import {DEFAULT_NARROWED_LENGTH, lengthDesc, type NarrowedLength} from '../../narrowed'
import {ARRAY, DICT, FLOAT, INT, OBJECT, SET, STRING} from '../../types'
import * as Expressions from '../expressions'
import {type Expression} from '../expressions'
import {
  isNumberChar,
  isNumberStart,
  isArgumentStartChar,
  isStringStartChar,
  ARGS_CLOSE,
  ARGS_OPEN,
  PARENS_CLOSE,
  PARENS_OPEN,
  OBJECT_OPEN,
  OBJECT_CLOSE,
  isNamedArg,
  ARRAY_OPEN,
  ARRAY_CLOSE,
} from '../grammars'
import {type Scanner} from '../scanner'
import {type ArgumentType, ParseError, type ParseNext, type ExpressionType} from '../types'
import {unexpectedToken} from './basics'
import {
  scanFormulaArgumentDefinitions,
  scanFormulaTypeArgumentDefinitions,
} from './formula_arguments'
import {scanAtom, scanIdentifier, scanValidName} from './identifier'
import {
  scanNarrowedFloat,
  scanNarrowedInt,
  scanNarrowedLength,
  scanNarrowedString,
} from './narrowed'
import {scanNumber} from './number'
import {scanString} from './string'

/**
 * scans for:
 *   type:
 *     Int, String, String(), etc
 *   Object:
 *     { … }
 *   Object:
 *     Object(age: Int), Object(#name: String), etc
 *   Array:
 *     Array(Int), Array(String), etc
 *   Dict:
 *     Dict(Int), Dict(String), etc
 *   Set:
 *     Set(Int), Set(String), etc
 *   oneOf:
 *     Int | String, (Int | String)
 *   function:
 *     fn (#name: Int): String
 *   enum:
 *     enum | NotLoaded | Loading | Success(#value: Tsuccess) | Failure(#value: Tfail)
 */
