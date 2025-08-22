import * as Expressions from '../../expressions'

import {type Scanner} from '../scanner'
import {ParseError} from '../types'

export function scanPipePlaceholder(scanner: Scanner) {
  const pipeSymbol = Expressions.PipePlaceholderExpression.Symbol
  if (!scanner.isInPipe) {
    throw new ParseError(
      scanner,
      `Unexpected token '${pipeSymbol}' found outside of pipe operation`,
    )
  }

  scanner.expectString(pipeSymbol)
  return new Expressions.PipePlaceholderExpression(
    [scanner.charIndex - 1, scanner.charIndex],
    scanner.flushComments(),
  )
}
