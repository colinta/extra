import {err, mapAll, ok, type Result} from '@extra-lang/result'

import {
  type TypeRuntime,
  type ValueRuntime,
  type ApplicationRuntime,
  MutableTypeRuntime,
  MutableValueRuntime,
} from '../runtime'
import * as Narrowed from '../narrowed'
import * as Types from '../types'
import * as Values from '../values'

import {dependencySort} from './dependencySort'
import {difference, union} from './set'
import {
  RuntimeError,
  type NarrowedTypes,
  type Comment,
  type Operator,
  type GetTypeResult,
  type GetValueResult,
  type GetRuntimeResult,
} from './types'

export type Range = [number, number]
export const INDENT = '  '
const NEWLINE_INDENT = '\n  '
const MAX_LEN = 100
const MAX_INNER_LEN = 80
const HIGHEST_PRECEDENCE = 100

/**
 * Each Expression represents a section of code, like a number, reference, or
 * compound expressions like Arrays, Objects, etc.
 *
 * Expressions can be stringified (toCode()), or if given a runtime they can
 * determine their Type (getType()) or Value (eval()). Both these functions can
 * result in an error – though it's desirable that if getType() returns a value,
 * eval() should also return a value.
 */
export abstract class Expression {
  resolvedType: Types.Type | undefined
  #resolvedRuntime: TypeRuntime | undefined

  constructor(
    readonly range: Range,
    public precedingComments: Comment[],
    /**
     * These are most often comments attached to the same line as the expression.
     */
    public followingComments: Comment[] = [],
  ) {
    const getType = this.getType.bind(this)
    this.getType = (runtime: TypeRuntime) => {
      if (this.#resolvedRuntime !== runtime) {
        this.resolvedType = undefined
      } else if (this.resolvedType) {
        return ok(this.resolvedType)
      }

      return getType(runtime).map(type => {
        this.resolvedType = type
        return type
      })
    }
  }

  /**
   * Returns a string suitable for parsing via parse().
   */
  abstract toCode(precedence: number): string
  abstract toCode(): string

  toString() {
    return this.toCode()
  }

  /**
   * For debugging purposes (makes it clear what was parsed, and order of operations)
   */
  abstract toLisp(): string

  /**
   * In a <View property=HERE />, the code there often – but not always – needs to be
   * surrounded with `()`. The exceptions are:
   * - references `property=foo`
   * - boolean property `isFoo, !isFoo`
   * - unary operators `property=-foo`
   * - property access `property=foo.bar`
   * - array access `property=foo[0]`
   * - function invoke `property=foo(bar)`
   */
  toViewPropCode() {
    return this.toCode()
  }

  /**
   * Code representation of `this` as a child of a <View>
   *
   * Strings are unescaped except for `\{` and `\}`
   *
   * All other values are enclosed in `{…}`
   */
  toViewChildrenCode() {
    return `{${this}}`
  }

  /**
   * Type of runtime value
   */
  abstract getType(runtime: TypeRuntime): GetTypeResult
  /**
   * Converts a "type expression" into the type it represents (usually a `TypeConstructor`).
   *
   * - `Int` is both a value, a function that accepts a `String|number` and returns
   *   `Int|null`: `foo(Int(value)) --> foo(Int | null)`
   * - and a type expression: `foo(#a: Int) --> foo(123)`
   */
  getArgType(_runtime: TypeRuntime): GetTypeResult {
    return err(new RuntimeError(this, `Invalid argument type ${this}`))
  }
  abstract eval(runtime: ValueRuntime): GetValueResult

  /**
   * After a type assertion or comparison, this will return a runtime with the
   * assertion stored. Only Reference and '.' operator implement this function.
   * Used by 'and', 'or' and 'if'.
   *
   *     foo: Int | String
   *     foo is Int -->
   *         foo: IntType  -- (or, if false, `foo: StringType`)
   *     foo: Int
   *     foo > 10 -->
   *         foo: Int(10)
   *     foo: String
   *     foo.length > 5 -->
   *         foo: String(5)
   */
  replaceWithType(runtime: TypeRuntime, _withType: Types.Type): GetRuntimeResult<TypeRuntime> {
    return ok(runtime)
  }

  /**
   * In a conditional expression, the true branch should assume the types in
   * narrowedTypes().truthy, and the false branch should assume the types in
   * narrowedTypes().falsey
   */
  narrowedTypes(runtime: TypeRuntime): GetRuntimeResult<NarrowedTypes> {
    return this.getType(runtime).map(type => ({
      truthy: type.toTruthyType(),
      falsey: type.toFalseyType(),
    }))
  }

  /**
   * Operators return lhs.isNullCoalescing(), which means that expressions chained
   * off of ?. will be able to detect that the "root" access operator is the null
   * coalescing operator.
   *
   * lhs?.foo
   */
  isNullCoalescing() {
    return false
  }

  /**
   * Expressions that return the size of the container:
   *     [].length
   *     dict().length
   *     "".length
   * e.g. `foo.length` where foo is an array, dict, or string.
   *
   * `foo > 5` is also a "length-expression" (naming is hard) because `foo` will be
   * narrowed to a type with a minimum value of 5.
   */
  isLengthExpression(_runtime: TypeRuntime) {
    return ok(false)
  }

  /**
   * The type that is represented by this expression.
   *
   * Types that return a TypeConstructor (like IntTypeExpression et al) will return
   * their associated type (e.g. `IntType`).
   */
  typeAssertion(runtime: TypeRuntime): GetTypeResult {
    return this.getType(runtime).map(type => {
      if (type instanceof Types.TypeConstructor) {
        return ok(type.intendedType)
      }

      return type
    })
  }

  /**
   * Returns the names of all the variables this expression refers to.
   */
  dependencies(): Set<string> {
    return new Set()
  }

  /**
   * Returns the names of all the variables this expression provides
   */
  provides(): Set<string> {
    return new Set()
  }
}

/**
 * Mostly defined in operators.ts, but also StringTemplateOperation
 */
export abstract class Operation extends Expression {
  constructor(
    range: Range,
    precedingComments: Comment[],
    /**
     * Comments can appear immediately after the operator symbol, before the next
     * expression. These are attached to the Operator before it is instantiated as an
     * Operation.
     * - precedingComments: before the operator symbol
     * - followingOperatorComments: after the operator symbol
     * - followingComments: after the last operator argument
     */
    readonly followingOperatorComments: Comment[],
    readonly operator: Operator,
    readonly args: Expression[],
  ) {
    super(range, precedingComments)
  }

  dependencies() {
    return this.args.reduce((set, arg) => union(set, arg.dependencies()), new Set<string>())
  }

  isNullCoalescing() {
    return this.args[0].isNullCoalescing()
  }
}

/**
 * Literal of any kind: Boolean, Int, Float, String, Regex
 */
export class Literal extends Expression {
  constructor(
    range: Range,
    precedingComments: Comment[],
    readonly value: Values.BasicValue | typeof Values.NullValue,
  ) {
    super(range, precedingComments)
  }

  toLisp() {
    return this.value.toLisp()
  }

  toViewChildrenCode() {
    if (this.value instanceof Values.StringValue) {
      let code = this.value.value.replace(/([{}])/g, '\\$1')
      code = code.replace(/(<\/)/g, '\\</')
      return code
    } else {
      return super.toViewChildrenCode()
    }
  }

  toCode() {
    return this.value.toCode()
  }

  getType() {
    return ok(this.value.getType())
  }

  eval(): GetValueResult {
    return ok(this.value)
  }
}

export class LiteralKey extends Literal {
  constructor(
    range: Range,
    precedingComments: Comment[],
    readonly value: Values.BasicValue,
  ) {
    super(range, precedingComments, value)
  }

  toLisp() {
    return this.toCode()
  }

  toCode() {
    const code = `${this.value.value}`
    if (!code.includes(' ') && !code.includes('\n')) {
      return code
    }

    return super.toCode()
  }
}

/**
 * Literal is good for storing strings and numbers _in general_, but in
 * interpolated strings and View expressions, we need a way to distinguish "parts
 * of a string" with "the whole string".
 */
export class StringLiteral extends Literal {
  readonly stringValue: string
  readonly value: Values.StringValue

  constructor(
    range: Range,
    precedingComments: Comment[],
    stringValue: string | Values.StringValue,
    readonly tag?: string,
  ) {
    let value: Values.StringValue
    if (stringValue instanceof Values.StringValue) {
      value = stringValue
    } else {
      value = Values.string(stringValue)
    }
    super(range, precedingComments, value)
    this.value = value
    this.stringValue = value.value
  }

  toLisp(showTag = true) {
    if (showTag && this.tag) {
      return this.toCode()
    }

    return super.toLisp()
  }

  toCode() {
    if (this.tag) {
      return `${this.tag}\`${this.stringValue.replaceAll('`', '\\`')}\``
    }

    return super.toCode()
  }
}

/**
 * A string literal starting with `:` and only containing letters, numbers, dashes,
 * and underscores.
 */
export class StringAtomLiteral extends Literal {
  constructor(
    range: Range,
    precedingComments: Comment[],
    readonly stringValue: string,
  ) {
    super(range, precedingComments, Values.string(stringValue))
  }
}

export abstract class Identifier extends Expression {
  abstract readonly name: string
}

export class Reference extends Identifier {
  constructor(
    range: Range,
    precedingComments: Comment[],
    readonly name: string,
  ) {
    super(range, precedingComments)
  }

  dependencies() {
    return new Set([this.name])
  }

  toLisp() {
    return this.name
  }

  toCode() {
    return this.name
  }

  getType(runtime: TypeRuntime): GetTypeResult {
    const type = runtime.getLocalType(this.name)
    if (type) {
      return ok(type)
    }

    return err(new RuntimeError(this, `Cannot get type of entity named '${this.name}'`))
  }

  getArgType(runtime: TypeRuntime): GetTypeResult {
    return this.getType(runtime).map(type => {
      if (type instanceof Types.TypeConstructor) {
        return type.intendedType
      }

      return type
    })
  }

  isLengthExpression(runtime: TypeRuntime) {
    return this.getType(runtime).map(type => {
      return type.isFloat()
    })
  }

  eval(runtime: ValueRuntime) {
    const value = runtime.getLocalValue(this.name)
    if (value) {
      return ok(value)
    }

    return err(new RuntimeError(this, `Cannot get value of entity named '${this.name}'`))
  }

  replaceWithType(runtime: TypeRuntime, withType: Types.Type) {
    const name = this.name
    return ok(
      runtime.pushRuntime({
        getLocalType(path: string) {
          if (path === name) {
            return withType
          }
        },
      }),
    )
  }
}

// @state
export class StateReference extends Reference {
  dependencies() {
    return new Set(['@' + this.name])
  }

  toLisp() {
    return '@' + this.name
  }

  toCode() {
    return '@' + this.name
  }

  getType(runtime: TypeRuntime): GetTypeResult {
    const type = runtime.getStateType(this.name)
    if (type) {
      return ok(type)
    }

    return err(new RuntimeError(this, `Cannot get type of entity named '${this.name}'`))
  }

  eval(runtime: ValueRuntime) {
    const value = runtime.getStateValue(this.name)
    if (value) {
      return ok(value)
    }

    return err(new RuntimeError(this, `Cannot get value of entity named '${this.name}'`))
  }

  replaceWithType(runtime: TypeRuntime, withType: Types.Type) {
    const name = this.name
    return ok(
      runtime.pushRuntime({
        getStateType(path: string) {
          if (path === name) {
            return withType
          }
        },
      }),
    )
  }
}

// &action
export class ActionReference extends Reference {
  dependencies() {
    return new Set(['&' + this.name])
  }

  toLisp() {
    return '&' + this.name
  }

  toCode() {
    return '&' + this.name
  }

  getType(runtime: TypeRuntime): GetTypeResult {
    const type = runtime.getActionType(this.name)
    if (type) {
      return ok(type)
    }

    return err(new RuntimeError(this, `Cannot get type of entity named '${this.name}'`))
  }

  eval(runtime: ValueRuntime) {
    const value = runtime.getActionValue(this.name)
    if (value) {
      return ok(value)
    }

    return err(new RuntimeError(this, `Cannot get value of entity named '${this.name}'`))
  }

  replaceWithType(runtime: TypeRuntime, withType: Types.Type) {
    const name = this.name
    return ok(
      runtime.pushRuntime({
        getActionType(path: string) {
          if (path === name) {
            return withType
          }
        },
      }),
    )
  }
}

export class StringTemplateOperation extends Operation {
  constructor(
    range: Range,
    precedingComments: Comment[],
    operator: Operator,
    args: Expression[],
    readonly quote: string,
    readonly tag?: string,
  ) {
    super(range, precedingComments, [], operator, args)
  }

  toLisp(): string {
    const args = this.args
      .map(it => {
        if (it instanceof StringLiteral) {
          return it.toLisp(false)
        } else {
          return it.toLisp()
        }
      })
      .join(' ')
    return `(${this.operator.symbol} ${args})`
  }

