import {type MatchExpression} from '@/expressions'
import * as Expressions from '@/expressions'

import {
  ARGS_CLOSE,
  ARGS_OPEN,
  ARRAY_OPEN,
  ARRAY_CLOSE,
  isRefChar,
  CASE_KEYWORD,
  isArgumentStartChar,
  isNumberStart,
  IGNORE_TOKEN,
  isStringStartChar,
  AS_KEYWORD,
  THEN_KEYWORD,
  ARG_SEPARATOR,
  STRING_CONCAT_OPERATOR,
  ENUM_START,
  OR_OPERATOR,
  OBJECT_OPEN,
  OBJECT_CLOSE,
  SPREAD_OPERATOR,
} from '../grammars'
import {type Scanner} from '../scanner'
import {ParseError, type ParseNext} from '../types'
import {scanArgumentType} from './argument_type'

import {unexpectedToken} from './basics'
import {
  isValidLocalName,
  scanAnyReference,
  scanValidLocalName,
  scanValidTypeName,
} from './identifier'
import {scanNumber} from './number'
import {scanRegex} from './regex'
import {scanStringLiteral} from './string'

// see below for scanCase

/**
 * scans for:
 *   'or' operator:
 *     Int or String
 *   Enum:
 *     .some -- enum case (enum type is inferred)
 *     .some(value) -- assigned enum value
 *     Maybe.some -- qualified enum case
 *   Types, via scanArgumentType:
 *     Int as var -- checks for 'Int' and assigns to 'var'
 *     Int, String, String(length: =8)
 *     Array(Int), Array(String, length: >5), Set(String), Dict(String, Int)
 *     [Int], [String, length: >5], #[String], #{String: Int}
 *     Int | String, (Int | String)
 *     fn (# name: Int): String
 *   Int:
 *     Treated as literal type
 *   String:
 *     "" -- empty string
 *     "test" -- string literal
 *     "prefix" .. foo -- string starts with "prefix", remainder assigned
 *     foo .. "suffix" -- string ends with "suffix", prefix assigned
 *     "<<" .. foo .. ">>" -- string starts with "<<", ends with ">>", middle assigned
 *     "<<" .. foo .. "--" .. bar .. ">>" -- uses non-greedy match
 *   Regex:
 *     /foo/ -- regex literal
 *     /foo/i -- regex literal with flags
 *     /(?<name>foo)/ -- regex with named group - foo is assigned the matching regular expression
 *   Array:
 *     []  -- empty
 *     [foo] -- one item, assigned
 *     [_, _] -- exactly two items, not assigned
 *     [ foo, ... ] -- at least one item, only first is assigned
 *     [ foo, ..., last ] -- at least 2 items, first and last are assigned
 *     [ foo, ...items ] -- first is assigned, remainder are in items
 *     [ ...items, z1, z0 ] -- last two are assigned, remainder are in items
 *   Object or Class:
 *     { } -- just makes sure it's an object
 *     { name: } -- name is assigned to 'name'
 *     { name: foo } -- name is assigned to 'foo'
 *     { name: _ }  -- name must be present, not assigned
 *   Named Object or Class:
 *     User(name:)  -- Type is User, assign name
 *   TODO: Dict, Set
 */
export function scanMatch(scanner: Scanner, parseNext: ParseNext): MatchExpression {
  scanner.whereAmI('scanMatch')
  const matchExpression = _scanMatch(scanner, parseNext)
  const duplicates = matchExpression.checkAssignRefs()
  if (duplicates.size) {
    scanner.rewindTo(matchExpression.range[0])
    throw new ParseError(
      scanner,
      `Too many variables named '${[...duplicates].join(', ')}' in match expression '${matchExpression}'`,
    )
  }
  return matchExpression
}

