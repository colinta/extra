import * as Expressions from '../expressions'
import {type Expression} from '../expressions'
import {type Scanner} from '../scanner'
import {type ExpressionType, type Comment, ParseError, type ParseNext} from '../types'
import {
  ARGS_OPEN,
  FUNCTION_BODY_START,
  GENERIC_CLOSE,
  GENERIC_OPEN,
  isArgumentStartChar,
  OVERRIDE_KEYWORD,
} from '../grammars'

import {scanArgumentType} from './argument_type'
import {scanFormulaArgumentDefinitions} from './formula_arguments'
import {scanValidLocalName, scanValidTypeName, scanValidViewName} from './identifier'

export function scanFormula(
  scanner: Scanner,
  expressionType: ExpressionType,
  parseNext: ParseNext,
  bodyExpressionType?: ExpressionType,
) {
  return _scanFormula(scanner, expressionType, parseNext, {
    type: 'fn',
    isNamedFn: false,
    bodyExpressionType,
  })
}

export function scanStaticFormula(
  scanner: Scanner,
  parseNext: ParseNext,
  bodyExpressionType?: ExpressionType,
) {
  return _scanFormula(scanner, 'expression', parseNext, {
    type: 'static',
    isNamedFn: true,
    bodyExpressionType,
  }) as Expressions.StaticFormulaExpression
}

export function scanNamedFormula(
  scanner: Scanner,
  parseNext: ParseNext,
  bodyExpressionType?: ExpressionType,
) {
  return _scanFormula(scanner, 'expression', parseNext, {
    type: 'fn',
    isNamedFn: true,
    bodyExpressionType,
  }) as Expressions.NamedFormulaExpression
}

export function scanRenderFormula(scanner: Scanner, parseNext: ParseNext) {
  const value = _scanFormula(scanner, 'class', parseNext, {
    type: 'render',
    isNamedFn: true,
    bodyExpressionType: 'class',
  }) as Expressions.RenderFormulaExpression

  return value
}

export function scanViewFormula(
  scanner: Scanner,
  expressionType: ExpressionType,
  parseNext: ParseNext,
  bodyExpressionType?: ExpressionType,
) {
  const value = _scanFormula(scanner, expressionType, parseNext, {
    type: 'view',
    isNamedFn: true,
    bodyExpressionType,
  }) as Expressions.ViewFormulaExpression

  if (!value.nameRef.name.match(/^[A-Z]/)) {
    throw new ParseError(
      scanner,
      `Views must start with an uppercased letter, found '${value.nameRef.name}'`,
    )
  }

  return value
}