  toViewChildrenCode() {
    return this.args.flatMap(arg => arg.toViewChildrenCode()).join('')
  }

  toCode() {
    let output = ''
    let hasNewline = false
    for (const arg of this.args) {
      if (arg instanceof StringLiteral) {
        const code = arg.value.value.replaceAll(this.quote, '\\' + this.quote)
        hasNewline = hasNewline || code.includes('\n')
        output += code
      } else {
        output += '${'.concat(arg.toCode(), '}')
      }
    }

    if (hasNewline && this.quote.length > 1) {
      output = (this.tag ?? '').concat(this.quote, '\n', output, '\n')
    } else {
      output = (this.tag ?? '').concat(this.quote, output)
    }
    return output.concat(this.quote)
  }

  getType(): GetTypeResult {
    // todo scan all values in the string template and return a narrowed string type
    return ok(Types.StringType)
  }

  eval(runtime: ValueRuntime) {
    return mapAll(this.args.map(arg => arg.eval(runtime))).map(values => {
      let result = ''
      for (const value of values) {
        result = result += value.printable()
      }
      return Values.string(result)
    })
  }
}

export class ObjectExpression extends Expression {
  constructor(
    range: Range,
    precedingComments: Comment[],
    /**
     * Array, Object, Dict, and Set expressions have _three_ places
     * that comments can be attached: Before the first sigil, before the closing sigil,
     * and after the closing sigil.
     * - precedingComments: before the first sigil
     * - lastComments: before the last sigil
     * - followingComments: after the last sigil
     */
    readonly lastComments: Comment[],
    // values can be:
    // - NamedArgument (most "common" key-value pair for an object type)
    // - SpreadObjectArgument (returns ObjectProp[] and is merged into this object)
    // - all other Expressions => Tuple values
    readonly values: Expression[],
  ) {
    super(range, precedingComments)
  }

  dependencies() {
    return this.values.reduce((set, value) => union(set, value.dependencies()), new Set<string>())
  }

  toLisp() {
    return `{${this.values.map(it => it.toLisp()).join(' ')}}`
  }

  toCode() {
    return wrapValues('{', this.values, '}')
  }

  typeAssertion(): GetTypeResult {
    throw new Error('Never happens?')
  }
  // typeAssertion(runtime: TypeRuntime) {
  //   return mapAll(
  //     this.values.map(arg =>
  //       arg.value.typeAssertion(runtime).map(type => [arg.alias, type] as [string, Types.Type]),
  //     ),
  //   ).map(types => {
  //     const props = new Map<string, Types.Type>(types)
  //     return new Types.ObjectType(props)
  //   })

  getType(runtime: TypeRuntime): GetTypeResult {
    return mapAll(
      this.values.map((arg): GetRuntimeResult<Types.ObjectProp[]> => {
        if (arg instanceof SpreadObjectArgument) {
          return getChildType(this, arg, runtime).map(type => type.props)
        } else if (arg instanceof NamedArgument) {
          return getChildType(this, arg, runtime).map(type => [
            {
              is: 'named',
              name: arg.alias,
              type,
            },
          ])
        } else {
          return getChildType(this, arg, runtime).map(type => [
            {
              is: 'positional',
              type,
            },
          ])
        }
      }),
    )
      .map(types => types.flat())
      .map(types => new Types.ObjectType(types))
  }

  eval(runtime: ValueRuntime) {
    return mapAll(
      this.values.map(arg => {
        if (arg instanceof SpreadObjectArgument) {
          return arg.eval(runtime).map(value => [value.tupleValues, value.namedValues] as const)
        } else if (arg instanceof NamedArgument) {
          return arg
            .eval(runtime)
            .map(
              value =>
                [[], new Map([[arg.alias, value]])] as [Values.Value[], Map<string, Values.Value>],
            )
        } else {
          return arg
            .eval(runtime)
            .map(value => [[value], new Map()] as [Values.Value[], Map<string, Values.Value>])
        }
      }),
    )
      .map(values =>
        values.reduce(
          ([tupleValues, namedValues], [nextTupleValues, nextNamedValues]) => {
            return [
              tupleValues.concat(nextTupleValues),
              new Map([...namedValues, ...nextNamedValues]),
            ]
          },
          [[], new Map()] as [Values.Value[], Map<string, Values.Value>],
        ),
      )
      .map(([tupleValues, namedValues]) => new Values.ObjectValue(tupleValues, namedValues))
  }
}

export class ArrayExpression extends Expression {
  constructor(
    range: Range,
    precedingComments: Comment[],
    /**
     * Array, Object, Dict, and Set expressions have _three_ places
     * that comments can be attached: Before the first sigil, before the closing sigil,
     * and after the closing sigil.
     * - precedingComments: before the first sigil
     * - lastComments: before the last sigil
     * - followingComments: after the last sigil
     */
    readonly lastComments: Comment[],
    readonly values: Expression[],
    readonly generic: Expression,
  ) {
    super(range, precedingComments, [])
    if (!generic) {
      throw new Error(this.toString() + ' must have a generic type')
    }
  }

  dependencies() {
    return this.values.reduce((set, value) => union(set, value.dependencies()), new Set<string>())
  }

  toLisp() {
    if (this.generic instanceof InferIdentifier) {
      return `[${this.values.map(it => it.toLisp()).join(' ')}]`
    }

    return `(array(${this.generic.toLisp()}) (${this.values.map(it => it.toLisp()).join(' ')}))`
  }

  toCode() {
    if (this.generic instanceof InferIdentifier) {
      return wrapValues('[', this.values, ']')
    }

    return `array<${this.generic.toCode()}>${wrapValues('(', this.values, ')')}`
  }

  // SpreadArgument works pretty easily here, its type signature is an
  // ArrayType so we just need to grab its 'of' property and merge it with the
  // rest of the types... and merge in the narrowed information
  getType(runtime: TypeRuntime): GetTypeResult {
    return mapAll(
      // returns [isSpreadArray, Type][]
      this.values.map((arg): GetRuntimeResult<[boolean, Types.Type]> => {
        if (arg instanceof SpreadArrayArgument) {
          return getChildType(this, arg, runtime).map(type => [true, type])
        } else {
          return getChildType(this, arg, runtime).map(type => [false, type])
        }
      }),
    ).map(types => {
      let returnType: Types.Type | undefined
      let min = 0,
        max: number | undefined = 0
      for (const [isSpread, type] of types) {
        if (isSpread && type instanceof Types.ArrayType) {
          min += type.narrowedLength.min
          max =
            type.narrowedLength.max === undefined || max === undefined
              ? undefined
              : max + type.narrowedLength.max
          returnType = returnType ? Types.compatibleWithBothTypes(returnType, type.of) : type.of
        } else {
          min += 1
          max = max === undefined ? undefined : max + 1
          if (returnType === undefined) {
            returnType = type
          } else {
            returnType = Types.compatibleWithBothTypes(returnType, type)
          }
        }
      }

      if (returnType === undefined) {
        return new Types.ArrayType(Types.AnyType)
      }

      return new Types.ArrayType(returnType, {min, max})
    })
  }

  // SpreadArgument has to be special cased - it returns an array that should
  // be flattened
  eval(runtime: ValueRuntime) {
    return mapAll(
      this.values.map((valueExpr): GetRuntimeResult<Values.Value[]> => {
        if (valueExpr instanceof SpreadArrayArgument) {
          return valueExpr.eval(runtime).map(array => [...array.iterate()])
        } else {
          return valueExpr.eval(runtime).map(value => [value])
        }
      }),
    )
      .map(values => values.flat())
      .map(values => Values.array(values))
  }
}

export class DictExpression extends Expression {
  constructor(
    range: Range,
    precedingComments: Comment[],
    /**
     * Array, Object, Dict, and Set expressions have _three_ places
     * that comments can be attached: Before the first sigil, before the closing sigil,
     * and after the closing sigil.
     * - precedingComments: before the first sigil
     * - lastComments: before the last sigil
     * - followingComments: after the last sigil
     */
    readonly lastComments: Comment[],
    readonly values: (DictEntry | SpreadDictArgument)[],
    readonly generic: Expression,
  ) {
    super(range, precedingComments)
    if (!generic) {
      throw new Error(this.toString() + ' must have a generic type')
    }
  }

  dependencies() {
    return this.values.reduce((set, value) => union(set, value.dependencies()), new Set<string>())
  }

  toLisp() {
    const values = this.values
      .map(entry => {
        return entry.toLisp()
      })
      .join(' ')

    if (this.generic instanceof InferIdentifier) {
      return `dict(${values})`
    }

    return `(dict(${this.generic.toLisp()}) (${values}))`
  }

  toCode() {
    if (this.generic instanceof InferIdentifier) {
      return wrapValues('dict(', this.values, ')')
    }

    return `dict<${this.generic.toCode()}>${wrapValues('(', this.values, ')')}`
  }

  getType(runtime: TypeRuntime): GetTypeResult {
    return mapAll(
      this.values.map((entry): GetRuntimeResult<Types.Type> => {
        if (entry instanceof SpreadDictArgument) {
          return getChildType(this, entry, runtime).map(dict => dict.of)
        } else {
          return getChildType(this, entry.value, runtime)
        }
      }),
    ).map(types => {
      let returnType: Types.Type | undefined
      for (const type of types) {
        if (returnType === undefined) {
          returnType = type
        } else {
          returnType = Types.compatibleWithBothTypes(returnType, type)
        }
      }

      if (returnType === undefined) {
        return new Types.DictType(Types.AnyType)
      }

      return new Types.DictType(returnType)
    })
  }

  eval(runtime: ValueRuntime) {
    return mapAll(
      this.values.map((valueExpr): GetRuntimeResult<[Types.Key, Values.Value][]> => {
        if (valueExpr instanceof SpreadDictArgument) {
          return valueExpr.eval(runtime).map(dict => [...dict.values])
        } else {
          return valueExpr.name
            .eval(runtime)
            .map((name): GetRuntimeResult<[Types.Key, Values.Value]> => {
              const key = name.validKey()
              if (!key) {
                return err(new RuntimeError(this, `Invalid key type ${name}`))
              }

              return valueExpr.value
                .eval(runtime)
                .map(value => [key, value] as [Types.Key, Values.Value])
            })
            .map(kv => [kv])
        }
      }),
    )
      .map(values => values.flat())
      .map(values => Values.dict(new Map(values)))
  }
}

export class SetExpression extends Expression {
  constructor(
    range: Range,
    precedingComments: Comment[],
    /**
     * Array, Object, Dict, and Set expressions have _three_ places
     * that comments can be attached: Before the first sigil, before the closing sigil,
     * and after the closing sigil.
     * - precedingComments: before the first sigil
     * - lastComments: before the last sigil
     * - followingComments: after the last sigil
     */
    readonly lastComments: Comment[],
    readonly values: Expression[],
    readonly generic: Expression,
  ) {
    super(range, precedingComments)
    if (!generic) {
      throw new Error(this.toString() + ' must have a generic type')
    }
  }

  dependencies() {
    return this.values.reduce((set, value) => union(set, value.dependencies()), new Set<string>())
  }

  toLisp() {
    if (this.generic instanceof InferIdentifier) {
      return `set(${this.values.map(it => it.toLisp()).join(' ')})`
    }

    return `(set(${this.generic.toLisp()}) (${this.values.map(it => it.toLisp()).join(' ')}))`
  }

  toCode() {
    if (this.generic instanceof InferIdentifier) {
      return wrapValues('set(', this.values, ')')
    }

    return `set<${this.generic.toCode()}>${wrapValues('(', this.values, ')')}`
  }

  // Identical to ArrayType.getType
  getType(runtime: TypeRuntime): GetTypeResult {
    return mapAll(
      // returns [isSpreadArray, Type][]
      this.values.map((arg): GetRuntimeResult<[boolean, Types.Type]> => {
        if (arg instanceof SpreadSetArgument) {
          return getChildType(this, arg, runtime).map(type => [true, type])
        } else {
          return getChildType(this, arg, runtime).map(type => [false, type])
        }
      }),
    ).map(types => {
      let returnType: Types.Type | undefined
      let min = 0,
        max: number | undefined = 0
      for (const [isSpread, type] of types) {
        if (isSpread && type instanceof Types.ArrayType) {
          min += type.narrowedLength.min
          max =
            type.narrowedLength.max === undefined || max === undefined
              ? undefined
              : max + type.narrowedLength.max
          returnType = returnType ? Types.compatibleWithBothTypes(returnType, type.of) : type.of
        } else {
          min += 1
          max = max === undefined ? undefined : max + 1
          if (returnType === undefined) {
            returnType = type
          } else {
            returnType = Types.compatibleWithBothTypes(returnType, type)
          }
        }
      }

      if (returnType === undefined) {
        return new Types.SetType(Types.AnyType)
      }

      return new Types.SetType(returnType, {min, max})
    })
  }

