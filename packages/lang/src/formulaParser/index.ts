import {ok, err, attempt} from '@extra-lang/result'

import * as Values from '../values'

import {Application} from './application'
import * as Expressions from './expressions'
import {Expression} from './expressions'
import {LOWEST_PRECEDENCE, binaryOperatorNamed, isOperator} from './operators'
import {
  ParseError,
  type ParseNext,
  type ExpressionType,
  type GetParserResult,
  type Operator,
  type Options,
} from './types'
import {
  isBinaryOperatorSymbol,
  isBinaryOperatorName,
  isCommentStart,
  isDiceStart,
  isNumberChar,
  isNumberStart,
  isRefStartChar,
  isStringStartChar,
  isUnaryOperatorChar,
  isUnaryOperatorName,
  isViewStart,
  terminatesWithComma,
  terminatesWithRoundBracket,
  terminatesWithSquareBracket,
  terminatesWithCurlyBracket,
  terminatesWithAngleBracket,
  isBlockStartOperator,
  isWhitespaceChar,
  treatNewlineAsComma,
  expressionSupportsSplat,
  isTaggedString,
  LET_KEYWORD,
  LET_IN,
  VIEW_KEYWORD,
  FN_KEYWORD,
  INCLUSION_OPERATOR,
  NULL_COALESCING,
  PARENS_OPEN,
  ARRAY_OPEN,
  ARRAY_WORD_START,
  DICT_WORD_START,
  SET_WORD_START,
  REGEX_START,
  OBJECT_OPEN,
  OBJECT_WORD_START,
  SINGLE_BLOCK_OPEN,
  PUBLIC_KEYWORD,
  CLASS_KEYWORD,
  IMPORT_KEYWORD,
  REQUIRES_KEYWORD,
  TYPE_KEYWORD,
  IS_KEYWORD,
  NOT_IS_KEYWORD,
  CASE_KEYWORD,
  PROVIDES_KEYWORD,
  ENUM_KEYWORD,
} from './grammars'
import {Scanner} from './scanner'
import {unexpectedToken} from './scan/basics'
import {scanNumber} from './scan/number'
import {scanRegex} from './scan/regex'
import {scanIdentifier} from './scan/identifier'
import {scanString} from './scan/string'
import {scanDice} from './scan/dice'
import {
  scanRequiresStatement,
  scanImportStatement,
  scanHelperDefinition,
  scanTypeDefinition,
  scanProvidesStatement,
  scanApplicationType,
} from './scan/application'
import {scanFormula} from './scan/formula'
import {scanArray, scanDict, scanObject, scanSet} from './scan/container_type'
import {scanView} from './scan/view'
import {scanJsx} from './scan/jsx'
import {scanPipePlaceholder} from './scan/pipe'
import {scanParensGroup} from './scan/parens'
import {scanArrayAccess} from './scan/array_access'
import {scanBlockArgs, scanInvocationArgs} from './scan/formula_invocation_arguments'
import {scanBinaryOperator} from './scan/binary_operator'
import {scanUnaryOperator} from './scan/unary_operator'
import {scanLet} from './scan/let'
import {scanCase, scanMatch} from './scan/match'
import {scanArgumentType} from './scan/argument_type'
import {scanClass} from './scan/class'
import {scanEnum} from './scan/enum'

const LOWEST_OP: Operator = {
  name: 'lowest op',
  symbol: '',
  precedence: LOWEST_PRECEDENCE,
  associativity: 'left',
  arity: 1,
  precedingComments: [],
  followingOperatorComments: [],
  create() {
    throw new Error('Should not be called')
  },
}

export function parse(input: string, debug = 0): GetParserResult<Expression> {
  const scanner = new Scanner(input, {debug})
  const result = attempt<Expression, ParseError>(
    () => parseInternal(scanner, 'expression'),
    e => e instanceof ParseError,
  )

  if (result.isOk()) {
    const expression = result.value
    scanner.scanAllWhitespace()
    if (scanner.charIndex < input.length) {
      return err(new ParseError(scanner, 'Unexpected end of formula before the input was parsed'))
    }
    return ok(expression)
  }

  return err(result.error)
}

export function parseType(input: string, debug = 0) {
  return testScan(input, (scanner, parseNext) =>
    scanArgumentType(scanner, 'argument_type', parseNext),
  )
}

