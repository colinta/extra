import * as Expressions from '../expressions'
import {type Expression} from '../expressions'
import {
  ARGS_CLOSE,
  ARGS_OPEN,
  ARRAY_OPEN,
  ARRAY_CLOSE,
  isRefStartChar,
  isRefChar,
  CASE_KEYWORD,
  isArgumentStartChar,
} from '../grammars'
import {type Scanner} from '../scanner'
import {ParseError, type ParseNext} from '../types'
import {scanArgumentType} from './argument_type'

import {unexpectedToken} from './basics'
import {scanAnyReference, scanValidName} from './identifier'
import {scanString} from './string'

/**
 * scans for:
 *   enum:
 *     .some(value) -- assigned enum value
 *   types, via scanArgumentType:
 *     Int, String, String(length: =8)
 *     Array(Int), Array(String, length: >5)
 *     Int | String, (Int | String)
 *     fn (#name: Int): String
 *
 *   also:
 *     Int as a -- checks 'Int' and assigns to 'a'
 *   Object:
 *     { } -- any fields
 *     { name: name } -- name is assigned
 *     { name: _ }  -- name must be present, not assigned
 *   Array:
 *     []  -- empty
 *     [foo] -- one item, assigned
 *     [_, _] -- exactly two items, not assigned
 *     [ foo, ... ] -- many items, only first is assigned
 *     [ foo, ...items ] -- many items, first is assigned and remainder are in items
 *   Int:
 *     Treated as literal type
 *   String:
 *     "" -- ❌ empty string - just use ==
 *     "test" -- ❌ string literal - just use ==
 *     "prefix" <> foo -- string starts with "prefix", remainder assigned
 *     foo <> "suffix" -- string ends with "suffix", prefix assigned
 *     "<<" <> foo <> ">>" -- string starts with "<<", ends with ">>", middle assigned
 *     "<<" <> foo <> "--" <> ">>" -- string starts with "<<", ends with ">>", middle assigned
 */
export function scanMatch(scanner: Scanner, parseNext: ParseNext): Expressions.MatchExpression {
  scanner.whereAmI('scanMatch')
  const matchExpression = _scanMatch(scanner, parseNext)
  const duplicate = matchExpression.checkAssignRefs()
  if (duplicate) {
    scanner.rewindTo(matchExpression.range[0])
    throw new ParseError(
      scanner,
      `Too many variables named '${duplicate}' in match expression '${matchExpression}'`,
    )
  }
  return matchExpression
}