  // Identical to ArrayExpression.eval
  eval(runtime: ValueRuntime) {
    return mapAll(
      this.values.map((valueExpr): GetRuntimeResult<Values.Value[]> => {
        if (valueExpr instanceof SpreadSetArgument) {
          return valueExpr.eval(runtime).map(set => [...set.iterate()])
        } else {
          return valueExpr.eval(runtime).map(value => [value])
        }
      }),
    )
      .map(values => values.flat())
      .map(values => Values.set(values))
  }
}

/**
 * A "complex" type of a function argument, e.g.
 *
 * Array<Int>
 * Dict<String>
 * Int | String --> OneOf<Int | String>
 */
export abstract class TypeExpression extends Expression {
  isUnknown() {
    return false
  }

  eval(): GetValueResult {
    return err(new RuntimeError(this, 'ArgumentType cannot be evaluated'))
  }
}

/**
 * While scanning a type, we might come across a module or namespace "type access"
 * operation, ie
 *
 *     fn foo(bar: namespace.TypeName) => …
 */
export class NamespaceAccessExpression extends TypeExpression {
  constructor(
    range: Range,
    precedingComments: Comment[],
    readonly lhs: Identifier | NamespaceAccessExpression,
    readonly rhs: Identifier,
  ) {
    super(range, precedingComments)
  }

  toLisp(): string {
    return `(. ${this.lhs.toLisp()} ${this.rhs.toLisp()})`
  }

  toCode(): string {
    return `${this.lhs.toCode()}.${this.rhs.toCode()}`
  }

  getArgType(runtime: TypeRuntime): GetTypeResult {
    if (this.lhs instanceof NamespaceAccessExpression) {
      return this.lhs.getArgType(runtime).map(type => {
        if (!(type instanceof Types.ObjectType)) {
          return err(
            new RuntimeError(
              this,
              `Expected type namespace in '${this.lhs}.${this.rhs}', found '${type}'`,
            ),
          )
        }
        const rhsType = type.literalAccessType(this.rhs.name)
        if (!rhsType) {
          return err(new RuntimeError(this, `No type named '${this.lhs}.${this.rhs.name}'`))
        }
        return ok(rhsType)
      })
    } else {
      const namespace = this.lhs.name
      const typeName = this.rhs.name
      const lhsType = runtime.getNamespaceType(namespace, typeName)
      if (!lhsType) {
        if (!runtime.hasNamespace(namespace)) {
          return err(new RuntimeError(this, `No type named '${namespace}'`))
        }
        return err(new RuntimeError(this, `No type named '${namespace}.${typeName}'`))
      }
      return ok(lhsType)
    }
  }

  getType() {
    return err(new RuntimeError(this, 'NamespaceAccessExpression has no intrinsic type'))
  }

  eval(): GetValueResult {
    return err(new RuntimeError(this, 'NamespaceAccessExpression cannot be evaluated'))
  }
}

/**
 * A | B
 * A | { a: … }
 */
export class OneOfTypeExpression extends TypeExpression {
  precedence = 6

  constructor(
    range: Range,
    precedingComments: Comment[],
    readonly of: Expression[],
  ) {
    super(range, precedingComments)
  }

  dependencies() {
    return this.of.reduce((set, type) => type.dependencies(), new Set<string>())
  }

  toLisp() {
    return `(${this.of.map(ref => ref.toLisp()).join(' | ')})`
  }

  toCode(precedence = 0): string {
    if (precedence > this.precedence) {
      return `(${this.toCode(0)})`
    }

    if (this.of.length === 2 && this.of.some(type => type instanceof NullExpression)) {
      if (this.of[0] instanceof NullExpression) {
        return `${this.of[1].toCode(this.precedence)}?`
      } else {
        return `${this.of[0].toCode(this.precedence)}?`
      }
    }

    return `${this.of.map(ref => ref.toCode(this.precedence)).join(' | ')}`
  }

  getType(runtime: TypeRuntime): GetTypeResult {
    return mapAll(
      this.of.map(type => {
        return getChildType(this, type, runtime)
      }),
    ).map(types => Types.oneOf(types))
  }
}

/**
 * A & B
 * A & { a: … }
 */
export class ExtendsExpression extends TypeExpression {
  precedence = 7

  constructor(
    range: Range,
    precedingComments: Comment[],
    readonly of: Expression[],
  ) {
    super(range, precedingComments)
  }

  dependencies() {
    return this.of.reduce((set, type) => type.dependencies(), new Set<string>())
  }

  toLisp() {
    return `(${this.of.map(ref => ref.toLisp()).join(' & ')})`
  }

  toCode(precedence = 0): string {
    if (precedence > this.precedence) {
      return `(${this.toCode(0)})`
    }

    return `${this.of.map(ref => ref.toCode(this.precedence)).join(' & ')}`
  }

  getType(runtime: TypeRuntime): GetTypeResult {
    return mapAll(
      this.of.map(type => {
        return getChildType(this, type, runtime)
      }),
    ).map(types => Types.oneOf(types))
  }
}

export class ObjectTypeExpression extends TypeExpression {
  constructor(
    range: Range,
    precedingComments: Comment[],
    readonly values: [string | undefined, Expression][],
  ) {
    super(range, precedingComments)
  }

  dependencies() {
    return this.values
      .map(([_, value]) => value)
      .reduce((set, value) => union(set, value.dependencies()), new Set<string>())
  }

  toLisp() {
    const code = this.values
      .map(([name, it]) => {
        if (name === undefined) {
          return it.toLisp()
        }

        return `(${name}: ${it.toLisp()})`
      })
      .join(' ')
    return `{${code}}`
  }

  toCode() {
    const code = this.values.map(([name, it]) => {
      // if (it instanceof NamedFormulaTypeExpression) {
      //   return it.toCode()
      // }

      if (name === undefined) {
        return it.toCode()
      }

      return `${name}: ${it.toCode()}`
    })

    return wrapStrings('{', code, '}')
  }

  typeAssertion(): GetTypeResult {
    throw new Error('Never happens?')
    // typeAssertion(runtime: TypeRuntime) {
    //   return mapAll(
    //     this.values.map(arg =>
    //       arg.value.typeAssertion(runtime).map(type => [arg.alias, type] as [string, Types.Type]),
    //     ),
    //   ).map(types => {
    //     const props = new Map<string, Types.Type>(types)
    //     return new Types.ObjectType(props)
    //   })
  }

  getType(_runtime: TypeRuntime): GetTypeResult {
    return err(new RuntimeError(this, 'ObjectType has no intrinsic type'))
  }
}

/**
 * Array(Int)
 * Array(Int, length: >=6)
 */
export class ArrayTypeExpression extends TypeExpression {
  constructor(
    range: Range,
    precedingComments: Comment[],
    readonly of: Expression,
    /**
     * Holds min-number / max-number of items that are known to be in the array
     */
    readonly narrowed: Narrowed.NarrowedLength = Narrowed.DEFAULT_NARROWED_LENGTH,
  ) {
    super(range, precedingComments)
  }

  dependencies() {
    return this.of.dependencies()
  }

  toLisp() {
    return Types.ArrayType.desc(this.of.toLisp(), this.narrowed)
  }

  toCode() {
    return Types.ArrayType.desc(this.of.toCode(0), this.narrowed)
  }

  typeAssertion(runtime: TypeRuntime) {
    return this.of.typeAssertion(runtime).map(type => Types.array(type, this.narrowed))
  }

  getType() {
    return err(new RuntimeError(this, 'ArrayType has no intrinsic type'))
  }

  getArgType(runtime: TypeRuntime): GetTypeResult {
    return this.of
      .getArgType(runtime)
      .map(type => new Types.ArrayType(type, this.narrowed).fromTypeConstructor())
  }
}

/**
 * Dict(Users)
 * Dict(Users, keys: [:name])
 * Dict(Users, length: >=5)
 */
export class DictTypeExpression extends TypeExpression {
  constructor(
    range: Range,
    precedingComments: Comment[],
    readonly of: Expression,
    readonly narrowedLength: Narrowed.NarrowedLength,
    readonly narrowedNames: Set<string>,
  ) {
    super(range, precedingComments)
    this.narrowedLength = {
      min: Math.max(narrowedLength.min, this.narrowedNames.size),
      max: narrowedLength.max,
    }
  }

  dependencies() {
    return this.of.dependencies()
  }

  toLisp() {
    return Types.DictType.desc(this.of.toLisp(), this.narrowedNames, this.narrowedLength)
  }

  toCode() {
    return Types.DictType.desc(this.of.toCode(0), this.narrowedNames, this.narrowedLength)
  }

  typeAssertion(runtime: TypeRuntime) {
    return this.of
      .typeAssertion(runtime)
      .map(type => Types.dict(type, this.narrowedLength, this.narrowedNames))
  }

  getType() {
    return err(new RuntimeError(this, 'DictType has no intrinsic type'))
  }

  getArgType(runtime: TypeRuntime): GetTypeResult {
    return this.of.getArgType(runtime).map(type => {
      return new Types.DictType(type, this.narrowedLength, this.narrowedNames).fromTypeConstructor()
    })
  }
}

/**
 * Set(Users)
 * Set(Users, length: >=5)
 */
export class SetTypeExpression extends TypeExpression {
  constructor(
    range: Range,
    precedingComments: Comment[],
    readonly of: Expression,
    readonly narrowedLength: Narrowed.NarrowedLength,
  ) {
    super(range, precedingComments)
  }

  dependencies() {
    return this.of.dependencies()
  }

  toLisp() {
    return Types.SetType.desc(this.of.toLisp(), this.narrowedLength)
  }

  toCode() {
    return Types.SetType.desc(this.of.toCode(0), this.narrowedLength)
  }

  typeAssertion(runtime: TypeRuntime) {
    return this.of.typeAssertion(runtime).map(type => Types.set(type, this.narrowedLength))
  }

  getType() {
    return err(new RuntimeError(this, 'SetType has no intrinsic type'))
  }

  getArgType(runtime: TypeRuntime): GetTypeResult {
    return this.of.getArgType(runtime).map(type => {
      return new Types.SetType(type, this.narrowedLength).fromTypeConstructor()
    })
  }
}

/**
 * An argument, either positional or named.
 *
 * - required positional:
 *     #name: Int
 * - optional positional:
 *     #name?: Int
 *     #name: Int = 1
 * - named; required or optional:
 *     name: Int
 *     name: Int = 1
 *     alias name: Int
 *     alias name: Int = 1
 */
export abstract class ArgumentExpression extends Expression {
  constructor(
    range: Range,
    precedingComments: Comment[],
    readonly nameRef: Reference,
    readonly aliasRef: Reference,
    readonly argType: Expression,
    readonly spreadArg: false | 'spread' | 'kwargs',
    readonly isPositional: boolean,
  ) {
    super(range, precedingComments)
  }

  dependencies() {
    return this.argType.dependencies()
  }

  provides(): Set<string> {
    return new Set([this.aliasRef.name])
  }

  getType() {
    return err(new RuntimeError(this, 'ArgumentExpression has no intrinsic type'))
  }

  eval(): GetValueResult {
    return err(new RuntimeError(this, 'ArgumentExpression cannot be evaluated'))
  }
}

export class DictEntry extends Expression {
  constructor(
    range: Range,
    precedingComments: Comment[],
    readonly name: Expression,
    readonly value: Expression,
  ) {
    super(range, precedingComments)
  }

  dependencies() {
    return union(this.name.dependencies(), this.value.dependencies())
  }

  toLisp() {
    return `(${this.name.toLisp()}: ${this.value.toLisp()})`
  }

  toCode() {
    const name = this.name.toCode(HIGHEST_PRECEDENCE)
    if (this.value instanceof Reference && this.value.name === name) {
      return name + ':'
    }

    const value = this.value.toCode()
    if (value.length > MAX_INNER_LEN) {
      return `${name}:\n${indent(value)}`
    }

    return `${name}: ${value}`
  }

  getType() {
    return err(new RuntimeError(this, 'DictEntry does not have a type'))
  }

  eval(): GetValueResult {
    return err(new RuntimeError(this, 'DictEntry cannot be evaluated'))
  }
}

/**
 * Either the positional or named argument to a function.
 */
export abstract class Argument extends Expression {
  abstract readonly alias: string | undefined

  constructor(
    range: Range,
    precedingComments: Comment[],
    readonly value: Expression,
  ) {
    super(range, precedingComments)
  }

  dependencies() {
    return this.value.dependencies()
  }

  innerLisp() {
    if (this.alias !== undefined) {
      return `${this.alias}: ${this.value.toLisp()}`
    }

    return this.value.toLisp()
  }

  toLisp() {
    if (this.alias !== undefined) {
      return `(${this.innerLisp()})`
    }

    return this.innerLisp()
  }

  toCode() {
    if (this.alias === undefined) {
      return this.value.toCode()
    }

    if (this.value instanceof Reference && this.value.name === this.alias) {
      return this.alias + ':'
    }

    return `${this.alias}: ${this.value.toCode()}`
  }

