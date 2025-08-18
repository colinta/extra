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
  EXPORT_KEYWORD,
  VIEW_KEYWORD,
  ARGS_OPEN,
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
import {scanFormulaArgumentDefinitions} from './formula_arguments'
import {scanArgumentType} from './argument_type'

export function scanClass(scanner: Scanner, parseNext: ParseNext): Expressions.ClassDefinition {
  const range0 = scanner.charIndex
  const precedingComments = scanner.flushComments()

  const isExport = scanner.scanIfWord(EXPORT_KEYWORD)
  if (isExport) {
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

  let argDeclarations: Expressions.FormulaLiteralArgumentDeclarations | undefined
  if (scanner.is(ARGS_OPEN)) {
    argDeclarations = scanFormulaArgumentDefinitions(scanner, 'fn', parseNext, false)
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
    argDeclarations,
    properties,
    formulas,
    isExport,
  )
}

export function scanClassBody(scanner: Scanner, parseNext: ParseNext, type: 'class' | 'view') {
  scanner.expectString(CLASS_OPEN)
  scanner.scanAllWhitespace()

  scanner.whereAmI(type === 'class' ? 'scanClassBody' : 'scanViewBody')

  const properties: Expressions.ClassPropertyExpression[] = []
  let renderFormula: Expressions.ViewFormulaExpression | undefined
  const formulas: Expressions.NamedFormulaExpression[] = []
  const staticFormulaNames = new Set<string>()
  const memberFormulaNames = new Set<string>()
  for (;;) {
    if (scanner.test(isFnStart)) {
      const formula = scanNamedFormula(scanner, parseNext, 'class')
      if (memberFormulaNames.has(formula.name)) {
        throw new ParseError(scanner, `Found duplicate function named '${formula.name}'.`)
      }
      memberFormulaNames.add(formula.name)
      formulas.push(formula)
    } else if (type === 'view' && scanner.test(isViewStart)) {
      const formula = scanViewFormula(scanner, 'class', parseNext, 'class')
      if (memberFormulaNames.has(formula.name)) {
        throw new ParseError(scanner, `Found duplicate function named '${formula.name}'.`)
      }
      memberFormulaNames.add(formula.name)
      formulas.push(formula)
    } else if (type === 'view' && scanner.test(isRenderStart)) {
      if (renderFormula) {
        throw new ParseError(scanner, `A view can only have one render function.`)
      }

      const formula = scanRenderFormula(scanner, parseNext)
      memberFormulaNames.add(formula.name)
      formulas.push(formula)
      renderFormula = formula
    } else if (type === 'class' && scanner.isWord(STATIC)) {
      const formula = scanStaticFormula(scanner, parseNext, 'class')
      if (staticFormulaNames.has(formula.name)) {
        throw new ParseError(scanner, `Found duplicate function named '${formula.name}'.`)
      }
      staticFormulaNames.add(formula.name)
      formulas.push(formula)
    } else {
      const property = scanClassProperty(scanner, parseNext)
      if (properties.some(existing => existing.name === property.name)) {
        throw new ParseError(scanner, `Found duplicate property '${property}'.`)
      }
      properties.push(property)
    }

    scanner.whereAmI('<here>')
    const shouldBreak = scanner.scanCommaOrBreak(
      CLASS_CLOSE,
      "Expected ',' separating properties in the class",
    )

    if (shouldBreak) {
      break
    }

    scanner.scanAllWhitespace()
  }

  if (type === 'view' && !renderFormula) {
    throw new ParseError(scanner, `All views must have a render function.`)
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

  let shouldScanType: boolean
  let requiresDefaultValue: boolean
  const isStaticProp = !(nameRef instanceof Expressions.StateReference)

  if (isStaticProp) {
    shouldScanType = scanner.scanIfString(':')
    scanner.scanAllWhitespace()
    requiresDefaultValue = true
  } else {
    // @state properties require a type - static properties do not at first I
    // was tempted to make the argument_type optional, but Extra is so
    // restrictive in its inferred types, this would be next to useless. So
    // let's just require the type instead and avoid any confusion.
    scanner.expectString(
      ':',
      `Class properties must declare their type. Missing type on property '${nameRef}'`,
    )
    shouldScanType = true
    requiresDefaultValue = false
  }

  let argType: Expressions.Expression | undefined
  let defaultValue: Expression | undefined
  if (shouldScanType) {
    argType = scanArgumentType(scanner, 'argument_type', parseNext)
  }

  if (requiresDefaultValue) {
    scanner.scanAllWhitespace()
    scanner.expectString('=', `static property '${nameRef}' expects a value`)
  } else {
    requiresDefaultValue = scanner.scanAhead('=')
  }

  if (requiresDefaultValue) {
    ;(argType ?? nameRef).followingComments.push(...scanner.flushComments())
    scanner.scanAllWhitespace()
    defaultValue = parseNext('default')
  }

  const followingComments = scanner.flushComments()
  if (followingComments.length) {
    throw new ParseError(
      scanner,
      `Unexpected comments after class property '${nameRef.name}'. Comments should be before the property definition.`,
    )
  }

  if (isStaticProp) {
    return new Expressions.ClassStaticPropertyExpression(
      [range1, scanner.charIndex],
      precedingComments,
      nameRef,
      argType,
      defaultValue!,
    )
  }

  return new Expressions.ClassStatePropertyExpression(
    [range1, scanner.charIndex],
    precedingComments,
    nameRef,
    argType!,
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
