import {isDice, isDiceChar} from '../grammars'
import {type Scanner} from '../scanner'
import {ParseError} from '../types'
import * as Expressions from '../expressions'

export function scanDice(scanner: Scanner) {
  const range0 = scanner.charIndex
  scanner.whereAmI('scanDice')
  let currentToken = scanner.char
  while (isDiceChar(scanner.scanNextChar())) {
    currentToken += scanner.char
  }

  if (!isDice(currentToken)) {
    throw new ParseError(scanner, `Expected a dice expression, found '${currentToken}'`)
  }

  scanner.whereAmI('scanDice: ' + currentToken)
  return new Expressions.DiceExpression(
    [range0, scanner.charIndex],
    scanner.flushComments(),
    currentToken,
  )
}