export function scanArgumentType(
  scanner: Scanner,
  // argument_type | application_type
  // only application_type supports enum definitions
  applicationOrArgument: ArgumentType,
  // could be anything in theory, because the 'is' operator scans for a type signature
  expressionType: ExpressionType,
  parseNext: ParseNext,
): Expression {
  scanner.whereAmI('scanArgumentType')
  let argType: Expression | undefined
  const range0 = scanner.charIndex
  const oneOfExpressions: Expression[] = []
  let extendsExpressions: Expression[] = []
  let hasOptional = false
  let rewind = scanner.charIndex

  // need to be careful in this scanning function to only scan what is necessary,
  // so that we can then check for a newline at the end. Object type parsing can
  // include multilines, with argument types coming at the end of the line.
  for (;;) {
    const arg0 = scanner.charIndex
    scanner.scanAllWhitespace()

    if (scanner.scanIfString(PARENS_OPEN)) {
      argType = scanArgumentType(scanner, applicationOrArgument, expressionType, parseNext)
      scanner.scanAllWhitespace()
      scanner.expectString(
        PARENS_CLOSE,
        `Expected '${PARENS_CLOSE}' closing the argument type group`,
      )
      scanner.whereAmI(`scanArgumentType: () ${argType.toCode()}`)
    } else if (isNumberChar(scanner.char) && isNumberStart(scanner.remainingInput)) {
      argType = scanNumber(scanner, 'float')
    } else if (isStringStartChar(scanner.char)) {
      argType = scanString(scanner, parseNext)
      // } else if (scanner.is(REGEX_START)) {
      //   argType = scanRegex(scanner)
    } else if (isArgumentStartChar(scanner)) {
      const identifier = scanIdentifier(scanner)

      if (identifier.name === 'enum') {
        if (applicationOrArgument !== 'application_type') {
          throw new ParseError(
            scanner,
            `Unexpected 'enum' definition. Enums can only be defined in the 'Types' section.`,
          )
        }

        scanner.scanAllWhitespace()
        argType = scanEnum(scanner, expressionType, parseNext)
      } else if (identifier.name === 'fn') {
        scanner.scanAllWhitespace()
        argType = scanFormulaType(scanner, arg0, expressionType, parseNext, applicationOrArgument)
      } else {
        if (
          scanner.test(() => {
            scanner.scanSpaces()
            return scanner.scanIfString(ARGS_OPEN)
          })
        ) {
          scanner.scanSpaces()
          scanner.expectString(ARGS_OPEN)
          scanner.scanAllWhitespace()

          if (identifier.name === STRING) {
            const narrowed = scanNarrowedString(scanner)
            argType = new Expressions.StringTypeExpression(
              [range0, scanner.charIndex],
              scanner.flushComments(),
              narrowed,
            )

            scanner.scanAllWhitespace()
            scanner.expectString(ARGS_CLOSE)
          } else if (identifier.name === INT) {
            const narrowed = scanNarrowedInt(scanner)
            argType = new Expressions.IntTypeExpression(
              [range0, scanner.charIndex],
              scanner.flushComments(),
              narrowed,
            )

            scanner.scanAllWhitespace()
            scanner.expectString(ARGS_CLOSE)
          } else if (identifier.name === FLOAT) {
            const narrowed = scanNarrowedFloat(scanner)
            argType = new Expressions.FloatTypeExpression(
              [range0, scanner.charIndex],
              scanner.flushComments(),
              narrowed,
            )

            scanner.scanAllWhitespace()
            scanner.expectString(ARGS_CLOSE)
          } else if (identifier.name === ARRAY) {
            argType = scanArrayType(
              scanner,
              applicationOrArgument,
              expressionType,
              parseNext,
              range0,
            )
          } else if (identifier.name === DICT) {
            argType = scanDictType(
              scanner,
              applicationOrArgument,
              expressionType,
              parseNext,
              range0,
            )
          } else if (identifier.name === SET) {
            argType = scanSetType(scanner, applicationOrArgument, expressionType, parseNext, range0)
          } else if (identifier.name === OBJECT) {
            throw 'only so much time'
          } else {
            throw new ParseError(
              scanner,
              `Unexpected type refinement on type '${identifier.name}'. Type refinements are only supported on String, Int, and Float, not '${identifier.name}'`,
              scanner.charIndex - 1,
            )
          }
        } else if (scanner.scanAhead('.')) {
          // parsing foo.type.Type
          // TODO: currently, only _concrete types_ are supported here.
          // ie if `Type` is generic `Type(a)`, this will fail.
          let childArgType: Expressions.NamespaceAccessExpression | undefined
          do {
            scanner.scanAllWhitespace()
            const childIdentifier = scanValidName(scanner)
            childArgType = new Expressions.NamespaceAccessExpression(
              [range0, scanner.charIndex],
              scanner.flushComments(),
              childArgType ?? identifier,
              childIdentifier,
            )
          } while (scanner.scanAhead('.'))

          return childArgType
        } else {
          if (identifier instanceof Expressions.ContainerTypeIdentifier) {
            throw new ParseError(
              scanner,
              `${identifier.name} requires a type (${identifier.name}(Type))`,
            )
          }

          argType = identifier
        }
      }
    } else if (scanner.scanIfString(OBJECT_OPEN)) {
      argType = scanObjectType(
        scanner,
        'literal',
        applicationOrArgument,
        expressionType,
        parseNext,
        range0,
      )
    } else {
      throw new ParseError(scanner, `Unexpected token '${unexpectedToken(scanner)}'`)
    }

    rewind = scanner.charIndex
    scanner.scanSpaces()

    let argTypeIsOptional = false
    if (scanner.scanIfString('?')) {
      rewind = scanner.charIndex
      scanner.scanSpaces()
      hasOptional = true
      argTypeIsOptional = true
    }

    if (scanner.scanIfString('&')) {
      if (argTypeIsOptional) {
        throw new ParseError(
          scanner,
          `Optional type '${argType}?' is not supported with the '&' extends operator`,
        )
      }

      scanner.whereAmI(`scanArgumentType: & ${argType.toCode()}`)
      extendsExpressions.push(argType)
      continue
    }

    if (extendsExpressions.length) {
      if (argTypeIsOptional) {
        throw new ParseError(
          scanner,
          `Optional type '${argType}?' is not supported with the '&' extends operator`,
        )
      }

      extendsExpressions.push(argType)

      argType = new Expressions.ExtendsExpression(
        [extendsExpressions[0].range[0], argType.range[1]],
        scanner.flushComments(),
        extendsExpressions,
      )

      extendsExpressions = []
    }

    if (scanner.scanAhead('|')) {
      scanner.whereAmI(`scanArgumentType: | ${argType.toCode()}`)
      oneOfExpressions.push(argType)
      continue
    }

    if (oneOfExpressions.length) {
      oneOfExpressions.push(argType)
    }

    scanner.rewindTo(rewind)
    break
  }

  if (hasOptional) {
    if (oneOfExpressions.length === 0) {
      oneOfExpressions.push(argType)
    }
    oneOfExpressions.push(
      new Expressions.NullExpression(
        [scanner.charIndex - 1, scanner.charIndex],
        scanner.flushComments(),
      ),
    )
  }

  if (oneOfExpressions.length > 1) {
    argType = new Expressions.OneOfTypeExpression(
      [range0, scanner.charIndex],
      scanner.flushComments(),
      oneOfExpressions,
    )
  }

  scanner.whereAmI(`scanArgumentType: ${argType.toCode()}`)
  return argType
}

