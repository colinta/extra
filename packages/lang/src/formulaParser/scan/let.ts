import * as Expressions from '../../expressions'
import {FN_KEYWORD, LET_IN, LET_KEYWORD} from '../grammars'
import {type Scanner} from '../scanner'
import {type ExpressionType, type ParseNext} from '../types'
import {scanArgumentType} from './argument_type'
import {scanNamedFormula} from './formula'
import {scanValidLocalName} from './identifier'

/**
 *     let
 *       a = 1
 *       b = 2
 *       foo = a + b
 *     in
 *       foo
 */
export function scanLet(
  scanner: Scanner,
  parseNext: ParseNext,
  outerExpressionType: ExpressionType,
): Expressions.Expression {
  const range0 = scanner.charIndex
  scanner.whereAmI('scanLet')

  const precedingComments = scanner.flushComments()
  scanner.expectString(LET_KEYWORD)
  scanner.scanAllWhitespace()

  const bindings: (Expressions.LetAssign | Expressions.NamedFormulaExpression)[] = []
  for (;;) {
    if (scanner.scanIfWord(LET_IN)) {
      break
    }

    let entry: Expressions.LetAssign | Expressions.NamedFormulaExpression
    if (scanner.isWord(FN_KEYWORD)) {
      entry = scanNamedFormula(scanner, parseNext, 'let')
    } else {
      const name = scanValidLocalName(scanner)
      scanner.scanAllWhitespace()
      let type: Expressions.Expression | undefined
      if (scanner.scanIfString(':')) {
        scanner.scanAllWhitespace()
        type = scanArgumentType(scanner, 'argument_type', parseNext)
        scanner.scanAllWhitespace()
      }

      const followingAliasComments = scanner.flushComments()
      scanner.expectString('=')
      scanner.scanAllWhitespace()
      const value = parseNext('let')

      scanner.whereAmI(`scanLet: ${name} = ${value}`)

      entry = new Expressions.LetAssign(
        [name.range[0], value.range[1]],
        name.precedingComments,
        name.name,
        type,
        value,
      )
      entry.followingAliasComments = followingAliasComments
    }
    bindings.push(entry)

    const shouldBreak = scanner.scanCommaOrBreak('in', `Expected ',' separating items in let`)

    if (shouldBreak) {
      break
    }

    scanner.scanSpaces()
    entry.followingComments.push(...scanner.flushComments())
    scanner.scanAllWhitespace()
  }

  const precedingInBodyComments = scanner.flushComments()
  scanner.whereAmI(`scanLet: body`)
  const body = parseNext(outerExpressionType)

  scanner.whereAmI(`scanLet: body = ${body}`)
  return new Expressions.LetExpression(
    [range0, body.range[1]],
    precedingComments,
    precedingInBodyComments,
    bindings,
    body,
  )
}
