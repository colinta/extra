import {Scanner} from '../scanner'
import {Operator, ParseError} from '../types'
import {binaryOperatorNamed, isBinaryOperator} from '../../operators'
import {BINARY_OP_ALIASES, BINARY_OP_NAMES, scanBinaryOperatorSymbol} from '../grammars'

export function scanBinaryOperator(scanner: Scanner): Operator {
  scanner.whereAmI('scanBinaryOperator')
  const namedOp = BINARY_OP_NAMES.find(opName => scanner.isWord(opName))
  let currentToken: string
  if (namedOp) {
    currentToken = namedOp
    scanner.expectString(namedOp)
  } else {
    currentToken = scanBinaryOperatorSymbol(scanner) ?? ''
  }

  if (currentToken in BINARY_OP_ALIASES) {
    currentToken = BINARY_OP_ALIASES[currentToken as keyof typeof BINARY_OP_ALIASES]
  }

  if (!isBinaryOperator(currentToken)) {
    if (!currentToken) {
      if (scanner.is(/\w/)) {
        while (scanner.is(/\w/)) {
          currentToken += scanner.scanNextChar()
        }
      } else {
        while (scanner.is(/[^\w\d\s()[\]{}]/)) {
          currentToken += scanner.scanNextChar()
        }
      }
    }
    throw new ParseError(scanner, unknownErrorMessage('binary operator', currentToken))
  }

  scanner.whereAmI('scanBinaryOperator: ' + currentToken)
  return binaryOperatorNamed(currentToken, scanner.flushComments())
}

function unknownErrorMessage(type: string, thing: string) {
  return `Unknown ${type} '${thing}'`
}