/**
 * Scans a formula type, starting at the open parens.
 *
 * fn(foo: Type): Type
 *   ^^^^^^^^^^^^^^^^^
 */
function scanFormulaType(
  scanner: Scanner,
  arg0: number,
  expressionType: ExpressionType,
  parseNext: ParseNext,
  applicationOrArgument: ArgumentType,
) {
  const argDefinitions = scanFormulaTypeArgumentDefinitions(scanner, expressionType, parseNext)

  let returnType: Expression
  if (scanner.scanAhead(':')) {
    scanner.scanAllWhitespace()
    returnType = scanArgumentType(scanner, applicationOrArgument, expressionType, parseNext)
  } else {
    returnType = new Expressions.InferIdentifier(
      [scanner.charIndex, scanner.charIndex],
      scanner.flushComments(),
    )
  }

  return new Expressions.FormulaTypeExpression(
    [arg0, scanner.charIndex],
    scanner.flushComments(),
    argDefinitions,
    returnType,
  )
}

function scanObjectType(
  scanner: Scanner,
  is: 'literal' | 'object',
  applicationOrArgument: ArgumentType,
  expressionType: ExpressionType,
  parseNext: ParseNext,
  range0: number,
) {
  scanner.whereAmI(`scanObjectType (${is})`)
  scanner.scanAllWhitespace()
  // if (is === 'literal') {
  // } else {
  // }
  const values: [string | undefined, Expression][] = []
  for (;;) {
    scanner.whereAmI(`objectArgType: start of loop`)
    let name: string | undefined

    //     I played with the idea of having
    //     {
    //       fn foo(): Value
    //     }
    //
    //     but instead I think I should stick to
    //     {
    //       foo: fn(): Value
    //     }
    // if (scanner.isWord('fn')) {
    //   scanner.expectString('fn')
    //   scanner.expectWhitespace()
    //   name = scanValidName(scanner).name
    //   scanner.scanAllWhitespace()

    //   const arg0 = scanner.charIndex
    //   const formula = scanFormulaType(scanner, arg0, 'object', parseNext, 'argument_type')
    //   objectArgType = new Expressions.NamedFormulaTypeExpression(
    //     formula.range,
    //     name,
    //     formula.argDefinitions,
    //     formula.returnType,
    //   )
    // } else {
    // }
    if (isNamedArg(scanner)) {
      name = scanValidName(scanner).name
      scanner.scanAllWhitespace()
      scanner.expectString(':')
      scanner.scanAllWhitespace()
    }

    const objectArgType = scanArgumentType(
      scanner,
      applicationOrArgument,
      expressionType,
      parseNext,
    )

    scanner.whereAmI(`objectArgType: ${objectArgType.toCode()}`)
    values.push([name, objectArgType])

    const shouldBreak = scanner.scanCommaOrBreak(
      OBJECT_CLOSE,
      `Expected ',' or '${OBJECT_CLOSE}' in object type definition`,
    )
    scanner.whereAmI(`shouldBreak: ${shouldBreak}`)

    if (shouldBreak) {
      break
    }

    scanner.scanAllWhitespace()
  }

  scanner.whereAmI(
    `scanObjectType: {${values
      .map(([name, value]) => (name ? name + ':' : '') + value.toCode())
      .join(' ')}}`,
  )

  return new Expressions.ObjectTypeExpression(
    [range0, scanner.charIndex],
    scanner.flushComments(),
    values,
  )
}

function scanArrayType(
  scanner: Scanner,
  applicationOrArgument: ArgumentType,
  expressionType: ExpressionType,
  parseNext: ParseNext,
  range0: number,
) {
  scanner.whereAmI(`scanArrayType`)
  const {ofType, narrowedLength} = scanOfAndLength(
    scanner,
    applicationOrArgument,
    expressionType,
    parseNext,
  )
  scanner.whereAmI(
    `scanArrayType: (` + ofType.toCode() + `, length: ${lengthDesc(narrowedLength)})`,
  )
  return new Expressions.ArrayTypeExpression(
    [range0, scanner.charIndex],
    scanner.flushComments(),
    ofType,
    narrowedLength,
  )
}

