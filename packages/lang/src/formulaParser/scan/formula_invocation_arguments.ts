import * as Expressions from '../expressions'
import {
  ARGS_CLOSE,
  ARGS_OPEN,
  BLOCK_CLOSE,
  BLOCK_OPEN,
  isNamedArg,
  KWARG_OP,
  SPLAT_OP,
} from '../grammars'
import {Scanner} from '../scanner'
import {ParseError, type ParseNext} from '../types'
import {scanValidName} from './identifier'

/**
 * Args passed to a function.
 * - positional arguments
 *     foo("a", true, 123)
 * - named arguments
 *     foo(x: "a", y: '', z: 123)
 * - spread arguments (tuple, array, or dict)
 *
 * Tuple arguments are treated as if the arguments were passed directly.
 * Since Tuples can contain positional and named arguments, it is easy to map these
 * to the argument list.
 *     foo(...tuple)  -- Tuple = {"a", y: b, z: 123}
 *
 * Array arguments are treated as positional arguments, but there also must be a
 * positional spread argument defined to handle "the rest". An exception is made if
 * the array is refined to be of a compatible length
 *     foo(...array)  -- Array = ["a", b, 123]
 *     -- fn foo(# a: String)
 *
 * In the case of passing an array to a repeated named argument, there *must* be a
 * repeated named argument, this won't be treated as arguments to the function.
 *     foo(...name: array)  -- Array = ["a", b, 123]
 *
 * Dict arguments are treated as named arguments, and the keyword arguments will
 * also be checked, if it is defined.
 *     foo(*dict)     -- Dict  = dict(x: "a", y: b, z: 123)
 */
export function scanInvocationArgs(scanner: Scanner, parseNext: ParseNext) {
  return _scanArguments(scanner, parseNext, 'invocation')
}

export function scanBlockArgs(scanner: Scanner, parseNext: ParseNext) {
  return _scanArguments(scanner, parseNext, 'block')
}

function _scanArguments(scanner: Scanner, parseNext: ParseNext, what: 'invocation' | 'block') {
  const precedingComments = scanner.flushComments()
  const range0 = scanner.charIndex
  scanner.whereAmI('scanInvocationArgs')
  let closer: string
  if (what === 'invocation') {
    scanner.expectString(ARGS_OPEN)
    closer = ARGS_CLOSE
  } else {
    scanner.expectString(BLOCK_OPEN)
    closer = BLOCK_CLOSE
  }
  scanner.scanAllWhitespace()

  const args: Expressions.Argument[] = []
  if (scanner.is(closer)) {
    scanner.expectString(closer)
  } else {
    for (;;) {
      if (scanner.isEOF()) {
        if (what === 'block') {
          throw new ParseError(
            scanner,
            `Expected '}' to close block arguments list, but reached end of input.`,
          )
        }

        throw new ParseError(
          scanner,
          `Expected ')' to close arguments list, but reached end of input.`,
        )
      }

      const argRange0 = scanner.charIndex

      let isSpreadArg = false
      let isKwarg = false
      if (scanner.is(SPLAT_OP)) {
        scanner.expectString(SPLAT_OP)
        isSpreadArg = true
      } else if (scanner.is(KWARG_OP)) {
        scanner.expectString(KWARG_OP)
        isKwarg = true
      }

      let argName: Expressions.Reference | undefined
      if (isNamedArg(scanner)) {
        // I'm excited for the bug report that points out that you can't insert comments
        // between the 'name' and ':'. To fix it, we just need to use `scanner.test`
        // instead of isNamedArg, but then we would need to attach the comments somewhere
        // and test it in comments.test.ts
        argName = scanValidName(scanner)
        scanner.scanAllWhitespace()
        scanner.expectString(':', "Expected ':' followed by the argument type")
      }

      const expression = parseNext(what === 'invocation' ? 'argument' : 'block_argument')

      let arg: Expressions.Argument
      if (isKwarg || isSpreadArg) {
        if (argName && isKwarg) {
          throw new ParseError(
            scanner,
            `Keyword argument list operator ${KWARG_OP} cannot be applied to named arguments.`,
          )
        }

        arg = new Expressions.SpreadFunctionArgument(
          [argRange0, scanner.charIndex],
          scanner.flushComments(),
          argName?.name,
          expression,
          isSpreadArg ? 'spread' : 'kwargs',
        )
      } else if (argName) {
        arg = new Expressions.NamedArgument(
          [argRange0, scanner.charIndex],
          scanner.flushComments(),
          argName.name,
          expression,
        )
      } else {
        arg = new Expressions.PositionalArgument(
          [argRange0, scanner.charIndex],
          scanner.flushComments(),
          expression,
        )
      }

      if (argName) {
        arg.precedingComments = argName.precedingComments
      }

      args.push(arg)
      scanner.whereAmI('scanFunctionArg: ' + arg.toLisp())

      const shouldBreak = scanner.scanCommaOrBreak(closer, "Expected ',' separating arguments")

      if (shouldBreak) {
        break
      }

      scanner.scanAllWhitespace()
    }
  }

  scanner.whereAmI(`scanInvocationArgs: ${args.length} ` + args.map(arg => arg.toCode()).join(', '))

  return new Expressions.ArgumentsList(
    [range0, scanner.charIndex],
    precedingComments,
    scanner.flushComments(),
    args,
    [],
  )
}