function _scanMatch(scanner: Scanner, parseNext: ParseNext): MatchExpression {
  if (scanner.is('(')) {
    throw new ParseError(scanner, "TODO: support '(...)' in scanMatch")
  }

  if (scanner.test(isQualifiedEnum)) {
    return scanMatchEnum(scanner, parseNext)
  } else if (scanner.test(isMatchNamedObject)) {
    // scans User{...}
    return scanMatchObject(scanner, parseNext)
  } else if (scanner.is(/^[A-Z]/)) {
    // scans User | Int | ...
    return scanMatchType(scanner, parseNext)
  } else if (
    // these need to be an exhaustive check of type declarations
    //     case Foo as foo
    //     case view as foo
    //     case null as foo
    scanner.isWord('view') ||
    scanner.isWord('null') ||
    scanner.isWord('true') ||
    scanner.isWord('false') ||
    scanner.test(isNumberList) ||
    scanner.test(isStringList)
  ) {
    return scanMatchType(scanner, parseNext)
  } else if (scanner.is(IGNORE_TOKEN)) {
    return scanMatchIgnore(scanner)
  } else if (scanner.is('/')) {
    return scanMatchRegex(scanner)
  } else if (isNumberStart(scanner) || scanner.is(/[<=>]/)) {
    return scanMatchRange(scanner)
  } else if (scanner.test(isReferenceThenConcat) || scanner.is(/[\'"`]/)) {
    return scanMatchString(scanner)
  } else if (isArgumentStartChar(scanner)) {
    return scanMatchReference(scanner)
  } else if (scanner.is(ENUM_START)) {
    return scanMatchEnum(scanner, parseNext)
  } else if (scanner.is(ARRAY_OPEN)) {
    return scanMatchArray(scanner, parseNext)
  } else if (scanner.is(OBJECT_OPEN)) {
    return scanMatchObject(scanner, parseNext)
  } else {
    throw new ParseError(scanner, `Invalid match expression (else) '${unexpectedToken(scanner)}'`)
  }
}

function scanMatchType(scanner: Scanner, parseNext: ParseNext) {
  const argType = scanArgumentType(scanner, 'match_type', parseNext)
  let assignRef: Expressions.Reference | undefined
  if (scanner.test(isAsKeyword)) {
    scanner.scanSpaces()
    scanner.expectWord(AS_KEYWORD)
    assignRef = scanValidLocalName(scanner)
  }
  return new Expressions.MatchTypeExpression(argType, assignRef)
}

function scanMatchIgnore(scanner: Scanner) {
  scanner.whereAmI('scanMatchIgnore')
  const arg0 = scanner.charIndex
  scanner.expectString(IGNORE_TOKEN)
  while (scanner.scanIfString(IGNORE_TOKEN)) {}

  return new Expressions.MatchIgnore([arg0, scanner.charIndex], scanner.flushComments())
}

function scanMatchReference(scanner: Scanner) {
  scanner.whereAmI('scanMatchReference')
  const reference = scanValidLocalName(scanner)
  return new Expressions.MatchReference(reference)
}

function scanMatchPositionalReference(index: number, scanner: Scanner, parseNext: ParseNext) {
  scanner.whereAmI(`scanMatchPositionalReference @ ${index}`)
  const arg0 = scanner.charIndex

  const matchExpr = scanMatch(scanner, parseNext)
  return new Expressions.MatchPositionalArgument([arg0, scanner.charIndex], [], index, matchExpr)
}

function scanMatchNamedReference(scanner: Scanner, parseNext: ParseNext, closer: string) {
  scanner.whereAmI(`scanMatchNamedReference until ${closer}`)
  const arg0 = scanner.charIndex
  const precedingComments = scanner.flushComments()
  const nameRef = scanAnyReference(scanner)
  scanner.scanSpaces()
  scanner.expectString(ARG_SEPARATOR)
  // only scan spaces for now, so that we can check for \n in the shorthand check
  //     case {name: }  -- terminated with 'closer'
  //     case {name: ,  -- terminated with explicit comma
  //     case {
  //       name:        -- terminated with newline
  //     case {name:
  //        , address:  -- also supported 🙄
  // yeah not requiring commas is a sisyphaen task. but you're worth it. and
  // you're welcome, you're welcome 🎶
  scanner.scanSpaces()

  let reference: MatchExpression
  if (scanner.lookAhead(closer) || scanner.lookAhead(',') || scanner.is('\n')) {
    scanner.scanAllWhitespace()
    // shorthand {name:}
    if (!isValidLocalName(nameRef.name)) {
      // ❌ { Name: }
      throw new ParseError(
        scanner,
        `Invalid shorthand '{ ${nameRef.name}: }' because '${nameRef.name}' is not a valid reference name.`,
      )
    }
    reference = new Expressions.MatchReference(nameRef)
  } else {
    scanner.scanAllWhitespace()
    reference = scanMatch(scanner, parseNext)
  }

  return new Expressions.MatchNamedArgument(
    [arg0, scanner.charIndex],
    precedingComments,
    nameRef.name,
    reference,
  )
}

function scanMatchEnum(scanner: Scanner, parseNext: ParseNext) {
  scanner.whereAmI('scanMatchEnum')
  const range0 = scanner.charIndex

  const qualifiers: string[] = []
  if (isArgumentStartChar(scanner)) {
    while (isArgumentStartChar(scanner)) {
      const qualifier = scanValidTypeName(scanner)
      scanner.scanAllWhitespace()
      qualifier.followingComments = scanner.flushComments()

      qualifiers.push(qualifier.name)

      scanner.expectString('.', `Expected '.' after type name '${qualifier.name}'`)
    }
  } else {
    scanner.expectString('.')
  }

  const enumName = qualifiers.pop()

  // enum '.some' or '.some(value, name: value, _...)'
  const enumCaseName = scanAnyReference(scanner).name
  scanner.scanSpaces()

  const args: (Expressions.MatchNamedArgument | Expressions.MatchPositionalArgument)[] = []
  let argIndex = 0
  let ignoreRemaining = false
  if (scanner.scanIfString(ARGS_OPEN)) {
    for (;;) {
      scanner.scanSpaces()

      if (ignoreRemaining) {
        scanner.expectString(
          ARGS_CLOSE,
          "Remaining match '...' must be the last argument in the enum match expression",
        )
      }

      if (scanner.scanIfString('...')) {
        ignoreRemaining = true
      } else if (scanner.test(isNamedArg)) {
        args.push(scanMatchNamedReference(scanner, parseNext, ARGS_CLOSE))
      } else {
        args.push(scanMatchPositionalReference(argIndex, scanner, parseNext))
        argIndex += 1
      }

      const shouldBreak = scanner.scanCommaOrBreak(
        ARGS_CLOSE,
        "Expected ',' separating items in the arguments list",
      )

      if (shouldBreak) {
        break
      }
    }
  }

  return new Expressions.MatchEnumExpression(
    [range0, scanner.charIndex],
    scanner.flushComments(),
    qualifiers,
    enumName,
    enumCaseName,
    args,
    ignoreRemaining,
  )
}

function scanMatchRange(scanner: Scanner) {
  const range0 = scanner.charIndex
  if (scanner.is(/[<=>]/)) {
    let unaryOp: '>' | '>=' | '<' | '<='
    if (scanner.scanIfString('>=')) {
      unaryOp = '>='
    } else if (scanner.scanIfString('>')) {
      unaryOp = '>'
    } else if (scanner.scanIfString('<=')) {
      unaryOp = '<='
    } else if (scanner.scanIfString('<')) {
      unaryOp = '<'
    } else {
      throw new ParseError(scanner, `Unexpected token '${unexpectedToken(scanner)}'`)
    }

    scanner.scanAllWhitespace()
    const precedingComments = scanner.flushComments()
    const start = scanNumber(scanner, 'float')
    return new Expressions.MatchUnaryRange(
      [range0, scanner.charIndex],
      precedingComments,
      unaryOp,
      start,
    )
  }

  const precedingComments = scanner.flushComments()
  const start = scanNumber(scanner, 'float')
  if (!scanner.test(isRange)) {
    if (start.value.isInt()) {
      return new Expressions.MatchLiteralInt(start)
    }
    return new Expressions.MatchLiteralFloat(start)
  }
  scanner.scanSpaces()

  let op: '...' | '<..' | '..<' | '<.<'
  if (scanner.scanIfString('...')) {
    op = '...'
  } else if (scanner.scanIfString('<..')) {
    op = '<..'
  } else if (scanner.scanIfString('..<')) {
    op = '..<'
  } else if (scanner.scanIfString('<.<')) {
    op = '<.<'
  } else {
    throw new ParseError(scanner, `Unexpected token '${unexpectedToken(scanner)}'`)
  }

  scanner.scanSpaces()
  const stop = scanNumber(scanner, 'float')
  if (op === '...' && start.value.value === stop.value.value) {
    if (start.value.isInt()) {
      return new Expressions.MatchLiteralInt(start)
    }
    return new Expressions.MatchLiteralFloat(start)
  } else if (start.value.value === stop.value.value) {
    throw new ParseError(
      scanner,
      `Unexpected empty range '${start}${op}${stop}'. start and stop values must not be the same value (use literal matcher '${start}' instead)`,
    )
  }

  return new Expressions.MatchBinaryRange(
    [range0, scanner.charIndex],
    precedingComments,
    op,
    start,
    stop,
  )
}

function isRange(scanner: Scanner) {
  scanner.scanAllWhitespace()
  return scanner.is(/[<.]/)
}

function scanMatchString(scanner: Scanner) {
  scanner.whereAmI('scanMatchString')
  const range0 = scanner.charIndex
  const precedingComments = scanner.flushComments()

  const args: [Expressions.MatchReference, Expressions.MatchLiteralString][] = []
  let prefix: Expressions.MatchLiteralString | undefined
  let lastRef: Expressions.MatchReference | undefined
  let prev: 'string' | 'ref' | undefined
  for (;;) {
    if (scanner.is(/['"`]/)) {
      if (prev === 'string') {
        throw new ParseError(
          scanner,
          'In a match expression, after every string you must concatenate a reference',
        )
      }
      prev = 'string'

      const stringExpression = scanStringLiteral(scanner)
      if (stringExpression.stringValue === '') {
        throw new ParseError(scanner, `Empty string is invalid in match expression`)
      }

      const matchExpression = new Expressions.MatchLiteralString(stringExpression)

      if (lastRef) {
        args.push([lastRef!, matchExpression])
        lastRef = undefined
      } else if (prefix === undefined) {
        prefix = matchExpression
      } else {
        throw `Unexpected... found '${stringExpression}' but prefix is already defined, and lastRef is undefined`
      }
    } else if (isArgumentStartChar(scanner)) {
      if (prev === 'ref') {
        throw new ParseError(
          scanner,
          'In a match expression, after every reference you must concatenate a string',
        )
      }
      prev = 'ref'

      const reference = scanValidLocalName(scanner)
      const matchExpression = new Expressions.MatchReference(reference)
      lastRef = matchExpression
    } else {
      throw new ParseError(scanner, invalidMatch(unexpectedToken(scanner)))
    }

    scanner.scanAllWhitespace()

    if (!scanner.is(STRING_CONCAT_OPERATOR)) {
      break
    }

    scanner.expectString(STRING_CONCAT_OPERATOR)
    scanner.scanAllWhitespace()
  }

  if (args.length === 0 && prefix && !lastRef) {
    return prefix
  }

  return new Expressions.MatchStringExpression(
    [range0, scanner.charIndex],
    precedingComments,
    prefix,
    args,
    lastRef,
  )
}

function scanMatchRegex(scanner: Scanner) {
  scanner.whereAmI('scanMatchRegex')
  const regex = scanRegex(scanner)
  return new Expressions.MatchLiteralRegex(regex)
}

/**
 *     {}  {name:} {name:, ...}
 * or named variant:
 *     User{} User{name:, ...}
 */
function scanMatchObject(scanner: Scanner, parseNext: ParseNext) {
  scanner.whereAmI('scanMatchObject')
  const precedingComments = scanner.flushComments()
  let typeName: Expressions.Reference | undefined
  if (isArgumentStartChar(scanner)) {
    typeName = scanValidTypeName(scanner)
  }

  const exprs: (Expressions.MatchNamedArgument | Expressions.MatchPositionalArgument)[] = []
  const range0 = scanner.charIndex
  scanner.expectString(OBJECT_OPEN)
  scanner.scanAllWhitespace()
  let argIndex = 0
  let ignoreRemaining = false
  if (!scanner.scanIfString(OBJECT_CLOSE)) {
    for (;;) {
      if (ignoreRemaining) {
        scanner.expectString(
          ARGS_CLOSE,
          "Remaining match '...' must be the last argument in the object match expression",
        )
      }

      if (scanner.scanIfString('...')) {
        ignoreRemaining = true
      } else {
        let matchExpr: Expressions.MatchNamedArgument | Expressions.MatchPositionalArgument
        if (scanner.test(isNamedArg)) {
          matchExpr = scanMatchNamedReference(scanner, parseNext, OBJECT_CLOSE)
        } else {
          matchExpr = scanMatchPositionalReference(argIndex, scanner, parseNext)
          argIndex += 1
        }
        exprs.push(matchExpr)
      }

      const shouldBreak = scanner.scanCommaOrBreak(
        OBJECT_CLOSE,
        "Expected ',' separating items in the object",
      )

      if (shouldBreak) {
        break
      }

      scanner.scanAllWhitespace()
    }
  }

  return new Expressions.MatchObjectExpression(
    [range0, scanner.charIndex],
    precedingComments,
    typeName,
    exprs,
    ignoreRemaining,
  )
}

function scanMatchArray(scanner: Scanner, parseNext: ParseNext) {
  scanner.whereAmI('scanMatchArray')
  const precedingComments = scanner.flushComments()
  const initialExprs: MatchExpression[] = []
  let remainingExpr:
    | Expressions.MatchIgnoreRemainingExpression
    | Expressions.MatchAssignRemainingExpression
    | undefined
  const trailingExprs: MatchExpression[] = []
  const range0 = scanner.charIndex
  scanner.expectString(ARRAY_OPEN)
  scanner.scanAllWhitespace()
  if (!scanner.scanIfString(ARRAY_CLOSE)) {
    for (;;) {
      if (scanner.is(SPREAD_OPERATOR)) {
        if (remainingExpr) {
          throw new ParseError(scanner, 'Already matched remaining array elements')
        }

        const arg0 = scanner.charIndex
        const precedingComments = scanner.flushComments()
        scanner.expectString(SPREAD_OPERATOR)
        scanner.scanSpaces()
        if (scanner.is(/_+\b/)) {
          // TODO: could emit a warning here
          // [..._] is equivalent to just [...]
          // scan the _ and ignore it
          while (scanner.scanIfString('_')) {}
          scanner.scanSpaces()
        }

        if (isArgumentStartChar(scanner)) {
          const reference = scanValidLocalName(scanner)
          remainingExpr = new Expressions.MatchAssignRemainingExpression(
            [arg0, scanner.charIndex],
            precedingComments,
            reference,
          )
        } else {
          remainingExpr = new Expressions.MatchIgnoreRemainingExpression(
            [arg0, scanner.charIndex],
            precedingComments,
          )
        }
      } else {
        const matchExpression = scanMatch(scanner, parseNext)
        if (remainingExpr) {
          trailingExprs.push(matchExpression)
        } else {
          initialExprs.push(matchExpression)
        }
      }

      const shouldBreak = scanner.scanCommaOrBreak(
        ARRAY_CLOSE,
        "Expected ',' separating items in the array",
      )

      if (shouldBreak) {
        break
      }

      scanner.scanAllWhitespace()
    }
  }

  return new Expressions.MatchArrayExpression(
    [range0, scanner.charIndex],
    precedingComments,
    initialExprs,
    remainingExpr,
    trailingExprs,
  )
}

export function scanCase(scanner: Scanner, parseNext: ParseNext): Expressions.CaseExpression {
  scanner.whereAmI('scanCase')
  const precedingComments = scanner.flushComments()
  const range0 = scanner.charIndex
  scanner.expectWord(CASE_KEYWORD)
  const matches: MatchExpression[] = []
  for (;;) {
    const match = scanMatch(scanner, parseNext)
    matches.push(match)

    scanner.scanAllWhitespace()

    if (scanner.isWord(OR_OPERATOR)) {
      scanner.expectString(OR_OPERATOR)
      scanner.scanAllWhitespace()
      scanner.whereAmI('scanCase or')
      continue
    } else {
      if (scanner.scanIfWord(THEN_KEYWORD)) {
        scanner.scanAllWhitespace()
      }
      break
    }
  }

  const bodyExpression = parseNext('case-then')
  scanner.whereAmI(`case: ${bodyExpression}`)

  let matchExpr: Expressions.MatchExpression
  if (matches.length === 1) {
    matchExpr = matches[0]
  } else {
    matchExpr = new Expressions.MatchAnyOneOfExpression(
      [range0, scanner.charIndex],
      precedingComments,
      matches,
    )
  }

  return new Expressions.CaseExpression(
    [range0, scanner.charIndex],
    precedingComments,
    matchExpr,
    bodyExpression,
  )
}

function invalidMatch(message: string) {
  return `Invalid match expression '${message}'`
}

function isReferenceThenConcat(scanner: Scanner) {
  if (!isRefChar(scanner)) {
    return false
  }

  while (isRefChar(scanner)) {
    scanner.charIndex += 1
  }

  scanner.scanSpaces()
  return scanner.is(STRING_CONCAT_OPERATOR)
}

function isNamedArg(scanner: Scanner) {
  if (!isRefChar(scanner)) {
    return false
  }

  while (isRefChar(scanner)) {
    scanner.charIndex += 1
  }

  scanner.scanSpaces()
  if (scanner.scanIfString('?')) {
    scanner.scanSpaces()
  }
  return scanner.is(ARG_SEPARATOR)
}

function isAsKeyword(scanner: Scanner) {
  scanner.scanSpaces()
  return scanner.isWord(AS_KEYWORD)
}

function isNumberList(scanner: Scanner) {
  if (!isNumberStart(scanner)) {
    return false
  }
  scanNumber(scanner)
  scanner.scanAllWhitespace()
  return scanner.is('|')
}

function isStringList(scanner: Scanner) {
  if (!isStringStartChar(scanner)) {
    return false
  }
  scanStringLiteral(scanner)
  scanner.scanAllWhitespace()
  return scanner.is('|')
}

/**
 * case SomeEnum.foo
 * case SomeModule.Enum.foo
 */
function isQualifiedEnum(scanner: Scanner) {
  // must have at least one type name
  if (!isArgumentStartChar(scanner)) {
    return false
  }

  // scan any number of module and enum names (we don't validate them here -
  // scanAnyReference is a very accepting scan function)
  while (isArgumentStartChar(scanner)) {
    try {
      scanAnyReference(scanner)
    } catch (e) {
      if (e instanceof ParseError) {
        return false
      }
      throw e
    }

    if (!scanner.scanIfString('.')) {
      return false
    }
  }

  // and finally an enum start char
  return isArgumentStartChar(scanner)
}

/**
 *     User{ ... }
 */
function isMatchNamedObject(scanner: Scanner) {
  if (!scanner.is(/^[A-Z]/)) {
    return false
  }
  scanAnyReference(scanner)
  scanner.scanAllWhitespace()
  return scanner.is('{')
}
