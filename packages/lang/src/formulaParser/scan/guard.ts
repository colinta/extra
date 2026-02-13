import * as Expressions from '../../expressions'
import {ELSE_KEYWORD, GUARD_KEYWORD, THEN_KEYWORD} from '../grammars'
import {type Scanner} from '../scanner'
import {type ParseNext} from '../types'

/**
 *     guard cond else val then body
 *     guard cond
 *     else
 *       val2
 *     val1
 */
export function scanGuard(scanner: Scanner, parseNext: ParseNext): Expressions.GuardExpression {
  const range0 = scanner.charIndex
  scanner.whereAmI('scanGuard')

  const precedingComments = scanner.flushComments()
  scanner.expectWord(GUARD_KEYWORD)
  scanner.scanAllWhitespace()

  const condExpr = scanCondition(scanner, parseNext)

  scanner.expectWord(ELSE_KEYWORD)
  const elseExpr = scanElse(scanner, parseNext)

  // optional 'then', but guard always reformats to be multiline sorry-not-sorry
  if (scanner.scanIfWord(THEN_KEYWORD)) {
    scanner.scanAllWhitespace()
  }

  const thenExpr = scanThen(scanner, parseNext)

  return new Expressions.GuardExpression(
    [range0, scanner.charIndex],
    precedingComments,
    // followingComments
    [],
    condExpr,
    thenExpr,
    elseExpr,
  )
}

function scanCondition(_scanner: Scanner, parseNext: ParseNext): Expressions.Expression {
  return parseNext('guard')
}

function scanElse(_scanner: Scanner, parseNext: ParseNext): Expressions.Expression {
  return parseNext('guard-else')
}

function scanThen(_scanner: Scanner, parseNext: ParseNext): Expressions.Expression {
  return parseNext('guard-then')
}