  getType(runtime: TypeRuntime): GetTypeResult {
    return getChildType(this, this.value, runtime)
  }

  eval(runtime: ValueRuntime) {
    return this.value.eval(runtime)
  }
}

abstract class TypeArgument extends Argument {
  constructor(
    range: Range,
    precedingComments: Comment[],
    value: Expression,
    readonly defaultValue: Expression | undefined,
  ) {
    super(range, precedingComments, value)
  }

  innerLisp() {
    if (this.value instanceof FormulaExpression) {
      return 'fn ' + this.alias + this.value.toLispPrefixed(false)
    }

    let code = super.innerLisp()
    if (this.defaultValue !== undefined) {
      code += ' = ' + this.defaultValue.toLisp()
    }

    return code
  }

  toCode() {
    if (this.value instanceof FormulaExpression) {
      return 'fn ' + this.alias + this.value.toCodePrefixed(false)
    }

    let code: string
    if (this.alias === undefined) {
      code = this.value.toCode()
    } else {
      code = `${this.alias}: ${this.value.toCode()}`
    }

    if (this.defaultValue !== undefined) {
      code += ' = ' + this.defaultValue.toCode()
    }

    return code
  }
}

/**
 * A named argument passed to a function, object, or view.
 *
 *     foo(name: 'value')
 *         ^^^^^^^^^^^^^
 */
export class NamedArgument extends Argument {
  /**
   * - precedingComments: before the alias
   * - followingAliasComments: after the alias
   * - followingComments: unused
   */
  public followingAliasComments: Comment[] = []

  constructor(
    range: Range,
    precedingComments: Comment[],
    readonly alias: string,
    value: Expression,
  ) {
    super(range, precedingComments, value)
  }
}

/**
 * A positional argument passed to a function.
 *
 *     foo('value')
 *         ^^^^^^^
 */
export class PositionalArgument extends Argument {
  readonly alias = undefined
}

/**
 * A type in an object type expression, possibly with default value
 *
 *     {
 *       name: String
 *       ^^^^^^^^^^^^
 *       name: String = 'value'
 *     } ^^^^^^^^^^^^^^^^^^^^^^
 */
export class NamedType extends TypeArgument {
  constructor(
    range: Range,
    precedingComments: Comment[],
    readonly alias: string,
    value: Expression,
    defaultValue: Expression | undefined,
  ) {
    super(range, precedingComments, value, defaultValue)
  }
}

/**
 * A positional type in an object type expression, possibly with default value
 *
 *     {
 *       #name: String
 *       ^^^^^^^^^^^^^
 *       #name: String = 'value'
 *     } ^^^^^^^^^^^^^^^^^^^^^^^
 */
export class PositionalType extends TypeArgument {
  readonly alias = undefined

  constructor(
    range: Range,
    precedingComments: Comment[],
    value: Expression,
    readonly defaultValue: Expression | undefined,
  ) {
    super(range, precedingComments, value, defaultValue)
  }
}

/**
 * A named argument passed to a function as a "block" (a named argument that is
 * outside the function)
 *
 *     foo() { name: 'value' }
 *             ^^^^^^^^^^^^^
 */
export class NamedBlockArgument extends NamedArgument {
  constructor(range: Range, precedingComments: Comment[], alias: string, value: Expression) {
    super(range, precedingComments, alias, value)
  }

  toLisp() {
    return `(${this.alias} ${this.value.toLisp()})`
  }

  toCode() {
    return `${this.alias} ${this.value}`
  }
}

/**
 * A spread argument passed to an object, array, or dict
 *
 *     {...a}
 */
export abstract class SpreadArgument extends Argument {
  readonly alias = undefined

  constructor(range: Range, precedingComments: Comment[], value: Expression) {
    super(range, precedingComments, value)
  }

  toLisp() {
    return `(... ${this.value.toLisp()})`
  }

  toCode() {
    return `...${this.value}`
  }
}

/**
 * A spread argument passed to an object
 */
export class SpreadObjectArgument extends SpreadArgument {
  getType(runtime: TypeRuntime): GetRuntimeResult<Types.ObjectType> {
    return getChildType(this, this.value, runtime).map(type => {
      if (!(type instanceof Types.ObjectType)) {
        return err(new RuntimeError(this, 'Expected an Object, found ' + type.constructor.name))
      }

      return type
    })
  }

  eval(runtime: ValueRuntime): GetRuntimeResult<Values.ObjectValue> {
    return this.value.eval(runtime).map(value => {
      if (!(value instanceof Values.ObjectValue)) {
        return err(new RuntimeError(this, 'Expected an Object, found ' + value.constructor.name))
      }

      return value
    })
  }
}

/**
 * A spread argument passed to an array
 */
export class SpreadArrayArgument extends SpreadArgument {
  getType(runtime: TypeRuntime): GetRuntimeResult<Types.ArrayType> {
    return getChildType(this, this.value, runtime).map(type => {
      if (!(type instanceof Types.ArrayType)) {
        return err(new RuntimeError(this, 'Expected a Array, found ' + type.constructor.name))
      }

      return type
    })
  }

  eval(runtime: ValueRuntime): GetRuntimeResult<Values.ArrayValue> {
    return this.value.eval(runtime).map(value => {
      if (!(value instanceof Values.ArrayValue)) {
        return err(new RuntimeError(this, 'Expected a Array, found ' + value.constructor.name))
      }

      return value
    })
  }
}

/**
 * A spread argument passed to an dict
 */
export class SpreadDictArgument extends SpreadArgument {
  getType(runtime: TypeRuntime): GetRuntimeResult<Types.DictType> {
    return getChildType(this, this.value, runtime).map(type => {
      if (!(type instanceof Types.DictType)) {
        return err(new RuntimeError(this, 'Expected a Dict, found ' + type.constructor.name))
      }

      return type
    })
  }

  eval(runtime: ValueRuntime): GetRuntimeResult<Values.DictValue> {
    return this.value.eval(runtime).map(value => {
      if (!(value instanceof Values.DictValue)) {
        return err(new RuntimeError(this, 'Expected a Dict, found ' + value.constructor.name))
      }

      return value
    })
  }
}

/**
 * A spread argument passed to an set
 */
export class SpreadSetArgument extends SpreadArgument {
  getType(runtime: TypeRuntime): GetRuntimeResult<Types.SetType> {
    return getChildType(this, this.value, runtime).map(type => {
      if (!(type instanceof Types.SetType)) {
        return err(new RuntimeError(this, 'Expected a Set, found ' + type.constructor.name))
      }

      return type
    })
  }

  eval(runtime: ValueRuntime): GetRuntimeResult<Values.SetValue> {
    return this.value.eval(runtime).map(value => {
      if (!(value instanceof Values.SetValue)) {
        return err(new RuntimeError(this, 'Expected a Set, found ' + value.constructor.name))
      }

      return value
    })
  }
}

/**
 * Dice rolling expression.
 *
 *     d6       => roll 1 six-sided die
 *     1d6      => same
 *     2d8      => roll 2 eight-sided dice and add them
 *     (return sum: int)
 *
 *     4d6d1    => roll 4 six-sided dice, drop the lowest value, add the rest
 *     4d6k3    => roll 4 six-sided dice, keep only the highest 3 values and add them
 *     (return sum: int)
 *
 *     3d20>10  => roll 3 twenty-sided dice, count how many were greater than 10
 *     3d20<=10 => roll 3 twenty-sided dice, count how many were less than or equal to 10
 *     (return count: int)
 *
 *     6d6>4f<3 => roll 6 dice, count how many were greater than 4 as successes, and less than 3 as failures
 *     (return {successes: int, failures: int})
 */
export class DiceExpression extends Expression {
  constructor(
    range: Range,
    precedingComments: Comment[],
    readonly value: string,
  ) {
    super(range, precedingComments)
  }

  getType() {
    return err(new RuntimeError(this, 'not sure yet'))
  }

  toLisp() {
    return `(roll ${this.value})`
  }

  toCode() {
    return this.value
  }

  eval(): GetValueResult {
    return err(new RuntimeError(this, 'TODO: parse dice expressions'))
  }
}

export class LetExpression extends Expression {
  readonly name = 'let'
  readonly bindings: [string, NamedArgument][]
  private isSorted: boolean

  constructor(
    range: Range,
    precedingComments: Comment[],
    /*
     * - precedingComments: before 'let'
     * - precedingInBodyComments: before 'in'
     */
    public precedingInBodyComments: Comment[],
    bindings: NamedArgument[],
    readonly body: Expression,
  ) {
    super(range, precedingComments)

    const sorted = dependencySort(
      bindings.map(arg => [arg.alias, arg]),
      new Set(),
      true,
    )
    this.isSorted = sorted.isOk()
    this.bindings = sorted.safeGet() ?? bindings.map(arg => [arg.alias, arg])
  }

  private sortedBindings() {
    if (this.isSorted) {
      return ok(this.bindings)
    } else {
      return dependencySort(this.bindings, new Set(), true)
    }
  }

  toLisp() {
    const bindings = this.bindings.map(it => `(${it[0] + ': ' + it[1].value.toLisp()})`).join(' ')
    return `(let ${bindings} ${this.body.toLisp()})`
  }

  toCode() {
    let code = 'let\n'
    for (const [alias, arg] of this.bindings) {
      let line = alias + ' = '
      const exprCode = arg.value.toCode()
      if (exprCode.includes('\n') || line.length + exprCode.length > MAX_INNER_LEN) {
        line += '\n' + indent(exprCode)
      } else {
        line += exprCode
      }
      code += indent(line) + '\n'
    }
    code += 'in\n'
    code += indent(this.body.toCode()) + '\n'

    return code.replace(/^\s+$/gm, '')
  }

  getType(runtime: TypeRuntime): GetTypeResult {
    let nextRuntime = new MutableTypeRuntime(runtime)
    return this.sortedBindings()
      .map(deps =>
        mapAll(
          deps.map(([alias, dep]) =>
            dep.getType(nextRuntime).map(type => {
              nextRuntime.addLocalType(alias, type)
              return ok()
            }),
          ),
        ),
      )
      .map(() => this.body.getType(nextRuntime))
  }

  eval(runtime: ValueRuntime) {
    let nextRuntime = new MutableValueRuntime(runtime)
    return this.sortedBindings()
      .map(deps =>
        mapAll(
          deps.map(([alias, dep]) =>
            dep.eval(nextRuntime).map(value => {
              nextRuntime.addLocalValue(alias, value)
              return ok()
            }),
          ),
        ),
      )
      .map(() => this.body.eval(nextRuntime))
  }
}

export abstract class ReservedWord extends Identifier {
  abstract name: string

  toLisp() {
    return '`' + this.name + '`'
  }

  toCode() {
    return this.name
  }

  typeAssertion(): GetTypeResult {
    return ok(Types.NeverType)
  }

  getType(_runtime: TypeRuntime): GetTypeResult {
    return err(new RuntimeError(this, `${this.name} does not have a type`))
  }

  eval(_runtime: ValueRuntime): GetValueResult {
    return err(new RuntimeError(this, `${this.name} cannot be evaluated`))
  }
}

export abstract class ContainerTypeIdentifier extends ReservedWord {}

export class ObjectTypeIdentifier extends ContainerTypeIdentifier {
  readonly name = 'Object'
}

export class ArrayTypeIdentifier extends ContainerTypeIdentifier {
  readonly name = 'Array'
}

export class DictTypeIdentifier extends ContainerTypeIdentifier {
  readonly name = 'Dict'
}

export class SetTypeIdentifier extends ContainerTypeIdentifier {
  readonly name = 'Set'
}

export class FallbackIdentifier extends ReservedWord {
  readonly name = 'fallback'
}

export class InferIdentifier extends ReservedWord {
  readonly name = 'infer'
}

export class IfExpression extends ReservedWord {
  readonly name = 'if'

  getType() {
    return ok(
      Types.withGenericT(T =>
        Types.namedFormula(
          'if',
          [
            Types.positionalArgument({name: 'cond', type: Types.ConditionType, isRequired: true}),
            Types.spreadPositionalArgument({
              name: 'elseif',
              type: Types.array(Types.tuple([Types.lazy(Types.ConditionType), Types.lazy(T)])),
            }),
            Types.namedArgument({name: 'then', type: T, isRequired: true}),
            Types.namedArgument({name: 'else', type: T, isRequired: false}),
          ],
          T,
        ),
      ),
    )
  }
}

export class ElseIfExpression extends ReservedWord {
  readonly name = 'elseif'

  getType() {
    return ok(
      Types.withGenericT(T =>
        Types.namedFormula(
          'elseif',
          // elseif<T>(#cond: Condition, #then: T)
          [
            Types.positionalArgument({name: 'cond', type: Types.ConditionType, isRequired: true}),
            Types.positionalArgument({name: 'then', type: T, isRequired: true}),
          ],
          // => fn(): {true, T} | {false, null}
          Types.lazy(
            Types.oneOf([
              Types.tuple([Types.LiteralTrueType, T]),
              Types.tuple([Types.LiteralFalseType, Types.NullType]),
            ]),
          ),
        ),
      ),
    )
  }
}

