import * as Expressions from '../../expressions'
import {
  BLOCK_CLOSE,
  BLOCK_OPEN,
  CASE_KEYWORD,
  DEFAULT_KEYWORD,
  ELSE_KEYWORD,
  SWITCH_KEYWORD,
} from '../grammars'
import {type Scanner} from '../scanner'
import {type ParseNext} from '../types'
import {scanCase} from './match'

/**
 *     switch subject case test then value
 *     switch subject case test then value1 else value2
 *     switch subject case test1 then value1 case test2 then value2
 *     switch subject case test1 then value1 case test2 then value2 else value3
 *
 *     switch subject
 *     case test1
 *       value1
 *     case test2
 *       value2
 *     else
 *       value3
 *
 */
export function scanSwitch(scanner: Scanner, parseNext: ParseNext): Expressions.SwitchExpression {
  const range0 = scanner.charIndex
  scanner.whereAmI('scanSwitch')

  const precedingComments = scanner.flushComments()
  scanner.expectWord(SWITCH_KEYWORD)

  const subjectExpr = scanSubject(scanner, parseNext)

  const didUseBrackets = scanner.scanIfString(BLOCK_OPEN)

  const caseExprs: Expressions.CaseExpression[] = []
  for (;;) {
    if (!scanner.lookAhead(CASE_KEYWORD)) {
      break
    }
    scanner.scanAllWhitespace()
    caseExprs.push(scanCase(scanner, parseNext))
  }

  let elseExpr: Expressions.Expression | undefined
  if (scanner.scanAhead(ELSE_KEYWORD) || scanner.scanAhead(DEFAULT_KEYWORD)) {
    elseExpr = scanElse(scanner, parseNext)
  }

  if (didUseBrackets) {
    scanner.scanAllWhitespace()
    scanner.expectString(BLOCK_CLOSE)
  }

  return new Expressions.SwitchExpression(
    [range0, scanner.charIndex],
    precedingComments,
    // followingComments
    [],
    subjectExpr,
    caseExprs,
    elseExpr,
  )
}

function scanSubject(_scanner: Scanner, parseNext: ParseNext): Expressions.Expression {
  return parseNext('switch')
}

function scanElse(_scanner: Scanner, parseNext: ParseNext): Expressions.Expression {
  return parseNext('case-else')
}
