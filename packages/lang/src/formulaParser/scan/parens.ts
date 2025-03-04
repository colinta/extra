import {PARENS_CLOSE, PARENS_OPEN} from '../grammars'
import {type Scanner} from '../scanner'
import {type ParseNext} from '../types'

export function scanParensGroup(scanner: Scanner, parseNext: ParseNext) {
  scanner.whereAmI('scanParensGroup')
  scanner.expectString(PARENS_OPEN)
  const expression = parseNext('parens')
  scanner.expectString(PARENS_CLOSE)

  scanner.whereAmI('scanParensGroup: ' + expression.toCode())
  return expression
}