export class SwitchIdentifier extends ReservedWord {
  readonly name = 'switch'
}

export class ObjectConstructorIdentifier extends ReservedWord {
  readonly name = 'object'
}

export class ArrayConstructorIdentifier extends ReservedWord {
  readonly name = 'array'
}

export class DictConstructorIdentifier extends ReservedWord {
  readonly name = 'dict'
}

export class SetConstructorIdentifier extends ReservedWord {
  readonly name = 'set'
}

export class ThisIdentifier extends ReservedWord {
  readonly name = 'this'

  typeAssertion(): GetTypeResult {
    return ok(Types.NeverType)
  }

  getType() {
    return err(new RuntimeError(this, `${this.name} cannot be evaluated`))
  }

  eval(): GetValueResult {
    return err(new RuntimeError(this, `${this.name} cannot be evaluated`))
  }
}

/**
 * The name of a built-in type:
 * Int, Float, String, Boolean, View
 * null, true, false
 */
abstract class TypeIdentifier extends Identifier {
  toLisp() {
    return '`' + this.toCode() + '`'
  }

  getArgType(runtime: TypeRuntime): GetTypeResult {
    return this.getType(runtime).map(type => {
      if (type instanceof Types.TypeConstructor) {
        return type.intendedType
      }

      return type
    })
  }
}

export class NullExpression extends TypeIdentifier {
  readonly name = 'null'

  toLisp() {
    return '`null`'
  }

  toCode() {
    return 'null'
  }

  typeAssertion(): GetTypeResult {
    return ok(Types.NullType)
  }

  getType(): GetTypeResult {
    return ok(Types.NullType)
  }

  eval(): GetValueResult {
    return ok(Values.NullValue)
  }
}

export class TrueExpression extends TypeIdentifier {
  readonly name = 'true'

  toLisp() {
    return '`true`'
  }

  toCode() {
    return 'true'
  }

  getType(): GetTypeResult {
    return ok(Types.literal(true))
  }

  eval(): GetValueResult {
    return ok(Values.TrueValue)
  }
}

export class FalseExpression extends TypeIdentifier {
  readonly name = 'false'

  toLisp() {
    return '`false`'
  }

  toCode() {
    return 'false'
  }

  getType(): GetTypeResult {
    return ok(Types.literal(false))
  }

  eval(): GetValueResult {
    return ok(Values.FalseValue)
  }
}

export class BooleanTypeExpression extends TypeIdentifier {
  readonly name = 'Boolean'

  toCode() {
    return this.getType().get().intendedType.toCode()
  }

  safeTypeAssertion(): Types.Type {
    return Types.BooleanType
  }

  typeAssertion(): GetTypeResult {
    return ok(this.safeTypeAssertion())
  }

  getArgType(): GetTypeResult {
    return ok(this.safeTypeAssertion())
  }

  getType(): GetRuntimeResult<Types.TypeConstructor> {
    return ok(this.safeTypeAssertion().typeConstructor())
  }

  eval(): GetValueResult {
    return err(new RuntimeError(this, 'BooleanTypeExpression cannot be evaluated'))
  }
}

export class FloatTypeExpression extends TypeIdentifier {
  readonly name = 'Float'

  constructor(
    range: Range,
    precedingComments: Comment[],
    readonly narrowed: Narrowed.NarrowedFloat | undefined = undefined,
  ) {
    super(range, precedingComments)
  }

  toCode() {
    return this.getType().get().intendedType.toCode()
  }

  safeTypeAssertion(): Types.Type {
    if (this.narrowed === undefined) {
      return Types.FloatType
    } else {
      return Types.FloatType.narrow(this.narrowed.min, this.narrowed.max)
    }
  }

  typeAssertion() {
    return ok(this.safeTypeAssertion())
  }

  getArgType(): GetRuntimeResult<Types.Type> {
    return ok(this.safeTypeAssertion())
  }

  getType(): GetRuntimeResult<Types.TypeConstructor> {
    return ok(this.safeTypeAssertion().typeConstructor())
  }

  eval(): GetValueResult {
    return err(new RuntimeError(this, 'FloatTypeExpression cannot be evaluated'))
  }
}

export class IntTypeExpression extends TypeIdentifier {
  readonly name = 'Int'

  constructor(
    range: Range,
    precedingComments: Comment[],
    readonly narrowed: Narrowed.NarrowedInt | undefined = undefined,
  ) {
    super(range, precedingComments)
  }

  toCode() {
    return this.safeTypeAssertion().toCode()
  }

  safeTypeAssertion(): Types.Type {
    if (this.narrowed === undefined) {
      return Types.IntType
    } else {
      return Types.IntType.narrow(this.narrowed.min, this.narrowed.max)
    }
  }

  typeAssertion() {
    return ok(this.safeTypeAssertion())
  }

  getArgType(): GetRuntimeResult<Types.Type> {
    return ok(this.safeTypeAssertion())
  }

  getType(): GetRuntimeResult<Types.TypeConstructor> {
    return ok(this.safeTypeAssertion().typeConstructor())
  }

  eval(): GetValueResult {
    return err(new RuntimeError(this, 'IntTypeExpression cannot be evaluated'))
  }
}

export class StringTypeExpression extends TypeIdentifier {
  readonly name = 'String'

  constructor(
    range: Range,
    precedingComments: Comment[],
    readonly narrowed: Narrowed.NarrowedString | undefined = undefined,
  ) {
    super(range, precedingComments)
  }

  toCode() {
    return this.safeTypeAssertion().toCode()
  }

  safeTypeAssertion(): Types.Type {
    if (this.narrowed === undefined) {
      return Types.StringType
    } else {
      return Types.StringType.narrowString(this.narrowed)
    }
  }

  typeAssertion() {
    return ok(this.safeTypeAssertion())
  }

  getArgType(): GetRuntimeResult<Types.Type> {
    return ok(this.safeTypeAssertion())
  }

  getType(): GetRuntimeResult<Types.TypeConstructor> {
    return ok(this.safeTypeAssertion().typeConstructor())
  }

  eval(): GetValueResult {
    return err(new RuntimeError(this, 'StringTypeExpression cannot be evaluated'))
  }
}

export class PipePlaceholderExpression extends Expression {
  static Symbol = '#'

  toLisp() {
    return '`' + PipePlaceholderExpression.Symbol + '`'
  }

  toCode() {
    return PipePlaceholderExpression.Symbol
  }

  getType(runtime: TypeRuntime): GetTypeResult {
    const pipeType = runtime.getPipeType()
    if (pipeType) {
      return ok(pipeType)
    }

    return err(
      new RuntimeError(
        this,
        `'${PipePlaceholderExpression.Symbol}' accessed outside of pipe ('|>') operation`,
      ),
    )
  }

  eval(runtime: ValueRuntime) {
    const pipeType = runtime.getPipeValue()
    if (pipeType) {
      return ok(pipeType)
    }

    return err(
      new RuntimeError(
        this,
        `'${PipePlaceholderExpression.Symbol}' accessed outside of pipe ('|>') operation`,
      ),
    )
  }
}

export class EnumMemberExpression extends Expression {
  constructor(
    range: Range,
    precedingComments: Comment[],
    readonly name: string,
    /**
     * Uses FormulaLiteralArgumentDeclarations, which supports default arguments.
     * EnumMemberExpression acts very much like a formula literal.
     */
    readonly args: FormulaLiteralArgumentDeclarations | undefined,
  ) {
    super(range, precedingComments)
  }

  dependencies() {
    return this.args?.dependencies() ?? new Set<string>()
  }

  toLisp() {
    let code = this.name
    if (this.args !== undefined) {
      code += this.args.toLisp()
    }

    return code
  }

  toCode() {
    let code = this.name
    if (this.args !== undefined) {
      code += `(${this.args})`
    }

    return code
  }

  getType() {
    return err(new RuntimeError(this, 'EnumEntryExpression does not have a type'))
  }

  eval(): GetValueResult {
    return err(new RuntimeError(this, 'EnumEntryExpression cannot be evaluated'))
  }
}

export class EnumTypeExpression extends Expression {
  constructor(
    range: Range,
    precedingComments: Comment[],
    readonly members: EnumMemberExpression[],
  ) {
    super(range, precedingComments)
  }

  dependencies() {
    return this.members.reduce(
      (set, member) => union(set, member.dependencies()),
      new Set<string>(),
    )
  }

  toLisp() {
    return '(enum | ' + this.members.map(m => m.toLisp()).join(' | ') + ')'
  }

  toCode() {
    return 'enum\n  | ' + this.members.map(m => m.toCode()).join('\n  | ')
  }

  getType() {
    return err(new RuntimeError(this, 'EnumTypeExpression does not have a type'))
  }

  eval(): GetValueResult {
    return err(new RuntimeError(this, 'EnumTypeExpression cannot be evaluated'))
  }
}

export class ViewTypeExpression extends TypeIdentifier {
  readonly name = 'view'

  toCode() {
    return this.safeTypeAssertion().toCode()
  }

  safeTypeAssertion(): Types.Type {
    return Types.UserViewType
  }

  typeAssertion() {
    return ok(this.safeTypeAssertion())
  }

  getArgType(): GetRuntimeResult<Types.Type> {
    return ok(this.safeTypeAssertion())
  }

  getType(): GetRuntimeResult<Types.TypeConstructor> {
    return ok(this.safeTypeAssertion().typeConstructor())
  }

  eval(): GetValueResult {
    return err(new RuntimeError(this, 'ViewTypeExpression cannot be evaluated'))
  }
}

/**
 * The argument list passed to a function by the invocation operator `()`
 */
export class ArgumentsList extends Expression {
  private positionalArgs: Expression[] = []
  private repeatedNamedArgs: Map<string, Expression[]> = new Map()

  constructor(
    range: Range,
    precedingComments: Comment[],
    readonly parenArgs: Argument[],
    readonly blockArgs: Argument[],
  ) {
    super(range, precedingComments)

    for (const arg of [...parenArgs, ...blockArgs]) {
      if (arg instanceof PositionalArgument) {
        this.positionalArgs.push(arg.value)
      } else if (arg instanceof NamedArgument) {
        const repeated = this.repeatedNamedArgs.get(arg.alias)
        if (repeated) {
          repeated.push(arg.value)
        } else {
          this.repeatedNamedArgs.set(arg.alias, [arg.value])
        }
      }
    }
  }

  get allArgs() {
    return [...this.parenArgs, ...this.blockArgs]
  }

  allPositionalArgs(from?: number): Expression[] {
    return from ? this.positionalArgs.slice(from) : this.positionalArgs
  }

  allNamedArgs(): Map<string, Expression[]> {
    return this.repeatedNamedArgs
  }

  positionalArg(at: number): Expression | undefined {
    return this.positionalArgs[at]
  }

  namedArg(name: string): Expression | undefined {
    return this.repeatedNamedArgs.get(name)?.[0]
  }

  repeatedArg(name: string): Expression[] {
    return this.repeatedNamedArgs.get(name) ?? []
  }

  dependencies() {
    return this.allArgs.reduce((set, arg) => union(set, arg.dependencies()), new Set<string>())
  }

  isTruthy() {
    return false
  }

  toLisp() {
    const insideArgs = this.parenArgs.map(it => it.toLisp()).join(' ')
    const blockArgs = this.blockArgs.map(it => it.toLisp()).join(' ')
    let code = '('
    if (insideArgs.length) {
      code += insideArgs
    }
    code += ')'
    if (insideArgs.length && blockArgs.length) {
      code += ' '
    }

    if (blockArgs.length) {
      code += '{ ' + blockArgs + ' }'
    }
    return code
  }

  toCode() {
    const insideCode: string = wrapValues('(', this.parenArgs, ')')

    if (this.blockArgs.length === 0) {
      return insideCode
    }

    if (this.blockArgs.length === 1 && this.blockArgs[0] instanceof PositionalArgument) {
      return insideCode + ': ' + this.blockArgs[0].value.toCode()
    }

    const blockCode = wrapValues('{ ', this.blockArgs, ' }')
    return insideCode + ' ' + blockCode
  }

  getType() {
    return err(new RuntimeError(this, 'ArgumentsList do not have a type'))
  }

  eval(): GetValueResult {
    return err(
      new RuntimeError(this, 'ArgumentsList cannot be evaluated (call formulaArgs(runtime))'),
    )
  }

  formulaArgs(runtime: ValueRuntime): GetRuntimeResult<Values.FormulaArgs> {
    return mapAll(
      this.allArgs.map(arg =>
        arg.eval(runtime).map(value => [arg.alias, value] as [string | undefined, Values.Value]),
      ),
    ).map(args => new Values.FormulaArgs(args))
  }
}

