import {STATIC} from 'src/types'
import * as Expressions from '../../expressions'
import {
  ARGS_OPEN,
  BLOCK_CLOSE,
  BLOCK_OPEN,
  CLASS_EXTENDS,
  CLASS_KEYWORD,
  EXPORT_KEYWORD,
  FN_KEYWORD,
  FUNCTION_BODY_START,
  GENERIC_OPEN,
  OVERRIDE_KEYWORD,
  RENDER_KEYWORD,
  STATE_START,
  TYPE_START,
  VIEW_KEYWORD,
  isArgumentStartChar,
  isRefStartChar,
} from '../grammars'
import type {Scanner} from '../scanner'
import {ParseError, type Comment, type ParseNext} from '../types'
import {
  scanGenerics,
  scanInstanceFormula,
  scanRenderFormula,
  scanStaticFormula,
  scanViewFormula,
} from './formula'
import {scanValidClassPropertyName, scanValidTypeName} from './identifier'
import {scanFormulaLiteralArguments} from './formula_arguments'
import {scanArgumentType} from './argument_type'
import {unexpectedToken} from './basics'

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

  const generics: Expressions.GenericExpression[] = []
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

  let argDefinitions: Expressions.FormulaArgumentDefinition[] | undefined
  let precedingArgsComments: Comment[] = []
  let followingArgsComments: Comment[] = []
  if (scanner.is(ARGS_OPEN)) {
    precedingArgsComments = scanner.flushComments()
    argDefinitions = scanFormulaLiteralArguments(scanner, 'fn', parseNext, false)
    scanner.scanAllWhitespace()
    followingArgsComments = scanner.flushComments()
  }

  const {properties, staticProperties, formulas, staticFormulas} = scanClassBody(
    scanner,
    parseNext,
    'class',
  )

  const lastComments = scanner.flushComments()
  return new Expressions.ClassDefinition(
    [range0, scanner.charIndex],
    precedingComments,
    lastComments,
    precedingArgsComments,
    followingArgsComments,
    nameRef,
    generics,
    extendsExpression,
    argDefinitions,
    properties,
    staticProperties,
    formulas,
    staticFormulas,
    isExport,
  )
}

export function scanClassBody(scanner: Scanner, parseNext: ParseNext, type: 'class' | 'view') {
  scanner.expectString(BLOCK_OPEN)
  scanner.scanAllWhitespace()

  scanner.whereAmI(type === 'class' ? 'scanClassBody' : 'scanViewBody')

  const properties: Expressions.ClassStatePropertyExpression[] = []
  const staticProperties: Expressions.ClassStaticPropertyExpression[] = []
  let renderFormula: Expressions.ViewFormulaExpression | undefined
  const formulas: Expressions.InstanceFormulaExpression[] = []
  const staticFormulas: Expressions.StaticFormulaExpression[] = []
  const staticNames = new Set<string>()
  const memberNames = new Set<string>()
  for (;;) {
    if (scanner.test(isFnStart)) {
      const formula = scanInstanceFormula(scanner, parseNext, 'class')
      if (memberNames.has(formula.name)) {
        throw new ParseError(scanner, `Found duplicate property '${formula.name}'.`)
      }
      memberNames.add(formula.name)
      formulas.push(formula)
    } else if (type === 'view' && scanner.test(isViewStart)) {
      const formula = scanViewFormula(scanner, 'class', parseNext, 'class')
      if (memberNames.has(formula.name)) {
        throw new ParseError(scanner, `Found duplicate property '${formula.name}'.`)
      }
      memberNames.add(formula.name)
      formulas.push(formula)
    } else if (type === 'view' && scanner.test(isRenderStart)) {
      if (renderFormula) {
        throw new ParseError(scanner, `A view can only have one render function.`)
      }

      const formula = scanRenderFormula(scanner, parseNext)
      memberNames.add(formula.name)
      formulas.push(formula)
      renderFormula = formula
    } else if (scanner.test(isClassProperty)) {
      const isStatic = scanner.isWord(STATIC)
      const property = scanClassProperty(scanner, parseNext, isStatic)
      if (isStatic) {
        staticProperties.push(property as Expressions.ClassStaticPropertyExpression)
      } else {
        properties.push(property as Expressions.ClassStatePropertyExpression)
      }

      if (isStatic) {
        if (staticNames.has(property.name)) {
          throw new ParseError(scanner, `Found duplicate static property '${property}'.`)
        }
        staticNames.add(property.name)
      } else {
        if (memberNames.has(property.name)) {
          throw new ParseError(scanner, `Found duplicate property '${property}'.`)
        }
        memberNames.add(property.name)
      }
    } else if (scanner.isWord(STATIC) && scanner.test(isStaticFunction)) {
      const formula = scanStaticFormula(scanner, parseNext, 'class')
      if (staticNames.has(formula.name)) {
        throw new ParseError(scanner, `Found duplicate function named '${formula.name}'.`)
      }
      staticNames.add(formula.name)
      staticFormulas.push(formula)
    } else if (scanner.isWord(STATIC)) {
      scanner.expectWord(STATIC)

      throw new ParseError(
        scanner,
        `Unexpected token '${unexpectedToken(scanner)}' after 'static' keyword`,
      )
    } else {
      throw new ParseError(scanner, `Unexpected token '${unexpectedToken(scanner)}' in class body`)
    }

    const shouldBreak = scanner.scanCommaOrBreak(
      BLOCK_CLOSE,
      `Expected ',' separating properties in the class or '${BLOCK_CLOSE}' to end the class definition.`,
    )

    if (shouldBreak) {
      break
    }

    scanner.scanAllWhitespace()
  }

  if (type === 'view' && !renderFormula) {
    throw new ParseError(scanner, `All views must have a render function.`)
  }

  return {properties, staticProperties, formulas, staticFormulas}
}

