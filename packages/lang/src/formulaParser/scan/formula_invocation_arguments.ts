import * as Expressions from '../expressions'
import {ARGS_CLOSE, ARGS_OPEN, BLOCK_CLOSE, BLOCK_OPEN, isNamedArg} from '../grammars'
import {Scanner} from '../scanner'
import {ParseError, type ParseNext} from '../types'
import {scanValidName} from './identifier'

/**
 * Args passed to a function.
 * - positional arguments
 * - named arguments
 * - spread arguments (tuple, array, or dict)
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
  if (scanner.input[scanner.charIndex] === closer) {
    scanner.charIndex++
  } else {
    for (;;) {
      if (scanner.isEOF()) {
        if (what === 'block') {
          break
        }

        throw new ParseError(scanner, `Unexpected end of input while scanning arguments.`)
      }

      const argRange0 = scanner.charIndex

      let argName: Expressions.Reference | undefined
      if (isNamedArg(scanner)) {
        argName = scanValidName(scanner)
        scanner.scanAllWhitespace()
        scanner.expectString(':', "Expected ':' followed by the argument type")
      }

      const expression = parseNext(what === 'invocation' ? 'argument' : 'block_argument')

      let arg: Expressions.Argument
      if (argName) {
        arg = new Expressions.NamedArgument(
          [argRange0, scanner.charIndex],
          scanner.flushComments(),
          argName.name,
          expression,
        )
        arg.precedingComments = argName.precedingComments
      } else {
        arg = new Expressions.PositionalArgument(
          [argRange0, scanner.charIndex],
          scanner.flushComments(),
          expression,
        )
      }
      args.push(arg)
      scanner.whereAmI('scanFunctionArg: ' + expression.toLisp())

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