function _scanMatch(scanner: Scanner, parseNext: ParseNext): Expressions.MatchExpression {
  if (
    scanner.is(/[A-Z]/) ||
    scanner.isWord('view') ||
    scanner.isWord('null') ||
    scanner.isWord('true') ||
    scanner.isWord('false')
  ) {
    const argType = scanArgumentType(scanner, 'argument_type', parseNext)
    let assignRef: Expressions.Reference | undefined
    if (scanner.test(isAsKeyword)) {
      scanner.scanSpaces()
      scanner.expectString('as')
      scanner.scanSpaces()
      assignRef = scanValidName(scanner)
    }
    return new Expressions.MatchTypeExpression(argType, assignRef)
  } else if (scanner.is('_')) {
    return scanMatchIgnore(scanner)
  } else if (isArgumentStartChar(scanner)) {
    return scanMatchReference(scanner, parseNext)
  } else if (scanner.is('.')) {
    return scanMatchEnum(scanner, parseNext)
  } else if (scanner.is(/[\'"`]/)) {
    return scanMatchString(scanner, parseNext)
  } else if (scanner.is(ARRAY_OPEN)) {
    return scanArrayEnum(scanner, parseNext)
  } else {
    throw new ParseError(scanner, `Invalid match expression (else) '${unexpectedToken(scanner)}'`)
  }
}

function scanMatchIgnore(scanner: Scanner) {
  scanner.whereAmI('scanMatchIgnore')
  const arg0 = scanner.charIndex
  scanner.expectString('_')
  while (scanner.scanIfString('_')) {}

  return new Expressions.MatchIgnore([arg0, scanner.charIndex], scanner.flushComments())
}

function scanMatchReference(scanner: Scanner, parseNext: ParseNext) {
  scanner.whereAmI('scanMatchReference')
  if (scanner.test(isReferenceThenConcat)) {
    return scanMatchString(scanner, parseNext)
  }
  const reference = scanValidName(scanner)
  return new Expressions.MatchReference(reference)
}

function scanMatchNamedReference(scanner: Scanner, parseNext: ParseNext) {
  scanner.whereAmI('scanMatchNamedReference')
  const arg0 = scanner.charIndex
  const precedingComments = scanner.flushComments()
  const nameRef = scanAnyReference(scanner)
  scanner.scanSpaces()
  scanner.expectString(':')
  scanner.scanAllWhitespace()

  const reference = scanMatch(scanner, parseNext)

  return new Expressions.MatchNamedArgument(
    [arg0, scanner.charIndex],
    precedingComments,
    nameRef,
    reference,
  )
}

function scanMatchEnum(scanner: Scanner, parseNext: ParseNext) {
  scanner.whereAmI('scanMatchEnum')
  const range0 = scanner.charIndex
  scanner.expectString('.')
  // enum '.some' or '.some(value, name: value, _...)'
  const enumCaseName = scanAnyReference(scanner).name
  scanner.scanSpaces()

  const args: Expressions.MatchExpression[] = []
  if (scanner.scanIfString(ARGS_OPEN)) {
    for (;;) {
      scanner.scanSpaces()

      const arg0 = scanner.charIndex
      if (scanner.scanIfString('...')) {
        args.push(
          new Expressions.MatchIgnoreRemainingExpression(
            [arg0, scanner.charIndex],
            scanner.flushComments(),
          ),
        )
        scanner.scanAllWhitespace()
        scanner.expectString(
          ARGS_CLOSE,
          "Remaining match '...' must be the last argument in the enum match expression",
        )
        break
      }

      if (scanner.test(isNamedArg)) {
        args.push(scanMatchNamedReference(scanner, parseNext))
      } else {
        args.push(scanMatch(scanner, parseNext))
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
    enumCaseName,
    args,
  )
}

function scanMatchString(scanner: Scanner, parseNext: ParseNext) {
  scanner.whereAmI('scanMatchString')
  const range0 = scanner.charIndex
  const precedingComments = scanner.flushComments()

  const args: (Expressions.MatchStringLiteral | Expressions.MatchReference)[] = []
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

      const stringExpression = scanString(scanner, false, parseNext) as Expressions.StringLiteral
      const matchExpression = new Expressions.MatchStringLiteral(stringExpression)
      args.push(matchExpression)
    } else if (isRefStartChar(scanner)) {
      if (prev === 'ref') {
        throw new ParseError(
          scanner,
          'In a match expression, after every reference you must concatenate a string',
        )
      }
      prev = 'ref'

      const reference = scanValidName(scanner)
      const matchExpression = new Expressions.MatchReference(reference)
      args.push(matchExpression)
    } else {
      throw new ParseError(scanner, invalidMatch(unexpectedToken(scanner)))
    }

    scanner.scanAllWhitespace()

    if (!scanner.is('<>')) {
      break
    }

    scanner.expectString('<>')
    scanner.scanAllWhitespace()
  }

  if (args.length === 1) {
    return args[0]
  }

  if (
    args.some(
      arg => arg instanceof Expressions.MatchStringLiteral && arg.literal.stringValue === '',
    )
  ) {
    throw new ParseError(
      scanner,
      `Empty string is invalid in match expression '${args.join(' <> ')}'`,
    )
  }

  return new Expressions.MatchStringExpression([range0, scanner.charIndex], precedingComments, args)
}

function scanArrayEnum(scanner: Scanner, parseNext: ParseNext) {
  scanner.whereAmI('scanArrayEnum')
  const precedingComments = scanner.flushComments()
  const args: Expressions.MatchExpression[] = []
  const range0 = scanner.charIndex
  scanner.expectString(ARRAY_OPEN)
  scanner.scanAllWhitespace()
  let hasRemaining = false
  if (!scanner.scanIfString(ARRAY_CLOSE)) {
    for (;;) {
      if (scanner.is('...')) {
        const arg0 = scanner.charIndex
        const precedingComments = scanner.flushComments()
        scanner.expectString('...')
        scanner.scanSpaces()
        if (hasRemaining) {
          throw new ParseError(scanner, 'Already matched remaining array elements')
        }
        hasRemaining = true

        if (scanner.is(/_+\b/)) {
          throw new ParseError(
            scanner,
            "Ignore placeholder '_' is not necessary here, just '...' is enough",
          )
        }

        if (isRefStartChar(scanner)) {
          const reference = scanValidName(scanner)
          args.push(
            new Expressions.MatchAssignRemainingExpression(
              [arg0, scanner.charIndex],
              precedingComments,
              reference,
            ),
          )
        } else {
          args.push(
            new Expressions.MatchIgnoreRemainingExpression(
              [arg0, scanner.charIndex],
              precedingComments,
            ),
          )
        }
      } else {
        const matchExpression = scanMatch(scanner, parseNext)
        args.push(matchExpression)
      }

      scanner.scanAllWhitespace()

      const shouldBreak = scanner.scanCommaOrBreak(
        ARRAY_CLOSE,
        "Expected ',' separating items in the arguments list",
      )

      if (shouldBreak) {
        break
      }

      scanner.scanAllWhitespace()
    }
  }

  return new Expressions.MatchArrayExpression([range0, scanner.charIndex], precedingComments, args)
}

export function scanCase(scanner: Scanner, parseNext: ParseNext): Expression {
  scanner.whereAmI('scanCase')
  const precedingComments = scanner.flushComments()
  const range0 = scanner.charIndex
  scanner.expectString(CASE_KEYWORD)
  scanner.scanAllWhitespace()
  const matches: Expressions.MatchExpression[] = []
  for (;;) {
    const match = scanMatch(scanner, parseNext)
    matches.push(match)

    const shouldBreak = scanner.scanCommaOrBreak(
      ':',
      "Expected ',' separating items in the case list",
    )

    if (shouldBreak) {
      break
    }
  }

  const bodyExpression = parseNext('case')

  return new Expressions.CaseExpression(
    [range0, scanner.charIndex],
    precedingComments,
    matches,
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
  return scanner.is('<>')
}

function isNamedArg(scanner: Scanner) {
  if (!isRefChar(scanner)) {
    return false
  }

  while (isRefChar(scanner)) {
    scanner.charIndex += 1
  }

  scanner.scanSpaces()
  return scanner.is(':')
}

function isAsKeyword(scanner: Scanner) {
  scanner.scanSpaces()
  return scanner.isWord('as')
}
