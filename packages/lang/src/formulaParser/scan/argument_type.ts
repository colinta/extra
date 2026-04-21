import {DEFAULT_NARROWED_LENGTH, lengthDesc, type NarrowedLength} from '../../narrowed'
import {ARRAY, BOOLEAN, DICT, FLOAT, INT, OBJECT, SET, STRING} from '../../types'
import * as Expressions from '../../expressions'
import {type Expression} from '../../expressions'
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
  ENUM_KEYWORD,
  CLASS_KEYWORD,
  MSG_TYPE,
  TYPE_START,
  BLOCK_OPEN,
  BLOCK_CLOSE,
  DICT_SEPARATOR,
  PROPERTY_ACCESS_OPERATOR,
} from '../grammars'
import {type Scanner} from '../scanner'
import {ParseError, type ParseNext} from '../types'

import {unexpectedToken} from './basics'
import {scanGenerics} from './formula'
import {scanFormulaTypeArguments} from './formula_arguments'
import {scanAnyReference, scanEnumName, scanIdentifier, scanValidLocalName} from './identifier'
import {
  scanNarrowedDict,
  scanNarrowedFloat,
  scanNarrowedInt,
  scanNarrowedLength,
  scanNarrowedString,
} from './narrowed'
import {scanNumber} from './number'
import {scanString} from './string'

/**
 * scans for:
 *   simple type:
 *     Int, String, String(), etc
 *   Object:
 *     { … }
 *     { … } & User
 *     User & { … }
 *   Object:
 *     TODO: Object(age: Int), Object(# name: String), etc
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
 *     fn (# name: Int): String
 *   enum shorthand (does not support generics):
 *     .notLoaded | .loading | .success(String) | .failure(HttpError)
 *     ❌ enum RemoteData<Tsuccess, Tfailure> { .notLoaded, .loading, .success(Tsuccess), .failure(Tfailure) }
 *   &: message type
 */