/**
 * List of argument declarations and their type, e.g. `(name: String, age: Int)`,
 * as part of a function literal. Comes in two subclasses, FormulaLiteralArgumentDeclarations
 * and FormulaTypeArgumentDeclarations.
 *
 * FormulaLiteralArgumentDeclarations stores the arguments and types of a formula literal
 *
 *   […].map( fn(a: Int) => a + 1 )
 *               ^^^^^^ FormulaLiteralArgumentDeclarations
 *               (list of FormulaLiteralArgumentAndTypeDeclaration)
 *
 * FormulaTypeArgumentDeclarations stores the arguments and types of a formula *type*
 *
 *   Add is fn(a: Int, b: Int): Int
 *             ^^^^^^^^^^^^^^
 *            (list of FormulaTypeArgumentAndType)
 *
 * The main difference being that formula _types_ can have optional arguments,
 * whereas formulas can have default values.
 */
export abstract class ArgumentDeclarations extends Expression {
  abstract args: (FormulaLiteralArgumentAndTypeDeclaration | FormulaTypeArgumentAndType)[]

  dependencies() {
    return this.args.reduce((set, type) => union(set, type.dependencies()), new Set<string>())
  }

  provides() {
    return this.args.reduce((set, arg) => union(set, arg.provides()), new Set<string>())
  }

  getType(runtime: TypeRuntime): GetTypeResult {
    const resolvedArgs: [string, Types.Type][] = []
    const errors: RuntimeError[] = []
    this.args.forEach(arg => {
      const type = getChildType(this, arg.argType, runtime)
      if (type.isOk()) {
        resolvedArgs.push([arg.nameRef.name, type.get()])
      } else {
        errors.push(type.error)
      }
    })

    if (errors.length) {
      return err(new RuntimeError(this, 'errors found in types', errors))
    }

    const props: Types.ObjectProp[] = []
    for (const [name, type] of resolvedArgs) {
      props.push({is: 'named', name, type})
    }

    return ok(new Types.ObjectType(props))
  }

  eval(): GetValueResult {
    return err(new RuntimeError(this, 'ArgumentDeclarations cannot be evaluated'))
  }

  toLisp() {
    return `(${this.args.map(it => it.toLisp()).join(' ')})`
  }

  toCode() {
    return wrapValues('', this.args, '')
  }
}

/**
 * List of argument declarations and their type for a literal formula,
 * e.g. `(name: String, age: Int = 0)`
 *
 * FormulaLiteralArgumentDeclarations stores the arguments and types of a formula literal
 *
 *   fn helper(a: Int = 0) => a + 1
 *             ^^^^^^^^^^ FormulaLiteralArgumentDeclarations
 *             (list of FormulaLiteralArgumentAndTypeDeclaration)
 */
export class FormulaLiteralArgumentDeclarations extends ArgumentDeclarations {
  constructor(
    range: Range,
    precedingComments: Comment[],
    readonly args: FormulaLiteralArgumentAndTypeDeclaration[],
  ) {
    super(range, precedingComments)
  }
}

/**
 * An argument definition. Comes in many flavors: position, named (w/ optional
 * aliased), spread, and keyword-args. Position and named arguments can have a
 * default value.
 *
 *     #name: Type [=value]
 *     alias name: Type [= value]
 *     name: Type [= value]
 *     ...#spread: Array(Type)
 *     ...spread: Array(Type)
 *     *kwargs: Dict(Type)
 */
export class FormulaLiteralArgumentAndTypeDeclaration extends ArgumentExpression {
  constructor(
    range: Range,
    precedingComments: Comment[],
    nameRef: Reference,
    aliasRef: Reference,
    argType: Expression,
    spreadArg: false | 'spread' | 'kwargs',
    isPositional: boolean,
    readonly defaultValue: Expression | undefined,
  ) {
    super(range, precedingComments, nameRef, aliasRef, argType, spreadArg, isPositional)
  }

  provides() {
    return new Set([this.nameRef.name])
  }

  toLisp() {
    let code = ''
    if (this.spreadArg === 'spread') {
      code += '...'
    } else if (this.spreadArg === 'kwargs') {
      code += '*'
    }

    if (this.isPositional) {
      code += '#' + this.nameRef.name
    } else if (this.aliasRef.name !== this.nameRef.name) {
      code += this.aliasRef.name + ' ' + this.nameRef.name
    } else {
      code += this.nameRef.name
    }

    code += ': ' + this.argType.toLisp()

    if (this.defaultValue) {
      code += ' ' + this.defaultValue.toLisp()
    }

    return `(${code})`
  }

  toCode() {
    let code = ''
    if (this.spreadArg === 'spread') {
      code += '...'
    } else if (this.spreadArg === 'kwargs') {
      code += '*'
    }

    if (this.isPositional) {
      code += '#' + this.nameRef.name
    } else if (this.aliasRef.name !== this.nameRef.name) {
      code += this.aliasRef.name + ' ' + this.nameRef.name
    } else {
      code += this.nameRef.name
    }

    if (!(this.argType instanceof InferIdentifier)) {
      code += ': ' + this.argType.toCode()
    }

    if (this.defaultValue) {
      code += ' = ' + this.defaultValue.toCode()
    }

    return code
  }
}

/**
 * List of argument declarations and their type, e.g. `(name: String, age: Int)`
 * FormulaTypeArgumentDeclarations stores the arguments and types of a formula *type*
 *
 *   Add = fn(a: Int, b: Int): Int
 *            ^^^^^^^^^^^^^^
 *            (list of FormulaTypeArgumentAndType)
 */
export class FormulaTypeArgumentDeclarations extends ArgumentDeclarations {
  constructor(
    range: Range,
    precedingComments: Comment[],
    readonly args: FormulaTypeArgumentAndType[],
  ) {
    super(range, precedingComments)
  }
}

/**
 * Can be declared optional, but cannot accept a default value
 */
export class FormulaTypeArgumentAndType extends ArgumentExpression {
  constructor(
    range: Range,
    precedingComments: Comment[],
    nameRef: Reference,
    aliasRef: Reference,
    argType: Expression,
    spreadArg: false | 'spread' | 'kwargs',
    isPositional: boolean,
    readonly isOptional: boolean,
  ) {
    super(range, precedingComments, nameRef, aliasRef, argType, spreadArg, isPositional)
  }

  provides(): Set<string> {
    return new Set([this.nameRef.name])
  }

  toLisp() {
    let code = ''
    if (this.spreadArg === 'spread') {
      code += '...'
    } else if (this.spreadArg === 'kwargs') {
      code += '*'
    }

    if (this.isPositional) {
      code += '#' + this.nameRef.name
    } else if (this.aliasRef.name !== this.nameRef.name) {
      code += this.aliasRef.name + ' ' + this.nameRef.name
    } else {
      code += this.nameRef.name
    }

    if (this.isOptional) {
      code += '?'
    }
    code += ': ' + this.argType.toLisp()

    return `(${code})`
  }

  toCode() {
    let code = ''
    if (this.spreadArg === 'spread') {
      code += '...'
    } else if (this.spreadArg === 'kwargs') {
      code += '*'
    }

    if (this.isPositional) {
      code += '#' + this.nameRef.name
    } else if (this.aliasRef.name !== this.nameRef.name) {
      code += this.aliasRef.name + ' ' + this.nameRef.name
    } else {
      code += this.nameRef.name
    }

    if (this.isOptional) {
      code += '?'
    }
    code += ': ' + this.argType.toCode()

    return code
  }
}

/**
 * Formula *values* are different from formula *types*. Formula types, for
 * instance, can declare an argument as optional (the function may be invoked
 * without providing the value), but it cannot declare a default value (that would
 * be done) by the formula *value*.
 *
 *     type Fn = fn(a: Int): Int
 */
export class FormulaTypeExpression extends Expression {
  constructor(
    range: Range,
    precedingComments: Comment[],
    readonly argDefinitions: FormulaTypeArgumentDeclarations,
    readonly returnType: Expression,
  ) {
    super(range, precedingComments)
  }

  dependencies() {
    const deps = union(this.argDefinitions.dependencies(), this.returnType.dependencies())
    return difference(deps, this.argDefinitions.provides())
  }

  toLisp() {
    return `(fn ${this.argDefinitions.toLisp()} : (${this.returnType.toLisp()}))`
  }

  toCode() {
    const returnType = ': ' + this.returnType.toCode()
    return `fn(${this.argDefinitions.toCode()})${returnType}`
  }

  getType() {
    return err(new RuntimeError(this, ''))
  }

  eval(): GetValueResult {
    return err(new RuntimeError(this, ''))
  }
}

/**
 * An instance of a function (named or anonymous function, with explicit types) or
 * a lambda (an argument to a function; the types are defined by the function)
 *
 * formula:
 *     fn [name](#arg0: type, #arg1: type = value, name: type = value): type => body
 */
export class FormulaExpression extends Expression {
  prefix = 'fn'

  constructor(
    range: Range,
    precedingComments: Comment[],
    /**
     * Comments preceding the name
     */
    readonly precedingNameComments: Comment[],
    /**
     * Comments after the return type
     */
    readonly precedingReturnTypeComments: Comment[],
    readonly nameRef: Reference | undefined,
    readonly argDefinitions: FormulaLiteralArgumentDeclarations,
    readonly returnType: Expression,
    readonly body: Expression,
    readonly generics: string[],
  ) {
    super(range, precedingComments)
  }

  dependencies() {
    const deps = union(this.returnType.dependencies(), this.body.dependencies())
    const provides = union(this.argDefinitions.provides(), new Set(this.generics))
    return difference(deps, provides)
  }

  toLisp() {
    return this.toLispPrefixed(true)
  }

  toLispPrefixed(prefixed: boolean) {
    let code = prefixed ? '(' + this.prefix : ''
    if (this.nameRef) {
      if (prefixed) {
        code += ' '
      }
      code += `${this.nameRef.name}`
    } else if (prefixed) {
      code += ' '
    }

    if (this.generics.length) {
      code += '<' + this.generics.join(' ') + '> '
    }
    code += this.argDefinitions.toLisp()
    if (!(this.returnType instanceof InferIdentifier)) {
      code += ' : ' + this.returnType.toLisp()
    }
    code += ' (=> ' + this.body.toLisp() + ')'
    code += prefixed ? ')' : ''
    return code
  }

  toCode() {
    return this.toCodePrefixed(true)
  }

  toCodePrefixed(prefixed: boolean) {
    let code = prefixed ? this.prefix : ''
    if (this.nameRef) {
      if (prefixed) {
        code += ' '
      }
      code += this.nameRef.name
    }

    if (this.generics.length) {
      code += '<' + this.generics.join(', ') + '>'
    }

    const argDefinitions = this.argDefinitions.toCode()
    const hasNewline = argDefinitions.includes('\n')
    if (hasNewline) {
      code += `(\n${indent(argDefinitions)}\n)`
    } else {
      code += `(${argDefinitions})`
    }

    if (!(this.returnType instanceof InferIdentifier)) {
      code += ': ' + this.returnType.toCode()
    }

    code += ' ' + this.toBodyCode(hasNewline ? 0 : MAX_LEN - code.length)

    return code
  }

  toBodyCode(REM_LEN: number) {
    let code = '=>'
    const bodyCode = this.body.toCode()
    if (bodyCode.length > REM_LEN || bodyCode.includes('\n')) {
      code += '\n' + indent(bodyCode)
    } else {
      code += ' ' + bodyCode
    }

    return code
  }

  private argumentToArgumentType(
    arg: FormulaLiteralArgumentAndTypeDeclaration,
    type: Types.Type,
  ): GetRuntimeResult<Types.Argument> {
    // arg:
    // name: string,
    // alias: string,
    // argType: Expression,
    // spreadArg: false | 'spread' | 'kwargs',
    // isPositional: boolean,
    if (arg.spreadArg === 'spread' && arg.isPositional) {
      if (!(type instanceof Types.ArrayType)) {
        return err(new RuntimeError(this, 'Spread positional argument must be an array'))
      }
      return ok({
        is: 'spread-positional-argument',
        spread: 'spread',
        name: arg.nameRef.name,
        type,
        isRequired: false,
        alias: undefined,
      })
    } else if (arg.spreadArg === 'spread') {
      if (!(type instanceof Types.ArrayType)) {
        return err(new RuntimeError(this, 'Spread positional argument must be an array'))
      }
      return ok({
        is: 'repeated-named-argument',
        spread: 'spread',
        name: arg.nameRef.name,
        type,
        isRequired: false,
        alias: arg.aliasRef.name,
      })
    } else if (arg.spreadArg === 'kwargs') {
      if (!(type instanceof Types.DictType)) {
        return err(new RuntimeError(this, 'Spread positional argument must be an dict'))
      }
      return ok({
        is: 'kwarg-list-argument',
        spread: 'kwargs',
        name: arg.nameRef.name,
        type,
        isRequired: false,
        alias: undefined,
      })
    } else if (arg.isPositional) {
      return ok({
        is: 'positional-argument',
        spread: false,
        name: arg.nameRef.name,
        type,
        isRequired: !arg.defaultValue,
        alias: undefined,
      })
    } else {
      return ok({
        is: 'named-argument',
        spread: false,
        name: arg.nameRef.name,
        type,
        isRequired: !arg.defaultValue,
        alias: arg.aliasRef.name,
      })
    }
  }

