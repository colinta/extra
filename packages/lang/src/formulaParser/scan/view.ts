import * as Expressions from '../../expressions'
import {ARGS_OPEN, EXPORT_KEYWORD, FUNCTION_BODY_START, VIEW_KEYWORD} from '../grammars'
import type {Scanner} from '../scanner'
import {type ParseNext} from '../types'
import {scanValidViewName} from './identifier'
import {scanClassBody} from './class'
import {scanViewFormula} from './formula'
import {scanFormulaLiteralArguments} from './formula_arguments'

/**
 * Scans a view type:
 *
 *     view Name {}
 *     view Name(prop: Type) {}
 *     export view Name {}
 *
 * Must have a render function, but this is part of runtime type checking.
 *     render => ...<JSX />
 */
export function scanView(scanner: Scanner, parseNext: ParseNext) {
  scanner.whereAmI('scanView')
  const precedingComments = scanner.flushComments()
  const range0 = scanner.charIndex
  const isExport = scanner.scanIfWord(EXPORT_KEYWORD)
  scanner.whereAmI('isExport: ' + isExport)
  if (isExport) {
    scanner.expectWhitespace()
  }

  if (scanner.test(isViewFormula)) {
    const formula = scanViewFormula(scanner, 'module', parseNext)
    return new Expressions.ViewDefinition(
      [range0, scanner.charIndex],
      precedingComments,
      formula,
      isExport,
    )
  }
  scanner.expectWord(VIEW_KEYWORD)

  const nameRef = scanValidViewName(scanner)
  scanner.scanAllWhitespace()

  let argDefinitions: Expressions.FormulaLiteralArgument[] | undefined
  if (scanner.scanIfString(ARGS_OPEN)) {
    argDefinitions = scanFormulaLiteralArguments(scanner, 'view', parseNext, false)
  }

  const {properties, formulas} = scanClassBody(scanner, parseNext, 'view')

  const lastComments = scanner.flushComments()

  return new Expressions.ViewClassDefinition(
    [range0, scanner.charIndex],
    precedingComments,
    lastComments,
    nameRef,
    argDefinitions,
    properties,
    formulas,
    isExport,
  )
}

function isViewFormula(scanner: Scanner) {
  if (!scanner.scanIfWord(VIEW_KEYWORD)) {
    return false
  }
  scanner.expectWhitespace()
  scanValidViewName(scanner)
  scanner.scanAllWhitespace()

  return scanner.is(ARGS_OPEN) || scanner.is(FUNCTION_BODY_START)
}
