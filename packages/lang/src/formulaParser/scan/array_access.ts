import {type Scanner} from '../scanner'
import {type ParseNext} from '../types'

export function scanArrayAccess(scanner: Scanner, parseNext: ParseNext) {
  scanner.whereAmI('scanArrayAccess')
  scanner.expectString('[')
  scanner.scanAllWhitespace()
  const expression = parseNext('bracket_access')
  scanner.expectString(']')

  scanner.whereAmI('scanArrayAccess: ' + expression.toCode())
  return expression
}
