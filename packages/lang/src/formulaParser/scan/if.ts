import * as Expressions from '../../expressions'
import {ELSE_KEYWORD, IF_KEYWORD, THEN_KEYWORD} from '../grammars'
import {type Scanner} from '../scanner'
import {type ExpressionType, type ParseNext} from '../types'
import {scanArgumentType} from './argument_type'
import {scanNamedFormula} from './formula'
import {scanValidLocalName} from './identifier'

/**
 *     if cond then val
 *     if cond then val1 else val2
 *     if cond
 *       val1
 *     else
 *       val2
 */
export function scanIf(scanner: Scanner, parseNext: ParseNext): Expressions.IfExpression {
  const range0 = scanner.charIndex
  scanner.whereAmI('scanIf')

  const precedingComments = scanner.flushComments()
  scanner.expectWord(IF_KEYWORD)
  scanner.scanAllWhitespace()

  const condExpr = scanCondition(scanner, parseNext)

  // optional 'then', which indicates preference for keeping code on one line
  const preferCode = scanner.scanIfWord(THEN_KEYWORD) ? 'oneline' : 'multiline'
  if (preferCode === 'oneline') {
    scanner.scanAllWhitespace()
  }

  const thenExpr = scanThen(scanner, parseNext)
  let elseExpr: Expressions.Expression | undefined
  if (scanner.scanAhead(ELSE_KEYWORD)) {
    elseExpr = scanElse(scanner, parseNext)
  }

  return new Expressions.IfExpression(
    [range0, scanner.charIndex],
    precedingComments,
    // followingComments
    [],
    condExpr,
    thenExpr,
    elseExpr,
    preferCode,
  )
}

function scanCondition(scanner: Scanner, parseNext: ParseNext): Expressions.Expression {
  return parseNext('if')
}

function scanThen(scanner: Scanner, parseNext: ParseNext): Expressions.Expression {
  return parseNext('if-then')
}

function scanElse(scanner: Scanner, parseNext: ParseNext): Expressions.Expression {
  return parseNext('else')
}
