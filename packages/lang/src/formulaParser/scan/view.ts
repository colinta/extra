import * as Expressions from '../expressions'
import {ARGS_OPEN, PUBLIC_KEYWORD, VIEW_KEYWORD} from '../grammars'
import type {Scanner} from '../scanner'
import {type ParseNext} from '../types'
import {scanValidViewName} from './identifier'
import {scanClassBody} from './class'
import {scanViewFormula} from './formula'

/**
 * Scans a view type:
 *
 *     view Name {}
 *     public view Name {}
 *
 * Must have a render function, but this is part of runtime type checking.
 *     override render(…props…) => ...<JSX />
 *
 * State
 *     \@name: Type = 'value'
 *
 * Could have Context and Children
 *     Context: <Type>
 *     Children: <Type>
 *
 * Helpers and Messages
 *     fn message() => @foo = 'bar'
 *     fn addOne(a: String) => a + 1
 */

export function scanView(scanner: Scanner, parseNext: ParseNext) {
  const precedingComments = scanner.flushComments()
  const range0 = scanner.charIndex
  const isPublic = scanner.scanIfWord(PUBLIC_KEYWORD)
  scanner.whereAmI('isPublic: ' + isPublic)
  if (isPublic) {
    scanner.expectWhitespace()
  }

  if (scanner.test(isViewFormula)) {
    const formula = scanViewFormula(scanner, 'application', parseNext)
    return new Expressions.ViewDefinition(
      [range0, scanner.charIndex],
      precedingComments,
      formula,
      isPublic,
    )
  }
  scanner.expectWord(VIEW_KEYWORD)

  const nameRef = scanValidViewName(scanner)
  scanner.scanAllWhitespace()
  const {properties, formulas} = scanClassBody(scanner, parseNext, 'view')

  const lastComments = scanner.flushComments()

  return new Expressions.ViewClassDefinition(
    [range0, scanner.charIndex],
    precedingComments,
    lastComments,
    nameRef,
    properties,
    formulas,
    isPublic,
  )
}

function isViewFormula(scanner: Scanner) {
  if (!scanner.scanIfWord(VIEW_KEYWORD)) {
    return false
  }
  scanner.expectWhitespace()
  scanValidViewName(scanner)
  scanner.scanAllWhitespace()

  return scanner.is(ARGS_OPEN)
}
