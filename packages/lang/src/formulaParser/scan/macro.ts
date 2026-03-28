import * as Expressions from '../../expressions'
import {type Scanner} from '../scanner'
import {ParseError} from '../types'

const MACROS = ['#line', '#column', '#fn'] as const

export function scanMacro(scanner: Scanner) {
  const range0 = scanner.charIndex

  const pipeSymbol = Expressions.PipePlaceholderExpression.Symbol
  if (scanner.is(pipeSymbol)) {
    if (!scanner.isInPipe) {
      throw new ParseError(
        scanner,
        `Unexpected token '${pipeSymbol}' found outside of pipe operation`,
      )
    }

    scanner.expectString(pipeSymbol)
    return new Expressions.PipePlaceholderExpression(
      [range0, scanner.charIndex],
      scanner.flushComments(),
    )
  }

  for (const macro of MACROS) {
    if (scanner.scanIfString(macro)) {
      return new Expressions.MacroExpression(
        [range0, scanner.charIndex],
        scanner.flushComments(),
        macro,
        scanner.input,
      )
    }
  }

  throw new ParseError(scanner, `Unexpected token '${scanner.remainingInput}'`)
}