  private argumentTypes(
    runtime: TypeRuntime,
    formulaType?: Types.FormulaType | undefined,
  ): GetRuntimeResult<Types.Argument[]> {
    // for every arg, check the arg type _and_ the default type, and make sure
    // default type can be assigned to the arg type
    return mapAll(
      this.argDefinitions.args.map((arg, position) => {
        let argType: GetTypeResult
        if (arg.argType instanceof InferIdentifier) {
          let inferArgType: Types.Type | undefined
          if (formulaType) {
            inferArgType =
              formulaType.positionalArg(position)?.type ??
              formulaType.namedArg(arg.aliasRef.name)?.type
          } else {
            inferArgType = undefined
          }

          if (!inferArgType) {
            let message = 'Unable to infer type for argument '
            if (arg instanceof NamedArgument) {
              message += `'${arg.aliasRef.name}'`
            } else if (arg instanceof PositionalArgument) {
              message += `at position #${position + 1}`
            }
            return err(new RuntimeError(this, message))
          }

          argType = ok(inferArgType)
        } else {
          argType = arg.argType.getArgType(runtime)
        }

        return argType.map(type => {
          if (arg.defaultValue) {
            const defaultTypeResult = getChildType(this, arg.defaultValue, runtime)
            if (defaultTypeResult.isErr()) {
              return err(defaultTypeResult.error)
            }

            const defaultType = defaultTypeResult.get()
            if (!Types.canBeAssignedTo(defaultType, type)) {
              return err(new RuntimeError(this, Types.cannotAssignToError(defaultType, type)))
            }
          }

          return this.argumentToArgumentType(arg, type)
        })
      }),
    )
  }

  getType(
    runtime: TypeRuntime,
    formulaType?: Types.FormulaType | undefined,
  ): GetRuntimeResult<Types.FormulaType> {
    const argumentTypes = new Map<string, Types.Type>()
    const argResults = this.argumentTypes(runtime, formulaType)

    if (argResults.isErr()) {
      return err(argResults.error)
    }

    const args = argResults.get()
    args.forEach(arg => {
      argumentTypes.set(arg.name, arg.type)
    })

    let returnTypeResult: GetTypeResult
    const bodyRuntime = runtime.pushRuntime({
      getLocalType(path: string) {
        return argumentTypes.get(path)
      },
    })
    const bodyReturnType = this.body.getType(bodyRuntime)
    if (this.returnType instanceof InferIdentifier) {
      returnTypeResult = bodyReturnType
    } else {
      returnTypeResult = mapAll([bodyReturnType, getChildType(this, this.returnType, runtime)]).map(
        types => {
          const [bodyType, typeConstructor] = types
          if (!(typeConstructor instanceof Types.TypeConstructor)) {
            return err(
              new RuntimeError(
                this,
                `Invalid return type ${typeConstructor}, expected valid type (e.g. int, string[], etc)`,
              ),
            )
          }
          const returnType = typeConstructor.intendedType

          if (!Types.canBeAssignedTo(bodyType, returnType)) {
            return err(
              new RuntimeError(
                this,
                `Function body result type '${bodyType.toCode()}' is not assignable to explicit return type '${returnType.toCode()}'`,
              ),
            )
          }

          return returnType
        },
      )
    }

    if (returnTypeResult.isErr()) {
      return err(returnTypeResult.error)
    }

    const returnType = returnTypeResult.get()

    if (this.nameRef) {
      return ok(new Types.NamedFormulaType(this.nameRef.name, returnType, args))
    }

    return ok(new Types.FormulaType(returnType, args))
  }

  private reconcileArgs(
    runtime: ValueRuntime,
    formulaType: Types.FormulaType,
    args: Values.FormulaArgs,
  ): GetRuntimeResult<ValueRuntime> {
    const defaultValues = new Map(
      this.argDefinitions.args.map((arg, position) => {
        const index = arg.isPositional ? position : arg.aliasRef.name
        return [index, arg.defaultValue]
      }),
    )

    let argCount = 0
    const argValues: Map<string | number, Values.Value> = new Map()
    const repeatedArgValues: Map<string, Values.Value[]> = new Map()
    for (const [alias, arg] of args.args) {
      if (alias) {
        argValues.set(alias, arg)

        const repeated = repeatedArgValues.get(alias) ?? []
        repeated.push(arg)
        repeatedArgValues.set(alias, repeated)
      } else {
        argValues.set(argCount++, arg)
      }
    }

    let formulaTypeArgIndex = 0
    const resolvedValues = mapAll(
      formulaType.args.map(argType => {
        let arg: GetValueResult
        let fromArgs: Values.Value | undefined
        let fromDefault: Expression | undefined
        switch (argType.is) {
          case 'positional-argument':
            fromArgs = argValues.get(formulaTypeArgIndex)
            fromDefault = defaultValues.get(formulaTypeArgIndex)
            argValues.delete(formulaTypeArgIndex)

            formulaTypeArgIndex++
            break
          case 'named-argument':
            fromArgs = argValues.get(argType.alias)
            fromDefault = defaultValues.get(argType.alias)

            argValues.delete(argType.alias)
            repeatedArgValues.delete(argType.alias)
            break
          case 'spread-positional-argument':
            // starting at formulaTypeArgIndex until argCount
            // put all remaining values into fromArgs ArrayValue
            const spreadArgs: Values.Value[] = []
            for (let index = formulaTypeArgIndex; index < argCount; index++) {
              const value = argValues.get(index)
              if (!value) {
                break
              }
              spreadArgs.push(value)
              argValues.delete(index)
            }
            fromArgs = new Values.ArrayValue(spreadArgs)
            break
          case 'repeated-named-argument':
            const repeatedArgs = repeatedArgValues.get(argType.alias)
            fromArgs = new Values.ArrayValue(repeatedArgs ?? [])
            argValues.delete(argType.alias)
            repeatedArgValues.delete(argType.alias)
            break
          case 'kwarg-list-argument':
            const kwargArgs: Map<string, Values.Value> = new Map()
            for (const [key, value] of argValues) {
              kwargArgs.set(key as string, value)
              argValues.delete(key)
            }
            fromArgs = new Values.DictValue(kwargArgs)
            break
        }

        if (fromArgs) {
          arg = ok(fromArgs)
        } else if (fromDefault) {
          arg = fromDefault.eval(runtime)
        } else if (argType.alias) {
          arg = err(new RuntimeError(this, `No argument passed for '${argType.alias}'`))
        } else {
          arg = err(
            new RuntimeError(this, `No argument passed at position #${formulaTypeArgIndex}`),
          )
        }

        return arg.map(arg => [argType.name, arg] as [string, Values.Value])
      }),
    ).map(entries => new Map(entries))

    return resolvedValues.map(argValues => {
      return runtime.pushRuntime({
        getLocalType(path: string) {
          return argValues.get(path)?.getType()
        },
        getLocalValue(path: string) {
          return argValues.get(path)
        },
      })
    })
  }

  eval(runtime: ValueRuntime): GetValueResult {
    return this.getType(runtime).map(formulaType => {
      const fn = (args: Values.FormulaArgs): Result<Values.Value, string> => {
        return this.reconcileArgs(runtime, formulaType, args)
          .map(nextRuntime => {
            return this.body.eval(nextRuntime)
          })
          .mapResult(result => {
            if (result.isErr()) {
              return err(result.error.message)
            }
            return ok(result.get())
          })
      }

      if (formulaType.name) {
        return new Values.NamedFormulaValue(formulaType.name, formulaType, fn)
      } else {
        return new Values.FormulaValue(formulaType, fn)
      }
    })
  }
}

export class NamedFormulaExpression extends FormulaExpression {
  nameRef: Reference

  constructor(
    range: Range,
    precedingComments: Comment[],
    precedingNameComments: Comment[],
    precedingReturnTypeComments: Comment[],
    nameRef: Reference,
    argDefinitions: FormulaLiteralArgumentDeclarations,
    returnType: Expression,
    body: Expression,
    generics: string[],
  ) {
    super(
      range,
      precedingComments,
      precedingNameComments,
      precedingReturnTypeComments,
      nameRef,
      argDefinitions,
      returnType,
      body,
      generics,
    )
    this.nameRef = nameRef
  }
}

abstract class ViewExpression extends Expression {
  readonly nameRef: Reference | undefined

  constructor(
    range: Range,
    precedingComments: Comment[],
    readonly args: NamedArgument[],
    readonly children: Expression[],
  ) {
    super(range, precedingComments)
  }

  dependencies() {
    return union(
      this.args.reduce((set, value) => union(set, value.dependencies()), new Set<string>()),
      this.children.reduce((set, value) => union(set, value.dependencies()), new Set<string>()),
    )
  }

  provides() {
    return this.nameRef !== undefined ? new Set([this.nameRef.name]) : new Set<string>()
  }

  toLispCode() {
    let code = '<'
    if (this.nameRef) {
      code += this.nameRef
    }

    if (this.args.length) {
      if (this.nameRef) {
        code += ' '
      }

      code += this.args
        .map(arg => {
          if (arg.value instanceof TrueExpression) {
            return arg.alias
          } else if (arg.value instanceof FalseExpression) {
            return `!${arg.alias}`
          }

          return `${arg.alias}=${arg.value.toViewPropCode()}`
        })
        .join(' ')
    }

    if (this.children.length) {
      code += '>'
      const lines: string[] = [code]

      this.children
        .flatMap(child => child.toLisp().split('\n'))
        .forEach(line => {
          lines.push(line)
        })

      if (this.nameRef) {
        lines.push(`</${this.nameRef}>`)
      } else {
        lines.push('</>')
      }

      return lines
    } else {
      if (this.nameRef) {
        code += ' />'
      } else {
        code += '></>'
      }
      return [code]
    }
  }

  toLisp() {
    return this.toLispCode().join(' ')
  }

  toViewChildrenCode() {
    let code = '<'
    if (this.nameRef) {
      code += this.nameRef
    }

    if (this.args.length) {
      if (this.nameRef) {
        code += ' '
      }

      code += this.args
        .map(arg => {
          if (arg.value instanceof TrueExpression) {
            return arg.alias
          } else if (arg.value instanceof FalseExpression) {
            return `!${arg.alias}`
          }

          return `${arg.alias}=${arg.value.toViewPropCode()}`
        })
        .join(' ')
    }

    if (this.children.length) {
      code += '>'
      const lines: string[] = [code]

      const children = this.children
        .map(child => {
          if (child instanceof ViewExpression) {
            return child.toViewChildrenCode().replaceAll('\n', NEWLINE_INDENT)
          } else {
            return child.toViewChildrenCode()
          }
        })
        .join('')
      lines.push(children)

      if (this.nameRef) {
        lines.push(`</${this.nameRef}>`)
      } else {
        lines.push('</>')
      }

      return lines.join('')
    } else {
      if (this.nameRef) {
        code += ' />'
      } else {
        code += '></>'
      }
      return code
    }
  }

  toCode() {
    return this.toViewChildrenCode()
  }

  typeAssertion(runtime: TypeRuntime) {
    return this.getType(runtime)
  }

  getType(runtime: TypeRuntime): GetTypeResult {
    let type: Types.Type
    if (this.nameRef) {
      const refType = runtime.getLocalType(this.nameRef.name)

      if (!refType) {
        return err(new RuntimeError(this, `No View named '${this.nameRef}'`))
      }

      type = refType
    } else {
      type = Types.FragmentViewType
    }
    ;(_ => {})(type)

    return mapAll(
      this.args.map(arg =>
        getChildType(this, arg.value, runtime).map(
          type => [arg.alias, type] as [string, Types.Type],
        ),
      ),
    ).map(types => {
      return new Types.ObjectType(types.map(([name, type]) => ({is: 'named', name, type})))
    })
  }

