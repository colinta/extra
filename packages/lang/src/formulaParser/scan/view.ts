import * as Expressions from '../../expressions'
import {ARGS_OPEN, CLASS_OPEN, EXPORT_KEYWORD, VIEW_KEYWORD} from '../grammars'
import type {Scanner} from '../scanner'
import {type ParseNext, type Comment} from '../types'
import {scanValidViewName} from './identifier'
import {scanClassBody} from './class'
import {scanFormulaLiteralArguments} from './formula_arguments'
import {finishScanningFormula} from './formula'

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

  scanner.expectWord(VIEW_KEYWORD)
  scanner.scanAllWhitespace()

  const precedingNameComments = scanner.flushComments()
  const nameRef = scanValidViewName(scanner)
  scanner.scanAllWhitespace()

  let argDefinitions: Expressions.FormulaLiteralArgument[] | undefined
  let precedingArgsComments: Comment[] = []
  let followingArgsComments: Comment[] = []
  if (scanner.is(ARGS_OPEN)) {
    precedingArgsComments = scanner.flushComments()
    argDefinitions = scanFormulaLiteralArguments(scanner, 'view', parseNext, false)
    scanner.scanAllWhitespace()
    followingArgsComments = scanner.flushComments()
  }

  if (scanner.is(CLASS_OPEN)) {
    const {properties, formulas} = scanClassBody(scanner, parseNext, 'view')

    const lastComments = scanner.flushComments()

    return new Expressions.ViewClassDefinition(
      [range0, scanner.charIndex],
      precedingComments,
      lastComments,
      precedingArgsComments,
      followingArgsComments,
      nameRef,
      argDefinitions,
      properties,
      formulas,
      isExport,
    )
  }

  return finishScanningViewFunction(
    scanner,
    parseNext,
    range0,
    precedingComments,
    precedingNameComments,
    precedingArgsComments,
    followingArgsComments,
    nameRef,
    argDefinitions,
  )
}

function finishScanningViewFunction(
  scanner: Scanner,
  parseNext: ParseNext,
  range0: number,
  precedingComments: Comment[],
  precedingNameComments: Comment[],
  precedingArgsComments: Comment[],
  followingArgsComments: Comment[],
  nameRef: Expressions.Reference | undefined,
  argDefinitions: Expressions.FormulaLiteralArgument[] | undefined,
) {
  return finishScanningFormula(
    scanner,
    parseNext,
    range0,
    precedingComments,
    precedingNameComments,
    precedingArgsComments,
    followingArgsComments,
    false,
    nameRef,
    [],
    argDefinitions ?? [],
    'view',
    'module',
    true,
  ) as Expressions.ViewFormulaExpression
}
