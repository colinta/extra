import {Scanner} from '../scanner'
import {Operator, ParseError} from '../types'
import {binaryOperatorNamed, isBinaryOperator, NAMED_BINARY_OPS} from '../operators'
import {isBinaryOperatorChar} from '../grammars'

export function scanBinaryOperator(scanner: Scanner): Operator {
  scanner.whereAmI('scanBinaryOperator')
  const namedOp = NAMED_BINARY_OPS.find(opName => scanner.isWord(opName))
  let currentToken: string
  if (namedOp) {
    currentToken = namedOp
    scanner.expectString(namedOp)
  } else {
    currentToken = scanner.char
    while (isBinaryOperatorChar(scanner.scanNextChar())) {
      if (currentToken === '...') {
        // needs a special case otherwise '...-' is scanned
        // breaking here means scanner is still pointed at '-'
        break
      }

      currentToken += scanner.char
    }
  }

  switch (currentToken) {
    case '≤':
      currentToken = '<='
      break
    case '≥':
      currentToken = '>='
      break
    case '≠':
      currentToken = '!='
      break
  }

  if (!isBinaryOperator(currentToken)) {
    throw new ParseError(scanner, unknownErrorMessage('binary operator', currentToken))
  }

  scanner.whereAmI('scanBinaryOperator: ' + currentToken)
  return binaryOperatorNamed(currentToken, scanner.flushComments())
}

function unknownErrorMessage(type: string, thing: string) {
  return `Unknown ${type} '${thing}'`
}