export function parseApplication(input: string, debug = 0): GetParserResult<Application> {
  const scanner = new Scanner(input, {debug})

  const range0 = scanner.charIndex
  const applicationTokens: {
    provides: Expressions.ProvidesStatement | undefined
    requires: Expressions.RequiresStatement | undefined
    imports: Expressions.ImportStatement[]
    expressions: (
      | Expressions.TypeDefinition
      | Expressions.HelperDefinition
      | Expressions.ViewDefinition
      | Expressions.ClassDefinition
      | Expressions.EnumDefinition
    )[]
  } = {
    provides: undefined,
    requires: undefined,
    imports: [],
    expressions: [],
  }

  scanner.scanAllWhitespace()
  for (;;) {
    if (scanner.isEOF()) {
      break
    }

    if (scanner.isWord(REQUIRES_KEYWORD)) {
      //
      //  REQUIRES
      //
      const requires = scanRequiresStatement(scanner)

      if (applicationTokens.requires) {
        applicationTokens.requires.envs.push(...requires.envs)
      } else {
        applicationTokens.requires = requires
      }
    } else if (scanner.isWord(PROVIDES_KEYWORD)) {
      //
      //  PROVIDES
      //
      if (applicationTokens.provides) {
        return err(
          new ParseError(
            scanner,
            `Provides statement already defined: ${applicationTokens.provides}`,
          ),
        )
      }

      const provides = scanProvidesStatement(scanner)
      applicationTokens.provides = provides
    } else if (scanner.isWord(IMPORT_KEYWORD)) {
      //
      //  IMPORT
      //
      applicationTokens.imports.push(scanImportStatement(scanner))
    } else if (scanner.test(isPublic(TYPE_KEYWORD))) {
      const typeExpr = scan(scanner, scanApplicationType)
      if (typeExpr.isErr()) {
        return err(typeExpr.error)
      }
      applicationTokens.expressions.push(typeExpr.value as Expressions.TypeDefinition)
    } else if (scanner.test(isPublic(CLASS_KEYWORD))) {
      const classExpr = scan(scanner, scanClass)
      if (classExpr.isErr()) {
        return err(classExpr.error)
      }
      applicationTokens.expressions.push(classExpr.value as Expressions.ClassDefinition)
    } else if (scanner.test(isPublic(ENUM_KEYWORD))) {
      const enumExpr = scan(scanner, scanEnum)
      if (enumExpr.isErr()) {
        return err(enumExpr.error)
      }
      applicationTokens.expressions.push(enumExpr.value as Expressions.EnumDefinition)
    } else if (scanner.isWord(FN_KEYWORD)) {
      //
      //  HELPER
      //
      const helper = scan(scanner, scanHelperDefinition)
      if (helper.isErr()) {
        return err(helper.error)
      }
      applicationTokens.expressions.push(helper.value as Expressions.HelperDefinition)
    } else if (scanner.isWord(VIEW_KEYWORD)) {
      //
      //  <VIEW>
      //
      const view = scan(scanner, scanView)
      if (view.isErr()) {
        return err(view.error)
      }
      applicationTokens.expressions.push(view.value as Expressions.ViewDefinition)
    } else {
      throw new ParseError(scanner, `Unexpected token '${unexpectedToken(scanner)}'`)
    }

    scanner.scanAllWhitespace()
  }

  return ok(
    new Application(
      [range0, scanner.input.length],
      scanner.flushComments(),
      applicationTokens.requires,
      applicationTokens.imports,
      applicationTokens.expressions,
    ) as any,
  )
}

function isPublic(keyword: string) {
  return (scanner: Scanner) => {
    scanner.scanIfWord(PUBLIC_KEYWORD) && scanner.expectWhitespace()
    return scanner.isWord(keyword)
  }
}

/**
 * Only for testing.
 */
export function parseInternalTest(
  input: string,
  expressionType: ExpressionType,
  options?: Options,
): GetParserResult<[Expression, Scanner]> {
  const scanner = new Scanner(input, options)
  return parseAttempt(scanner, expressionType).map(expression => [expression, scanner])
}

/**
 * Only for testing.
 */
export function testScan(
  input: string,
  scanFn: (scanner: Scanner, parseNext: ParseNext) => Expression,
  options?: Options,
): GetParserResult<Expression> {
  return attempt<Expressions.Expression, ParseError>(
    () => {
      const scanner = new Scanner(input, options)
      const parseNext = prepareParseNext(scanner)
      return scanFn(scanner, parseNext)
    },
    e => e instanceof ParseError,
  )
}

