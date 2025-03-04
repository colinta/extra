import {Scanner} from '../scanner'
import {Operator, ParseError} from '../types'
import {unaryOperatorNamed, isUnaryOperator, NAMED_UNARY_OPS} from '../operators'
import {isUnaryOperatorChar} from '../grammars'

export function scanUnaryOperator(scanner: Scanner): Operator {
  scanner.whereAmI('scanUnaryOperator')
  const namedOp = NAMED_UNARY_OPS.find(opName =>
    new RegExp(`^(${opName})\\b`).test(scanner.remainingInput),
  )
  let currentToken: string
  if (namedOp) {
    currentToken = namedOp
    scanner.expectString(namedOp)
  } else {
    currentToken = scanner.char
    while (isUnaryOperatorChar(scanner.scanNextChar())) {
      if (!isUnaryOperator(currentToken + scanner.char)) {
        break
      }

      currentToken += scanner.char
    }
  }

  if (!isUnaryOperator(currentToken)) {
    throw new ParseError(scanner, unknownErrorMessage('unary operator', currentToken))
  }

  scanner.whereAmI('scanUnaryOperator: ' + currentToken)
  return unaryOperatorNamed(currentToken, scanner.flushComments())
}

function unknownErrorMessage(type: string, thing: string) {
  return `Unknown ${type} '${thing}'`
}
