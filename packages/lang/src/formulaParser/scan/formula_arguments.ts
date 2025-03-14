import * as Expressions from '../expressions'
import {type Expression} from '../expressions'
import {ARGS_CLOSE, ARGS_OPEN, isArgumentStartChar} from '../grammars'
import {type Scanner} from '../scanner'
import {type ExpressionType, ParseError, type ParseNext} from '../types'
import {scanArgumentType} from './scanArgumentType'
import {scanValidName} from './identifier'

// "Formula argument" vs "Formula Type Argument"

// formulas _can_ have default values
export function scanFormulaArgumentDefinitions(
  scanner: Scanner,
  type: 'view' | 'fn',
  expressionType: ExpressionType,
  parseNext: ParseNext,
) {
  const range0 = scanner.charIndex - 1
  const precedingComments = scanner.flushComments()
  scanner.expectString(ARGS_OPEN, `Expected '${ARGS_OPEN}' to start arguments`)
  scanner.scanAllWhitespace()
  const [args, range1] = _scanArgumentDeclarations(
    scanner,
    'formula',
    type,
    expressionType,
    parseNext,
  )
  return new Expressions.FormulaLiteralArgumentDeclarations(
    [range0, range1],
    precedingComments,
    args,
  )
}

// _formula types_ cannot have default values, only optional args
export function scanFormulaTypeArgumentDefinitions(
  scanner: Scanner,
  expressionType: ExpressionType,
  parseNext: ParseNext,
) {
  const precedingComments = scanner.flushComments()
  const range0 = scanner.charIndex
  scanner.expectString(ARGS_OPEN)
  scanner.scanAllWhitespace()

  const [args, range1] = _scanArgumentDeclarations(
    scanner,
    'formula_type',
    'fn',
    expressionType,
    parseNext,
  )
  return new Expressions.FormulaTypeArgumentDeclarations([range0, range1], precedingComments, args)
}