/**
 * Provides an easy way to scan an expression using any `scan*` function.
 */
function scan(
  scanner: Scanner,
  scanFn: (scanner: Scanner, parseNext: ParseNext) => Expression,
  options?: Options,
): GetParserResult<Expression> {
  return attempt<Expressions.Expression, ParseError>(
    () => {
      const parseNext = prepareParseNext(scanner)
      return scanFn(scanner, parseNext)
    },
    e => e instanceof ParseError,
  )
}

function parseAttempt(
  scanner: Scanner,
  expressionType: ExpressionType = 'expression',
): GetParserResult<Expression> {
  return attempt<Expressions.Expression, ParseError>(
    () => parseInternal(scanner, expressionType),
    e => e instanceof ParseError,
  )
}

function prepareParseNext(scanner: Scanner) {
  scanner.scanAllWhitespace()
  return function parseNext(
    expressionType: ExpressionType,
    options: Pick<Options, 'isInPipe' | 'isInView'> = {},
  ) {
    scanner.pushOptions(options)
    const value = parseInternal(scanner, expressionType)
    scanner.popOptions()

    return value
  }
}

function parseInternal(
  scanner: Scanner,
  expressionType: ExpressionType = 'expression',
): Expression {
  let isMatchingExpression = true
  let prevOperator: Operator = LOWEST_OP
  // [range0, Operator]
  const operatorStack: [number, Operator][] = []
  const expressionStack: Expression[] = []
  const parseNext = prepareParseNext(scanner)

  function processOperator(nextOperator: Operator) {
    // once we're "in the pipe", since it's the lowest precedence, we can't really
    // *leave* the pipe (within the current expression)
    const enterPipe =
      !scanner.isInPipe && (isOperator(nextOperator, '|>', 2) || isOperator(nextOperator, '?|>', 2))
    if (enterPipe) {
      scanner.setOptions({isInPipe: true})
    }

    while (
      operatorStack.length &&
      ((nextOperator.associativity === 'left' &&
        nextOperator.precedence <= prevOperator.precedence) ||
        (nextOperator.associativity === 'right' &&
          nextOperator.precedence < prevOperator.precedence))
    ) {
      const [range0, operator] = operatorStack.pop() ?? [0]
      if (operator !== undefined) {
        const args: Expression[] = []
        for (let i = 0; i < operator.arity; ++i) {
          const value = expressionStack.pop()
          if (value === undefined) {
            throw new ParseError(
              scanner,
              `Expected ${operator.arity} argument(s) for operator '${operator.symbol}', but found ${i}`,
            )
          }

          args.unshift(value)
        }

        // small "optimization" (aesthetics, really), to convert unary negate of a
        // literal number, to the negated literal number
        let negativeNumber: Expression | undefined
        if (isOperator(operator, '-', 1) && args[0] instanceof Expressions.Literal) {
          const literal = args[0]
          if (literal.value instanceof Values.IntValue) {
            negativeNumber = new Expressions.Literal(
              literal.range,
              literal.precedingComments,
              Values.int(-literal.value.value),
            )
          } else if (literal.value instanceof Values.FloatValue) {
            negativeNumber = new Expressions.Literal(
              literal.range,
              literal.precedingComments,
              Values.float(-literal.value.value),
            )
          }
        }

        const operation =
          negativeNumber ??
          operator.create(
            [range0, range0 + operator.symbol.length],
            operator.precedingComments,
            operator.followingOperatorComments,
            operator,
            args,
          )
        expressionStack.push(operation)
      }

      const last = operatorStack.at(-1)
      if (last) {
        prevOperator = last[1]
      }
    }

    if (nextOperator !== LOWEST_OP) {
      operatorStack.push([scanner.charIndex, nextOperator])
    }

    prevOperator = nextOperator
    isMatchingExpression = true
  }

  function processExpression(expression: Expression) {
    if (!isMatchingExpression) {
      throw new ParseError(scanner, `Expected operator, found '${unexpectedToken(scanner)}'`)
    }

    scanner.whereAmI(`==> adding ${expression} <==`)
    expressionStack.push(expression)
    isMatchingExpression = false
  }

  function processBlockArguments() {
    const appendToArguments = expressionStack.pop()
    // blocks can only be appended to ArgumentsList
    if (!(appendToArguments instanceof Expressions.ArgumentsList)) {
      throw new ParseError(
        scanner,
        `Block operator '{' can only follow a function argument list. Found '${appendToArguments}'`,
      )
    }

    let nextArguments: Expressions.ArgumentsList
    if (scanner.scanIfString(SINGLE_BLOCK_OPEN)) {
      const expression = parseNext('argument')
      nextArguments = new Expressions.ArgumentsList(
        [appendToArguments.range[0], expression.range[1]],
        [],
        [],
        appendToArguments.parenArgs,
        [new Expressions.PositionalArgument(expression.range, scanner.flushComments(), expression)],
      )
    } else {
      const blockArguments = scanBlockArgs(scanner, parseNext)
      nextArguments = new Expressions.ArgumentsList(
        [appendToArguments.range[0], blockArguments.range[1]],
        blockArguments.precedingComments,
        blockArguments.followingComments,
        appendToArguments.parenArgs,
        blockArguments.parenArgs,
      )
      nextArguments.lastParensComments = blockArguments.lastParensComments
    }

    if (nextArguments) {
      nextArguments.lastBlockComments = nextArguments.lastParensComments
      nextArguments.lastParensComments = appendToArguments.lastParensComments
      nextArguments.betweenComments = [
        ...appendToArguments.followingComments,
        ...nextArguments.precedingComments,
      ]
      nextArguments.precedingComments = appendToArguments.precedingComments
      expressionStack.push(nextArguments)
    }
  }

  function returnSingleExpression() {
    return (
      !isMatchingExpression &&
      (expressionType === 'argument_type' ||
        expressionType === 'single_expression' ||
        expressionType === 'view_property')
    )
  }

  // special "allow" list for view_property:
  // - <View prop=foo.bar …
  // - <View prop=foo?.bar …
  // - <View prop=foo[0] …
  // - <View prop=foo('bar') …
  function specialViewPropertyAllowList() {
    if (expressionType !== 'view_property') {
      return false
    }

    scanner.whereAmI(`specialAllowList: ${scanner.char}`)
    switch (scanner.char) {
      case '?':
        return scanner.nextChar === '.'
      case '.':
      case '[':
      case '(':
        return true
    }

    return false
  }

  function scanExpression(): Expression {
    scanner.whereAmI('parseInternal:scanExpression ' + expressionType)
    while (!scanner.isEOF()) {
      if (!isMatchingExpression) {
        if (treatNewlineAsComma(expressionType) && scanner.is('\n')) {
          // we're at a newline... cool
          // 1. is the next token a '-'? Check for whitespace after.
          //    whitespace means it's subtraction (keep scanning),
          //    otherwise it's negation (stop scanning)
          // 2. is the next token '...'? if we're scanning array/object/set/dict,
          //    that's a splat operator, we should stop scanning.
          // 3. check for an 'if' inclusion operator inside of array/object/set/dict.
          // 4. finally, check for a binary operator.
          if (
            scanner.test(() => {
              scanner.scanAllWhitespace()
              if (scanner.is(/[-~$][^ \n\t]/)) {
                scanner.whereAmI('scanning a negative number')
                return false
              }

              if (scanner.is('...') && expressionSupportsSplat(expressionType)) {
                return false
              }

              if (scanner.is(INCLUSION_OPERATOR) && expressionSupportsSplat(expressionType)) {
                scanner.whereAmI('INCLUSION_OPERATOR')
                return true
              }

              return isBinaryOperatorSymbol(scanner) || isBinaryOperatorName(scanner)
            })
          ) {
            scanner.scanAllWhitespace()
          } else {
            const comments = scanner.flushComments()
            const commentExpr = expressionStack.at(-1)
            if (commentExpr) {
              commentExpr.followingComments.push(...comments)
            }

            scanner.whereAmI(`done scanning ${expressionType}`)
            break
          }
        }

        if (expressionType === 'let') {
          if (
            scanner.test(() => {
              scanner.scanAllWhitespace()
              return scanner.isWord('in')
            })
          ) {
            const comments = scanner.flushComments()
            const commentExpr = expressionStack.at(-1)
            if (commentExpr) {
              commentExpr.followingComments.push(...comments)
            }

            scanner.whereAmI(`done scanning let`)
            break
          }
        }

        if (
          (terminatesWithComma(expressionType) && scanner.is(',')) ||
          (terminatesWithRoundBracket(expressionType) && scanner.is(')')) ||
          (terminatesWithSquareBracket(expressionType) && scanner.is(']')) ||
          (terminatesWithCurlyBracket(expressionType) && scanner.is('}')) ||
          (terminatesWithAngleBracket(expressionType) && scanner.is('>'))
        ) {
          scanner.whereAmI(`done scanning ${expressionType}`)
          break
        }
      }

      if (isCommentStart(scanner.remainingInput)) {
        throw 'testing - does this happen?'
        // scanner.scanComment()
        // continue
      }

      if (isMatchingExpression) {
        scanner.whereAmI(`expressionType ${expressionType}`)
        if (
          isOperator(prevOperator, IS_KEYWORD, 2) ||
          isOperator(prevOperator, NOT_IS_KEYWORD, 2)
        ) {
          processExpression(scanMatch(scanner, parseNext))
        } else if (
          scanner.is(CASE_KEYWORD) &&
          (expressionType === 'block_argument' || expressionType === 'argument')
        ) {
          processExpression(scanCase(scanner, parseNext))
        } else if (scanner.isInView && isViewStart(scanner.remainingInput)) {
          processExpression(scanJsx(scanner, parseNext))
        } else if (isDiceStart(scanner.remainingInput)) {
          processExpression(scanDice(scanner))
        } else if (isNumberChar(scanner.char) && isNumberStart(scanner)) {
          processExpression(scanNumber(scanner, 'float'))
        } else if (scanner.isWord(FN_KEYWORD)) {
          processExpression(scanFormula(scanner, expressionType, parseNext))
        } else if (scanner.is(Expressions.PipePlaceholderExpression.Symbol)) {
          processExpression(scanPipePlaceholder(scanner))
        } else if (scanner.isWord(LET_KEYWORD)) {
          processExpression(scanLet(scanner, parseNext, expressionType))
        } else if (scanner.is(PARENS_OPEN)) {
          processExpression(scanParensGroup(scanner, parseNext))
        } else if (scanner.is(ARRAY_OPEN)) {
          processExpression(scanArray(scanner, parseNext, 'array[]'))
        } else if (scanner.isWord(ARRAY_WORD_START)) {
          processExpression(scanArray(scanner, parseNext, 'array-word'))
        } else if (scanner.is(OBJECT_OPEN)) {
          processExpression(scanObject(scanner, parseNext, 'object{}'))
        } else if (scanner.isWord(OBJECT_WORD_START)) {
          processExpression(scanObject(scanner, parseNext, 'object-word'))
        } else if (scanner.isWord(SET_WORD_START)) {
          processExpression(scanSet(scanner, parseNext))
        } else if (scanner.isWord(DICT_WORD_START)) {
          processExpression(scanDict(scanner, parseNext))
        } else if (
          isUnaryOperatorChar(scanner.char) ||
          isUnaryOperatorName(scanner.remainingInput)
        ) {
          processOperator(scanUnaryOperator(scanner))
        } else if (isStringStartChar(scanner)) {
          processExpression(scanString(scanner, true, parseNext))
        } else if (isTaggedString(scanner)) {
          processExpression(scanString(scanner, true, parseNext))
        } else if (scanner.is(REGEX_START)) {
          processExpression(scanRegex(scanner))
        } else if (isRefStartChar(scanner)) {
          processExpression(scanIdentifier(scanner))
        } else {
          throw new ParseError(scanner, `Unexpected token '${unexpectedToken(scanner)}'`)
        }
        scanner.whereAmI(`expressionType ${expressionType}`)

        if (isWhitespaceChar(scanner.prevChar) && !scanner.isEOF()) {
          // very special case for let ... in, where the 'let' ends with whitespace before 'in'
          if (
            expressionType === LET_KEYWORD &&
            scanner.test(() => {
              scanner.scanAllWhitespace()
              return scanner.isWord(LET_IN)
            })
          ) {
          }
        }
      } else {
        if (scanner.is(PARENS_OPEN)) {
          processOperator(binaryOperatorNamed('fn', scanner.flushComments()))
          processExpression(scanInvocationArgs(scanner, parseNext))
        } else if (scanner.is(NULL_COALESCING + PARENS_OPEN)) {
          scanner.expectString(NULL_COALESCING)
          processOperator(binaryOperatorNamed('?.()', scanner.flushComments()))
          processExpression(scanInvocationArgs(scanner, parseNext))
        } else if (scanner.is(ARRAY_OPEN)) {
          processOperator(binaryOperatorNamed('[]', scanner.flushComments()))
          processExpression(scanArrayAccess(scanner, parseNext))
        } else if (scanner.is(NULL_COALESCING + ARRAY_OPEN)) {
          scanner.expectString(NULL_COALESCING)
          processOperator(binaryOperatorNamed('?.[]', scanner.flushComments()))
          processExpression(scanArrayAccess(scanner, parseNext))
        } else if (isBinaryOperatorSymbol(scanner) || isBinaryOperatorName(scanner)) {
          processOperator(scanBinaryOperator(scanner))
        } else if (
          expressionSupportsSplat(expressionType) &&
          scanner.scanIfWord(INCLUSION_OPERATOR)
        ) {
          // if we are inside an array/dict/set/object literal, check for the inclusion
          // operator `if`
          processOperator(binaryOperatorNamed(INCLUSION_OPERATOR, scanner.flushComments()))
        } else if (isBlockStartOperator(scanner)) {
          // scans for `foo() { arg0, name: arg1, other: arg2, arg3 }`
          processBlockArguments()
        } else {
          const expectComma = treatNewlineAsComma(expressionType)
          throw new ParseError(
            scanner,
            `Expected operator${expectComma ? ' or comma' : ''}, found '${unexpectedToken(
              scanner,
            )}'`,
          )
        }
      }

      if (returnSingleExpression()) {
        if (
          scanner.test(() => {
            scanner.scanSpaces()
            return specialViewPropertyAllowList()
          })
        ) {
          scanner.scanSpaces()
          // TODO: attach comments?
          continue
        }

        scanner.whereAmI(`returnSingleExpression in ${expressionType}`)
        // TODO: attach comments?
        break
      }

      scanner.whereAmI(
        `treatNewlineAsComma(${expressionType}) ? ${treatNewlineAsComma(expressionType)}. isMatchingExpression ? ${isMatchingExpression}`,
      )

      // after an expression or operator, scan the remaining line (esp same-line comments)
      scanner.scanSpaces()

      // attach any remaining comments to the last expression or operator
      // if isMatchingExpression, attach it to the last operator
      // else attach to the last expression
      const comments = scanner.flushComments()
      if (comments.length) {
        if (isMatchingExpression) {
          const operatorExpr = operatorStack.at(-1)?.[1]
          if (operatorExpr) {
            operatorExpr.followingOperatorComments.push(...comments)

            scanner.whereAmI(
              `attaching comments: [${comments.map(({comment}) => comment).join('\\n')}] to ${operatorExpr.name}`,
            )
          }
        } else {
          const commentExpr = expressionStack.at(-1)
          if (commentExpr) {
            commentExpr.followingComments.push(...comments)

            scanner.whereAmI(
              `attaching comments: [${comments.map(({comment}) => comment).join('\\n')}] to ${commentExpr}`,
            )
          }
        }
      }

      // after an operator, or expressions that don't expect comma/newlines, scan all
      // available whitespace.
      if (isMatchingExpression || !treatNewlineAsComma(expressionType)) {
        scanner.scanAllWhitespace()
      }
    }

    if (isMatchingExpression) {
      throw new ParseError(scanner, `Unexpected end of input, expected expression after operator`)
    }

    processOperator(LOWEST_OP)

    if (!expressionStack.length) {
      throw new ParseError(scanner, `Unexpected end of input`)
    }

    expressionStack[0].followingComments.push(...scanner.flushComments())
    return expressionStack[0]
  } // end of scanExpression()

  let expression: Expression
  if (expressionType === 'app_type_definition') {
    expression = scanTypeDefinition(scanner, parseNext)
  } else if (expressionType === 'app_view_definition') {
    expression = scanView(scanner, parseNext)
  } else if (expressionType === 'app_helper_definition') {
    expression = scanHelperDefinition(scanner, parseNext)
  } else if (expressionType === 'argument_type') {
    expression = scanArgumentType(scanner, expressionType, parseNext)
  } else {
    expression = scanExpression()
  }

  return expression
}