function _scanFormula(
  scanner: Scanner,
  expressionType: ExpressionType,
  parseNext: ParseNext,
  options: {
    type: 'fn' | 'static' | 'view' | 'render'
    isNamedFn: boolean
    bodyExpressionType: ExpressionType | undefined
  },
) {
  const {type, isNamedFn} = options
  let {bodyExpressionType} = options
  const isInView = type === 'view' || type === 'render'
  // not all expressionTypes are supported as scanFormula expression types
  if (bodyExpressionType === undefined) {
    switch (expressionType) {
      case 'module':
      case 'let':
      case 'argument':
      case 'block_argument':
      case 'object':
      case 'array[]':
      case 'array-word':
      case 'dict-word':
      case 'set-word':
      case 'bracket_access':
      case 'expression':
      case 'interpolation':
      case 'parens':
      case 'jsx_embed':
        bodyExpressionType = expressionType
        break
      default:
        throw new ParseError(scanner, `Unexpected scanFormula within '${expressionType}'`)
    }
  }

  scanner.whereAmI(`scanFormula type = ${type}`)
  const typeExpect = type

  const precedingComments = scanner.flushComments()
  const range0 = scanner.charIndex

  let isOverride = false
  // if we are scanning in the context of a class, and are scanning a 'fn' (not
  // a 'static' fn), check for the override keyword.
  if (bodyExpressionType === 'class' && typeExpect === 'fn') {
    isOverride = scanner.scanIfWord(OVERRIDE_KEYWORD)
    if (isOverride) {
      scanner.expectWhitespace()
    }
  }

  scanner.expectString(typeExpect, `Expected '${typeExpect}(' to start the formula expression`)
  if (isNamedFn && type !== 'render') {
    scanner.expectWhitespace()
  }

  let nameRef: Expressions.Reference | undefined
  let precedingNameComments: Comment[] = []
  if (type === 'render') {
    nameRef = new Expressions.Reference([scanner.charIndex, scanner.charIndex], [], 'render')
  } else if (isArgumentStartChar(scanner)) {
    precedingNameComments = scanner.flushComments()
    if (type === 'view') {
      nameRef = scanValidViewName(scanner)
    } else {
      nameRef = scanValidLocalName(scanner)
    }
  }
  scanner.whereAmI(`scanFormula name = ${nameRef}`)

  if (isNamedFn && nameRef === undefined) {
    throw new ParseError(scanner, `Expected function name after '${type}'`)
  } else if (!isNamedFn && nameRef !== undefined) {
    throw new ParseError(scanner, `Unexpected name '${nameRef}' for formula type '${type}'`)
  }
  scanner.scanAllWhitespace()

  let generics: string[] = []
  if (scanner.scanIfString(GENERIC_OPEN)) {
    if (type === 'fn' || type === 'static') {
      generics = scanGenerics(scanner, parseNext)
      scanner.scanAllWhitespace()
    } else {
      throw new ParseError(scanner, `Unexpected generic in ${type} function`)
    }
  }
  scanner.whereAmI(`scanFormula generics = [${generics.join(', ')}]`)

  let argDeclarations: Expressions.FormulaLiteralArgumentDeclarations
  // support fn => 'value' (parentheses are optional when no args)
  if (!scanner.is(ARGS_OPEN)) {
    argDeclarations = new Expressions.FormulaLiteralArgumentDeclarations(
      [scanner.charIndex, scanner.charIndex],
      [],
      [],
    )
  } else {
    const canInfer = expressionType === 'argument'
    argDeclarations = scanFormulaArgumentDefinitions(
      scanner,
      isInView ? 'view' : 'fn',
      parseNext,
      canInfer,
    )
    scanner.scanAllWhitespace()
    argDeclarations.followingComments.push(...scanner.flushComments())
  }
  scanner.whereAmI(`scanFormula argDeclarations = (${argDeclarations})`)

  let returnType: Expression
  if (type === 'fn' && scanner.scanIfString(':')) {
    scanner.scanAllWhitespace()
    returnType = scanArgumentType(scanner, 'argument_type', parseNext)
  } else if (scanner.scanIfString(':')) {
    throw new ParseError(
      scanner,
      `Unexpected return type in ${type} function (${type} functions must return a View)`,
    )
  } else {
    returnType = new Expressions.InferIdentifier(
      [argDeclarations.range[1], argDeclarations.range[1]],
      scanner.flushComments(),
    )
  }
  scanner.whereAmI(`scanFormula returnType = ${returnType}`)

  scanner.scanSpaces()
  returnType.followingComments.push(...scanner.flushComments())
  scanner.scanAllWhitespace()

  const precedingReturnTypeComments = scanner.flushComments()
  scanner.expectString(
    FUNCTION_BODY_START,
    `Expected '${FUNCTION_BODY_START}' followed by the function body, or ':' followed by the return type`,
  )

  scanner.whereAmI(`scanFormulaArguments: scan body within ${bodyExpressionType}`)
  const body = parseNext(bodyExpressionType, {
    isInPipe: false,
    isInView,
  })

  if (type === 'view') {
    return new Expressions.ViewFormulaExpression(
      [range0, scanner.charIndex],
      precedingComments,
      precedingNameComments,
      precedingReturnTypeComments,
      nameRef!,
      argDeclarations,
      returnType,
      body,
    )
  } else if (type === 'render') {
    return new Expressions.RenderFormulaExpression(
      [range0, scanner.charIndex],
      precedingComments,
      precedingNameComments,
      precedingReturnTypeComments,
      nameRef!,
      argDeclarations,
      returnType,
      body,
    )
  } else {
    if (type === 'static') {
      return new Expressions.StaticFormulaExpression(
        [range0, scanner.charIndex],
        precedingComments,
        precedingNameComments,
        precedingReturnTypeComments,
        nameRef!,
        argDeclarations,
        returnType,
        body,
        generics,
      )
    } else if (bodyExpressionType === 'class') {
      return new Expressions.MemberFormulaExpression(
        [range0, scanner.charIndex],
        precedingComments,
        precedingNameComments,
        precedingReturnTypeComments,
        nameRef!,
        argDeclarations,
        returnType,
        body,
        generics,
        isOverride,
      )
    } else if (nameRef) {
      return new Expressions.NamedFormulaExpression(
        [range0, scanner.charIndex],
        precedingComments,
        precedingNameComments,
        precedingReturnTypeComments,
        nameRef,
        argDeclarations,
        returnType,
        body,
        generics,
      )
    }

    return new Expressions.FormulaExpression(
      [range0, scanner.charIndex],
      precedingComments,
      precedingNameComments,
      precedingReturnTypeComments,
      undefined,
      argDeclarations,
      returnType,
      body,
      generics,
    )
  }
}

/**
 * Scans generic names just after the '<'.
 * Ends after it scans a closing '>'.
 */
export function scanGenerics(scanner: Scanner, parseNext: ParseNext) {
  const generics: string[] = []
  scanner.scanAllWhitespace()
  for (;;) {
    const generic = scanValidTypeName(scanner).name
    if (generics.includes(generic)) {
      throw new ParseError(
        scanner,
        `Unexpected duplicate generic identifier <${generic}>`,
        scanner.charIndex - generic.length,
      )
    }

    if (
      scanner.test(() => {
        scanner.scanAllWhitespace()
        return scanner.isWord('is')
      })
    ) {
      scanner.scanAllWhitespace()
      scanner.expectString('is')
      scanner.scanAllWhitespace()
      const type = scanArgumentType(scanner, 'argument_type', parseNext)
      // generic.type = type
      throw `TODO - support type on generic ${type}`
    }

    generics.push(generic)

    const shouldBreak = scanner.scanCommaOrBreak(
      GENERIC_CLOSE,
      `Expected ',' separating items in the object`,
    )

    if (shouldBreak) {
      break
    }

    scanner.scanAllWhitespace()
  }

  return generics
}
