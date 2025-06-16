import * as Expressions from '~/formulaParser/expressions'
import {type Expression} from '~/formulaParser/expressions'
import {type Scanner} from '~/formulaParser/scanner'
import {type ExpressionType, type Comment, ParseError, type ParseNext} from '~/formulaParser/types'
import {
  FUNCTION_BODY_START,
  TYPE_CLOSE,
  TYPE_OPEN,
  isArgumentStartChar,
} from '~/formulaParser/grammars'

import {scanArgumentType} from './scanArgumentType'
import {scanFormulaArgumentDefinitions} from './formula_arguments'
import {scanValidName} from './identifier'

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

export function scanActionFormula(
  scanner: Scanner,
  parseNext: ParseNext,
  bodyExpressionType?: ExpressionType,
) {
  scanner.whereAmI('scanActionFormula')
  return _scanFormula(scanner, 'expression', parseNext, {
    type: '&fn',
    isNamedFn: true,
    bodyExpressionType,
  }) as Expressions.NamedFormulaExpression
}

export function scanViewFormula(
  scanner: Scanner,
  expressionType: ExpressionType,
  parseNext: ParseNext,
  bodyExpressionType?: ExpressionType,
) {
  return _scanFormula(scanner, expressionType, parseNext, {
    type: 'view',
    isNamedFn: true,
    bodyExpressionType,
  }) as Expressions.ViewFormulaExpression
}

export function scanMainFormula(
  scanner: Scanner,
  parseNext: ParseNext,
  bodyExpressionType?: ExpressionType,
) {
  return _scanFormula(scanner, 'expression', parseNext, {
    type: 'Main',
    isNamedFn: false,
    bodyExpressionType,
  }) as Expressions.MainFormulaExpression
}

function _scanFormula(
  scanner: Scanner,
  expressionType: ExpressionType,
  parseNext: ParseNext,
  options: {
    type: 'Main' | 'view' | 'fn' | '&fn'
    isNamedFn: boolean
    bodyExpressionType: ExpressionType | undefined
  },
) {
  const {type, isNamedFn} = options
  let {bodyExpressionType} = options
  const isInView = type === 'view' || type === 'Main'
  // not all expressionTypes are supported as scanFormula expression types
  if (bodyExpressionType === undefined) {
    switch (expressionType) {
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
      case 'view_embed':
        bodyExpressionType = expressionType
        break
      default:
        throw new ParseError(scanner, `Unexpected scanFormula within '${expressionType}'`)
    }
  }

  scanner.whereAmI(`scanFormula type = ${type}`)
  // scans 'fn' or 'Main' or 'view'
  const typeExpect = type === '&fn' ? 'fn' : type
  const typeDesc = type === '&fn' ? 'fn &<name>' : type

  const precedingComments = scanner.flushComments()
  const range0 = scanner.charIndex
  scanner.expectString(typeExpect, `Expected '${typeDesc}(' to start the formula expression`)
  if (isNamedFn) {
    scanner.expectWhitespace()
  }

  if (type === '&fn') {
    scanner.expectString('&', "Actions must start with the ampersand '&' symbol")
  }

  let nameRef: Expressions.Reference | undefined
  let precedingNameComments: Comment[] = []
  if (isArgumentStartChar(scanner)) {
    precedingNameComments = scanner.flushComments()
    nameRef = scanValidName(scanner)
  }

  if (isNamedFn && nameRef === undefined) {
    throw new ParseError(scanner, `Expected function name after '${type}'`)
  } else if (!isNamedFn && nameRef !== undefined) {
    throw new ParseError(scanner, `Unexpected named for '${type}'`)
  }
  scanner.scanAllWhitespace()

  let generics: string[] = []
  if (type === 'fn') {
    if (scanner.scanIfString(TYPE_OPEN)) {
      generics = scanGenerics(scanner)
    }
  } else if (scanner.scanIfString(TYPE_OPEN)) {
    throw new ParseError(scanner, `Unexpected generic in ${type} function`)
  }

  const argDeclarations = scanFormulaArgumentDefinitions(
    scanner,
    isInView ? 'view' : 'fn',
    expressionType,
    parseNext,
  )
  scanner.scanAllWhitespace()
  argDeclarations.followingComments.push(...scanner.flushComments())

  let returnType: Expression
  if (type === 'fn' && scanner.scanIfString(':')) {
    scanner.scanAllWhitespace()
    returnType = scanArgumentType(scanner, 'argument_type', expressionType, parseNext)
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
      nameRef ?? new Expressions.Reference([range0, range0], [], ''),
      argDeclarations,
      returnType,
      body,
      generics,
    )
  } else if (type === 'Main') {
    return new Expressions.MainFormulaExpression(
      [range0, body.range[1]],
      precedingComments,
      precedingNameComments,
      precedingReturnTypeComments,
      argDeclarations,
      returnType,
      body,
      generics,
    )
  } else {
    if (nameRef) {
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

export function scanGenerics(scanner: Scanner) {
  const generics: string[] = []
  scanner.scanAllWhitespace()
  for (;;) {
    const generic = scanValidName(scanner).name
    if (generics.includes(generic)) {
      throw new ParseError(
        scanner,
        `Unexpected duplicate generic identifier <${generic}>`,
        scanner.charIndex - generic.length,
      )
    }

    generics.push(generic)

    const shouldBreak = scanner.scanCommaOrBreak(
      TYPE_CLOSE,
      `Expected ',' separating items in the object`,
    )

    if (shouldBreak) {
      break
    }

    scanner.scanAllWhitespace()
  }

  return generics
}
