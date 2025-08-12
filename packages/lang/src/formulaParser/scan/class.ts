import {STATIC} from 'src/types'
import * as Expressions from '../expressions'
import {type Expression} from '../expressions'
import {
  CLASS_KEYWORD,
  GENERIC_OPEN,
  CLASS_EXTENDS,
  CLASS_OPEN,
  CLASS_CLOSE,
  OVERRIDE_KEYWORD,
  FN_KEYWORD,
  RENDER_KEYWORD,
  PUBLIC_KEYWORD,
  VIEW_KEYWORD,
} from '../grammars'
import type {Scanner} from '../scanner'
import {ParseError, type ParseNext} from '../types'
import {
  scanGenerics,
  scanNamedFormula,
  scanRenderFormula,
  scanStaticFormula,
  scanViewFormula,
} from './formula'
import {scanValidClassPropertyName, scanValidTypeName} from './identifier'

export function scanClass(scanner: Scanner, parseNext: ParseNext): Expressions.ClassDefinition {
  const range0 = scanner.charIndex
  const precedingComments = scanner.flushComments()

  const isPublic = scanner.scanIfWord(PUBLIC_KEYWORD)
  if (isPublic) {
    scanner.expectWhitespace()
  }

  scanner.expectWord(CLASS_KEYWORD)
  const nameRef = scanValidTypeName(scanner)
  scanner.scanAllWhitespace()

  const generics: string[] = []
  if (scanner.scanIfString(GENERIC_OPEN)) {
    generics.push(...scanGenerics(scanner, parseNext))
    scanner.scanAllWhitespace()
  }

  let extendsExpression: Expressions.Reference | undefined
  if (scanner.scanIfWord(CLASS_EXTENDS)) {
    scanner.scanAllWhitespace()
    extendsExpression = scanValidTypeName(scanner)
    scanner.scanAllWhitespace()
  }

  const {properties, formulas} = scanClassBody(scanner, parseNext, 'class')

  return new Expressions.ClassDefinition(
    [range0, scanner.charIndex],
    precedingComments,
    scanner.flushComments(),
    nameRef,
    generics,
    extendsExpression,
    properties,
    formulas,
    isPublic,
  )
}

export function scanClassBody(scanner: Scanner, parseNext: ParseNext, type: 'class' | 'view') {
  scanner.expectString(CLASS_OPEN)
  scanner.scanAllWhitespace()

  scanner.whereAmI(type === 'class' ? 'scanClassBody' : 'scanViewBody')

  const properties: Expressions.ClassPropertyExpression[] = []
  let renderFormula: Expressions.ViewFormulaExpression | undefined
  const formulas: Expressions.NamedFormulaExpression[] = []
  while (!scanner.scanIfString(CLASS_CLOSE)) {
    if (scanner.test(isFnStart)) {
      const formula = scanNamedFormula(scanner, parseNext, 'class')
      formulas.push(formula)
    } else if (type === 'view' && scanner.test(isViewStart)) {
      const formula = scanViewFormula(scanner, 'class', parseNext, 'class')
      formulas.push(formula)
    } else if (type === 'view' && scanner.test(isRenderStart)) {
      if (renderFormula) {
        throw new ParseError(
          scanner,
          `A view can only have one render function. Already defined '${renderFormula}'`,
        )
      }

      const formula = scanRenderFormula(scanner, parseNext)
      formulas.push(formula)
      renderFormula = formula
    } else if (type === 'class' && scanner.isWord(STATIC)) {
      const formula = scanStaticFormula(scanner, parseNext, 'class')
      formulas.push(formula)
    } else {
      const property = scanClassProperty(scanner, parseNext)
      properties.push(property)
    }

    scanner.scanAllWhitespace()
    if (scanner.scanIfString(',')) {
      scanner.scanAllWhitespace()
    }
  }

  return {properties, formulas}
}

function scanClassProperty(scanner: Scanner, parseNext: ParseNext) {
  // scan class property
  const precedingComments = scanner.flushComments()
  const range1 = scanner.charIndex
  const nameRef = scanValidClassPropertyName(scanner)
  // support comments here? ug, the first person to open that pull request gets
  // a frown emoji for sure. _why_ just _why_ would you want a comment here
  // ("because I can" is the answer, and not entirely unreasonable, I know)
  scanner.scanAllWhitespace()

  // at first I was tempted to make the argument_type optional, but Extra is so
  // restrictive in its inferred types, this would be next to useless. So let's
  // just require the type instead and avoid any confusion.
  scanner.expectString(':')
  const argType = parseNext('argument_type')
  let defaultValue: Expression | undefined
  if (scanner.scanAhead('=')) {
    scanner.scanAllWhitespace()
    defaultValue = parseNext('single_expression')
  }

  const followingComments = scanner.flushComments()
  if (followingComments.length) {
    throw new ParseError(
      scanner,
      `Unexpected comments after class property '${nameRef.name}'. Comments should be before the property definition.`,
    )
  }

  return new Expressions.ClassPropertyExpression(
    [range1, scanner.charIndex],
    precedingComments,
    nameRef,
    argType,
    defaultValue,
  )
}

function isFnStart(scanner: Scanner) {
  if (scanner.scanIfWord(OVERRIDE_KEYWORD)) {
    scanner.expectWhitespace()
  }
  return scanner.isWord(FN_KEYWORD)
}

function isViewStart(scanner: Scanner) {
  return scanner.scanIfWord(VIEW_KEYWORD)
}

function isRenderStart(scanner: Scanner) {
  return scanner.scanIfWord(RENDER_KEYWORD)
}