//     -- static properties (constants)
//     static foo: Bar
//     static foo: Int = 0
//     static foo = 0
//
//     -- state/instance properties
//     @foo: Bar
//     @foo: Int = 0
//     @foo = 0
//
// state expressions (`@foo: Bar`) can be initialized from constructor args
// and may change over time. They are attached to an instance of the class.
//
// static properties (`foo: Foo = Foo()`) require a default value and are not
// initialized from constructor arguments, though they can depend on other
// static properties. They are constant.
//
// This method is also used in 'enum' definitions to scan static properties.
export function scanClassProperty(scanner: Scanner, parseNext: ParseNext, isStatic: boolean) {
  if (isStatic) {
    scanner.expectWord(STATIC)
  }

  const precedingComments = scanner.flushComments()
  const range1 = scanner.charIndex
  const nameRef = scanValidClassPropertyName(scanner)
  if (isStatic && nameRef.name.startsWith(STATE_START)) {
    throw new ParseError(
      scanner,
      `Static property '${nameRef.name}' cannot be a state property. Remove the '${STATE_START}' prefix.`,
    )
  } else if (!isStatic && !(nameRef instanceof Expressions.StateReference)) {
    throw new ParseError(scanner, propertySyntaxExplanation(nameRef))
  }

  // support comments here? ug, the first person to open that pull request gets
  // a frown emoji for sure. _why_ just _why_ would you want a comment here
  // ("because I can" is the answer, and not entirely unreasonable, I know)
  //
  // btw, the use case here is something like
  //     class Foo {
  //       foo
  //        -- comment not supported here, it's scanned but the formatter will move
  //        -- it above 'foo'
  //          : Foo = Foo()
  //     }
  // the fix is to pass it to the ClassStatePropertyExpression constructor as a
  // new comment location.
  scanner.scanAllWhitespace()
  precedingComments.push(...scanner.flushComments())

  let argType: Expressions.Expression | undefined
  let defaultValue: Expressions.Expression | undefined
  if (scanner.scanIfString(TYPE_START)) {
    argType = scanArgumentType(scanner, 'argument_type', parseNext)
  }

  if (scanner.is(ARGS_OPEN)) {
    throw new ParseError(
      scanner,
      `Unexpected argument declaration. Did you mean 'fn ${nameRef.name}('`,
    )
  }

  let requiresDefaultValue: boolean
  if (isStatic) {
    requiresDefaultValue = true
  } else {
    requiresDefaultValue = scanner.lookAhead('=')
  }

  if (requiresDefaultValue) {
    scanner.scanAllWhitespace()
    // here again, comments are scanned, but not "attached" to the correct place
    // in ClassPropertyExpression. They will get attached to the argType or
    // nameRef, which I guess isn't so bad

    scanner.expectString(
      '=',
      `${isStatic ? 'Static' : 'Instance'} property '${nameRef}' expects a value`,
    )
    ;(argType ?? nameRef).followingComments.push(...scanner.flushComments())
    scanner.scanAllWhitespace()
    defaultValue = parseNext('default')
  }

  if (!requiresDefaultValue && !argType) {
    throw new ParseError(
      scanner,
      `Class property '${nameRef.name}' must have a type or a default value.`,
    )
  }

  // looking at this much later, this is a weird bit of code... seems like we
  // could just ignore comments and let them be picked up by the next property
  // or function
  const followingComments = scanner.flushComments()
  if (followingComments.length) {
    throw new ParseError(
      scanner,
      `Unexpected comments after class property '${nameRef.name}'. Comments should be before the property definition.`,
    )
  }

  if (isStatic) {
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
    argType,
    defaultValue,
  )
}

