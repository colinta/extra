import {DEFAULT_NARROWED_LENGTH, lengthDesc, type NarrowedLength} from '../../narrowed'
import {ARRAY, BOOLEAN, DICT, FLOAT, INT, OBJECT, SET, STATIC, STRING} from '../../types'
import * as Expressions from '../expressions'
import {type Expression} from '../expressions'
import {
  isNumberChar,
  isNumberStart,
  isArgumentStartChar,
  isStringStartChar,
  FN_KEYWORD,
  ARGS_CLOSE,
  ARGS_OPEN,
  PARENS_CLOSE,
  PARENS_OPEN,
  OBJECT_OPEN,
  OBJECT_CLOSE,
  isNamedArg,
  ARRAY_OPEN,
  ARRAY_CLOSE,
  ENUM_START,
  ENUM_OPEN,
  GENERIC_OPEN,
  ENUM_CLOSE,
  CLASS_OPEN,
  CLASS_CLOSE,
  CLASS_EXTENDS,
  ENUM_KEYWORD,
  CLASS_KEYWORD,
} from '../grammars'
import {type Scanner} from '../scanner'
import {type ArgumentType, ParseError, type ParseNext} from '../types'

import {unexpectedToken} from './basics'
import {scanNamedFormula, scanGenerics, scanStaticFormula} from './formula'
import {
  scanFormulaArgumentDefinitions,
  scanFormulaTypeArgumentDefinitions,
} from './formula_arguments'
import {
  scanAnyReference,
  scanAtom,
  scanIdentifier,
  scanValidName,
  scanValidTypeName,
} from './identifier'
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
 *   oneOf supports initial '|'
 *     | Int | String, (Int | String)
 *   function:
 *     fn (#name: Int): String
 *   enum:
 *     enum RemoteData(Tsuccess, Tfailure) { .notLoaded, .loading, .success(Tsuccess), .failure(Tfailure) }
 *   enum shorthand (does not support generics):
 *     .notLoaded | .loading | .success(String) | .failure(HttpError)
 */
export function scanArgumentType(
  scanner: Scanner,
  // argument_type | application_type
  // only application_type supports enum definitions
  applicationOrArgument: ArgumentType,
  parseNext: ParseNext,
): Expression {
  scanner.whereAmI('scanArgumentType')
  let argType: Expression | undefined
  const range0 = scanner.charIndex
  const oneOfExpressions: Expression[] = []
  const enumExpressions: Expressions.EnumShorthandExpression[] = []
  let extendsExpressions: Expression[] = []
  let hasOptional = false
  let rewind = scanner.charIndex

  if (scanner.scanIfString('|')) {
    scanner.scanAllWhitespace()
  }

  // need to be careful in this scanning function to only scan what is necessary,
  // so that we can then check for a newline at the end. Object type parsing can
  // include multilines, with argument types coming at the end of the line.
  for (;;) {
    scanner.scanAllWhitespace()
    const arg0 = scanner.charIndex

    if (scanner.scanIfString(PARENS_OPEN)) {
      argType = scanArgumentType(scanner, applicationOrArgument, parseNext)
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
    } else if (scanner.scanIfString(ENUM_START)) {
      if (applicationOrArgument === 'application_type') {
        throw new ParseError(
          scanner,
          'Enum shorthand syntax `.type | .type | ...` is only allowed for formula argument types',
        )
      }

      const enumCaseName = scanAnyReference(scanner).name
      scanner.whereAmI(`scanEnum: ${enumCaseName}`)
      let args: Expressions.FormulaLiteralArgumentDeclarations | undefined
      if (scanner.is(ARGS_OPEN)) {
        args = scanFormulaArgumentDefinitions(scanner, 'fn', parseNext)
      }

      enumExpressions.push(
        new Expressions.EnumShorthandExpression(
          [arg0, scanner.charIndex],
          scanner.flushComments(),
          enumCaseName,
          args,
        ),
      )

      if (scanner.scanAhead('|')) {
        continue
      }

      argType = new Expressions.EnumShorthandTypeExpression(
        [range0, scanner.charIndex],
        scanner.flushComments(),
        enumExpressions,
      )

      break
    } else if (scanner.scanIfString(OBJECT_OPEN)) {
      argType = scanObjectType(scanner, 'literal', applicationOrArgument, parseNext, arg0)
    } else if (scanner.isWord(CLASS_KEYWORD)) {
      throw new ParseError(
        scanner,
        'The `class` type is not allowed as a formula argument type, you should move it to the module scope',
      )
    } else if (scanner.isWord(ENUM_KEYWORD)) {
      throw new ParseError(
        scanner,
        'The `enum` type is not allowed as a formula argument type, however you *can* use the enum shorthand syntax: `arg: .case1 | .case2`, or you should move it to the module scope',
      )
    } else if (scanner.isWord(FN_KEYWORD)) {
      scanner.expectString(FN_KEYWORD)
      scanner.scanAllWhitespace()
      argType = scanFormulaType(scanner, arg0, parseNext, applicationOrArgument)
    } else if (isArgumentStartChar(scanner)) {
      const typeName = scanIdentifier(scanner)

      if (
        scanner.test(() => {
          scanner.scanSpaces()
          return scanner.scanIfString(ARGS_OPEN)
        })
      ) {
        scanner.scanSpaces()
        scanner.expectString(ARGS_OPEN)
        scanner.scanAllWhitespace()

        if (typeName.name === STRING) {
          const narrowed = scanNarrowedString(scanner)
          argType = new Expressions.StringTypeExpression(
            [arg0, scanner.charIndex],
            scanner.flushComments(),
            narrowed,
          )

          scanner.scanAllWhitespace()
          scanner.expectString(ARGS_CLOSE)
        } else if (typeName.name === INT) {
          const narrowed = scanNarrowedInt(scanner)
          argType = new Expressions.IntTypeExpression(
            [arg0, scanner.charIndex],
            scanner.flushComments(),
            narrowed,
          )

          scanner.scanAllWhitespace()
          scanner.expectString(ARGS_CLOSE)
        } else if (typeName.name === FLOAT) {
          const narrowed = scanNarrowedFloat(scanner)
          argType = new Expressions.FloatTypeExpression(
            [arg0, scanner.charIndex],
            scanner.flushComments(),
            narrowed,
          )

          scanner.scanAllWhitespace()
          scanner.expectString(ARGS_CLOSE)
        } else if (typeName.name === ARRAY) {
          argType = scanArrayType(scanner, applicationOrArgument, parseNext, arg0)
        } else if (typeName.name === DICT) {
          argType = scanDictType(scanner, applicationOrArgument, parseNext, arg0)
        } else if (typeName.name === SET) {
          argType = scanSetType(scanner, applicationOrArgument, parseNext, arg0)
        } else if (typeName.name === OBJECT) {
          throw new ParseError(
            scanner,
            `Object types are defined using { key: Type, ... }, not Object(key: Type, ...)`,
            scanner.charIndex - 1,
          )
        } else if (typeName.name === BOOLEAN) {
          throw new ParseError(
            scanner,
            `Unexpected type refinement on type '${typeName.name}'. Type refinements are only supported on String, Int, and Float, and generic types, not '${typeName.name}'`,
            scanner.charIndex - 1,
          )
        } else if (typeName instanceof Expressions.Reference) {
          const typeArgs: Expressions.Expression[] = []
          for (;;) {
            const ofType = scanArgumentType(scanner, applicationOrArgument, parseNext)
            typeArgs.push(ofType)

            const shouldBreak = scanner.scanCommaOrBreak(
              PARENS_CLOSE,
              `Expected ',' separating items in the arguments`,
            )

            if (shouldBreak) {
              break
            }

            scanner.scanAllWhitespace()
          }

          argType = new Expressions.TypeConstructorExpression(
            [arg0, scanner.charIndex],
            scanner.flushComments(),
            typeName,
            typeArgs,
          )
        } else {
          throw new ParseError(
            scanner,
            `Unexpected type refinement on type '${typeName.name}'`,
            scanner.charIndex - 1,
          )
        }
      } else if (scanner.scanAhead('.')) {
        // parsing foo.type.Type
        // TODO: currently, only _concrete types_ are supported here.
        // i.e. if `Type` is generic `Type(a)`, this will fail.
        let childArgType: Expressions.NamespaceAccessExpression | undefined
        do {
          scanner.scanAllWhitespace()
          const childIdentifier = scanAnyReference(scanner)
          childArgType = new Expressions.NamespaceAccessExpression(
            [arg0, scanner.charIndex],
            scanner.flushComments(),
            childArgType ?? typeName,
            childIdentifier,
          )
        } while (scanner.scanAhead('.'))

        return childArgType
      } else {
        if (typeName instanceof Expressions.ContainerTypeIdentifier) {
          throw new ParseError(scanner, `${typeName.name} requires a type (${typeName.name}(Type))`)
        }

        argType = typeName
      }
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

    // we are starting or continuing a 'extends' type, e.g.
    //     User & {isGreat: Boolean} & {isFunny: Boolean}
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

    // we *had* some extendsExpressions, but no more (no '&'), so merge them into one
    // `ExtendsExpression`.
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

  if (enumExpressions.length && !(argType instanceof Expressions.EnumShorthandTypeExpression)) {
    const enumType = new Expressions.EnumShorthandTypeExpression(
      [range0, scanner.charIndex],
      scanner.flushComments(),
      enumExpressions,
    )

    oneOfExpressions.push(enumType)
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
 * Scans a formula type, possibly with generics. ('fn' has already been scanned)
 *
 * fn<T>(foo: Type, bar: T): Type
 *   ^^^^^^^^^^^^^^^^^^^^^^^^^^^^
 */
function scanFormulaType(
  scanner: Scanner,
  arg0: number,
  parseNext: ParseNext,
  applicationOrArgument: ArgumentType,
) {
  let generics: string[]
  if (scanner.scanIfString('<')) {
    generics = scanGenerics(scanner, parseNext)
  } else {
    generics = []
  }
  const argDefinitions = scanFormulaTypeArgumentDefinitions(scanner, parseNext)

  let returnType: Expression
  if (scanner.scanAhead(':')) {
    scanner.scanAllWhitespace()
    returnType = scanArgumentType(scanner, applicationOrArgument, parseNext)
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
    generics,
  )
}

function scanObjectType(
  scanner: Scanner,
  is: 'literal' | 'object',
  applicationOrArgument: ArgumentType,
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

    const objectArgType = scanArgumentType(scanner, applicationOrArgument, parseNext)

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
  parseNext: ParseNext,
  range0: number,
) {
  scanner.whereAmI(`scanArrayType`)
  const {ofType, narrowedLength} = scanOfAndLength(scanner, applicationOrArgument, parseNext)
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
  parseNext: ParseNext,
  range0: number,
) {
  scanner.whereAmI(`scanDictType`)
  const ofType = scanArgumentType(scanner, applicationOrArgument, parseNext)
  scanner.scanAllWhitespace()

  let narrowedLength: NarrowedLength = DEFAULT_NARROWED_LENGTH
  let didSetNarrowedLength = false
  const narrowedNames: Set<string> = new Set()
  let didSetNarrowedNames = false
  while (scanner.scanIfString(',')) {
    scanner.scanAllWhitespace()
    if (!didSetNarrowedLength && scanner.scanIfWord('length')) {
      didSetNarrowedLength = true

      scanner.scanAllWhitespace()
      scanner.expectString(':')
      scanner.scanAllWhitespace()
      narrowedLength = scanNarrowedLength(scanner)
      scanner.scanAllWhitespace()
      scanner.whereAmI(`scanDictType: (length: ${narrowedLength})`)
    } else if (!didSetNarrowedNames && scanner.scanIfWord('keys')) {
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
  parseNext: ParseNext,
  range0: number,
) {
  scanner.whereAmI(`scanSetType`)
  const {ofType, narrowedLength} = scanOfAndLength(scanner, applicationOrArgument, parseNext)
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
  parseNext: ParseNext,
) {
  const ofType = scanArgumentType(scanner, applicationOrArgument, parseNext)
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

export function scanEnum(
  scanner: Scanner,
  parseNext: ParseNext,
  {
    isPublic,
    isFnArg,
  }: {
    // isPublic is only scanned during application scanning
    isPublic: boolean
    // fn args do not support features like member and static methods
    isFnArg: boolean
  },
): Expressions.NamedEnumTypeExpression {
  const range0 = scanner.charIndex
  const precedingComments = scanner.flushComments()
  scanner.expectString(ENUM_KEYWORD)
  scanner.expectWhitespace()
  const nameRef = scanValidTypeName(scanner)
  scanner.scanAllWhitespace()

  const generics: string[] = []
  if (scanner.scanIfString(GENERIC_OPEN)) {
    generics.push(...scanGenerics(scanner, parseNext))
    scanner.scanAllWhitespace()
  }

  scanner.expectString(ENUM_OPEN)
  scanner.scanAllWhitespace()

  let range1 = scanner.charIndex
  scanner.whereAmI('scanEnum')

  const members: Expressions.EnumMemberExpression[] = []
  const formulas: Expressions.NamedFormulaExpression[] = []
  while (!scanner.scanIfString(ENUM_CLOSE)) {
    if (scanner.scanIfString(ENUM_START)) {
      scanner.scanAllWhitespace()

      const enum0 = scanner.charIndex
      const enumCaseName = scanAnyReference(scanner).name
      scanner.whereAmI(`scanEnum: ${enumCaseName}`)
      let args: Expressions.FormulaLiteralArgumentDeclarations | undefined
      if (scanner.is(ARGS_OPEN)) {
        args = scanFormulaArgumentDefinitions(scanner, 'fn', parseNext)
      }
      range1 = scanner.charIndex

      members.push(
        new Expressions.EnumMemberExpression(
          [enum0, range1],
          scanner.flushComments(),
          enumCaseName,
          args,
        ),
      )

      scanner.scanCommaOrNewline()
    } else if (isFnArg && (scanner.isWord(FN_KEYWORD) || scanner.isWord(STATIC))) {
      if (isFnArg) {
        throw new ParseError(
          scanner,
          `Enum formulas are not supported in argument definitions, only enum cases.`,
          scanner.charIndex - 1,
        )
      }
    } else if (scanner.isWord(FN_KEYWORD)) {
      const formula = scanNamedFormula(scanner, parseNext, 'enum')
      formulas.push(formula)
    } else if (scanner.isWord(STATIC)) {
      const formula = scanStaticFormula(scanner, parseNext, 'enum')
      formulas.push(formula)
    } else {
      throw new ParseError(scanner, `Unexpected token '${unexpectedToken(scanner)}'`)
    }

    scanner.scanAllWhitespace()
  }

  if (members.length === 0) {
    throw new ParseError(scanner, `Expected at least one enum member.`, scanner.charIndex - 1)
  }

  return new Expressions.NamedEnumTypeExpression(
    [range0, scanner.charIndex],
    precedingComments,
    nameRef,
    members,
    formulas,
    generics,
    isPublic,
  )
}

export function scanClass(
  scanner: Scanner,
  parseNext: ParseNext,
  {
    isPublic,
  }: {
    // isPublic is only scanned during application scanning
    isPublic: boolean
  },
): Expressions.ClassExpression {
  const range0 = scanner.charIndex
  const precedingComments = scanner.flushComments()
  scanner.expectString(CLASS_KEYWORD)
  scanner.expectWhitespace()
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

  scanner.expectString(CLASS_OPEN)
  scanner.scanAllWhitespace()

  scanner.whereAmI('scanClass')

  const properties: Expressions.ClassPropertyExpression[] = []
  const formulas: Expressions.NamedFormulaExpression[] = []
  while (!scanner.scanIfString(CLASS_CLOSE)) {
    if (scanner.isWord(FN_KEYWORD)) {
      const formula = scanNamedFormula(scanner, parseNext, 'class')
      formulas.push(formula)
    } else if (scanner.isWord(STATIC)) {
      const formula = scanStaticFormula(scanner, parseNext, 'class')
      formulas.push(formula)
    } else {
      const precedingComments = scanner.flushComments()
      const range1 = scanner.charIndex
      const nameRef = scanValidName(scanner)
      // support comments here? ug, the first person to open that pull request gets
      // a frown emoji for sure. _why_ just _why_ would you want a comment here
      // ("because I can" is the answer, and not entirely unreasonable, I know)
      scanner.scanAllWhitespace()
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

      const property = new Expressions.ClassPropertyExpression(
        [range1, scanner.charIndex],
        precedingComments,
        nameRef,
        argType,
        defaultValue,
      )
      properties.push(property)
    }

    scanner.scanAllWhitespace()
    if (scanner.scanIfString(',')) {
      scanner.scanAllWhitespace()
    }
  }

  if (properties.length === 0) {
    throw new ParseError(scanner, `Expected at least one enum member.`, scanner.charIndex - 1)
  }

  return new Expressions.ClassExpression(
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