function _scanArgumentDeclarations<T extends 'formula' | 'formula_type'>(
  scanner: Scanner,
  is: T,
  type: 'view' | 'fn',
  expressionType: ExpressionType,
  parseNext: ParseNext,
): [
  T extends 'formula'
    ? Expressions.FormulaLiteralArgumentAndTypeDeclaration[]
    : Expressions.FormulaTypeArgumentAndType[],
  number,
] {
  scanner.whereAmI(`_scanArgumentDeclarations is = ${is}, type = ${type}`)

  let range1 = scanner.charIndex
  const args: Expressions.ArgumentExpression[] = []
  if (scanner.is(ARGS_CLOSE)) {
    scanner.expectString(ARGS_CLOSE)
  } else {
    const names = new Set<string>()
    const aliases = new Set<string>()
    let firstDefaultName = ''
    let prevIsOptional = false
    let prevOptionalArg = ''
    /**
     * The name of the first (and only) positional spread arg
     *
     *     fn(...#foo: Int): Int -> foo[0] ?? 0
     */
    let spreadPositionalArg: string | undefined
    /**
     * The name of the first (and only) keyword-arg
     *
     *     fn(*foo: Dict(Int)): Int -> foo['dave'] ?? 0
     */
    let kwargsNamedArg: string | undefined
    for (;;) {
      if (scanner.isEOF()) {
        throw new ParseError(scanner, `Unexpected end of input while scanning formula.`)
      }

      const argRange0 = scanner.charIndex
      /**
       * Current argument is a spread arg (positional OR named)
       */
      let spreadArg: false | 'spread' | 'kwargs' = false
      /**
       * true => positional, false => named
       */
      let isSpreadPositionalArg = false
      if (scanner.is(/^\.\.\.\s*#/m)) {
        scanner.expectString('...')
        scanner.scanAllWhitespace()
        isSpreadPositionalArg = true
        spreadArg = 'spread'
      } else if (scanner.is(/^\.\.\.\s*\b/m)) {
        scanner.expectString('...')
        scanner.scanAllWhitespace()
        spreadArg = 'spread'
      } else if (scanner.is(/^\*\s*\b/)) {
        scanner.expectString('*')
        scanner.scanAllWhitespace()
        spreadArg = 'kwargs'
      }

      const isPositional = scanner.scanIfString('#')

      const argNameRange0 = scanner.charIndex
      let argName = scanValidName(scanner)
      scanner.scanSpaces()
      argName.followingComments.push(...scanner.flushComments())

      if (isSpreadPositionalArg && spreadPositionalArg === undefined) {
        spreadPositionalArg = argName.name
      } else if (isSpreadPositionalArg) {
        // spreadPositionalArg should be undefined at this point. If it is assigned,
        // we already have a spread positional arg
        throw new ParseError(
          scanner,
          `Found second remaining arguments list '...#${argName.name}' after '...#${spreadPositionalArg}'`,
          argRange0,
        )
      } else if (spreadArg === 'kwargs' && kwargsNamedArg === undefined) {
        kwargsNamedArg = argName.name
      } else if (spreadArg === 'kwargs') {
        // spreadPositionalArg should be undefined at this point, if it is true,
        // we already have a spread positional arg
        if (kwargsNamedArg !== undefined) {
          throw new ParseError(
            scanner,
            `Found second keyword arguments list '*${argName.name}' after '*${kwargsNamedArg}'`,
            argRange0,
          )
        }
      }

      if (isPositional && type === 'view') {
        throw new ParseError(
          scanner,
          `Unexpected positional argument '${argName.name}' in view() function`,
        )
      }

      scanner.scanAllWhitespace()

      let argAlias: Expressions.Reference | undefined
      if (!isPositional && is === 'formula' && isArgumentStartChar(scanner)) {
        argAlias = argName
        argName = scanValidName(scanner)
        scanner.scanSpaces()
        argName.followingComments.push(...scanner.flushComments())
        scanner.scanAllWhitespace()
      }

      if (!isPositional) {
        argAlias = argAlias ?? argName

        if (aliases.has(argAlias.name)) {
          throw new ParseError(
            scanner,
            `Found second argument with the same name '${argAlias.name}'`,
            argNameRange0,
          )
        }

        aliases.add(argAlias.name)
      }

      if (names.has(argName.name)) {
        throw new ParseError(
          scanner,
          `Found second argument with the same name '${argName.name}'`,
          argNameRange0,
        )
      }

      names.add(argName.name)

      // formula types can have optional args - the function passed to this can either
      // not have the argument at all, or it can have a default value
      //     callback: fn(#arg1: T, #arg2?: U)
      // will be called with either:
      //     callback(t, u)
      //     callback(t)
      let isOptional = false
      if (is === 'formula_type') {
        isOptional = scanner.scanIfString('?')
        prevIsOptional = true
        prevOptionalArg = argName.name
        scanner.scanSpaces()
      } else if (scanner.scanIfString('?')) {
        throw new ParseError(
          scanner,
          `Optional arguments are not allowed in function definitions (use a default value instead).`,
        )
      } else if (prevIsOptional && isPositional) {
        throw new ParseError(
          scanner,
          `Required argument '#${argName.name}' must appear before optional argument "#${prevOptionalArg}".\nAll required arguments must come before optional arguments.`,
          scanner.charIndex - argName.name.length,
        )
      }

      let argType: Expression
      if (is === 'formula' && !scanner.is(':')) {
        // maybe this will be supported one day?
        // argType = new Expressions.InferIdentifier(
        //   [scanner.charIndex, scanner.charIndex],
        //   scanner.flushComments(),
        // )
        throw new ParseError(scanner, `Expected type expression for '${argName.name}'`)
      } else {
        scanner.expectString(':', "Expected ':' followed by the argument type")
        scanner.scanAllWhitespace()
        argType = scanArgumentType(scanner, 'argument_type', expressionType, parseNext)
        scanner.scanSpaces()
        argType.followingComments.push(...scanner.flushComments())
        scanner.scanAllWhitespace()

        if (spreadArg === 'spread' && !(argType instanceof Expressions.ArrayTypeExpression)) {
          throw new ParseError(
            scanner,
            `Expected 'Array' type for '...${isSpreadPositionalArg ? '#' : ''}${
              argName.name
            }', found '${argType}'. Remaining argument lists must use the Array type, e.g. 'Array(${argType})'.`,
          )
        } else if (spreadArg === 'kwargs' && !(argType instanceof Expressions.DictTypeExpression)) {
          throw new ParseError(
            scanner,
            `Expected 'Dict' type for '*${argName.name}', found '${argType}'. Keyword arguments lists must use the Dict type, e.g. 'Dict(${argType})'.`,
          )
        }
      }

      let defaultValue: Expression | undefined
      if (scanner.scanIfString('=')) {
        if (is === 'formula_type') {
          throw new ParseError(
            scanner,
            `Default values are not allowed in formula type definitions (you can use '?:' to define optional arguments)`,
          )
        }

        scanner.scanAllWhitespace()
        defaultValue = parseNext('single_expression')
        scanner.scanSpaces()
        defaultValue.followingComments.push(...scanner.flushComments())
        firstDefaultName = firstDefaultName || argName.name

        scanner.scanSpaces()
      } else if (firstDefaultName && isPositional) {
        // we _had_ a default value, now we encountered an argument _without_ a default
        // value (this error doesn't apply to named arguments)
        throw new ParseError(
          scanner,
          `Required argument '#${argName.name}' must appear before '#${firstDefaultName}', which has a default value.\nRequired positional arguments must come before optional positional arguments.`,
        )
      }

      let arg: Expressions.ArgumentExpression
      if (is === 'formula') {
        arg = new Expressions.FormulaLiteralArgumentAndTypeDeclaration(
          [argRange0, scanner.charIndex],
          [], //
          argName,
          argAlias ?? argName,
          argType,
          spreadArg,
          isPositional,
          defaultValue,
        )
      } else {
        arg = new Expressions.FormulaTypeArgumentAndType(
          [argRange0, scanner.charIndex],
          [], //
          argName,
          argAlias ?? argName,
          argType,
          spreadArg,
          isPositional,
          isOptional,
        )
      }
      arg.followingComments.push(...scanner.flushComments())
      args.push(arg)

      scanner.whereAmI(`_scanArgumentDeclarations: (${argName.name}: ${argType.constructor.name})`)
      const shouldBreak = scanner.scanCommaOrBreak(
        ARGS_CLOSE,
        `Expected ',' separating items in the arguments`,
      )

      if (shouldBreak) {
        range1 = scanner.charIndex
        break
      }

      scanner.scanAllWhitespace()
    }
  }

  scanner.whereAmI('_scanArgumentDeclarations: [' + args.map(arg => arg.toCode()).join(',') + ']')
  return [
    args as T extends 'formula'
      ? Expressions.FormulaLiteralArgumentAndTypeDeclaration[]
      : Expressions.FormulaTypeArgumentAndType[],
    range1,
  ]
}