  eval(runtime: ValueRuntime) {
    const childrenResult = mapAll(this.children.map(child => child.eval(runtime))).map(children =>
      children
        .flatMap(child => {
          if (child instanceof Values.FragmentViewValue) {
            return child.children
          }

          return [child]
        })
        .filter(child => {
          return !child.isNull()
        }),
    )

    if (childrenResult.isErr()) {
      return err(childrenResult.error)
    }

    const children = Values.array(childrenResult.value)
    if (this.nameRef) {
      const refValue = runtime.getLocalValue(this.nameRef.name)

      if (!refValue) {
        return err(new RuntimeError(this, `No View named '${this.nameRef}'`))
      }

      if (!(refValue instanceof Values.FormulaValue)) {
        return err(
          new RuntimeError(
            this,
            `Expected View named '${this.nameRef}', found '${refValue.constructor.name}'`,
          ),
        )
      }

      return mapAll(
        this.args.map(namedArg => {
          const name = namedArg.alias
          return namedArg.value.eval(runtime).map(value => [name, value] as [string, Values.Value])
        }),
      )
        .map(args => new Values.FormulaArgs([...args, ['children', children]]))
        .map(args => {
          const result = refValue.call(args)
          if (result.isOk()) {
            return ok(result)
          }

          if (result.error instanceof RuntimeError) {
            return err(result.error)
          }

          return err(new RuntimeError(this, result.error))
        })
    } else {
      if (this.args.length) {
        return err(new RuntimeError(this, `Fragment Views should not have args`))
      }

      // FragmentView
      return ok(children)
    }
  }
}

export class UserViewExpression extends ViewExpression {
  constructor(
    range: Range,
    precedingComments: Comment[],
    readonly nameRef: Reference,
    args: NamedArgument[],
    children: Expression[],
  ) {
    super(range, precedingComments, args, children)
  }
}

export class FragmentViewExpression extends ViewExpression {
  readonly nameRef: Reference | undefined = undefined

  constructor(
    range: Range,
    precedingComments: Comment[],
    args: NamedArgument[],
    children: Expression[],
  ) {
    super(range, precedingComments, args, children)
  }
}

export class ViewFormulaExpression extends NamedFormulaExpression {
  prefix = 'view'

  eval<T>(runtime: ApplicationRuntime<T>): GetValueResult {
    return super.eval(runtime)
  }
}

export class MainFormulaExpression extends ViewFormulaExpression {
  prefix = ''

  constructor(
    range: Range,
    precedingComments: Comment[],
    precedingNameComments: Comment[],
    precedingReturnTypeComments: Comment[],
    argDefinitions: FormulaLiteralArgumentDeclarations,
    returnType: Expression,
    body: Expression,
    generics: string[],
  ) {
    super(
      range,
      precedingComments,
      precedingNameComments,
      precedingReturnTypeComments,
      new Reference([range[0], range[0]], [], 'Main'),
      argDefinitions,
      returnType,
      body,
      generics,
    )
  }

  toLisp() {
    return this.toLispPrefixed(true)
  }

  toCode() {
    return this.toCodePrefixed(false)
  }
}

export class ImportSpecific extends Expression {
  constructor(
    range: Range,
    precedingComments: Comment[],
    readonly name: Reference,
    readonly alias: Reference | undefined,
  ) {
    super(range, precedingComments)

    if (this.alias && this.alias.name === this.name.name) {
      this.alias = undefined
    }
  }

  toLisp() {
    return this.toCode()
  }

  toCode() {
    if (this.alias) {
      return `${this.name.name} as ${this.alias.name}`
    }

    return this.name.name
  }

  getType() {
    return err(new RuntimeError(this, 'ImportSpecific does not have a type'))
  }

  eval(): GetValueResult {
    return err(new RuntimeError(this, 'ImportSpecific cannot be evaluated'))
  }
}

export class RequiresStatement extends Expression {
  constructor(
    range: Range,
    precedingComments: Comment[],
    readonly envs: string[],
  ) {
    super(range, precedingComments)
  }

  toLisp() {
    return this.toCode()
  }

  toCode() {
    if (!this.envs.length) {
      return ''
    }

    return `requires ${this.envs.join(', ')}`
  }

  getType() {
    return err(new RuntimeError(this, 'RequiresStatement does not have a type'))
  }

  eval(): GetValueResult {
    return err(new RuntimeError(this, 'RequiresStatement cannot be evaluated'))
  }
}

export type ImportLocation = 'package' | 'project' | 'relative' | 'scheme'

export class ImportSource extends Expression {
  readonly name: Reference | undefined

  constructor(
    range: Range,
    precedingComments: Comment[],
    /**
     * Where we should look for the import
     */
    readonly location: ImportLocation,
    /**
     * The path parts of the import path
     */
    readonly parts: Reference[],
    /**
     * Optional scheme (only for the 'scheme' location)
     */
    readonly scheme: string | undefined,
    readonly version: string | undefined,
  ) {
    super(range, precedingComments)
    this.name = parts.at(-1)
  }

  toLisp() {
    return `(${this.toCode()})`
  }

  toCode() {
    let code = ''

    if (this.scheme) {
      code += this.scheme + '://'
    } else {
      if (this.location === 'relative') {
        code += './'
      } else if (this.location === 'project') {
        code += '/'
      }
    }

    code += this.parts.join('/')

    if (this.version) {
      code += '@' + this.version
    }

    return code
  }

  getType() {
    return err(new RuntimeError(this, 'ImportStatement does not have a type'))
  }

  eval(): GetValueResult {
    return err(new RuntimeError(this, 'ImportStatement cannot be evaluated'))
  }
}

export class ImportStatement extends Expression {
  readonly name: Reference | undefined

  constructor(
    range: Range,
    precedingComments: Comment[],
    readonly precedingSpecifierComments: Comment[],
    /**
     * The path parts of the import path
     */
    readonly source: ImportSource,
    /**
     * If alias is set, the package should exports are made available using that name.
     */
    readonly alias: Reference | undefined,
    /**
     * Specific things that were imported via `import... : { a, b }`
     */
    readonly importSpecifiers: ImportSpecific[],
  ) {
    super(range, precedingComments)

    this.name = source.name

    // no alias is needed if no specific imports are defined.
    // if specific imports are defined, an alias is required if you want to refer
    // to other package imports.
    if (
      this.alias &&
      this.name &&
      this.alias.name === this.name.name &&
      importSpecifiers.length === 0
    ) {
      this.alias = undefined
    }
  }

  toLisp() {
    return `(${this.toCode()})`
  }

  toCode() {
    let code = 'import ' + this.source.toCode()

    if (this.alias) {
      code += ' as ' + this.alias.name
    }

    if (this.importSpecifiers.length) {
      code += ' : '
      code += wrapValues('{', this.importSpecifiers, '}')
      code += ''
    }

    return code
  }

  getType() {
    return err(new RuntimeError(this, 'ImportStatement does not have a type'))
  }

  eval(): GetValueResult {
    return err(new RuntimeError(this, 'ImportStatement cannot be evaluated'))
  }
}

/**
 * In the 'types' section of an application:
 *     [public] typeName[<generics>] = type
 */
export class TypeDefinition extends Expression {
  constructor(
    range: Range,
    precedingComments: Comment[],
    readonly name: string,
    readonly type: Expression,
    readonly generics: string[],
    readonly isPublic: boolean,
  ) {
    super(range, precedingComments)
  }

  dependencies() {
    return this.type.dependencies()
  }

  provides() {
    return new Set([this.name])
  }

  toLisp() {
    let code = ''
    if (this.isPublic) {
      code += 'public '
    }

    code += 'type '
    code += this.name
    if (this.generics.length) {
      code += ` <${this.generics.join(', ')}>`
    }

    code += ' '
    code += this.type.toLisp()
    return `(${code})`
  }

  toCode() {
    let code = ''
    if (this.isPublic) {
      code += 'public '
    }

    code += 'type '
    code += this.name
    if (this.generics.length) {
      code += `<${this.generics.join(', ')}>`
    }

    code += ' = '
    code += this.type.toCode()
    return code
  }

  getType(runtime: TypeRuntime): GetTypeResult {
    return getChildType(this, this.type, runtime)
  }

  eval(runtime: ValueRuntime) {
    return this.type.eval(runtime)
  }
}

export class StateDefinition extends Expression {
  constructor(
    range: Range,
    precedingComments: Comment[],
    readonly name: string,
    readonly type: Expression,
    readonly value: Expression,
    readonly isPublic: boolean,
  ) {
    super(range, precedingComments)
  }

  dependencies() {
    return union(this.type.dependencies(), this.value.dependencies())
  }

  provides() {
    return new Set(['@' + this.name])
  }

  toLisp() {
    let code = ''
    if (this.isPublic) {
      code += 'public '
    }

    code += `@${this.name}`
    if (!(this.type instanceof InferIdentifier)) {
      code += `: ${this.type.toLisp()}`
    }

    code += ` ${this.value.toLisp()}`

    return '(state ' + code + ')'
  }

  toCode() {
    let code = ''
    if (this.isPublic) {
      code += 'public '
    }

    code += `@${this.name}`
    if (!(this.type instanceof InferIdentifier)) {
      code += `: ${this.type.toCode()}`
    }

    code += ` = ${this.value.toCode()}`
    return code
  }

  getType() {
    return err(new RuntimeError(this, 'StateDefinition does not have a type'))
  }

  eval(): GetValueResult {
    return err(new RuntimeError(this, 'StateDefinition cannot be evaluated'))
  }
}

export class BuiltinActionExpression extends Identifier {
  name = '&'

  isUnknown() {
    return true
  }

  toLisp() {
    return '`&`'
  }

  toCode() {
    return '&'
  }

  getType() {
    return err(new RuntimeError(this, '& does not have a type'))
  }

  eval(): GetValueResult {
    return err(new RuntimeError(this, '& cannot be evaluated'))
  }
}

export class HelperDefinition extends Expression {
  actionType: 'action' | 'helper' = 'helper'

  constructor(
    range: Range,
    precedingComments: Comment[],
    readonly nameRef: Reference,
    readonly value: FormulaExpression,
    readonly isPublic: boolean,
  ) {
    super(range, precedingComments)
  }

  dependencies() {
    return this.value.dependencies()
  }

  provides() {
    return new Set([this.nameRef.name])
  }

  toLisp() {
    let code = ''
    if (this.isPublic) {
      code += 'public '
    }

    if (this.actionType === 'action') {
      code += '&'
    }
    code += `${this.nameRef.name} ${this.value.toLisp()}`

    return `(${this.actionType} ${code})`
  }

  toCode() {
    let code = ''
    if (this.isPublic) {
      code += 'public '
    }

    code += 'fn '
    if (this.actionType === 'action') {
      code += '&'
    }
    code += `${this.value.toCodePrefixed(false)}`
    return code
  }

  getType(runtime: TypeRuntime): GetTypeResult {
    return getChildType(this, this.value, runtime)
  }

  eval(runtime: ValueRuntime) {
    return this.value.eval(runtime)
  }
}

export class ActionDefinition extends HelperDefinition {
  actionType = 'action' as const
}

export class ViewDefinition extends Expression {
  constructor(
    range: Range,
    precedingComments: Comment[],
    readonly value: ViewFormulaExpression,
    readonly isPublic: boolean,
  ) {
    super(range, precedingComments)
  }

  get name() {
    return this.value.nameRef.name
  }

  dependencies() {
    return this.value.dependencies()
  }

  provides() {
    return new Set([this.value.nameRef.name])
  }

  toLisp() {
    let code = ''
    if (this.isPublic) {
      code += 'public '
    }

    code += `${this.value.toLispPrefixed(false)}`

    return '(view ' + code + ')'
  }

  toCode() {
    let code = ''
    if (this.isPublic) {
      code += 'public '
    }

    return code + this.value.toCode()
  }

  getType(runtime: TypeRuntime): GetTypeResult {
    return getChildType(this, this.value, runtime)
  }

  eval<T>(runtime: ApplicationRuntime<T>): GetValueResult {
    return this.value.eval(runtime)
  }
}

function wrapValues(lhs: string, expressions: Expression[], rhs: string, precedence = 0) {
  const codes = expressions.map(it => it.toCode(precedence))
  return wrapStrings(lhs, codes, rhs)
}

function wrapStrings(lhs: string, strings: string[], rhs: string) {
  // eslint complains when I use simple 'let' for these, due to the map function
  const wrap = {totalLength: 0, hasNewline: false}
  const values = strings.map(code => {
    wrap.hasNewline = wrap.hasNewline || code.length > MAX_INNER_LEN || code.includes('\n')
    wrap.totalLength += code.length + 2
    return code
  })

  if (wrap.hasNewline || wrap.totalLength > MAX_LEN) {
    if (!lhs && !rhs) {
      return values.join('\n')
    }

    const indented = values.map(code => indent(code)).join('\n')
    return `${lhs}\n${indented}\n${rhs}`
  } else {
    return `${lhs}${values.join(', ')}${rhs}`
  }
}

function indent(code: string) {
  return (INDENT + code.replaceAll('\n', NEWLINE_INDENT)).replace(/^\s+$/g, '')
}

function getChildType<T extends Expression>(
  parent: Expression,
  expr: T,
  runtime: TypeRuntime,
): ReturnType<T['getType']> {
  return expr.getType(runtime).mapResult(decorateError(parent)) as ReturnType<T['getType']>
}

function decorateError(expr: Expression) {
  return function mapError(result: GetTypeResult): GetTypeResult {
    if (result.isErr()) {
      result.error.pushParent(expr)
    }
    return result
  }
}
