import * as Expressions from '../../expressions'
import {type Expression} from '../../expressions'
import {
  ARGS_CLOSE,
  ARGS_OPEN,
  ARG_SEPARATOR,
  KWARG_OPERATOR,
  SPREAD_OPERATOR,
  isArgumentStartChar,
} from '../grammars'
import {type Scanner} from '../scanner'
import {ParseError, type ParseNext} from '../types'

import {scanArgumentType} from './argument_type'
import {scanValidLocalName} from './identifier'

// "Formula" (declared, actual formula) vs "Formula Type" (type signature of a
// formula)

// Formulas can have default values, Formula Types can have optional arguments.
//
// fn plusOne(# arg: Int = 0) => foo + 1
//            ^^^^^^^^^^^^^^

export function scanFormulaLiteralArguments(
  scanner: Scanner,
  type: 'view' | 'fn',
  parseNext: ParseNext,
  canInfer: boolean,
) {
  return _scanArguments(scanner, 'formula', type, parseNext, canInfer)
}

// _Formula Types_ cannot have default values, only optional args
//
// fn visit(func: fn(# arg?: Int): Int) => func(0) + func()
//                  ^^^^^^^^^^^^^
export function scanFormulaTypeArguments(scanner: Scanner, parseNext: ParseNext) {
  return _scanArguments(scanner, 'formula_type', 'fn', parseNext, false)
}