function propertySyntaxExplanation(nameRef: Expressions.Reference): string {
  return `Property '${nameRef.name}' must either be a static value or an instance property.

To make it static, add the 'static' keyword.

    static ${nameRef.name}: Type = ...

Add the '${STATE_START}' prefix to make it an instance property

    @${nameRef.name}: Type = ...
`
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

// properties are either static – which use the 'static' keyword – or instance
// properties – which use the '@' sigil to show that they are "stateful".
//
// The `isRefStartChar` returns true though... this is because
// `scanClassProperty` shows a helpful error message in this case.
function isClassProperty(scanner: Scanner) {
  if (scanner.isWord(STATIC) && scanner.test(isStaticProperty)) {
    return true
  } else if (scanner.isWord(STATIC)) {
    return false
  }

  return isRefStartChar(scanner) || scanner.is(STATE_START)
}

/**
 * Checks for the possible static property styles:
 *     static foo = bar
 *     static foo: Bar
 *     static foo: Bar = bar
 * It's enough to scan for `static \w+ [:=]`
 */
export function isStaticProperty(scanner: Scanner) {
  if (!scanner.scanIfWord(STATIC)) {
    return false
  }

  scanner.scanAllWhitespace()
  if (!isArgumentStartChar(scanner)) {
    return false
  }

  scanValidClassPropertyName(scanner)
  scanner.scanAllWhitespace()
  if (scanner.is(TYPE_START) || scanner.is('=')) {
    return true
  }

  return false
}

/**
 *
 * Checks for the possible static function styles:
 *    static foo<T>() => bar  -- GENERIC_OPEN
 *    static foo() => bar  -- ARGS_OPEN
 *    static foo(): Bar => bar  -- ARGS_OPEN
 *    static foo: Bar => bar  -- TYPE_START
 *    static foo => bar  -- FUNCTION_BODY_START
 */
export function isStaticFunction(scanner: Scanner) {
  scanner.whereAmI('isStaticFunction')
  if (!scanner.scanIfWord(STATIC)) {
    scanner.whereAmI('isStaticFunction = false')
    return false
  }

  scanner.scanAllWhitespace()
  if (!isArgumentStartChar(scanner)) {
    scanner.whereAmI('isStaticFunction = false')
    return false
  }

  scanValidClassPropertyName(scanner)
  scanner.scanAllWhitespace()
  if (
    scanner.is(GENERIC_OPEN) ||
    scanner.is(ARGS_OPEN) ||
    scanner.is(TYPE_START) ||
    scanner.is(FUNCTION_BODY_START)
  ) {
    scanner.whereAmI('isStaticFunction = true')
    return true
  }

  scanner.whereAmI('isStaticFunction = false')
  return false
}
