import * as Expressions from '../expressions'
import {type Expression} from '../expressions'
import {
  ARGS_CLOSE,
  ARGS_OPEN,
  ARRAY_OPEN,
  ARRAY_CLOSE,
  isRefStartChar,
  isRefChar,
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
 *     Dict(Int), Set(Int)
 *     Int | String, (Int | String)
 *     fn (#name: Int): String
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
export function scanMatch(scanner: Scanner, parseNext: ParseNext): Expression {
  if (
    scanner.is(/[A-Z]/) ||
    scanner.isWord('view') ||
    scanner.isWord('null') ||
    scanner.isWord('true') ||
    scanner.isWord('false')
  ) {
    const argType = scanArgumentType(scanner, 'argument_type', parseNext)
    return new Expressions.MatchTypeExpression(argType)
  } else if (scanner.is('.')) {
    return scanMatchEnum(scanner)
  } else if (scanner.is(/([\'"`])\1/)) {
    throw new ParseError(scanner, 'Empty string makes no sense in a match expression')
  } else if (
    scanner.is(/[\'"`]/) ||
    scanner.test(() => {
      // test for `ref <>`
      if (!isRefStartChar(scanner)) {
        return false
      }
      scanValidName(scanner)
      scanner.scanAllWhitespace()
      return scanner.is('<>')
    })
  ) {
    return scanMatchString(scanner, parseNext)
  } else if (scanner.is(ARRAY_OPEN)) {
    return scanArrayEnum(scanner)
  } else {
    throw new ParseError(scanner, `Invalid match expression '${unexpectedToken(scanner)}'`)
  }
}

function scanMatchEnum(scanner: Scanner): Expression {
  const range0 = scanner.charIndex
  scanner.expectString('.')
  // enum '.some' or '.some(value, name: value, _...)'
  const enumCaseName = scanAnyReference(scanner).name
  scanner.scanSpaces()

  const args: Expressions.MatchEnumReference[] = []
  const names = new Set<string>()
  let ignoreRemaining = false
  if (scanner.scanIfString(ARGS_OPEN)) {
    for (;;) {
      scanner.scanSpaces()
      if (scanner.scanIfString('...')) {
        ignoreRemaining = true
        scanner.scanAllWhitespace()
        scanner.expectString(ARGS_CLOSE)
        break
      }

      const arg0 = scanner.charIndex
      const precedingComments = scanner.flushComments()
      let nameRef: Expressions.Reference | undefined
      if (scanner.test(isNamedArg)) {
        nameRef = scanAnyReference(scanner)
        scanner.scanSpaces()
        scanner.expectString(':')
        scanner.scanAllWhitespace()
      }

      let reference: Expressions.Identifier
      if (scanner.is(/_+\b/)) {
        while (scanner.scanIfString('_')) {}
        reference = new Expressions.IgnorePlaceholder(
          [arg0, scanner.charIndex],
          scanner.flushComments(),
        )
      } else {
        reference = scanValidName(scanner)

        if (names.has(reference.name)) {
          throw new ParseError(scanner, `Too many variables named '${reference.name}'`)
        }

        names.add(reference.name)
      }

      args.push(
        new Expressions.MatchEnumReference(
          [arg0, scanner.charIndex],
          precedingComments,
          nameRef,
          reference,
        ),
      )

      const shouldBreak = scanner.scanCommaOrBreak(
        ARGS_CLOSE,
        "Expected ',' separating items in the arguments list",
      )

      if (shouldBreak) {
        break
      }
    }
  }

  return new Expressions.MatchEnumMemberExpression(
    [range0, scanner.charIndex],
    scanner.flushComments(),
    enumCaseName,
    args,
    ignoreRemaining,
  )
}

function scanMatchString(scanner: Scanner, parseNext: ParseNext): Expression {
  const range0 = scanner.charIndex
  const precedingComments = scanner.flushComments()

  const args: (Expressions.StringLiteral | Expressions.Reference)[] = []
  const names = new Set<string>()
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
      if (stringExpression.stringValue.length === 0) {
        throw new ParseError(scanner, 'Empty string makes no sense in a match expression')
      }
      args.push(stringExpression)
    } else if (isRefStartChar(scanner)) {
      if (prev === 'ref') {
        throw new ParseError(
          scanner,
          'In a match expression, after every reference you must concatenate a string',
        )
      }
      prev = 'ref'

      const reference = scanValidName(scanner)
      if (names.has(reference.name)) {
        throw new ParseError(scanner, `Too many variables named '${reference.name}'`)
      }
      if (reference.name !== '_') {
        names.add(reference.name)
      }
      args.push(reference)
    } else {
      throw new ParseError(scanner, invalidMatch(unexpectedToken(scanner)))
    }

    if (
      !scanner.test(() => {
        scanner.scanAllWhitespace()
        return scanner.is('<>')
      })
    ) {
      break
    }

    scanner.scanAllWhitespace()
    scanner.expectString('<>')
    scanner.scanAllWhitespace()
  }

  if (args.length === 1) {
    throw new ParseError(scanner, invalidMatch(args[0].toCode()))
  }

  return new Expressions.MatchStringExpression([range0, scanner.charIndex], precedingComments, args)
}

function scanArrayEnum(scanner: Scanner): Expression {
  const precedingComments = scanner.flushComments()
  const args: (
    | Expressions.IgnorePlaceholder
    | Expressions.Reference
    | Expressions.MatchArrayRemainingExpression
  )[] = []
  const names = new Set<string>()
  const range0 = scanner.charIndex
  scanner.expectString(ARRAY_OPEN)
  let hasRemaining = false
  for (;;) {
    scanner.scanAllWhitespace()

    if (scanner.is(/_+\b/)) {
      const arg0 = scanner.charIndex
      while (scanner.scanIfString('_')) {}
      const reference = new Expressions.IgnorePlaceholder(
        [arg0, scanner.charIndex],
        scanner.flushComments(),
      )
      args.push(reference)
    } else if (isRefStartChar(scanner)) {
      const reference = scanValidName(scanner)
      if (names.has(reference.name)) {
        throw new ParseError(scanner, `Too many variables named '${reference.name}'`)
      }
      if (reference.name !== '_') {
        names.add(reference.name)
      }
      args.push(reference)
    } else if (scanner.is('...')) {
      const arg0 = scanner.charIndex
      scanner.expectString('...')
      if (hasRemaining) {
        throw new ParseError(scanner, 'Already matched remaining array elements')
      }
      hasRemaining = true

      if (
        scanner.test(() => {
          scanner.scanSpaces()
          return scanner.is(/_+\b/)
        })
      ) {
        scanner.scanSpaces()
        throw new ParseError(
          scanner,
          "Ignore placeholder '_' is not necessary here, just '...' is enough",
        )
      } else if (
        scanner.test(() => {
          scanner.scanSpaces()
          return isRefStartChar(scanner)
        })
      ) {
        scanner.scanSpaces()
        const reference = scanValidName(scanner)
        if (names.has(reference.name)) {
          throw new ParseError(scanner, `Too many variables named '${reference.name}'`)
        }
        if (reference.name !== '_') {
          names.add(reference.name)
        }
        args.push(
          new Expressions.MatchArrayRemainingExpression([arg0, scanner.charIndex], [], reference),
        )
      } else {
        args.push(
          new Expressions.MatchArrayRemainingExpression([arg0, scanner.charIndex], [], undefined),
        )
      }
    }

    scanner.scanAllWhitespace()

    const shouldBreak = scanner.scanCommaOrBreak(
      ARRAY_CLOSE,
      "Expected ',' separating items in the arguments list",
    )

    if (shouldBreak) {
      break
    }
  }

  return new Expressions.MatchArrayExpression([range0, scanner.charIndex], precedingComments, args)
}

function invalidMatch(message: string) {
  return `Invalid match expression '${message}'`
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