function _scanArguments<T extends 'formula' | 'formula_type'>(
  scanner: Scanner,
  is: T,
  // view formulas cannot have positional arguments
  type: 'view' | 'fn',
  parseNext: ParseNext,
  canInfer: boolean,
): T extends 'formula'
  ? Expressions.FormulaArgumentDefinition[]
  : Expressions.FormulaTypeArgument[] {
  scanner.whereAmI(`_scanArguments is = ${is}, type = ${type}`)

  scanner.expectString(ARGS_OPEN, `Expected '${ARGS_OPEN}' to start arguments`)
  scanner.scanAllWhitespace()

  const args: Expressions.ArgumentExpression[] = []
  if (scanner.is(ARGS_CLOSE)) {
    scanner.expectString(ARGS_CLOSE)
  } else {
    const names = new Set<string>()
    const aliases = new Set<string>()
    let firstDefaultName = ''
    let prevIsRequired = true
    let firstOptionalArg = ''
    /**
     * The name of the first (and only) positional spread arg
     *
     *     fn(...# foo: Int): Int -> foo[0] ?? 0
     */
    let spreadPositionalArg: string | undefined
    /**
     * The name of the first (and only) keyword-arg
     *
     *     fn(**foo: Dict(Int)): Int -> foo['dave'] ?? 0
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
      if (scanner.test(scannerIsSpreadPositional)) {
        scanner.expectString(SPREAD_OPERATOR)
        scanner.scanAllWhitespace()
        isSpreadPositionalArg = true
        spreadArg = 'spread'
      } else if (scanner.test(scannerIsRepeatedNamed)) {
        scanner.expectString(SPREAD_OPERATOR)
        scanner.scanAllWhitespace()
        spreadArg = 'spread'
      } else if (scanner.test(scannerIsKeywordList)) {
        scanner.expectString(KWARG_OPERATOR)
        scanner.scanAllWhitespace()
        spreadArg = 'kwargs'
      }

      const isPositional = scanner.scanIfString('#')
      scanner.scanSpaces()

      const argNameRange0 = scanner.charIndex
      let argName = scanValidLocalName(scanner)
      scanner.scanSpaces()
      argName.followingComments.push(...scanner.flushComments())

      if (isSpreadPositionalArg && spreadPositionalArg !== undefined) {
        // spreadPositionalArg should be undefined at this point. If it is assigned,
        // we already have a spread positional arg
        throw new ParseError(
          scanner,
          `Found second remaining arguments list '${SPREAD_OPERATOR}# ${argName.name}' after '${SPREAD_OPERATOR}# ${spreadPositionalArg}'`,
          argRange0,
        )
      }

      if (isPositional && spreadPositionalArg !== undefined) {
        throw new ParseError(
          scanner,
          `Found positional argument '# ${argName.name}' after '${SPREAD_OPERATOR}# ${spreadPositionalArg}'.`,
          argRange0,
        )
      }

      if (spreadArg === 'kwargs' && kwargsNamedArg !== undefined) {
        // spreadPositionalArg should be undefined at this point, if it is true,
        // we already have a spread positional arg
        if (kwargsNamedArg !== undefined) {
          throw new ParseError(
            scanner,
            `Found second keyword arguments list '${KWARG_OPERATOR}${argName.name}' after '${KWARG_OPERATOR}${kwargsNamedArg}'`,
            argRange0,
          )
        }
      }

      if (!isPositional && kwargsNamedArg !== undefined) {
        throw new ParseError(
          scanner,
          `Found named argument '${argName.name}' after '${KWARG_OPERATOR}${kwargsNamedArg}'.`,
          argRange0,
        )
      }

      if (isSpreadPositionalArg) {
        spreadPositionalArg = argName.name
      } else if (spreadArg === 'kwargs') {
        kwargsNamedArg = argName.name
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
        argName = scanValidLocalName(scanner)
        scanner.scanSpaces()
        argName.followingComments.push(...scanner.flushComments())
        scanner.scanAllWhitespace()
      }

      argAlias ??= argName

      if (!isPositional) {
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
      //     callback: fn(# arg1: T, # arg2?: U)
      // will be called with either:
      //     callback(t, u)
      //     callback(t)
      let isRequired = true
      if (is === 'formula_type') {
        isRequired = !scanner.scanIfString('?')
        if (!isRequired) {
          prevIsRequired = false
          firstOptionalArg = firstOptionalArg ?? argName.name
        }
        scanner.scanSpaces()
      } else if (scanner.scanIfString('?')) {
        throw new ParseError(
          scanner,
          `Optional arguments are not allowed in function definitions (use a default value instead).`,
        )
      } else if (!prevIsRequired && isPositional) {
        throw new ParseError(
          scanner,
          `Required argument '# ${argName.name}' must appear before optional argument '# ${firstOptionalArg}'.\nAll required arguments must come before optional arguments.`,
          scanner.charIndex - argName.name.length,
        )
      }

      let argType: Expression
      if (is === 'formula' && !scanner.is(ARG_SEPARATOR)) {
        if (!canInfer) {
          throw new ParseError(scanner, `Expected type expression for '${argName.name}'`)
        }

        argType = new Expressions.InferIdentifier(
          [scanner.charIndex, scanner.charIndex],
          scanner.flushComments(),
        )
      } else {
        scanner.expectString(
          ARG_SEPARATOR,
          `Expected '${ARG_SEPARATOR}' followed by the argument type`,
        )
        scanner.scanAllWhitespace()
        argType = scanArgumentType(scanner, 'argument_type', parseNext)
        scanner.scanSpaces()
        argType.followingComments.push(...scanner.flushComments())

        if (spreadArg === 'spread' && !(argType instanceof Expressions.ArrayTypeExpression)) {
          throw new ParseError(
            scanner,
            `Expected 'Array' type for '${SPREAD_OPERATOR}${isSpreadPositionalArg ? '# ' : ''}${
              argName.name
            }', found '${argType}'. Remaining argument lists must use the Array type, e.g. 'Array(${argType})'.`,
          )
        } else if (spreadArg === 'kwargs' && !(argType instanceof Expressions.DictTypeExpression)) {
          throw new ParseError(
            scanner,
            `Expected 'Dict' type for '${KWARG_OPERATOR}${argName.name}', found '${argType}'. Keyword arguments lists must use the Dict type, e.g. 'Dict(${argType})'.`,
          )
        }
      }

      let defaultValue: Expression | undefined
      if (scanner.scanAhead('=')) {
        if (isPositional && spreadPositionalArg !== undefined) {
          throw new ParseError(
            scanner,
            `Default values are not allowed on positional arguments following a spread positional argument ('${SPREAD_OPERATOR}# ${spreadPositionalArg}')`,
          )
        }

        if (is === 'formula_type') {
          throw new ParseError(
            scanner,
            `Default values are not allowed in formula type definitions (but you can use '?:' to define optional arguments)`,
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
          `Required argument '# ${argName.name}' must appear before '# ${firstDefaultName}', which has a default value.\nRequired positional arguments must come before optional positional arguments.`,
        )
      }

      let arg: Expressions.ArgumentExpression
      if (is === 'formula') {
        arg = new Expressions.FormulaArgumentDefinition(
          [argRange0, scanner.charIndex],
          [], // precedingComments
          argName,
          argAlias,
          argType,
          spreadArg,
          isPositional,
          defaultValue,
        )
      } else {
        arg = new Expressions.FormulaTypeArgument(
          [argRange0, scanner.charIndex],
          [], // precedingComments
          argName,
          argAlias,
          argType,
          spreadArg,
          isPositional,
          isRequired,
        )
      }
      const shouldBreak = scanner.scanCommaOrBreak(
        ARGS_CLOSE,
        `Expected ',' separating items in the arguments`,
      )

      scanner.whereAmI(`_scanArguments: (${argName.name}: ${argType.constructor.name})`)
      arg.followingComments.push(...scanner.flushComments())
      args.push(arg)

      if (shouldBreak) {
        break
      }

      scanner.scanAllWhitespace()
    }
  }

  scanner.whereAmI('_scanArguments: [' + args.map(arg => arg.toCode()).join(',') + ']')
  return args as T extends 'formula'
    ? Expressions.FormulaArgumentDefinition[]
    : Expressions.FormulaTypeArgument[]
}

function scannerIsSpreadPositional(scanner: Scanner) {
  if (!scanner.scanIfString(SPREAD_OPERATOR)) {
    return false
  }

  scanner.scanAllWhitespace()
  return scanner.is('#')
}

function scannerIsRepeatedNamed(scanner: Scanner) {
  if (!scanner.scanIfString(SPREAD_OPERATOR)) {
    return false
  }

  scanner.scanAllWhitespace()
  return scanner.is(/\b/)
}

function scannerIsKeywordList(scanner: Scanner) {
  if (!scanner.scanIfString(KWARG_OPERATOR)) {
    return false
  }

  scanner.scanAllWhitespace()
  return scanner.is(/\b/)
}