export function scanArgumentType(
  scanner: Scanner,
  // argument_type | module_type_definition | match_type
  // only argument_type supports anonymous/shorthand enum definitions
  moduleOrArgument: ArgumentType,
  parseNext: ParseNext,
): Expression {
  scanner.whereAmI('scanArgumentType')
  let argType: Expression | undefined
  const range0 = scanner.charIndex
  const oneOfExpressions: Expression[] = []
  let extendsExpressions: Expression[] = []
  let hasOptional = false
  let rewind = scanner.charIndex
  let supportsExtends = false

  // support leading '|'
  if (scanner.scanIfString('|')) {
    scanner.scanAllWhitespace()
  }

  // need to be careful in this scanning function to only scan what is necessary,
  // so that we can then check for a newline at the end. Object type parsing can
  // include multilines, with argument types coming at the end of the line.
  for (;;) {
    scanner.scanAllWhitespace()
    const arg0 = scanner.charIndex

    if (scanner.isWord(CLASS_KEYWORD)) {
      throw new ParseError(
        scanner,
        'The `class` type is not allowed as an argument type, you should move it to the module scope',
      )
    } else if (scanner.isWord(ENUM_KEYWORD)) {
      throw new ParseError(
        scanner,
        'The `enum` type is not allowed as an argument type, however you *can* use the enum shorthand syntax: `arg: .case1 | .case2`, or you should move it to the module scope',
      )
    } else if (scanner.isWord(FN_KEYWORD)) {
      argType = scanFormulaType(scanner, arg0, parseNext, moduleOrArgument)
    } else if (scanner.scanIfString(PARENS_OPEN)) {
      argType = scanArgumentType(scanner, moduleOrArgument, parseNext)
      scanner.scanAllWhitespace()
      scanner.expectString(
        PARENS_CLOSE,
        `Expected '${PARENS_CLOSE}' closing the argument type group`,
      )
      scanner.whereAmI(`scanArgumentType: () ${argType.toCode()}`)
      supportsExtends = true
    } else if (scanner.scanIfString(MSG_TYPE)) {
      argType = new Expressions.BuiltinCommandIdentifier(
        [arg0, scanner.charIndex],
        scanner.flushComments(),
      )
    } else if (isNumberChar(scanner.char) && isNumberStart(scanner)) {
      argType = scanNumber(scanner, 'float')
    } else if (isStringStartChar(scanner)) {
      argType = scanString(scanner, false, parseNext)
    } else if (scanner.is(ENUM_START)) {
      argType = scanEnumShorthand(scanner, moduleOrArgument, parseNext)
    } else if (scanner.is(OBJECT_OPEN)) {
      // {arg: Type, Type}
      argType = scanObjectType(scanner, moduleOrArgument, parseNext)
      supportsExtends = true
    } else if (scanner.is(ARRAY_OPEN)) {
      // [Type, length: 0]
      argType = scanArrayLiteralType(scanner, moduleOrArgument, parseNext)
    } else if (isArgumentStartChar(scanner)) {
      argType = scanNamedType(scanner, moduleOrArgument, parseNext)
      supportsExtends = true
    } else {
      throw new ParseError(
        scanner,
        `Expected a type, found unexpected token '${unexpectedToken(scanner)}'`,
      )
    }

    let argTypeIsOptional = false
    rewind = scanner.charIndex
    scanner.scanSpaces()

    if (scanner.scanIfString('?')) {
      rewind = scanner.charIndex
      scanner.scanSpaces()
      hasOptional = true
      argTypeIsOptional = true
    }

    // we are starting or continuing a 'extends' type, e.g.
    //     User & {isGreat: Boolean} & {isFunny: Boolean}
    if (supportsExtends && scanner.scanIfString('&')) {
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
      if (hasOptional) {
        throw new ParseError(
          scanner,
          `Optional type '${argType}?' is not supported with the '&' extends operator`,
        )
      }

      extendsExpressions.push(argType)

      argType = new Expressions.CombineTypeExpression(
        [extendsExpressions[0].range[0], argType.range[1]],
        scanner.flushComments(),
        extendsExpressions,
      )

      extendsExpressions = []
    }

    oneOfExpressions.push(argType)

    if (scanner.scanAhead('|')) {
      scanner.whereAmI(`scanArgumentType: | ${argType.toCode()}`)
      continue
    }

    scanner.rewindTo(rewind)
    break
  }

  if (hasOptional) {
    oneOfExpressions.push(
      new Expressions.LiteralNull(
        [scanner.charIndex - 1, scanner.charIndex],
        scanner.flushComments(),
      ),
    )
  }

  if (oneOfExpressions.length > 1) {
    // check oneOfExpressions for duplicate named EnumShorthandExpression
    for (const expression of oneOfExpressions) {
      if (!(expression instanceof Expressions.EnumShorthandExpression)) {
        continue
      }

      const name = expression.member.name
      const duplicate = oneOfExpressions.find(
        otherExpression =>
          otherExpression instanceof Expressions.EnumShorthandExpression &&
          otherExpression !== expression &&
          otherExpression.member.name === name,
      )
      if (duplicate) {
        throw new ParseError(
          scanner,
          `Duplicate enum case name '${name}' in oneOf type definition. Enum case names must be unique.`,
          expression.range[0],
        )
      }
    }

    argType = new Expressions.OneOfTypeExpression(
      [range0, scanner.charIndex],
      scanner.flushComments(),
      oneOfExpressions,
    )
  }

  scanner.whereAmI(`scanArgumentType: ${argType!.toCode()}`)
  return argType!
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
  moduleOrArgument: ArgumentType,
) {
  scanner.expectWord(FN_KEYWORD)
  scanner.scanAllWhitespace()

  let generics: Expressions.GenericExpression[]
  if (scanner.scanIfString('<')) {
    generics = scanGenerics(scanner, parseNext)
  } else {
    generics = []
  }

  if (scanner.is(BLOCK_OPEN)) {
    scanner.expectString(BLOCK_OPEN)
    scanner.scanAllWhitespace()

    const argDefinitions = scanFormulaTypeArguments(scanner, parseNext)

    let returnType: Expression
    if (scanner.scanAhead(TYPE_START)) {
      scanner.scanAllWhitespace()
      returnType = scanArgumentType(scanner, moduleOrArgument, parseNext)
    } else {
      returnType = new Expressions.InferIdentifier(
        [scanner.charIndex, scanner.charIndex],
        scanner.flushComments(),
      )
    }

    const props: Expressions.FormulaPropertyDefinition[] = []
    if (
      !scanner.scanCommaOrBreak(BLOCK_CLOSE, `Expected ',' or '${BLOCK_CLOSE}' in formula type`)
    ) {
      scanner.scanAllWhitespace()
      for (;;) {
        const nameRef = scanValidLocalName(scanner)
        scanner.scanAllWhitespace()
        scanner.expectString(TYPE_START)
        scanner.scanAllWhitespace()
        const value = scanArgumentType(scanner, moduleOrArgument, parseNext)
        props.push({nameRef, value})

        if (
          scanner.scanCommaOrBreak(BLOCK_CLOSE, `Expected ',' or '${BLOCK_CLOSE}' in formula type`)
        ) {
          break
        }

        scanner.scanAllWhitespace()
      }
    }

    return new Expressions.FormulaTypeExpression(
      [arg0, scanner.charIndex],
      scanner.flushComments(),
      argDefinitions,
      returnType,
      generics,
      props,
    )
  }

  const argDefinitions = scanFormulaTypeArguments(scanner, parseNext)

  let returnType: Expression
  if (scanner.scanAhead(TYPE_START)) {
    scanner.scanAllWhitespace()
    returnType = scanArgumentType(scanner, moduleOrArgument, parseNext)
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

function scanArrayLiteralType(
  scanner: Scanner,
  moduleOrArgument: ArgumentType,
  parseNext: ParseNext,
) {
  scanner.whereAmI(`scanObjectType`)
  const range0 = scanner.charIndex
  scanner.expectString(ARRAY_OPEN)
  scanner.scanAllWhitespace()
  const {ofType, narrowedLength} = scanOfAndLength(
    scanner,
    moduleOrArgument,
    parseNext,
    ARRAY_CLOSE,
  )
  return new Expressions.ArrayTypeExpression(
    [range0, scanner.charIndex],
    scanner.flushComments(),
    ofType,
    narrowedLength,
  )
}

export function scanObjectType(
  scanner: Scanner,
  moduleOrArgument: ArgumentType,
  parseNext: ParseNext,
) {
  scanner.whereAmI(`scanObjectType`)
  const range0 = scanner.charIndex
  scanner.expectString(OBJECT_OPEN)
  scanner.scanAllWhitespace()
  const values = scanInsideObjectType(scanner, moduleOrArgument, OBJECT_CLOSE, parseNext)

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

export function scanInsideObjectType(
  scanner: Scanner,
  moduleOrArgument: ArgumentType,
  closer: string,
  parseNext: ParseNext,
) {
  const values: [Expressions.Reference | undefined, Expression][] = []
  for (;;) {
    scanner.whereAmI(`objectArgType: start of loop`)
    let nameRef: Expressions.Reference | undefined

    //     I played with the idea of having
    //     {
    //       fn foo(): Value
    //     }
    //     (like in 'let' expressions)
    //
    //     but instead I think I should stick to
    //     {
    //       foo: fn(): Value
    //     }
    // if (scanner.isWord(FN_KEYWORD)) {
    //   scanner.expectWord(FN_KEYWORD)
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
      nameRef = scanAnyReference(scanner)
      scanner.scanAllWhitespace()
      scanner.expectString(TYPE_START)
      scanner.scanAllWhitespace()
    }

    const objectArgType = scanArgumentType(scanner, moduleOrArgument, parseNext)

    scanner.whereAmI(`objectArgType: ${objectArgType.toCode()}`)
    values.push([nameRef, objectArgType])

    if (scanner.scanCommaOrBreak(closer, `Expected ',' or '${closer}' in object type definition`)) {
      break
    }

    scanner.scanAllWhitespace()
  }

  return values
}

function scanEnumShorthand(scanner: Scanner, moduleOrArgument: ArgumentType, parseNext: ParseNext) {
  if (moduleOrArgument === 'module_type_definition') {
    throw new ParseError(
      scanner,
      'Enum shorthand syntax `.type | .type | ...` is only allowed for formula argument types',
    )
  }

  const arg0 = scanner.charIndex
  scanner.expectString(ENUM_START)
  // whitespace not allowed after '.'
  const enumCaseName = scanEnumName(scanner).name
  scanner.whereAmI(`scanEnum: ${enumCaseName}`)
  let args: [Expressions.Reference | undefined, Expressions.Expression][]
  if (scanner.scanIfString(ARGS_OPEN)) {
    args = scanInsideObjectType(scanner, 'argument_type', ARGS_CLOSE, parseNext)
  } else {
    args = []
  }

  return new Expressions.EnumShorthandExpression(
    [arg0, scanner.charIndex],
    new Expressions.EnumMemberExpression(
      [arg0, scanner.charIndex],
      scanner.flushComments(),
      enumCaseName,
      args,
    ),
  )
}

function scanNamedType(scanner: Scanner, moduleOrArgument: ArgumentType, parseNext: ParseNext) {
  const arg0 = scanner.charIndex
  const typeName = scanIdentifier(scanner)

  if (scanner.scanAhead(ARGS_OPEN)) {
    scanner.scanAllWhitespace()

    if (typeName.name === STRING) {
      const narrowed = scanNarrowedString(scanner)
      const argType = new Expressions.StringTypeIdentifier(
        [arg0, scanner.charIndex],
        scanner.flushComments(),
        narrowed,
      )

      scanner.scanAllWhitespace()
      scanner.expectString(ARGS_CLOSE)
      return argType
    } else if (typeName.name === INT) {
      const narrowed = scanNarrowedInt(scanner)
      const argType = new Expressions.IntTypeIdentifier(
        [arg0, scanner.charIndex],
        scanner.flushComments(),
        narrowed,
      )

      scanner.scanAllWhitespace()
      scanner.expectString(ARGS_CLOSE)
      return argType
    } else if (typeName.name === FLOAT) {
      const narrowed = scanNarrowedFloat(scanner)
      const argType = new Expressions.FloatTypeIdentifier(
        [arg0, scanner.charIndex],
        scanner.flushComments(),
        narrowed,
      )

      scanner.scanAllWhitespace()
      scanner.expectString(ARGS_CLOSE)
      return argType
    } else if (typeName.name === ARRAY) {
      const {ofType, narrowedLength} = scanOfAndLength(scanner, moduleOrArgument, parseNext)
      return new Expressions.ArrayTypeExpression(
        [arg0, scanner.charIndex],
        scanner.flushComments(),
        ofType,
        narrowedLength,
      )
    } else if (typeName.name === DICT) {
      const {ofType, narrowedLength, narrowedNames} = scanDictOfAndLength(
        scanner,
        moduleOrArgument,
        parseNext,
      )
      return new Expressions.DictTypeExpression(
        [arg0, scanner.charIndex],
        scanner.flushComments(),
        ofType,
        narrowedLength,
        narrowedNames,
      )
    } else if (typeName.name === SET) {
      const {ofType, narrowedLength} = scanOfAndLength(scanner, moduleOrArgument, parseNext)
      return new Expressions.SetTypeExpression(
        [arg0, scanner.charIndex],
        scanner.flushComments(),
        ofType,
        narrowedLength,
      )
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
        const ofType = scanArgumentType(scanner, moduleOrArgument, parseNext)
        typeArgs.push(ofType)

        if (
          scanner.scanCommaOrBreak(PARENS_CLOSE, `Expected ',' separating items in the arguments`)
        ) {
          break
        }

        scanner.scanAllWhitespace()
      }

      return new Expressions.TypeConstructorExpression(
        [arg0, scanner.charIndex],
        scanner.flushComments(),
        typeName,
        typeArgs,
      )
    }

    throw new ParseError(
      scanner,
      `Unexpected type refinement on type '${typeName.name}'`,
      scanner.charIndex - 1,
    )
  } else if (scanner.scanAhead(PROPERTY_ACCESS_OPERATOR)) {
    // parsing Foo.Type.Type
    // TODO: currently, only _concrete types_ are supported here.
    // i.e. if `Type` is generic (`Type(a)`) this scanner will fail.
    // But I'm not sure `Foo.Type(a).Type` is even a meaningful expression
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
    } while (scanner.scanAhead(PROPERTY_ACCESS_OPERATOR))

    return childArgType
  }

  // matching a 'bare' Array/Dict/Set/Type is only allowed when parsing a type in the context of a
  // match expression
  //     switch thing-or-things
  //       case Array as things
  //         -- matches any array, regardless of item type or length
  //       case thing
  //         -- matches any non-array
  if (typeName instanceof Expressions.ContainerTypeIdentifier) {
    if (moduleOrArgument === 'match_type') {
      if (typeName.name === ARRAY) {
        return new Expressions.ArrayTypeExpression(
          [arg0, scanner.charIndex],
          scanner.flushComments(),
          new Expressions.AnyTypePlaceholder(),
        )
      } else if (typeName.name === DICT) {
        return new Expressions.DictTypeExpression(
          [arg0, scanner.charIndex],
          scanner.flushComments(),
          new Expressions.AnyTypePlaceholder(),
        )
      } else if (typeName.name === SET) {
        return new Expressions.SetTypeExpression(
          [arg0, scanner.charIndex],
          scanner.flushComments(),
          new Expressions.AnyTypePlaceholder(),
        )
      } else if (typeName.name === OBJECT) {
        return new Expressions.ObjectTypeExpression(
          [arg0, scanner.charIndex],
          scanner.flushComments(),
          [],
        )
      }
    } else {
      throw new ParseError(scanner, `${typeName.name} requires a type (${typeName.name}(Type))`)
    }
  }

  if (typeName.name === 'null' || typeName.name === 'true' || typeName.name === 'false') {
    return typeName
  } else if (typeName.name.match(/^[A-Z]/)) {
    return typeName
  }

  throw new ParseError(scanner, `Expected a type name, found '${typeName.name}'`)
}

