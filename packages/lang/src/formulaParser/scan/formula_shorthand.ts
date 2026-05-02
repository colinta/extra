import * as Expressions from '../../expressions'
import {FORMULA_SHORTHAND_DELIMITER} from '../grammars'
import {type Scanner} from '../scanner'
import {ParseError, type ParseNext} from '../types'
import {scanValidLocalName} from './identifier'

/**
 * Scans a formula shorthand expression, only used from invocation/block argument
 * lists:
 *
 *     array.map(|val| val + 1)
 *               ^^^^^^^^^^^^^
 *
 * Argument and return types are intentionally inferred from the receiving
 * formula's expected argument type.
 */
export function scanFormulaShorthand(scanner: Scanner, parseNext: ParseNext) {
  const precedingComments = scanner.flushComments()
  const range0 = scanner.charIndex

  scanner.expectString(
    FORMULA_SHORTHAND_DELIMITER,
    `Expected '${FORMULA_SHORTHAND_DELIMITER}' to start formula shorthand`,
  )
  scanner.scanAllWhitespace()

  const argDefinitions: Expressions.FormulaArgumentDefinition[] = []
  if (!scanner.scanIfString(FORMULA_SHORTHAND_DELIMITER)) {
    for (;;) {
      if (scanner.isEOF()) {
        throw new ParseError(scanner, 'Unexpected end of input while scanning formula shorthand.')
      }

      const argRange0 = scanner.charIndex
      const argName = scanValidLocalName(scanner)
      argName.followingComments.push(...scanner.flushComments())

      const argType = new Expressions.InferIdentifier(
        [scanner.charIndex, scanner.charIndex],
        scanner.flushComments(),
      )

      argDefinitions.push(
        new Expressions.FormulaArgumentDefinition(
          [argRange0, scanner.charIndex],
          [],
          argName,
          argName,
          argType,
          false,
          false,
          undefined,
        ),
      )

      scanner.scanAllWhitespace()
      if (scanner.scanIfString(FORMULA_SHORTHAND_DELIMITER)) {
        break
      }

      scanner.expectString(',', "Expected ',' separating shorthand formula arguments")
      scanner.scanAllWhitespace()
    }
  }

  scanner.scanAllWhitespace()
  const returnType = new Expressions.InferIdentifier(
    [scanner.charIndex, scanner.charIndex],
    scanner.flushComments(),
  )
  const body = parseNext('argument')

  return new Expressions.FormulaShorthand(
    [range0, scanner.charIndex],
    precedingComments,
    [],
    [],
    [],
    [],
    undefined,
    argDefinitions,
    returnType,
    body,
    [],
  )
}