function scanDictType(
  scanner: Scanner,
  applicationOrArgument: ArgumentType,
  expressionType: ExpressionType,
  parseNext: ParseNext,
  range0: number,
) {
  scanner.whereAmI(`scanDictType`)
  const ofType = scanArgumentType(scanner, applicationOrArgument, expressionType, parseNext)
  scanner.scanAllWhitespace()

  let narrowedLength: NarrowedLength = DEFAULT_NARROWED_LENGTH
  let didSetNarrowedLength = false
  const narrowedNames: Set<string> = new Set()
  let didSetNarrowedNames = false
  while (scanner.scanIfString(',')) {
    scanner.scanAllWhitespace()
    if (!didSetNarrowedLength && scanner.scanIfString('length')) {
      didSetNarrowedLength = true

      scanner.scanAllWhitespace()
      scanner.expectString(':')
      scanner.scanAllWhitespace()
      narrowedLength = scanNarrowedLength(scanner)
      scanner.scanAllWhitespace()
      scanner.whereAmI(`scanDictType: (length: ${narrowedLength})`)
    } else if (!didSetNarrowedNames && scanner.scanIfString('keys')) {
      didSetNarrowedNames = true

      scanner.scanAllWhitespace()
      scanner.expectString(':')
      scanner.scanAllWhitespace()
      scanner.expectString(ARRAY_OPEN)
      scanner.scanAllWhitespace()
      for (;;) {
        const name = scanAtom(scanner)
        narrowedNames.add(name.stringValue)

        const shouldBreak = scanner.scanCommaOrBreak(
          ARRAY_CLOSE,
          `Expected ',' or '${ARRAY_CLOSE}' in dict keys`,
        )
        scanner.whereAmI(`shouldBreak: ${shouldBreak}`)

        if (shouldBreak) {
          break
        }

        scanner.scanAllWhitespace()
      }

      scanner.scanAllWhitespace()
      scanner.whereAmI(`scanDictType: (names: ${narrowedNames})`)
    } else {
      throw new ParseError(
        scanner,
        `Unexpected token '${unexpectedToken(scanner)}'`,
        scanner.charIndex - 1,
      )
    }
  }

  scanner.expectString(PARENS_CLOSE)
  scanner.whereAmI(
    `scanDictType: (` +
      ofType.toCode() +
      `, length: ${lengthDesc(narrowedLength)}, names: ${[...narrowedNames]})`,
  )

  return new Expressions.DictTypeExpression(
    [range0, scanner.charIndex],
    scanner.flushComments(),
    ofType,
    narrowedLength,
    narrowedNames,
  )
}

function scanSetType(
  scanner: Scanner,
  applicationOrArgument: ArgumentType,
  expressionType: ExpressionType,
  parseNext: ParseNext,
  range0: number,
) {
  scanner.whereAmI(`scanSetType`)
  const {ofType, narrowedLength} = scanOfAndLength(
    scanner,
    applicationOrArgument,
    expressionType,
    parseNext,
  )
  scanner.whereAmI(`scanSetType: (` + ofType.toCode() + `, length: ${lengthDesc(narrowedLength)})`)
  return new Expressions.SetTypeExpression(
    [range0, scanner.charIndex],
    scanner.flushComments(),
    ofType,
    narrowedLength,
  )
}

function scanOfAndLength(
  scanner: Scanner,
  applicationOrArgument: ArgumentType,
  expressionType: ExpressionType,
  parseNext: ParseNext,
) {
  const ofType = scanArgumentType(scanner, applicationOrArgument, expressionType, parseNext)
  scanner.scanAllWhitespace()

  let narrowedLength: NarrowedLength = DEFAULT_NARROWED_LENGTH
  if (scanner.scanIfString(',')) {
    scanner.scanAllWhitespace()
    scanner.expectString('length')
    scanner.scanAllWhitespace()
    scanner.expectString(':')
    scanner.scanAllWhitespace()

    narrowedLength = scanNarrowedLength(scanner)
    scanner.scanAllWhitespace()
  }

  scanner.expectString(PARENS_CLOSE)

  return {ofType, narrowedLength}
}

export function scanEnum(scanner: Scanner, expressionType: ExpressionType, parseNext: ParseNext) {
  const range0 = scanner.charIndex
  let range1 = scanner.charIndex
  scanner.whereAmI('scanEnum')

  if (scanner.char !== '|') {
    throw new ParseError(
      scanner,
      `Expected at least one enum member. Enum members must be preceded by a '|' (even the first one).`,
      scanner.charIndex - 1,
    )
  }

  const members: Expressions.EnumMemberExpression[] = []
  while (scanner.scanIfString('|')) {
    scanner.scanAllWhitespace()

    const enum0 = scanner.charIndex
    const name = scanValidName(scanner).name
    scanner.whereAmI(`scanEnum: ${name}`)
    let args: Expressions.FormulaLiteralArgumentDeclarations | undefined
    if (scanner.is(ARGS_OPEN)) {
      args = scanFormulaArgumentDefinitions(scanner, 'fn', expressionType, parseNext)
    }
    range1 = scanner.charIndex

    members.push(
      new Expressions.EnumMemberExpression([enum0, range1], scanner.flushComments(), name, args),
    )
    // need to scan at end because while loop runs scanIfString('|')
    scanner.scanAllWhitespace()
  }

  return new Expressions.EnumTypeExpression([range0, range1], scanner.flushComments(), members)
}