function scanDictOfAndLength(
  scanner: Scanner,
  moduleOrArgument: ArgumentType,
  parseNext: ParseNext,
) {
  scanner.whereAmI(`scanDictType`)
  const ofType = scanArgumentType(scanner, moduleOrArgument, parseNext)
  scanner.scanAllWhitespace()

  const {narrowedLength, narrowedNames} = scanNarrowedDict(scanner)

  scanner.expectString(PARENS_CLOSE)
  scanner.whereAmI(
    `scanDictType: (` +
      ofType.toCode() +
      `, length: ${lengthDesc(narrowedLength)}, names: ${[...narrowedNames]})`,
  )

  return {ofType, narrowedLength, narrowedNames}
}

function scanOfAndLength(
  scanner: Scanner,
  moduleOrArgument: ArgumentType,
  parseNext: ParseNext,
  closer: string = PARENS_CLOSE,
) {
  const ofType = scanArgumentType(scanner, moduleOrArgument, parseNext)
  scanner.scanAllWhitespace()

  let narrowedLength: NarrowedLength = DEFAULT_NARROWED_LENGTH
  if (scanner.scanIfString(',')) {
    scanner.scanAllWhitespace()
    // support shorthand, skipping 'length:'
    if (scanner.lookAhead('length')) {
      scanner.expectString('length')
      scanner.scanAllWhitespace()
      scanner.expectString(DICT_SEPARATOR)
      scanner.scanAllWhitespace()
    }

    narrowedLength = scanNarrowedLength(scanner)
    scanner.scanAllWhitespace()
  }

  scanner.expectString(closer)

  return {ofType, narrowedLength}
}

export type ArgumentType = 'module_type_definition' | 'argument_type' | 'match_type'
