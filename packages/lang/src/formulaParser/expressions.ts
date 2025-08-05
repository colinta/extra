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
import {SPLAT_OP, KWARG_OP} from '../types'
import * as Values from '../values'

import {dependencySort} from './dependencySort'
import {difference, union} from './set'
import {
  RuntimeError,
  type Comment,
  type Operator,
  type GetTypeResult,
  type GetValueResult,
  type GetRuntimeResult,
} from './types'
import {
  assignRelationshipsToRuntime,
  invertComparison,
  type Relationship,
  relationshipFormula,
  type RelationshipFormula,
} from '../relationship'
import {indent, MAX_INNER_LEN, MAX_LEN, NEWLINE_INDENT, wrapStrings} from './util'

export type Range = [number, number]
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
  // #resolvedRuntime: TypeRuntime | undefined

  constructor(
    readonly range: Range,
    public precedingComments: Comment[],
    /**
     * These are most often comments attached to the same line as the expression.
     */
    public followingComments: Comment[] = [],
  ) {
    // const getType: (runtime: TypeRuntime, ...rem: any[]) => GetTypeResult = this.getType.bind(this)
    // this.getType = (runtime: TypeRuntime, ...args: any[]) => {
    //   if (this.#resolvedRuntime !== runtime) {
    //     this.resolvedType = undefined
    //   } else if (this.resolvedType) {
    //     return ok(this.resolvedType)
    //   }
    //   return getType(runtime, ...args).map(type => {
    //     this.resolvedType = type
    //     return type
    //   })
    // }
    // Object.defineProperty(this, 'getType', {enumerable: false})
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
    return `{${this.toCode()}}`
  }

  /**
   * Type of runtime value
   */
  abstract getType(runtime: TypeRuntime): GetTypeResult
  /**
   * Converts a "type expression" into the type it represents (usually a `TypeConstructor`).
   *
   * - `Int` as a value is a function that accepts a `String|Int|Float` and returns
   *   `Int?`: `Int(value) --> Int?`
   * - and a type expression: `foo(# a: Int) --> foo(123)`
   */
  getAsTypeExpression(_runtime: TypeRuntime): GetTypeResult {
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
   * If possible, returns a formula suitable for assignNextRuntime, used in
   * assumeTrue/assumeFalse.
   */
  relationshipFormula(_runtime: TypeRuntime): RelationshipFormula | undefined {
    return undefined
  }

  /**
   * relationshipFormula and assumeTrue work very similar to replaceWithType, I
   * tried to merge the two but replaceWithType works with specific type
   * assertions and relationshipFormula/assumeTrue work (partly) with formulas
   * (comparisons < <= > >= == !=).
   */
  assumeTrue(runtime: TypeRuntime): GetRuntimeResult<TypeRuntime> {
    return this.gimmeTrueStuff(runtime).map(stuff =>
      assignRelationshipsToRuntime(runtime, stuff, true),
    )
  }

  assumeFalse(runtime: TypeRuntime): GetRuntimeResult<TypeRuntime> {
    return this.gimmeFalseStuff(runtime).map(stuff =>
      assignRelationshipsToRuntime(runtime, stuff, false),
    )
  }

  /**
   * This returns an array of true-stuff - 'and' returns all it's conditions,
   * and things like `x?.foo == 1` returns `[x != null, x.foo == 1]`, so
   * sometimes conditions can have inferences not based on the subjects
   *     x?.foo == 1 || x?.bar == 1
   *        => x != null (regardless of which branch was true)
   *
   * 'or' operator uses this to find all the assertions on the lhs, and compares
   * them with all the assestions on the rhs. If all the assertions are on the
   * same relationship (i.e. x is Int || x is String) then something about the two
   * conditions can be inferred (x is Int | String). If the two are unrelated
   * comparisons, no inference can be made.
   */
  gimmeTrueStuff(runtime: TypeRuntime): GetRuntimeResult<Relationship[]> {
    return this.getType(runtime).map(type => {
      const formula = this.relationshipFormula(runtime)
      if (!formula) {
        return []
      }

      return [{formula, comparison: {operator: 'truthy'}}]
    })
  }

  /**
   * 'and' operator uses this to find false assertions just like 'or' uses
   * gimmeTrueStuff to find true assertions.
   */
  gimmeFalseStuff(runtime: TypeRuntime): GetRuntimeResult<Relationship[]> {
    return this.getType(runtime).map(type => {
      const formula = this.relationshipFormula(runtime)
      if (!formula) {
        return []
      }

      return [{formula, comparison: {operator: 'falsey'}}]
    })
  }

  /**
   * Ideally this would be an instanceof check on InclusionOperator, but then import
   * ordering would be impossible, so it's a method.
   */
  isInclusionOp(): this is Operation {
    return false
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
}

//|
//|  Literal Expressions
//|

/**
 * Literal of any kind: Boolean, Int, Float, Regex, null. Gonna be honest,
 * having all the literals stored in one type - *except* StringLiteral
 * (sometimes? I don't even remember) - this was not my favourite decision.
 *
 * StringLiteral has its own type, which has to do with String interpolation
 * literals.
 *
 * RegexLiteral is its own type because it stores capture group names (for use
 * in matching expressions).
 */
export class Literal extends Expression {
  constructor(
    range: Range,
    precedingComments: Comment[],
    readonly value: Values.BasicValue | typeof Values.NullValue,
  ) {
    super(range, precedingComments)
  }

  relationshipFormula(_runtime: TypeRuntime): RelationshipFormula | undefined {
    if (this.value.isNull()) {
      return relationshipFormula.null()
    }
    if (this.value.isBoolean()) {
      return relationshipFormula.boolean(this.value.value)
    }
    if (this.value.isInt()) {
      return relationshipFormula.int(this.value.value)
    }
    if (this.value.isFloat()) {
      return relationshipFormula.float(this.value.value)
    }
    if (this.value.isString()) {
      return relationshipFormula.string(this.value.value)
    }

    return undefined
  }

  toLisp() {
    return this.value.toLisp()
  }

  toViewChildrenCode() {
    if (this.value instanceof Values.StringValue) {
      let code = this.value.value.replace(/([{}])/g, '\\$1')
      code = code.replace(/(<\/)/g, '\\</')
      code = code.replace(/(<>)/g, '\\<>')
      return code
    } else {
      return super.toViewChildrenCode()
    }
  }

  toCode() {
    return this.value.toCode()
  }

  getAsTypeExpression(): GetTypeResult {
    return this.getType()
  }

  getType(): GetTypeResult {
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

export class RegexLiteral extends Literal {
  readonly value: Values.RegexValue

  constructor(
    range: Range,
    precedingComments: Comment[],
    readonly pattern: string,
    readonly flags: string,
    readonly groups: Map<string, string>,
  ) {
    const value = Values.regex(pattern, flags)
    super(range, precedingComments, value)
    this.value = value
  }
}

//|
//|  String Expressions
//|

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
export class StringAtomLiteral extends StringLiteral {
  constructor(
    range: Range,
    precedingComments: Comment[],
    readonly stringValue: string,
  ) {
    super(range, precedingComments, stringValue)
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
    const minLength = this.args.reduce((length, expression) => {
      if (!(expression instanceof StringLiteral)) {
        return length
      }
      return length + expression.value.length
    }, 0)

    return ok(Types.StringType.narrowLength(minLength, undefined))
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

//|
//|  Reference Expressions
//|

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

  relationshipFormula(runtime: TypeRuntime): RelationshipFormula | undefined {
    const id = runtime.refId(this.name)
    if (!id) {
      return
    }

    return relationshipFormula.reference(this.name, id)
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

    return err(new RuntimeError(this, `Cannot get type of variable named '${this.name}'`))
  }

  getAsTypeExpression(runtime: TypeRuntime): GetTypeResult {
    return this.getType(runtime).map(type => {
      return type.fromTypeConstructor()
    })
  }

  eval(runtime: ValueRuntime) {
    const value = runtime.getLocalValue(this.name)
    if (value) {
      return ok(value)
    }

    return err(new RuntimeError(this, `Cannot get value of variable named '${this.name}'`))
  }

  replaceWithType(runtime: TypeRuntime, withType: Types.Type) {
    let nextRuntime = new MutableTypeRuntime(runtime)
    nextRuntime.replaceTypeByName(this.name, withType)
    return ok(nextRuntime)
  }
}

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

    return err(new RuntimeError(this, `Cannot get type of state variable '@${this.name}'`))
  }

  eval(runtime: ValueRuntime) {
    const value = runtime.getStateValue(this.name)
    if (value) {
      return ok(value)
    }

    return err(new RuntimeError(this, `Cannot get value of state variable '@${this.name}'`))
  }

  replaceWithType(runtime: TypeRuntime, withType: Types.Type) {
    let nextRuntime = new MutableTypeRuntime(runtime)
    nextRuntime.addStateType(this.name, withType)
    return ok(nextRuntime)
  }
}

//|
//|  Container literal Expressions
//|

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

    return `(Array(${this.generic.toLisp()}) (${this.values.map(it => it.toLisp()).join(' ')}))`
  }

  toCode() {
    if (this.generic instanceof InferIdentifier) {
      return wrapValues('[', this.values, ']')
    }

    return `Array<${this.generic.toCode()}>${wrapValues('(', this.values, ')')}`
  }

  // SpreadArgument works pretty easily here, its type signature is an
  // ArrayType so we just need to grab its 'of' property and merge it with the
  // rest of the types... and merge in the narrowed information.
  getType(runtime: TypeRuntime): GetTypeResult {
    return combineAllTypesForArray(this, runtime)
  }

  // SpreadArgument has to be special cased - it returns an array that should
  // be flattened
  eval(runtime: ValueRuntime) {
    return mapAll(
      this.values.map((valueExpr): GetRuntimeResult<Values.Value[]> => {
        if (valueExpr instanceof SpreadArrayArgument) {
          if (valueExpr.value.isInclusionOp()) {
            const [_, rhs] = valueExpr.value.args
            return rhs.eval(runtime).map(include => {
              if (include.isTruthy()) {
                return valueExpr.eval(runtime).map(array => [...array.iterate()])
              } else {
                return ok([])
              }
            })
          }

          return valueExpr.eval(runtime).map(array => [...array.iterate()])
        } else {
          if (valueExpr.isInclusionOp()) {
            const [_, rhs] = valueExpr.args
            return rhs.eval(runtime).map(include => {
              if (include.isTruthy()) {
                return valueExpr.eval(runtime).map(value => [value])
              } else {
                return ok([])
              }
            })
          }
          return valueExpr.eval(runtime).map(value => [value])
        }
      }),
    )
      .map(values => values.flat())
      .map(values => Values.array(values))
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

  getType(): GetTypeResult {
    return err(new RuntimeError(this, 'DictEntry does not have a type'))
  }

  eval(): GetValueResult {
    return err(new RuntimeError(this, 'DictEntry cannot be evaluated'))
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
      return `Dict(${values})`
    }

    return `(Dict(${this.generic.toLisp()}) (${values}))`
  }

  toCode() {
    if (this.generic instanceof InferIdentifier) {
      return wrapValues('Dict(', this.values, ')')
    }

    return `Dict<${this.generic.toCode()}>${wrapValues('(', this.values, ')')}`
  }

  getType(runtime: TypeRuntime): GetTypeResult {
    return combineAllTypesForDict(this, runtime)
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
      return `Set(${this.values.map(it => it.toLisp()).join(' ')})`
    }

    return `(Set(${this.generic.toLisp()}) (${this.values.map(it => it.toLisp()).join(' ')}))`
  }

  toCode() {
    if (this.generic instanceof InferIdentifier) {
      return wrapValues('Set(', this.values, ')')
    }

    return `Set<${this.generic.toCode()}>${wrapValues('(', this.values, ')')}`
  }

  // Unlike ArrayType, combining Set is not straighforward. We can only reason about
  // the min/max values if we know the contents of the expression (literals).
  // However, we *can* take the max value of set.min
  //
  //     set(1, 2, ...setA)  -- we start with min: 2, if setA is min: 3, then we have min3
  getType(runtime: TypeRuntime): GetTypeResult {
    return combineAllTypesForSet(this, runtime)
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

function combineAllTypesForArray(expr: ArrayExpression, runtime: TypeRuntime) {
  return mapAll(
    // returns [isSpread, Type][]
    expr.values.map((arg): GetRuntimeResult<[boolean, boolean, Types.Type]> => {
      const isSpread = arg instanceof SpreadArrayArgument
      const isInclusionOp = isSpread ? arg.value.isInclusionOp() : arg.isInclusionOp()
      return getChildType(expr, arg, runtime).map(type => [isSpread, isInclusionOp, type])
    }),
  ).map(typesInfo => {
    let returnType: Types.Type = Types.AlwaysType
    let min = 0,
      max: number | undefined = 0
    for (const [isSpread, isInclusionOp, type] of typesInfo) {
      if (isSpread && (type instanceof Types.ArrayType || type instanceof Types.SetType)) {
        // [x, y, ...set]
        // [x, y, ...array]
        min += isInclusionOp ? 0 : type.narrowedLength.min
        max =
          type.narrowedLength.max === undefined || max === undefined
            ? undefined
            : max + type.narrowedLength.max
        returnType = Types.compatibleWithBothTypes(returnType, type.of)
      } else if (isSpread) {
        // unreachable
      } else {
        // [..., x, ...] or [..., x if y, ...]
        min += isInclusionOp ? 0 : 1
        max = max === undefined ? undefined : max + 1
        returnType = Types.compatibleWithBothTypes(returnType, type)
      }
    }

    return new Types.ArrayType(returnType, {min, max})
  })
}

// TODO: actually, we should iterate all the values, and group them according to
// assignability. for instance:
//
//     set(1, 2, 3, ...strings)  -- strings; Set(String, length: 2...3)
//
// 1,2,3 each form a distinct set (they can't be assigned to each other)
// `strings: Set<String>` is also distinct (can't be assigned to 1|2|3, and vice
// versa). So at this point we have min: 5, max: 6
//
//     set(1, 2, 3, ...strings, ...ints)  -- ints: Set(Int, length: 1..4)
//
// Since 1|2|3 can all be _combined_ into Int, we have to merge all these into one
// group. When we do, we have `Set(Int, length: 3...7)`. Then we combine that
// with the `Set(String)` to get `Set(Int|String, length: 5...10)`
//
// For now, we only look at literals and treat all ...set as already belonging to
// the same type as all the literals.
function combineAllTypesForSet(expr: SetExpression, runtime: TypeRuntime) {
  return mapAll(
    // returns [isSpread, Type][]
    expr.values.map((arg): GetRuntimeResult<[boolean, Types.Type]> => {
      const isSpread = arg instanceof SpreadArrayArgument || arg instanceof SpreadSetArgument
      return getChildType(expr, arg, runtime).map(type => [isSpread, type])
    }),
  ).map(typesInfo => {
    let included = new Set<string | number | boolean>()
    let returnType: Types.Type = Types.AlwaysType
    let min = 0,
      max: number | undefined = 0
    for (const [isSpread, type] of typesInfo) {
      // set(...set)
      // set(...array)
      if (isSpread && (type instanceof Types.ArrayType || type instanceof Types.SetType)) {
        if (type instanceof Types.ArrayType) {
          // if the array has at least one item, then we can assume min: 1.
          // we can't assume more than that; we don't know anything about the contents of the
          // array, and their uniquness
          if (type.narrowedLength.min && min === 0) {
            min = 1
          }
        } else if (type instanceof Types.SetType) {
          // Sets, however, CAN guarantee that their min guarantees that number of unique
          // elements. But we don't know if they overlap with our values
          min = Math.max(min, type.narrowedLength.min)
        }
        // we do know something about the max, whether it's an array or set, we can't have
        // more items than the number of items in the array/set (plus the prev max)
        max =
          type.narrowedLength.max === undefined || max === undefined
            ? undefined
            : max + type.narrowedLength.max
        returnType = Types.compatibleWithBothTypes(returnType, type.of)
      } else if (isSpread) {
        // unreachable
      } else if (type instanceof Types.LiteralType && !(type.value instanceof RegExp)) {
        // literal boolean, float, int, or string - we can check for inclusion in the list
        // of literals
        if (!included.has(type.value)) {
          // a new literal value, we can safely say our min increases
          min += 1
          max = max === undefined ? undefined : max + 1
          included.add(type.value)
        } else {
          // no affect to min *or* max, we already counted this value.
        }

        returnType = Types.compatibleWithBothTypes(returnType, type)
      } else {
        // cannot assume min += 1, because we don't know whether 'type' is being associated
        // with a unique entry or not.
        // but we can reason about max - there can't be more than the number of entries
        max = max === undefined ? undefined : max + 1
        returnType = Types.compatibleWithBothTypes(returnType, type)
      }
    }

    return new Types.SetType(returnType, {min, max})
  })
}

// this is more similar to combineAllTypesForSet - we need to know information
// about DictEntry in order to increase min/max.
function combineAllTypesForDict(expr: DictExpression, runtime: TypeRuntime) {
  return mapAll(
    expr.values.map(
      (
        entry,
      ): GetRuntimeResult<[true, Types.DictType, undefined] | [false, Types.Type, Types.Type]> => {
        if (entry instanceof SpreadDictArgument) {
          return getChildType(expr, entry, runtime).map(dict => [true, dict, undefined])
        } else {
          return getChildType(expr, entry.value, runtime).map(valueType =>
            getChildType(expr, entry.name, runtime).map(keyType => [false, valueType, keyType]),
          )
        }
      },
    ),
  ).map(typesInfo => {
    let keys = new Set<Types.Key>()
    let returnType: Types.Type = Types.AlwaysType
    let min = 0,
      max: number | undefined = 0
    for (const [isSpread, valueType, keyType] of typesInfo) {
      if (isSpread) {
        for (const key of valueType.narrowedNames) {
          keys.add(key)
        }
        min = Math.max(min, valueType.narrowedLength.min)
        max =
          valueType.narrowedLength.max === undefined || max === undefined
            ? undefined
            : max + valueType.narrowedLength.max
        returnType = Types.compatibleWithBothTypes(returnType, valueType.of)
      } else {
        if (keyType instanceof Types.LiteralType && !(keyType.value instanceof RegExp)) {
          if (!keys.has(keyType.value)) {
            max = max === undefined ? undefined : max + 1
          }
          keys.add(keyType.value)
        }
        returnType = Types.compatibleWithBothTypes(returnType, valueType)
      }
    }

    return new Types.DictType(returnType, {min, max}, keys)
  })
}

//|
//|  Type Expressions
//|

/**
 * The class doesn't provide much convenience, mostly it groups together a bunch of
 * related classes:
 *   NamespaceAccessExpression
 *   OneOfTypeExpression
 *   ExtendsExpression
 *   ObjectTypeExpression
 *   ArrayTypeExpression
 *   DictTypeExpression
 *   SetTypeExpression
 *   TypeConstructorExpression
 */
export abstract class TypeExpression extends Expression {
  isUnknown() {
    return false
  }

  eval(_runtime: ValueRuntime): GetValueResult {
    return err(new RuntimeError(this, `${this.constructor.name} cannot be evaluated`))
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

  getAsTypeExpression(runtime: TypeRuntime): GetTypeResult {
    if (this.lhs instanceof NamespaceAccessExpression) {
      return this.lhs.getAsTypeExpression(runtime).map(type => {
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

  getType(): GetTypeResult {
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

  getAsTypeExpression(runtime: TypeRuntime): GetTypeResult {
    return this.getType(runtime)
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

  getType(): GetTypeResult {
    return err(new RuntimeError(this, 'ArrayType has no intrinsic type'))
  }

  getAsTypeExpression(runtime: TypeRuntime): GetTypeResult {
    return this.of
      .getAsTypeExpression(runtime)
      .map(type => new Types.ArrayType(type, this.narrowed))
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

  getType(): GetTypeResult {
    return err(new RuntimeError(this, 'DictType has no intrinsic type'))
  }

  getAsTypeExpression(runtime: TypeRuntime): GetTypeResult {
    return this.of.getAsTypeExpression(runtime).map(type => {
      return new Types.DictType(type, this.narrowedLength, this.narrowedNames)
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

  getType(): GetTypeResult {
    return err(new RuntimeError(this, 'SetType has no intrinsic type'))
  }

  getAsTypeExpression(runtime: TypeRuntime): GetTypeResult {
    return this.of.getAsTypeExpression(runtime).map(type => {
      return new Types.SetType(type, this.narrowedLength)
    })
  }
}

/**
 * An example will make the most sense:
 *
 *     type TupleType<T, U> = { T, U }
 *     fn intStringTuple(): TupleType(Int, String) => …
 *                          ^^^^^^^^^^^^^^^^^^^^^^
 *     fn anotherExample(): TupleType(Array(Int), String?) => …
 *                          ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
 */
export class TypeConstructorExpression extends TypeExpression {
  constructor(
    range: Range,
    precedingComments: Comment[],
    readonly nameRef: Reference,
    readonly types: Expression[],
  ) {
    super(range, precedingComments)
  }

  dependencies() {
    return this.types.reduce((set, type) => union(set, type.dependencies()), new Set<string>())
  }

  toLisp() {
    const types = this.types.map(type => type.toLisp()).join(' ')
    return `(${this.nameRef.toLisp()} ${types})`
  }

  toCode() {
    const types = this.types.map(type => type.toLisp()).join(', ')
    return `${this.nameRef.toLisp()}(${types})`
  }

  getType(): GetTypeResult {
    throw 'TODO - TypeConstructorExpression getAsTypeExpression'
  }
}

//|
//|  Argument and Spread Expressions
//|

/**
 * An argument declaration, as part of a formula definition.
 *
 * - required positional:
 *     # name: Int
 * - optional positional:
 *     # name?: Int
 *     # name: Int = 1
 * - named; required or optional:
 *     name: Int
 *     name: Int = 1
 *     alias name: Int
 *     alias name: Int = 1
 * - spread positional argument:
 *     ...# name: Array(Int)
 * - repeated named argument:
 *     ...name: Array(Int)
 * - keyword list argument:
 *     *name: Dict(Int)
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

  getType(): GetTypeResult {
    return err(new RuntimeError(this, 'ArgumentExpression has no intrinsic type'))
  }

  eval(): GetValueResult {
    return err(new RuntimeError(this, 'ArgumentExpression cannot be evaluated'))
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

  relationshipFormula(runtime: TypeRuntime): RelationshipFormula | undefined {
    return this.value.relationshipFormula(runtime)
  }

  getType(runtime: TypeRuntime): GetTypeResult {
    return getChildType(this, this.value, runtime)
  }

  eval(runtime: ValueRuntime) {
    return this.value.eval(runtime)
  }

  private evalToSpreadArguments(value: Values.Value) {
    if (value instanceof Values.ObjectValue) {
      return value.tupleValues
        .map(value => [undefined, value] as [string | undefined, Values.Value])
        .concat(
          [...value.namedValues.entries()].map(
            ([alias, value]) => [alias, value] as [string | undefined, Values.Value],
          ),
        )
    }

    if (value instanceof Values.ArrayValue) {
      return value.values.map(value => [this.alias, value] as [string | undefined, Values.Value])
    }

    return err(new RuntimeError(this, 'Expected an Object, found ' + value.constructor.name))
  }

  private evalToKwargsArguments(value: Values.Value) {
    return [[this.alias, value] as [string | undefined, Values.Value]]
  }

  /**
   * Called from ArgumentsList to receive the *flattened* arguments for the function
   * invocation. `...` and `*` are resolved into positional and named arguments.
   */
  evalToArguments(
    runtime: ValueRuntime,
    spreadArg: 'spread' | 'kwargs' | undefined = undefined,
  ): GetRuntimeResult<[string | undefined, Values.Value][]> {
    return this.eval(runtime).map(value => {
      if (spreadArg === 'spread') {
        return this.evalToSpreadArguments(value)
      } else if (spreadArg === 'kwargs') {
        return this.evalToKwargsArguments(value)
      } else {
        return [[this.alias, value] as [string | undefined, Values.Value]]
      }
    })
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

  constructor(range: Range, precedingComments: Comment[], value: Expression) {
    super(range, precedingComments, value)
  }
}

/**
 * A named argument passed to a function, object, class, or view.
 *
 *     foo(name: 'value')
 *         ^^^^^^^^^^^^^
 *
 * Also used to store 'let' declarations (via LetAssign)
 *
 *     let
 *       name = value
 *       ^^^^^^^^^^^^
 *     in …
 */
export class NamedArgument extends Argument {
  /**
   * - precedingComments: before the alias
   * - followingAliasComments: after the alias
   * - followingComments: unused (they get attached to the value)
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
 * A spread argument passed to an object, array, set, dict, or function
 *
 *     {...a} -- must be an object
 *     [...a] -- must be an array (or set?)
 *     set(...a) -- must a set (or array?)
 *     dict(...a) -- must be a dict
 *
 *     foo(...a)
 *     -- can be object (the values are "spread" as if they were passed to the function)
 *     -- or array *if* the function accepts spread args `fn(...# args: Array(T))`
 *     -- (or repeated-named args `fn(...args: Array(T))`, `foo(...args: args)`)
 *     -- or dict *if* the function accepts keyword list `fn(*kwargs: Dict(T))`
 */
export abstract class SpreadArgument extends Argument {
  toLisp() {
    return `(${SPLAT_OP} ${this.value.toLisp()})`
  }

  toCode() {
    if (this.value instanceof Operation && this.value.operator.symbol !== 'onlyif') {
      return `${SPLAT_OP}(${this.value})`
    }

    return `${SPLAT_OP}${this.value}`
  }
}

/**
 * A spread argument passed to an object
 */
export class SpreadObjectArgument extends SpreadArgument {
  readonly alias = undefined

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
  readonly alias = undefined

  getType(runtime: TypeRuntime): GetRuntimeResult<Types.ArrayType> {
    return getChildType(this, this.value, runtime).map(type => {
      // TODO: could support Set here - better to show an error message about how to turn
      // a Set into an Array. Similar for Dict - could show how to extract the values
      // into an Array/Set.
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
  readonly alias = undefined

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
  readonly alias = undefined

  getType(runtime: TypeRuntime): GetRuntimeResult<Types.SetType> {
    return getChildType(this, this.value, runtime).map(type => {
      // TODO: could support Array here - better to show an error message about how to turn
      // a Array into an Set. Similar for Dict - could show how to extract the values
      // into an Array/Set.
      if (!(type instanceof Types.SetType)) {
        return err(new RuntimeError(this, 'Expected a Set, found ' + type.toCode()))
      }

      return type
    })
  }

  eval(runtime: ValueRuntime): GetRuntimeResult<Values.SetValue> {
    return this.value.eval(runtime).map(value => {
      if (!(value instanceof Values.SetValue)) {
        return err(new RuntimeError(this, 'Expected a Set, found ' + value.toCode()))
      }

      return value
    })
  }
}

/**
 * A spread argument passed to a function.
 *     foo(...values) -- can be an object, or array if foo accepts spread args
 *     foo(...name: values) -- must be an array, and foo must accept repeated-named-arg 'name'
 *     foo(*kwargs) -- must be a Dict and foo must accept keyword-args-list
 */
export class SpreadFunctionArgument extends SpreadArgument {
  constructor(
    range: Range,
    precedingComments: Comment[],
    readonly alias: string | undefined,
    value: Expression,
    readonly spread: 'spread' | 'kwargs',
  ) {
    super(range, precedingComments, value)
  }

  getType(runtime: TypeRuntime): GetRuntimeResult<Types.ObjectType> {
    return getChildType(this, this.value, runtime).map(type => {
      if (type instanceof Types.ObjectType) {
        return type
      }

      if (type instanceof Types.ArrayType) {
        return type
      }

      return err(
        new RuntimeError(this, 'Expected an Object or Array, found ' + type.constructor.name),
      )
    })
  }

  eval(runtime: ValueRuntime): GetRuntimeResult<Values.ObjectValue> {
    return this.value.eval(runtime).map(value => {
      if (value instanceof Values.ObjectValue) {
        return value
      }

      if (value instanceof Values.ArrayValue) {
        return value
      }

      return err(
        new RuntimeError(this, 'Expected an Object or Array, found ' + value.constructor.name),
      )
    })
  }

  evalToArguments(runtime: ValueRuntime): GetRuntimeResult<[string | undefined, Values.Value][]> {
    return super.evalToArguments(runtime, this.spread)
  }
}

//|
//|  Let Expression
//|

/**
 * Used to store 'let' declarations. I'm re-using NamedArgument for convenience.
 *
 *     let
 *       name = value
 *       ^^^^^^^^^^^^
 *     in
 */
export class LetAssign extends NamedArgument {
  constructor(
    range: Range,
    precedingComments: Comment[],
    alias: string,
    readonly type: Expression | undefined,
    value: Expression,
  ) {
    super(range, precedingComments, alias, value)
  }

  toLisp() {
    if (this.type === undefined) {
      return `(${this.alias} = ${this.value.toLisp()})`
    }

    return `(${this.alias}: ${this.type.toLisp()} = ${this.value.toLisp()})`
  }

  toCode() {
    if (this.type === undefined) {
      return `${this.alias} = ${this.value}`
    }

    return `${this.alias}: ${this.type} = ${this.value}`
  }
}

export class LetExpression extends Expression {
  readonly name = 'let'
  readonly bindings: [string, LetAssign | NamedFormulaExpression][]
  private isSorted: boolean

  constructor(
    range: Range,
    precedingComments: Comment[],
    /*
     * - precedingComments: before 'let'
     * - precedingInBodyComments: before 'in'
     */
    public precedingInBodyComments: Comment[],
    bindings: (LetAssign | NamedFormulaExpression)[],
    readonly body: Expression,
  ) {
    super(range, precedingComments)

    const sorted = dependencySort(
      bindings.map((arg): [string, LetAssign | NamedFormulaExpression] => {
        if (arg instanceof NamedFormulaExpression) {
          return [arg.nameRef.name, arg]
        }

        return [arg.alias, arg]
      }),
      new Set(),
      true,
    )
    this.isSorted = sorted.isOk()
    this.bindings =
      sorted.safeGet() ??
      bindings.map(arg => {
        if (arg instanceof NamedFormulaExpression) {
          return [arg.nameRef.name, arg]
        }

        return [arg.alias, arg]
      })
  }

  private sortedBindings() {
    if (this.isSorted) {
      return ok(this.bindings)
    } else {
      return dependencySort(this.bindings, new Set(), true)
    }
  }

  toLisp() {
    const bindings = this.bindings.map(([alias, arg]) => arg.toLisp()).join(' ')
    return `(let ${bindings} ${this.body.toLisp()})`
  }

  toCode() {
    let code = 'let\n'
    for (const [alias, arg] of this.bindings) {
      let line: string
      let exprCode: string
      if (arg instanceof NamedFormulaExpression) {
        line = ''
        exprCode = arg.toCode()
      } else {
        line = alias
        if (arg.type !== undefined) {
          line += `: ${arg.type}`
        }
        line += ' = '
        exprCode = arg.value.toCode()
      }

      if (exprCode.includes('\n') || line.length + exprCode.length > MAX_INNER_LEN) {
        line += '\n' + indent(exprCode)
      } else {
        line += exprCode
      }
      code += indent(line) + '\n'
    }
    code += 'in\n'
    const bodyCode = indent(this.body.toCode())
    if (bodyCode.includes('\n')) {
      code += bodyCode
    } else {
      code += bodyCode + '\n'
    }

    return code
  }

  assignRelationships(
    runtime: MutableTypeRuntime,
    name: string,
    assignment: LetAssign,
    inferredType: Types.Type,
    explicitType: Types.Type | undefined,
  ) {
    let localType: Types.Type
    if (explicitType) {
      localType = explicitType
    } else {
      localType = inferredType
    }

    runtime.addLocalType(name, localType)

    const id = runtime.refId(name)
    if (id) {
      const refFormula = relationshipFormula.reference(name, id)
      const lengthFormula = relationshipFormula.propertyAccess(refFormula, 'length')

      // TODO: assign relationships based on explicitType
      // IE `index: Int(0...5) = 2` should assign
      //   index >= 0
      //   index <= 5
      // and not
      //   index == 2
      if (assignment instanceof LetAssign && localType === inferredType) {
        const assignmentRelationship = assignment.value.relationshipFormula(runtime)
        if (assignmentRelationship) {
          runtime.addRelationshipFormula({
            formula: refFormula,
            comparison: {operator: '==', rhs: assignmentRelationship},
          })
        }
      }

      if (localType.isFloat()) {
        const isInt = localType.isInt()
        if (localType.narrowed.min !== undefined) {
          if (Array.isArray(localType.narrowed.min)) {
            runtime.addRelationshipFormula({
              formula: refFormula,
              comparison: {
                operator: '>',
                rhs: relationshipFormula.float(localType.narrowed.min[0]),
              },
            })
          } else {
            runtime.addRelationshipFormula({
              formula: refFormula,
              comparison: {
                operator: '>=',
                rhs: relationshipFormula.number(localType.narrowed.min, isInt),
              },
            })
          }
        }

        if (localType.narrowed.max !== undefined) {
          if (Array.isArray(localType.narrowed.max)) {
            runtime.addRelationshipFormula({
              formula: refFormula,
              comparison: {
                operator: '<',
                rhs: relationshipFormula.float(localType.narrowed.max[0]),
              },
            })
          } else {
            runtime.addRelationshipFormula({
              formula: refFormula,
              comparison: {
                operator: '<=',
                rhs: relationshipFormula.number(localType.narrowed.max, isInt),
              },
            })
          }
        }
      } else if (localType.isString()) {
        if (localType.narrowedString.length.min > 0) {
          runtime.addRelationshipFormula({
            formula: lengthFormula,
            comparison: {
              operator: '>=',
              rhs: relationshipFormula.int(localType.narrowedString.length.min),
            },
          })
        }

        if (localType.narrowedString.length.max !== undefined) {
          runtime.addRelationshipFormula({
            formula: lengthFormula,
            comparison: {
              operator: '<=',
              rhs: relationshipFormula.int(localType.narrowedString.length.max),
            },
          })
        }
      } else if (localType instanceof Types.ContainerType) {
        if (localType.narrowedLength.min > 0) {
          runtime.addRelationshipFormula({
            formula: lengthFormula,
            comparison: {
              operator: '>=',
              rhs: relationshipFormula.int(localType.narrowedLength.min),
            },
          })
        }

        if (localType.narrowedLength.max !== undefined) {
          runtime.addRelationshipFormula({
            formula: lengthFormula,
            comparison: {
              operator: '<=',
              rhs: relationshipFormula.int(localType.narrowedLength.max),
            },
          })
        }
      }
    }
  }

  getType(runtime: TypeRuntime): GetTypeResult {
    let nextRuntime = new MutableTypeRuntime(runtime)
    return this.sortedBindings()
      .map(deps =>
        mapAll(
          deps.map(([name, assignment]) =>
            assignment
              .getType(nextRuntime)
              .map((inferredType): GetRuntimeResult<[Types.Type, Types.Type | undefined]> => {
                if (assignment instanceof LetAssign && assignment.type) {
                  return assignment.type
                    .getAsTypeExpression(runtime)
                    .mapResult(decorateError(this))
                    .map(explicitType => [inferredType, explicitType])
                } else {
                  return ok([inferredType, undefined])
                }
              })
              .map(([inferredType, explicitType]) => {
                if (explicitType && !Types.canBeAssignedTo(inferredType, explicitType)) {
                  return err(
                    new RuntimeError(
                      this,
                      `Cannot assign inferred type '${inferredType.toCode()}' to '${explicitType.toCode()}'`,
                    ),
                  )
                }

                if (assignment instanceof LetAssign) {
                  this.assignRelationships(
                    nextRuntime,
                    name,
                    assignment,
                    inferredType,
                    explicitType,
                  )
                }

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

//|
//|  Reserved Word Expressions
//|

export abstract class ReservedWord extends Identifier {
  abstract name: string

  toLisp() {
    return '`' + this.name + '`'
  }

  toCode() {
    return this.name
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

export class IgnorePlaceholder extends ReservedWord {
  readonly name = '_'
}

export class FallbackIdentifier extends ReservedWord {
  readonly name = 'fallback'
}

export class InferIdentifier extends ReservedWord {
  readonly name = 'infer'
}

export class IfIdentifier extends ReservedWord {
  readonly name = 'if'

  getType(): GetTypeResult {
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
          [T],
        ),
      ),
    )
  }
}

export class ElseIfIdentifier extends ReservedWord {
  readonly name = 'elseif'

  getType(): GetTypeResult {
    return ok(
      Types.withGenericT(T =>
        Types.namedFormula(
          'elseif',
          // elseif<T>(# cond: Condition, # then: T)
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
          [T],
        ),
      ),
    )
  }
}

export class GuardIdentifier extends ReservedWord {
  readonly name = 'guard'

  getType(): GetTypeResult {
    return ok(
      Types.withGenericT(T =>
        Types.namedFormula(
          'guard',
          [
            Types.positionalArgument({
              name: 'condition',
              type: Types.array(Types.ConditionType),
              isRequired: true,
            }),
            Types.namedArgument({name: 'else', type: T, isRequired: true}),
            Types.positionalArgument({name: 'body', type: T, isRequired: true}),
          ],
          T,
          [T],
        ),
      ),
    )
  }
}

export class SwitchIdentifier extends ReservedWord {
  readonly name = 'switch'

  getType(): GetTypeResult {
    return ok(
      Types.withGenericT(T =>
        Types.namedFormula(
          'switch',
          [
            Types.spreadPositionalArgument({
              name: 'cases',
              type: Types.array(Types.ConditionType),
            }),
            Types.namedArgument({name: 'else', type: T, isRequired: false}),
          ],
          T,
          [T],
        ),
      ),
    )
  }
}

export class CaseIdentifier extends ReservedWord {
  readonly name = 'case'
}

export class ObjectConstructorIdentifier extends ReservedWord {
  readonly name = 'Object'
}

export class ArrayConstructorIdentifier extends ReservedWord {
  readonly name = 'Array'
}

export class DictConstructorIdentifier extends ReservedWord {
  readonly name = 'Dict'
}

export class SetConstructorIdentifier extends ReservedWord {
  readonly name = 'Set'
}

export class ThisIdentifier extends ReservedWord {
  readonly name = 'this'

  getType(): GetTypeResult {
    return err(new RuntimeError(this, `${this.name} cannot be evaluated`))
  }

  eval(): GetValueResult {
    return err(new RuntimeError(this, `${this.name} cannot be evaluated`))
  }
}

//|
//|  Type Identifier Expressions
//|

/**
 * The name of a built-in type:
 * Int, Float, String, Boolean, View
 * null, true, false
 */
abstract class TypeIdentifier extends Identifier {
  toLisp() {
    return '`' + this.toCode() + '`'
  }

  getAsTypeExpression(runtime: TypeRuntime): GetTypeResult {
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

  relationshipFormula(_runtime: TypeRuntime): RelationshipFormula | undefined {
    return relationshipFormula.null()
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

  relationshipFormula(_runtime: TypeRuntime): RelationshipFormula | undefined {
    return relationshipFormula.boolean(true)
  }

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

  relationshipFormula(_runtime: TypeRuntime): RelationshipFormula | undefined {
    return relationshipFormula.boolean(false)
  }

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

  getAsTypeExpression(): GetTypeResult {
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

  getAsTypeExpression(): GetRuntimeResult<Types.Type> {
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

  getAsTypeExpression(): GetRuntimeResult<Types.Type> {
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

  getAsTypeExpression(): GetRuntimeResult<Types.Type> {
    return ok(this.safeTypeAssertion())
  }

  getType(): GetRuntimeResult<Types.TypeConstructor> {
    return ok(this.safeTypeAssertion().typeConstructor())
  }

  eval(): GetValueResult {
    return err(new RuntimeError(this, 'StringTypeExpression cannot be evaluated'))
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

  getAsTypeExpression(): GetRuntimeResult<Types.Type> {
    return ok(this.safeTypeAssertion())
  }

  getType(): GetRuntimeResult<Types.TypeConstructor> {
    return ok(this.safeTypeAssertion().typeConstructor())
  }

  eval(): GetValueResult {
    return err(new RuntimeError(this, 'ViewTypeExpression cannot be evaluated'))
  }
}

//|
//|  Pipe Expressions
//|

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

//|
//|  Class Expressions
//|

export class ClassPropertyExpression extends Expression {
  constructor(
    range: Range,
    precedingComments: Comment[],
    readonly nameRef: Reference,
    readonly argType: Expression,
    readonly defaultValue: Expression | undefined,
  ) {
    super(range, precedingComments)
  }

  provides() {
    return new Set([this.nameRef.name])
  }

  toLisp() {
    let code = ''
    code += this.nameRef.name

    code += ': ' + this.argType.toLisp()

    if (this.defaultValue) {
      code += ' ' + this.defaultValue.toLisp()
    }

    return `(${code})`
  }

  toCode() {
    let code = ''
    code += this.nameRef.name
    code += ': ' + this.argType.toCode()

    if (this.defaultValue) {
      code += ' = ' + this.defaultValue.toCode()
    }

    return code
  }

  getType(): GetTypeResult {
    return err(new RuntimeError(this, 'ClassPropertyExpression does not have a type'))
  }

  eval(): GetValueResult {
    return err(new RuntimeError(this, 'ClassPropertyExpression cannot be evaluated'))
  }
}

export class ClassExpression extends Expression {
  constructor(
    range: Range,
    precedingComments: Comment[],
    readonly lastComments: Comment[],
    readonly nameRef: Reference,
    readonly generics: string[],
    readonly extendsExpression: Reference | undefined,
    /**
     * Properties and their type, possibly with default value.
     */
    readonly properties: ClassPropertyExpression[],
    /**
     * Static *and* member formulas
     */
    readonly formulas: NamedFormulaExpression[],
    readonly isPublic: boolean,
  ) {
    super(range, precedingComments)
  }

  provides(): Set<string> {
    return new Set([this.nameRef.name])
  }

  toLisp() {
    let code = `(class ${this.nameRef.name})`
    code += this.generics.length > 0 ? ` <${this.generics.join(' ')}>` : ''
    if (this.extendsExpression) {
      code += ` extends ${this.extendsExpression.name}`
    }
    if (this.properties.length) {
      code += ' (' + this.properties.map(m => m.toLisp()).join(' ') + ')'
    }
    if (this.formulas.length) {
      code += ' (' + this.formulas.map(f => f.toLisp()).join(' ') + ')'
    }
    return `(${code})`
  }

  toCode() {
    let code = `class ${this.nameRef.name}`
    if (this.generics.length > 0) {
      code += `<${this.generics.join(', ')}>`
    }
    if (this.extendsExpression) {
      code += ` extends ${this.extendsExpression.name}`
    }
    code += ' {\n'
    let body = ''
    // if (this.initializer)
    for (const prop of this.properties) {
      body += prop.toCode() + '\n'
    }

    if (this.properties.length && this.formulas.length) {
      body += '\n'
    }

    for (const formula of this.formulas) {
      body += formula.toCodePrefixed(true, true) + '\n'
    }
    code += indent(body)
    code += '}'

    return code
  }

  getType(runtime: TypeRuntime): GetTypeResult {
    throw 'TODO - class getType'
  }

  eval(): GetValueResult {
    throw 'TODO - class eval'
  }
}

//|
//|  Enum Expressions
//|

export class EnumMemberExpression extends Expression {
  constructor(
    range: Range,
    precedingComments: Comment[],
    readonly name: string,
    /**
     * Uses FormulaLiteralArgumentDeclarations, which supports default arguments.
     * EnumMemberExpression acts very much like a formula literal.
     */
    readonly args: FormulaLiteralArgumentAndTypeDeclaration[],
  ) {
    super(range, precedingComments)
  }

  dependencies() {
    return this.args.reduce((set, type) => union(set, type.dependencies()), new Set<string>())
  }

  toLisp() {
    let code = '.' + this.name
    if (this.args.length) {
      code += `(${this.args.map(arg => arg.toLisp()).join(' ')})`
    }

    return code
  }

  toCode() {
    let code = '.' + this.name
    if (this.args.length) {
      code += `(${this.args.map(arg => arg.toCode()).join(', ')})`
    }

    return code
  }

  getType(): GetTypeResult {
    return err(new RuntimeError(this, 'EnumEntryExpression does not have a type'))
  }

  eval(): GetValueResult {
    return err(new RuntimeError(this, 'EnumEntryExpression cannot be evaluated'))
  }
}

export abstract class EnumTypeExpression extends Expression {
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

  getAsTypeExpression(runtime: TypeRuntime) {
    return mapAll(
      // get types of all args (combine with original member)
      this.members.map(member =>
        mapAll(
          member.args.map(arg => arg.argType.getType(runtime).map(argType => ({arg, argType}))),
        ).map(argTypes => ({
          name: member.name,
          args: argTypes,
        })),
      ),
    ).map(members => {
      const enumMembers = members.map(({name, args}) => {
        // turn args into enumArgs (positional/named arguments)
        const enumArgs = args.map(({arg, argType}) => {
          if (arg.isPositional) {
            return Types.positionalArgument({
              name: arg.nameRef.name,
              type: argType,
              isRequired: true,
            })
          } else {
            return Types.namedArgument({name: arg.nameRef.name, type: argType, isRequired: true})
          }
        })
        // turn name + enumArgs into an enumCase
        return Types.enumCase(name, enumArgs)
      })

      return Types.enumType(enumMembers)
    })
  }

  getType(): GetTypeResult {
    return err(new RuntimeError(this, 'EnumTypeExpression does not have a type'))
  }

  eval(): GetValueResult {
    return err(new RuntimeError(this, 'EnumTypeExpression cannot be evaluated'))
  }
}

/**
 * This is the enum type used when declaring an enum type at the module level
 * scope.
 */
export class NamedEnumTypeExpression extends EnumTypeExpression {
  constructor(
    range: Range,
    precedingComments: Comment[],
    readonly nameRef: Reference,
    members: EnumMemberExpression[],
    readonly formulas: NamedFormulaExpression[],
    readonly generics: string[],
    readonly isPublic: boolean,
  ) {
    super(range, precedingComments, members)
  }

  provides(): Set<string> {
    return new Set([this.nameRef.name])
  }

  toLisp() {
    let code = `(enum ${this.nameRef.name})`
    if (this.generics.length) {
      code += ` <${this.generics.join(' ')}>`
    }
    code += ' (' + this.members.map(m => m.toLisp()).join(' ') + ')'
    return `(${code})`
  }

  toCode() {
    let code = ''
    if (this.isPublic) {
      code += 'public '
    }
    code += `enum ${this.nameRef.name}`
    if (this.generics.length) {
      code += '<' + this.generics.join(', ') + '>'
    }
    code += ' {\n'
    let body = ''
    for (const member of this.members) {
      body += member.toCode() + '\n'
    }
    if (this.formulas.length) {
      body += '\n'
    }
    // if (this.initializer)
    for (const formula of this.formulas) {
      body += formula.toCodePrefixed(true, true) + '\n'
    }
    code += indent(body)
    code += '}'
    return code
  }

  getAsTypeExpression(runtime: TypeRuntime) {
    const genericTypes: Types.GenericType[] = []
    const mutableRuntime = new MutableTypeRuntime(runtime)
    for (const generic of this.generics) {
      const genericType = new Types.GenericType(generic)
      genericTypes.push(genericType)
      mutableRuntime.addLocalType(generic, genericType)
    }

    return super
      .getAsTypeExpression(runtime)
      .map(enumType => enumType.members)
      .map(members => {
        return Types.namedEnumType(this.nameRef.name, members, [], [], genericTypes)
      })
  }

  getType(): GetTypeResult {
    return err(new RuntimeError(this, 'NamedEnumTypeExpression does not have a type'))
  }

  eval(): GetValueResult {
    return err(new RuntimeError(this, 'NamedEnumTypeExpression cannot be evaluated'))
  }
}

/**
 * An enum expression as part of a formula argument list
 *
 *     fn (foo: .a | .b | .c(Int))
 */
export class EnumShorthandExpression extends EnumMemberExpression {}

export class EnumShorthandTypeExpression extends EnumTypeExpression {
  constructor(range: Range, precedingComments: Comment[], members: EnumShorthandExpression[]) {
    super(range, precedingComments, members)
  }

  toCode() {
    return this.members.map(m => m.toCode()).join(' | ')
  }

  toLisp() {
    return '(enum | ' + this.members.map(m => m.toLisp()).join(' | ') + ')'
  }
}

//|
//|  Formula and Argument Expressions
//|

/**
 * The argument list passed to a function by the invocation operator `()`
 */
export class ArgumentsList extends Expression {
  private positionalArgs: Expression[] = []
  private repeatedNamedArgs: Map<string, Expression[]> = new Map()
  lastBlockComments: Comment[] = []
  betweenComments: Comment[] = []

  constructor(
    range: Range,
    precedingComments: Comment[],
    public lastParensComments: Comment[],
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

  getType(): GetTypeResult {
    return err(new RuntimeError(this, 'ArgumentsList do not have a type'))
  }

  eval(): GetValueResult {
    return err(
      new RuntimeError(this, 'ArgumentsList cannot be evaluated (call formulaArgs(runtime))'),
    )
  }

  formulaArgs(runtime: ValueRuntime): GetRuntimeResult<Values.FormulaArgs> {
    return mapAll(this.allArgs.map(arg => arg.evalToArguments(runtime)))
      .map(arraysOfArgs => arraysOfArgs.flat())
      .map(args => new Values.FormulaArgs(args))
  }
}

/**
 * List of argument declarations and their type, e.g. `(name: String, age: Int)`,
 * as part of a function literal. Comes in two subclasses, FormulaLiteralArgumentDeclarations
 * and FormulaTypeArgumentDeclarations.
 *
 * FormulaLiteralArgumentDeclarations stores the arguments and types of a formula
 * literal (an instance of a formula)
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
 *     # name: Type [=value]
 *     alias name: Type [= value]
 *     name: Type [= value]
 *     ...# spread: Array(Type)
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
      code += SPLAT_OP
    } else if (this.spreadArg === 'kwargs') {
      code += KWARG_OP
    }

    if (this.isPositional) {
      code += '# ' + this.nameRef.name
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
      code += SPLAT_OP
    } else if (this.spreadArg === 'kwargs') {
      code += KWARG_OP
    }

    if (this.isPositional) {
      code += '# ' + this.nameRef.name
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
 *     add = fn(a: Int, b: Int): Int
 *              ^^^^^^^^^^^^^^
 *       (list of FormulaTypeArgumentAndType)
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
 * The argument name and type for a FormulaType expression
 *
 *     add: fn(a: Int, b: Int): Int
 *             ^^^^^^  |
 *                     ^^^^^^
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
    readonly isRequired: boolean,
  ) {
    super(range, precedingComments, nameRef, aliasRef, argType, spreadArg, isPositional)
  }

  provides(): Set<string> {
    return new Set([this.nameRef.name])
  }

  formulaArgumentType(runtime: TypeRuntime): GetRuntimeResult<Types.Argument> {
    return this.argType.getAsTypeExpression(runtime).map(type => {
      // scanArgumentType already verifies that 'type' is correct (Array/Dict)
      // for the spread/kwargs-argument types.
      if (this.spreadArg === 'kwargs') {
        return Types.kwargListArgument({name: this.nameRef.name, type: type as Types.DictType})
      } else if (this.spreadArg === 'spread' && this.isPositional) {
        return Types.spreadPositionalArgument({
          name: this.nameRef.name,
          type: type as Types.ArrayType,
        })
      } else if (this.spreadArg === 'spread') {
        return Types.repeatedNamedArgument({
          name: this.nameRef.name,
          alias: this.aliasRef.name,
          type: type as Types.ArrayType,
        })
      } else if (this.isPositional) {
        return Types.positionalArgument({
          name: this.nameRef.name,
          type: type,
          isRequired: this.isRequired,
        })
      } else {
        return Types.namedArgument({
          name: this.nameRef.name,
          alias: this.aliasRef.name,
          type: type,
          isRequired: this.isRequired,
        })
      }
    })
  }

  toLisp() {
    let code = ''
    if (this.spreadArg === 'spread') {
      code += SPLAT_OP
    } else if (this.spreadArg === 'kwargs') {
      code += KWARG_OP
    }

    if (this.isPositional) {
      code += '# ' + this.nameRef.name
    } else if (this.aliasRef.name !== this.nameRef.name) {
      code += this.aliasRef.name + ' ' + this.nameRef.name
    } else {
      code += this.nameRef.name
    }

    if (!this.isRequired) {
      code += '?'
    }
    code += ': ' + this.argType.toLisp()

    return `(${code})`
  }

  toCode() {
    let code = ''
    if (this.spreadArg === 'spread') {
      code += SPLAT_OP
    } else if (this.spreadArg === 'kwargs') {
      code += KWARG_OP
    }

    if (this.isPositional) {
      code += '# ' + this.nameRef.name
    } else if (this.aliasRef.name !== this.nameRef.name) {
      code += this.aliasRef.name + ' ' + this.nameRef.name
    } else {
      code += this.nameRef.name
    }

    if (!this.isRequired) {
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
    readonly generics: string[],
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

  getAsTypeExpression(runtime: TypeRuntime): GetTypeResult {
    const genericTypes: Types.GenericType[] = []
    const mutableRuntime = new MutableTypeRuntime(runtime)
    for (const generic of this.generics) {
      const genericType = new Types.GenericType(generic)
      genericTypes.push(genericType)
      mutableRuntime.addLocalType(generic, genericType)
    }

    return mapAll(this.argDefinitions.args.map(arg => arg.formulaArgumentType(mutableRuntime))).map(
      args => {
        return this.returnType
          .getAsTypeExpression(mutableRuntime)
          .map(returnType => Types.formula(args, returnType, genericTypes))
      },
    )
  }

  getType(): GetTypeResult {
    return err(new RuntimeError(this, 'FormulaTypeExpression does not have a type'))
  }

  eval(): GetValueResult {
    return err(new RuntimeError(this, 'FormulaTypeExpression cannot be evaluated'))
  }
}

/**
 * An instance of a function (named or anonymous function, with explicit types)
 *
 *     fn [name](# arg0: type, # arg1: type = value, name: type = value): type => body
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
      code += '<' + this.generics.join(', ') + '> '
    }
    code += this.argDefinitions.toLisp()
    if (!(this.returnType instanceof InferIdentifier)) {
      code += ' : ' + this.returnType.toLisp()
    }
    code += ' => ' + this.body.toLisp()
    code += prefixed ? ')' : ''
    return code
  }

  toCode() {
    return this.toCodePrefixed(true, false)
  }

  toCodePrefixed(prefixed: boolean, forceNewline: boolean) {
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
    const returnTypeCode = this.returnType.toCode()
    let hasNewline: boolean
    if (forceNewline) {
      hasNewline = true
    } else {
      const bodyCode = this.body.toCode()
      const testCode = code + argDefinitions + returnTypeCode + bodyCode
      hasNewline = testCode.includes('\n') || testCode.length > MAX_LEN
    }

    const argDefinitionsHasNewline =
      argDefinitions.includes('\n') || argDefinitions.length > MAX_INNER_LEN
    if (!argDefinitions.length) {
      code += '()'
    } else if (argDefinitionsHasNewline) {
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
    const hasNewline = bodyCode.length > REM_LEN || bodyCode.includes('\n')
    if (hasNewline) {
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
          if (arg.spreadArg) {
            throw `TODO: inferring type of ${arg.toCode()} in argumentTypes is not done`
          }

          let inferArgType: Types.Type | undefined
          if (formulaType) {
            inferArgType =
              formulaType.positionalArg(position)?.type ??
              formulaType.namedArg(arg.aliasRef.name)?.type
          } else {
            inferArgType = undefined
          }

          if (!inferArgType) {
            // I know some programming languages are able to infer the argument type
            // based on how it's *used* but that just sounds like a ton of work,
            // for mediocre results.
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
          argType = arg.argType.getAsTypeExpression(runtime)
        }

        return argType.map(type => {
          if (arg.defaultValue) {
            const defaultTypeResult = getChildType(this, arg.defaultValue, runtime)
            if (defaultTypeResult.isErr()) {
              return err(defaultTypeResult.error)
            }

            const defaultType = defaultTypeResult.get()
            if (!Types.canBeAssignedTo(defaultType, type)) {
              return decorateError(this)(
                err(
                  new RuntimeError(arg.defaultValue, Types.cannotAssignToError(defaultType, type)),
                ),
              )
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
    const mutableRuntime = new MutableTypeRuntime(runtime)
    const genericTypes: Types.GenericType[] = []
    for (const generic of this.generics) {
      const genericType = new Types.GenericType(generic)
      genericTypes.push(genericType)
      mutableRuntime.addLocalType(generic, genericType)
    }

    return this.argumentTypes(mutableRuntime, formulaType).map(args => {
      args.forEach(arg => {
        mutableRuntime.addLocalType(arg.name, arg.type)
      })

      let returnTypeResult: GetTypeResult
      const bodyReturnType = this.body.getType(mutableRuntime)
      if (this.returnType instanceof InferIdentifier) {
        returnTypeResult = bodyReturnType
      } else {
        const returnType = this.returnType
          .getAsTypeExpression(mutableRuntime)
          .mapResult(decorateError(this))
        returnTypeResult = mapAll([bodyReturnType, returnType]).map(
          ([bodyType, typeConstructor]) => {
            const returnType = typeConstructor.fromTypeConstructor()

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

      return returnTypeResult.map(returnType => {
        if (this.nameRef) {
          return new Types.NamedFormulaType(this.nameRef.name, returnType, args, genericTypes)
        }

        return new Types.FormulaType(returnType, args, genericTypes)
      })
    })
  }

  private organizeArguments(argDefinitions: FormulaLiteralArgumentAndTypeDeclaration[]) {
    const requiredPositional: FormulaLiteralArgumentAndTypeDeclaration[] = []
    // const lastPositional: FormulaLiteralArgumentAndTypeDeclaration[] = []
    const optionalPositional: [FormulaLiteralArgumentAndTypeDeclaration, Expression][] = []
    let remainingPositional: FormulaLiteralArgumentAndTypeDeclaration | undefined
    const singleNamed: Map<string, FormulaLiteralArgumentAndTypeDeclaration> = new Map()
    const repeatNamed: Map<string, FormulaLiteralArgumentAndTypeDeclaration> = new Map()
    let kwargs: FormulaLiteralArgumentAndTypeDeclaration | undefined

    for (const arg of argDefinitions) {
      if (arg.spreadArg === 'spread' && arg.isPositional) {
        if (remainingPositional) {
          throw `weird(organizeArguments) - spread positional argument '${remainingPositional.aliasRef.name}' already defined`
        }
        remainingPositional = arg
      } else if (arg.spreadArg === 'spread') {
        if (repeatNamed.has(arg.aliasRef.name)) {
          throw `weird(organizeArguments) - repeated named argument '${arg.aliasRef.name}' already defined`
        }
        repeatNamed.set(arg.aliasRef.name, arg)
      } else if (arg.spreadArg === 'kwargs') {
        if (kwargs) {
          throw `weird(organizeArguments) - kwargs argument '${kwargs.aliasRef.name}' already defined`
        }
        kwargs = arg
      } else if (arg.isPositional && arg.defaultValue) {
        optionalPositional.push([arg, arg.defaultValue])
      } else if (arg.isPositional && remainingPositional) {
        // lastPositional.push(arg)
      } else if (arg.isPositional && !arg.defaultValue) {
        requiredPositional.push(arg)
      } else {
        if (singleNamed.has(arg.aliasRef.name)) {
          throw `weird(organizeArguments) - single named argument '${arg.aliasRef.name}' already defined`
        }
        singleNamed.set(arg.aliasRef.name, arg)
      }
    }

    return {
      requiredPositional,
      // lastPositional,
      optionalPositional,
      remainingPositional,
      singleNamed,
      repeatNamed,
      kwargs,
    }
  }

  private argumentValues(
    runtime: ValueRuntime,
    argDefinitions: FormulaLiteralArgumentAndTypeDeclaration[],
    invokedArgs: Values.FormulaArgs,
  ): GetRuntimeResult<ValueRuntime> {
    // the type checker in _checkFormulaArguments supports this "shorthand",
    // where passing *only positional arguments* to a function that only *accepts named
    // arguments* is accepted.
    if (
      // only named arguments defined by formula
      argDefinitions.length &&
      argDefinitions.every(arg => !arg.spreadArg && !arg.isPositional) &&
      // all positional arguments provided
      invokedArgs.args.length &&
      invokedArgs.args.every(([alias]) => alias === undefined)
    ) {
      return this.argumentValues(
        runtime,
        argDefinitions.map(
          arg =>
            new FormulaLiteralArgumentAndTypeDeclaration(
              arg.range,
              arg.precedingComments,
              arg.nameRef,
              arg.aliasRef,
              arg.argType,
              false,
              true,
              arg.defaultValue,
            ),
        ),
        invokedArgs,
      )
    }

    const {
      requiredPositional,
      // lastPositional,
      optionalPositional,
      remainingPositional,
      singleNamed,
      repeatNamed,
      kwargs,
    } = this.organizeArguments(argDefinitions)
    const mutableRuntime = new MutableValueRuntime(runtime)
    let position = 0
    for (const arg of requiredPositional) {
      const value = invokedArgs.safeAt(position)
      if (!value) {
        throw `weird - missing positional argument '${arg.nameRef.name}'. No argument passed at position #${position + 1}`
      }
      mutableRuntime.addLocalValue(arg.aliasRef.name, value)
      position += 1
    }
    for (const [arg, defaultValue] of optionalPositional) {
      let value = invokedArgs.safeAt(position)
      if (!value) {
        const result = defaultValue.eval(runtime)
        if (result.isErr()) {
          return err(result.error)
        }
        value = result.get()
      }
      mutableRuntime.addLocalValue(arg.aliasRef.name, value)
      position += 1
    }

    if (remainingPositional) {
      const values = []
      for (let index = position; index < invokedArgs.length; index += 1) {
        const value = invokedArgs.safeAt(index)
        if (!value) {
          break
        }
        values.push(value)
      }
      const array = new Values.ArrayValue(values)
      mutableRuntime.addLocalValue(remainingPositional.aliasRef.name, array)
    }

    const allNames = invokedArgs.names

    for (const [name, arg] of singleNamed) {
      allNames.delete(name)
      let value = invokedArgs.safeNamed(name)
      if (!value) {
        const defaultValue = arg.defaultValue
        if (!defaultValue) {
          throw `weird - missing positional argument '${arg.aliasRef.name}'. No argument named '${arg.aliasRef.name}'`
        }

        const result = defaultValue.eval(runtime)
        if (result.isErr()) {
          return err(result.error)
        }
        value = result.get()
      }
      mutableRuntime.addLocalValue(arg.nameRef.name, value)
    }

    for (const [name, arg] of repeatNamed) {
      allNames.delete(name)
      let value = invokedArgs.safeAllNamed(name)
      mutableRuntime.addLocalValue(arg.nameRef.name, new Values.ArrayValue(value))
    }

    if (kwargs) {
      const kwargValues: Map<string, Values.Value> = new Map()
      for (const name of allNames) {
        const value = invokedArgs.safeNamed(name)
        if (!value) {
          continue
        }
        kwargValues.set(name, value)
      }
      mutableRuntime.addLocalValue(kwargs.nameRef.name, new Values.DictValue(kwargValues))
    }

    return ok(mutableRuntime)
  }

  eval(runtime: ValueRuntime): GetValueResult {
    const argDefinitions = this.argDefinitions.args
    // this is the function that is invoked by 'FunctionInvocationOperator'
    const fn = (args: Values.FormulaArgs): Result<Values.Value, string> => {
      // TODO: use the context from below for closed-over variables
      return this.argumentValues(runtime, argDefinitions, args)
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

    if (this.nameRef) {
      return ok(new Values.NamedFormulaValue(this.nameRef.name, fn))
    } else {
      return ok(new Values.FormulaValue(fn))
    }
  }
}

export class NamedFormulaExpression extends FormulaExpression {
  constructor(
    range: Range,
    precedingComments: Comment[],
    precedingNameComments: Comment[],
    precedingReturnTypeComments: Comment[],
    readonly nameRef: Reference,
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

  getType(
    runtime: TypeRuntime,
    formulaType?: Types.FormulaType | undefined,
  ): GetRuntimeResult<Types.NamedFormulaType> {
    return super.getType(runtime, formulaType) as GetRuntimeResult<Types.NamedFormulaType>
  }
}

/**
 * Identical in form to a NamedFormulaExpression, but prefixed w/ 'static'
 * (and obviously semantics are different when invoked, but since they act as
 * regular formulas, this is actually "for free").
 */
export class StaticFormulaExpression extends NamedFormulaExpression {
  prefix = 'static'
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

      let childrenCode = this.children
        .map(child => {
          if (child instanceof ViewExpression) {
            return child.toViewChildrenCode().replaceAll('\n', NEWLINE_INDENT)
          } else {
            return child.toViewChildrenCode()
          }
        })
        .join('')
      if (childrenCode.includes('\n') && !childrenCode.startsWith('\n')) {
        const indent =
          childrenCode.split('\n').reduce(
            (indent, line) => {
              const lineIndent = line.match(/^\s*/)?.[0] ?? ''
              if (indent === undefined) {
                return lineIndent
              }
              return lineIndent.length > indent.length ? lineIndent : indent
            },
            undefined as string | undefined,
          ) ?? ''
        childrenCode = '\n' + indent + childrenCode
      }
      lines.push(childrenCode)

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
    throw `TODO - what to do with ${type}`
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

export class NamedViewExpression extends ViewExpression {
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
    return this.toCodePrefixed(false, true)
  }
}

//|
//|  Match Expressions
//|

export abstract class MatchExpression extends Expression {
  /**
   * Called from MatchOperator with the formula and expression of lhs.
   */
  gimmeTrueStuffWith(
    _runtime: TypeRuntime,
    _formula: RelationshipFormula | undefined,
    _lhsType: Types.Type,
  ): GetRuntimeResult<Relationship[]> {
    return ok([])
  }

  /**
   * Called from MatchOperator with the formula and expression of lhs.
   */
  gimmeFalseStuffWith(
    _runtime: TypeRuntime,
    _formula: RelationshipFormula | undefined,
    _lhsType: Types.Type,
  ): GetRuntimeResult<Relationship[]> {
    return ok([])
  }

  getType(): GetTypeResult {
    return err(new RuntimeError(this, `${this.constructor.name} does not have a type`))
  }

  eval(): GetValueResult {
    return err(new RuntimeError(this, `${this.constructor.name} cannot be evaluated`))
  }

  checkAssignRefs() {
    // TODO: examine gimmeTrueStuffWith results, looking for duplicate
    // assignments.
    const assignRefs = this.matchAssignReferences()
    const found = new Set<string>()
    for (const ref of assignRefs) {
      if (found.has(ref)) {
        return ref
      }
      found.add(ref)
    }
  }
  abstract matchAssignReferences(): string[]
}

/**
 * foo is Int, foo is Int(>=0), foo is Array(Int(>1), length: >0), etc etc
 */
export class MatchTypeExpression extends MatchExpression {
  constructor(
    readonly argType: Expression,
    readonly assignRef: Reference | undefined,
  ) {
    super(argType.range, argType.precedingComments, argType.followingComments)
  }

  matchAssignReferences() {
    return this.assignRef ? [this.assignRef.name] : []
  }

  getAsTypeExpression(runtime: TypeRuntime): GetTypeResult {
    return this.argType.getAsTypeExpression(runtime)
  }

  gimmeTrueStuffWith(
    runtime: TypeRuntime,
    formula: RelationshipFormula | undefined,
    _lhsType: Types.Type,
  ): GetRuntimeResult<Relationship[]> {
    if (!formula && !this.assignRef) {
      return ok([])
    }

    return this.getAsTypeExpression(runtime).map((type): Relationship[] => {
      const relationships: Relationship[] = []
      if (formula) {
        relationships.push({formula, comparison: {operator: 'instanceof', rhs: type}})
      }

      if (this.assignRef) {
        relationships.push({
          formula: relationshipFormula.assign(this.assignRef.name),
          comparison: {operator: 'instanceof', rhs: type},
        })
      }

      return relationships
    })
  }

  gimmeFalseStuffWith(
    runtime: TypeRuntime,
    formula: RelationshipFormula | undefined,
    lhsType: Types.Type,
  ): GetRuntimeResult<Relationship[]> {
    if (!formula) {
      return ok([])
    }

    return this.getAsTypeExpression(runtime).map(type => {
      return [{formula, comparison: {operator: '!instanceof', rhs: type}}]
    })
  }

  toLisp() {
    if (this.assignRef) {
      return `(${this.argType.toLisp()} as ${this.assignRef.toLisp()})`
    }

    return this.argType.toLisp()
  }

  toCode() {
    if (this.assignRef) {
      return `${this.argType} as ${this.assignRef}`
    }

    return this.argType.toCode()
  }
}

export abstract class MatchIdentifier extends MatchExpression {
  abstract readonly reference?: Identifier

  matchAssignReferences() {
    return this.reference ? [this.reference.name] : []
  }

  gimmeTrueStuffWith(
    runtime: TypeRuntime,
    _formula: RelationshipFormula | undefined,
    lhsType: Types.Type,
  ): GetRuntimeResult<Relationship[]> {
    if (!this.reference) {
      return ok([])
    }

    return ok([
      {
        formula: relationshipFormula.assign(this.reference.name),
        comparison: {operator: 'instanceof', rhs: lhsType},
      },
    ])
  }

  provides() {
    if (!this.reference) {
      return super.provides()
    }

    return new Set([this.reference.name])
  }
}

/**
 * `_` will match anything, but will not assign it to scope.
 */
export class MatchIgnore extends MatchIdentifier {
  readonly reference?: Identifier = undefined

  toLisp() {
    return '_'
  }

  toCode() {
    return '_'
  }
}

/**
 * `var-name` will match anything, and assigns it to scope. See MatchIdentifier for
 * implementation.
 */
export class MatchReference extends MatchIdentifier {
  constructor(readonly reference: Reference) {
    super(reference.range, reference.precedingComments)
  }

  toLisp() {
    return this.reference.toLisp()
  }

  toCode() {
    return this.reference.toCode()
  }
}

/**
 * Used to ignore the rest of the match args or array elements.
 *     .some(arg1, ...)
 *     [arg1, ...]
 *
 * TODO: Support splat (assigning remaining args to a Tuple)
 *     .some(arg, ...remaining)
 */
export class MatchIgnoreRemainingExpression extends MatchIdentifier {
  readonly reference?: Identifier = undefined

  toLisp() {
    return SPLAT_OP
  }

  toCode() {
    return SPLAT_OP
  }
}

/**
 * [...values]
 */
export class MatchAssignRemainingExpression extends MatchIdentifier {
  constructor(
    range: Range,
    precedingComments: Comment[],
    readonly reference: Reference,
  ) {
    super(range, precedingComments)
  }

  toLisp() {
    return this.toCode()
  }

  toCode() {
    return `${SPLAT_OP}${this.reference.name}`
  }
}

/**
 * A named reference within an enum match expression. Often contains a reference,
 * but can contain any match expression.
 *
 *     .something(named: value)
 *                ^^^^^^^^^^^^
 *     .something(named: [value])
 *                ^^^^^^^^^^^^^^
 */
export class MatchNamedArgument extends MatchExpression {
  constructor(
    range: Range,
    precedingComments: Comment[],
    readonly nameRef: Reference,
    readonly matchExpr: MatchExpression,
  ) {
    super(range, precedingComments)
  }

  matchAssignReferences() {
    return this.matchExpr.matchAssignReferences()
  }

  provides() {
    return this.matchExpr.provides()
  }

  gimmeTrueStuffWith(
    runtime: TypeRuntime,
    formula: RelationshipFormula | undefined,
    lhsType: Types.Type,
  ): GetRuntimeResult<Relationship[]> {
    return this.matchExpr.gimmeTrueStuffWith(runtime, formula, lhsType)
  }

  gimmeFalseStuffWith(
    runtime: TypeRuntime,
    formula: RelationshipFormula | undefined,
    lhsType: Types.Type,
  ): GetRuntimeResult<Relationship[]> {
    return this.matchExpr.gimmeFalseStuffWith(runtime, formula, lhsType)
  }

  toLisp() {
    return `(${this.nameRef.toLisp()}: ${this.matchExpr.toLisp()})`
  }

  toCode() {
    return `${this.nameRef.toCode()}: ${this.matchExpr.toCode()}`
  }
}

/**
 * Matches the case name and args.
 *
 *     foo is .some(arg1, named: arg2)
 *     foo is .some(arg1, ...)
 *     foo is .some([1, 2, ...], .red)
 */
export class MatchEnumExpression extends MatchExpression {
  private positionalCount: number = 0
  private names = new Set<string>()

  constructor(
    range: Range,
    precedingComments: Comment[],
    readonly name: string,
    readonly args: MatchExpression[],
  ) {
    super(range, precedingComments)
    for (const arg of args) {
      if (arg instanceof MatchIgnoreRemainingExpression) {
        break
      }

      if (arg instanceof MatchNamedArgument) {
        this.names.add(arg.nameRef.name)
      } else {
        this.positionalCount += 1
      }
    }
  }

  matchAssignReferences() {
    return this.args.flatMap(match => match.matchAssignReferences())
  }

  provides() {
    return this.args.reduce((set, arg) => union(set, arg.provides()), new Set<string>())
  }

  /**
   * Checks 'type' for an enum type with a case that matches the match data in
   * `this`.
   * - OneOfType searches all types for a matching enum
   * - `this.name` must match EnumType.name
   * - if `this.args` is empty only name needs to match.
   * - if `this.args` includes 'MatchIgnoreRemaining', then there should be enough
   *   positional args and names.
   * - otherwise there should be the same number of positional args and names.
   * - all the assigned names (in `this.names`) should be present in the enum case.
   */
  private findEnumTypeThatMatchesCase(
    type: Types.Type,
  ): GetRuntimeResult<[Types.EnumType, Types.EnumCase]> {
    const result = this._findOptionalEnumTypeThatMatchesCase(type)
    if (!result) {
      return err(
        new RuntimeError(
          this,
          `Invalid match expression - '${type}' does not match case expression '${this}'`,
        ),
      )
    }

    return result
  }

  /**
   * See findEnumTypeThatMatchesCase, this function actually does the checking. Three
   * possible return values:
   * - `undefined` => no match found
   * - Err => Multiple matches found
   * - Ok([Types.EnumType, Types.EnumCase]) => match found
   */
  private _findOptionalEnumTypeThatMatchesCase(
    type: Types.Type,
  ): GetRuntimeResult<[Types.EnumType, Types.EnumCase]> | undefined {
    if (type instanceof Types.OneOfType) {
      let enumInfo: [Types.EnumType, Types.EnumCase] | undefined
      for (const oneType of type.of) {
        const oneCheckResult = this._findOptionalEnumTypeThatMatchesCase(oneType)
        if (!oneCheckResult) {
          continue
        }

        if (oneCheckResult.isErr()) {
          return oneCheckResult
        }

        if (enumInfo) {
          // TODO: could possibly support this, if all the matching enum cases have
          // compatible arguments
          return err(
            new RuntimeError(
              this,
              `More than one matching case expression (${enumInfo[0]} and ${oneCheckResult.value[0]})`,
            ),
          )
        } else {
          enumInfo = oneCheckResult.value
        }
      }

      return enumInfo ? ok(enumInfo) : undefined
    }

    // must be an enum
    if (!(type instanceof Types.EnumType)) {
      return
    }

    // must have a case with this name
    const enumCase = type.members.find(({name}) => name === this.name)
    if (!enumCase) {
      return
    }

    // if there are no args, then this is a match
    if (this.args.length === 0) {
      return ok([type, enumCase])
    }

    // if not all args are matched, only check for enough args
    const ignoreRemaining = this.args.at(-1) instanceof MatchIgnoreRemainingExpression
    if (ignoreRemaining) {
      // foo is .some(value, ...)
      // => fine as long as EnumType has *at least* enough arguments to assign
      if (
        enumCase.positionalTypes.length < this.positionalCount ||
        enumCase.namedTypes.size < this.names.size
      ) {
        return
      }
    } else if (
      enumCase.positionalTypes.length !== this.positionalCount ||
      enumCase.namedTypes.size !== this.names.size
    ) {
      // no ignore-remaining matcher, so counts of all args must equal
      return
    }

    // all named args must be present in the enumCase
    for (const name of this.names) {
      if (!enumCase.namedTypes.has(name)) {
        return
      }
    }

    return ok([type, enumCase])
  }

  gimmeTrueStuffWith(
    runtime: TypeRuntime,
    formula: RelationshipFormula | undefined,
    lhsType: Types.Type,
  ): GetRuntimeResult<Relationship[]> {
    return this.findEnumTypeThatMatchesCase(lhsType).map(enumInfo => {
      const [enumType, enumCase] = enumInfo
      const relationships: Relationship[] = []

      if (formula) {
        // TODO: create an enumType that only contains the enumCase
        relationships.push({formula, comparison: {operator: 'instanceof', rhs: enumType}})
      }

      if (!this.args.length) {
        return ok(relationships)
      }

      let index = 0
      for (const arg of this.args) {
        let type: Types.Type
        if (arg instanceof MatchNamedArgument) {
          type = enumCase.namedTypes.get(arg.nameRef.name)!
        } else {
          type = enumCase.positionalTypes[index]
          index += 1
        }

        const result = arg.gimmeTrueStuffWith(runtime, undefined, type)
        if (result.isErr()) {
          return err(result.error)
        }
        relationships.push(...result.value)
      }

      return relationships
    })
  }

  // cannot infer anything in the 'false' case (TODO: or _at most_ the one
  // matching case could be excluded, when 'Exclude' is implemented).
  // gimmeFalseStuffWith(
  //   runtime: TypeRuntime,
  //   formula: RelationshipFormula,
  // ): GetRuntimeResult<Relationship[]> {
  //   return getChildType(this, lhsExpr, runtime)
  //     .map(lhsType => this._assumeMatchAndNestedAssertionType(runtime, lhsExpr, lhsType))
  //     .map(([type]) => [{formula, type: 'instanceof', right: relationshipFormula.type(type)}])
  // }

  toLisp() {
    let code = '.' + this.name
    const args = this.args.map(arg => arg.toLisp())

    if (this.args.length) {
      code += `(${args.join(' ')})`
    }

    return code
  }

  toCode() {
    let code = '.' + this.name
    const args = this.args.map(arg => arg.toCode())

    if (args.length) {
      code += `(${args.join(', ')})`
    }

    return code
  }
}

export class MatchLiteral extends MatchExpression {
  constructor(readonly literal: Literal) {
    super(literal.range, literal.precedingComments)
  }

  matchAssignReferences() {
    return []
  }

  getAsTypeExpression(runtime: TypeRuntime): GetTypeResult {
    return this.literal.getAsTypeExpression()
  }

  gimmeTrueStuffWith(
    runtime: TypeRuntime,
    formula: RelationshipFormula | undefined,
    lhsType: Types.Type,
  ): GetRuntimeResult<Relationship[]> {
    if (!formula) {
      return ok([])
    }

    return this.getAsTypeExpression(runtime).map((type): Relationship[] => {
      if (formula) {
        return [{formula, comparison: {operator: 'instanceof', rhs: type}}]
      }

      return []
    })
  }

  gimmeFalseStuffWith(
    runtime: TypeRuntime,
    formula: RelationshipFormula | undefined,
    lhsType: Types.Type,
  ): GetRuntimeResult<Relationship[]> {
    if (!formula) {
      return ok([])
    }

    return this.getAsTypeExpression(runtime).map(type => {
      return [{formula, comparison: {operator: '!instanceof', rhs: type}}]
    })
  }

  toLisp() {
    return this.literal.toLisp()
  }

  toCode() {
    return this.literal.toCode()
  }
}

export class MatchUnaryRange extends MatchExpression {
  readonly precedence = 12 // from operators.ts

  constructor(
    readonly range: Range,
    public precedingComments: Comment[],
    readonly op: '=' | '>' | '>=' | '<' | '<=',
    readonly start: Literal,
  ) {
    super(range, precedingComments)
  }

  matchAssignReferences() {
    return []
  }

  getTypeWithHint(hint: Types.Type): Types.Type {
    if (hint.isRange()) {
      const numberType = this.getTypeWithHint(hint.type)
      if (numberType.isInt()) {
        return Types.intRange(numberType.narrowed)
      } else if (numberType.isFloat()) {
        return Types.floatRange(numberType.narrowed)
      }
      return Types.NeverType
    }
    if (!this.start.value.isFloat()) {
      return Types.NeverType
    }
    const value = this.start.value.value

    // repeated in MatchBinaryRange
    let hintIsInt: boolean
    if (hint instanceof Types.OneOfType) {
      // if one of the types is an int and *none* of the types are a float
      hintIsInt =
        hint.of.some(type => type.isInt()) && !hint.of.some(type => type.isFloat() && !type.isInt())
    } else {
      hintIsInt = hint.isInt()
    }

    if (hintIsInt) {
      switch (this.op) {
        case '=':
          return Types.int({min: value, max: value})
        case '>':
          return Types.int({min: value + 1})
        case '>=':
          return Types.int({min: value})
        case '<':
          return Types.int({max: value - 1})
        case '<=':
          return Types.int({max: value})
      }
    }

    switch (this.op) {
      case '=':
        return Types.float({min: value, max: value})
      case '>':
        return Types.float({min: [value]})
      case '>=':
        return Types.float({min: value})
      case '<':
        return Types.float({max: [value]})
      case '<=':
        return Types.float({max: value})
    }
  }

  gimmeTrueStuffWith(
    runtime: TypeRuntime,
    formula: RelationshipFormula | undefined,
    lhsType: Types.Type,
  ): GetRuntimeResult<Relationship[]> {
    if (!formula) {
      return ok([])
    }

    const type = this.getTypeWithHint(lhsType)
    const rhs = this.start.relationshipFormula(runtime)
    if (!rhs) {
      return ok([])
    }

    const operator = this.op === '=' ? '==' : this.op
    return ok([
      {formula, comparison: {operator: 'instanceof', rhs: type}},
      {formula, comparison: {operator, rhs}},
    ])
  }

  gimmeFalseStuffWith(
    runtime: TypeRuntime,
    formula: RelationshipFormula | undefined,
    lhsType: Types.Type,
  ): GetRuntimeResult<Relationship[]> {
    if (!formula) {
      return ok([])
    }

    const type = this.getTypeWithHint(lhsType)
    const rhs = this.start.relationshipFormula(runtime)
    if (!rhs) {
      return ok([])
    }

    const operator = this.op === '=' ? '==' : this.op
    const relationships: Relationship[] = [
      {formula, comparison: {operator: '!instanceof', rhs: type}},
    ]
    const narrowType = Types.narrowTypeIsNot(lhsType, type)
    if (narrowType.isFloat()) {
      relationships.push({formula, comparison: {operator: invertComparison(operator), rhs}})
    }
    return ok(relationships)
  }

  toLisp() {
    return `(${this.op}${this.start.toLisp()})`
  }

  toCode(prevPrecedence = 0): string {
    if (prevPrecedence > this.precedence) {
      return `(${this.toCode(0)} ${prevPrecedence} ${this.precedence})`
    }

    return this.op + this.start.toCode()
  }
}

export class MatchBinaryRange extends MatchExpression {
  readonly precedence = 12 // from operators.ts

  constructor(
    readonly range: Range,
    public precedingComments: Comment[],
    readonly op: '...' | '<..' | '..<' | '<.<',
    readonly start: Literal,
    readonly stop: Literal,
  ) {
    super(range, precedingComments)
  }

  matchAssignReferences() {
    return []
  }

  getTypeWithHint(hint: Types.Type): Types.Type {
    if (!this.start.value.isFloat() || !this.stop.value.isFloat()) {
      return Types.NeverType
    }

    // repeated in MatchUnaryRange
    let hintIsInt: boolean
    if (hint instanceof Types.OneOfType) {
      // if one of the types is an int and *none* of the types are a float
      hintIsInt =
        hint.of.some(type => type.isInt()) && !hint.of.some(type => type.isFloat() && !type.isInt())
    } else {
      hintIsInt = hint.isInt()
    }

    if (hintIsInt) {
      switch (this.op) {
        case '...':
          return Types.int({min: this.start.value.value, max: this.stop.value.value})
        case '<..':
          return Types.int({min: this.start.value.value + 1, max: this.stop.value.value})
        case '..<':
          return Types.int({min: this.start.value.value, max: this.stop.value.value - 1})
        case '<.<':
          return Types.int({min: this.start.value.value + 1, max: this.stop.value.value - 1})
      }
    }

    switch (this.op) {
      case '...':
        return Types.float({min: this.start.value.value, max: this.stop.value.value})
      case '<..':
        return Types.float({min: [this.start.value.value], max: this.stop.value.value})
      case '..<':
        return Types.float({min: this.start.value.value, max: [this.stop.value.value]})
      case '<.<':
        return Types.float({min: [this.start.value.value], max: [this.stop.value.value]})
    }
  }

  gimmeTrueStuffWith(
    runtime: TypeRuntime,
    formula: RelationshipFormula | undefined,
    lhsType: Types.Type,
  ): GetRuntimeResult<Relationship[]> {
    if (!formula) {
      return ok([])
    }

    const type = this.getTypeWithHint(lhsType)
    const rhs = this.start.relationshipFormula(runtime)
    if (!rhs) {
      return ok([])
    }

    const relationships: Relationship[] = [
      {formula, comparison: {operator: 'instanceof', rhs: type}},
    ]

    if (this.start.value.isFloat() && this.stop.value.isFloat()) {
      // if the lhs type is an Int, assign int ranges
      if (type.isInt()) {
        if (this.op === '...' || this.op === '..<') {
          relationships.push({
            formula,
            comparison: {
              operator: '>=',
              rhs: relationshipFormula.int(Math.floor(this.start.value.value)),
            },
          })
        } else {
          relationships.push({
            formula,
            comparison: {
              operator: '>=',
              rhs: relationshipFormula.int(Math.floor(this.start.value.value + 1)),
            },
          })
        }

        if (this.op === '...' || this.op === '<..') {
          relationships.push({
            formula,
            comparison: {
              operator: '<=',
              rhs: relationshipFormula.int(Math.floor(this.stop.value.value)),
            },
          })
        } else {
          relationships.push({
            formula,
            comparison: {
              operator: '<=',
              rhs: relationshipFormula.int(Math.floor(this.stop.value.value - 1)),
            },
          })
        }
      } else if (type.isFloat()) {
        switch (this.op) {
          case '...':
            relationships.push({
              formula,
              comparison: {
                operator: '>=',
                rhs: relationshipFormula.float(this.start.value.value),
              },
            })
            relationships.push({
              formula,
              comparison: {
                operator: '<=',
                rhs: relationshipFormula.float(this.stop.value.value),
              },
            })
            break
          case '<..':
            relationships.push({
              formula,
              comparison: {
                operator: '>',
                rhs: relationshipFormula.float(this.start.value.value),
              },
            })
            relationships.push({
              formula,
              comparison: {
                operator: '<=',
                rhs: relationshipFormula.float(this.stop.value.value),
              },
            })
            break
          case '..<':
            relationships.push({
              formula,
              comparison: {
                operator: '>=',
                rhs: relationshipFormula.float(this.start.value.value),
              },
            })
            relationships.push({
              formula,
              comparison: {
                operator: '<',
                rhs: relationshipFormula.float(this.stop.value.value),
              },
            })
            break
          case '<.<':
            relationships.push({
              formula,
              comparison: {
                operator: '>',
                rhs: relationshipFormula.float(this.start.value.value),
              },
            })
            relationships.push({
              formula,
              comparison: {
                operator: '<',
                rhs: relationshipFormula.float(this.stop.value.value),
              },
            })
            break
        }
      }
    }

    return ok(relationships)
  }

  gimmeFalseStuffWith(
    runtime: TypeRuntime,
    formula: RelationshipFormula | undefined,
    lhsType: Types.Type,
  ): GetRuntimeResult<Relationship[]> {
    if (!formula) {
      return ok([])
    }

    const type = this.getTypeWithHint(lhsType)
    const rhs = this.start.relationshipFormula(runtime)
    if (!rhs) {
      return ok([])
    }

    const relationships: Relationship[] = [
      {formula, comparison: {operator: '!instanceof', rhs: type}},
    ]
    // no more information available here (the number is either less than the
    // minimum, or greater than the maximum)
    return ok(relationships)
  }

  toLisp() {
    return `(${this.start.toCode()}${this.op}${this.stop.toLisp()})`
  }

  toCode(prevPrecedence = 0): string {
    if (prevPrecedence > this.precedence) {
      return `(${this.toCode(0)})`
    }

    return this.start.toCode() + this.op + this.stop.toCode()
  }
}

export class MatchStringLiteral extends MatchLiteral {
  constructor(readonly literal: StringLiteral) {
    super(literal)
  }
}

export class MatchRegexLiteral extends MatchLiteral {
  constructor(readonly literal: RegexLiteral) {
    super(literal)
  }

  getAsTypeExpression(_runtime: TypeRuntime): GetTypeResult {
    return ok(Types.StringType.narrowRegex(this.literal.value.value))
  }

  gimmeTrueStuffWith(
    runtime: TypeRuntime,
    formula: RelationshipFormula | undefined,
    lhsType: Types.Type,
  ): GetRuntimeResult<Relationship[]> {
    if (!formula && !this.literal.groups.size) {
      return ok([])
    }

    return this.getAsTypeExpression(runtime).map(type => {
      const relationships: Relationship[] = []
      if (formula) {
        const ref = {formula, comparison: {operator: 'instanceof', rhs: type}} as const
        relationships.push(ref)
      }

      if (!this.literal.groups.size) {
        return relationships
      }

      for (const [name, pattern] of this.literal.groups) {
        const regex = new RegExp(pattern, this.literal.flags)
        const type = Types.StringType.narrowRegex(regex)
        const assign = {
          formula: relationshipFormula.assign(name),
          comparison: {operator: 'instanceof', rhs: type},
        } as const
        relationships.push(assign)
      }

      return relationships
    })
  }
}

/**
 * foo is "prefix"
 * foo is "prefix" <> value
 * foo is value <> "suffix"
 * foo is "pre" <> value <> "post"
 */
export class MatchStringExpression extends MatchExpression {
  constructor(
    range: Range,
    precedingComments: Comment[],
    readonly args: (MatchStringLiteral | MatchReference)[],
  ) {
    super(range, precedingComments)
  }

  matchAssignReferences() {
    return this.args.flatMap(match => match.matchAssignReferences())
  }

  provides() {
    return this.args.reduce((set, arg) => union(set, arg.provides()), new Set<string>())
  }

  private calcMatchLength() {
    return this.args.reduce((minLength, arg) => {
      if (arg instanceof MatchStringLiteral) {
        return minLength + arg.literal.value.length
      }
      return minLength
    }, 0)
  }

  /**
   * Add up all the string literals, the String is at least that length.
   */
  getAsTypeExpression(_runtime: TypeRuntime): GetTypeResult {
    return ok(
      Types.StringType.narrowString({
        length: {min: this.calcMatchLength(), max: undefined},
        regex: [],
      }),
    )
  }

  gimmeTrueStuffWith(
    runtime: TypeRuntime,
    formula: RelationshipFormula | undefined,
    lhsType: Types.Type,
  ): GetRuntimeResult<Relationship[]> {
    let stringType: Types.Type | undefined
    let stringTypeMaxLength: number | undefined = undefined
    if (lhsType instanceof Types.OneOfType) {
      for (const type of lhsType.of) {
        if (!type.isString()) {
          continue
        }

        if (stringTypeMaxLength !== undefined) {
          const maxTypeLength = type.narrowedString.length.max
          stringTypeMaxLength =
            maxTypeLength === undefined ? undefined : Math.min(stringTypeMaxLength, maxTypeLength)
        }

        if (!stringType) {
          stringType = type
        } else {
          stringType = Types.compatibleWithBothTypes(stringType, type)
        }
      }
    } else if (lhsType.isString()) {
      stringType = lhsType
      stringTypeMaxLength = lhsType.narrowedString.length.max
    }

    if (!stringType) {
      return err(
        new RuntimeError(
          this,
          `Invalid match expression - '${this}: ${lhsType}' does not match string expression '${this}'`,
        ),
      )
    }

    const minMatchLength = this.calcMatchLength()
    if (stringTypeMaxLength !== undefined && minMatchLength > stringTypeMaxLength) {
      return err(
        new RuntimeError(
          this,
          `Invalid match expression - '${this}: ${lhsType}' always contains less characters than '${this}'`,
        ),
      )
    }

    const replaceType = Types.StringType.narrowString({
      length: {
        min: minMatchLength,
        max: undefined,
      },
      regex: [],
    })

    const relationships: Relationship[] = []
    if (formula) {
      relationships.push({
        formula,
        comparison: {operator: 'instanceof', rhs: replaceType},
      })
    }

    // all the assigned matches will have this length. They could be empty strings, but
    // at most they will have `remainingMaxLength` many characters
    const remainingMaxLength =
      stringTypeMaxLength === undefined ? undefined : stringTypeMaxLength - minMatchLength
    const type = Types.StringType.narrowString({
      length: {
        min: 0,
        max: remainingMaxLength,
      },
      regex: [],
    })

    for (const arg of this.args) {
      const result = arg.gimmeTrueStuffWith(runtime, undefined, type)
      if (result.isErr()) {
        return err(result.error)
      }
      relationships.push(...result.value)
    }

    return ok(relationships)
  }

  gimmeFalseStuffWith(
    runtime: TypeRuntime,
    formula: RelationshipFormula | undefined,
    lhsType: Types.Type,
  ): GetRuntimeResult<Relationship[]> {
    if (!formula) {
      return ok([])
    }

    return this.getAsTypeExpression(runtime).map(type => {
      return [{formula, comparison: {operator: '!instanceof', rhs: type}}]
    })
  }

  toLisp() {
    const args = this.args.map(arg => arg.toLisp())

    return `(${args.join(' <> ')})`
  }

  toCode() {
    const args = this.args.map(arg => arg.toCode())

    return args.join(' <> ')
  }
}

/**
 * foo is [value, ...values]
 * foo is [_, ...]
 */
export class MatchArrayExpression extends MatchExpression {
  constructor(
    range: Range,
    precedingComments: Comment[],
    readonly args: MatchExpression[],
  ) {
    super(range, precedingComments)
  }

  matchAssignReferences() {
    return this.args.flatMap(match => match.matchAssignReferences())
  }

  provides() {
    return this.args.reduce((set, arg) => union(set, arg.provides()), new Set<string>())
  }

  private calcMatchLength(): [number, number | undefined] {
    let minLength = 0
    let maxLength: number | undefined = 0

    for (const arg of this.args) {
      if (arg instanceof MatchAssignRemainingExpression) {
        maxLength = undefined
      } else {
        minLength += 1
        maxLength = maxLength === undefined ? undefined : maxLength + 1
      }
    }

    return [minLength, maxLength]
  }

  gimmeTrueStuffWith(
    runtime: TypeRuntime,
    formula: RelationshipFormula | undefined,
    lhsType: Types.Type,
  ): GetRuntimeResult<Relationship[]> {
    let arrayType: Types.ArrayType | undefined
    if (lhsType instanceof Types.OneOfType) {
      for (const type of lhsType.of) {
        if (!(type instanceof Types.ArrayType)) {
          continue
        }

        if (!arrayType) {
          arrayType = type
        } else {
          arrayType = Types.compatibleWithBothTypes(arrayType, type) as Types.ArrayType
        }
      }
    } else if (lhsType instanceof Types.ArrayType) {
      arrayType = lhsType
    }

    if (!arrayType) {
      return err(
        new RuntimeError(
          this,
          `Invalid match expression - '${this}: ${lhsType}' does not match array expression '${this}'`,
        ),
      )
    }

    const [minMatchLength, maxMatchLength] = this.calcMatchLength()
    if (maxMatchLength !== undefined && maxMatchLength < arrayType.narrowedLength.min) {
      return err(
        new RuntimeError(
          this,
          `Invalid match expression - '${this}: ${lhsType}' always contains more values than '${this}'`,
        ),
      )
    }

    if (
      arrayType.narrowedLength.max !== undefined &&
      minMatchLength > arrayType.narrowedLength.max
    ) {
      return err(
        new RuntimeError(
          this,
          `Invalid match expression - '${this}: ${lhsType}' always contains less values than '${this}'`,
        ),
      )
    }

    const relationships: Relationship[] = []
    if (formula) {
      const replaceType = new Types.ArrayType(arrayType.of, {
        min: minMatchLength,
        max: maxMatchLength,
      })
      relationships.push({
        formula,
        comparison: {operator: 'instanceof', rhs: replaceType},
      })
    }

    // this code already supports [a, b, ...c, d, e]
    // a,b,d,e would contribute to minMatchLength, and so the min/max
    // calculation is correct
    for (const arg of this.args) {
      let argType: Types.Type
      if (arg instanceof MatchAssignRemainingExpression) {
        const min = Math.max(0, arrayType.narrowedLength.min - minMatchLength)
        const max =
          arrayType.narrowedLength.max === undefined
            ? undefined
            : Math.max(0, arrayType.narrowedLength.max - minMatchLength)
        argType = new Types.ArrayType(arrayType.of, {min, max})
      } else {
        argType = arrayType.of
      }

      const result = arg.gimmeTrueStuffWith(runtime, undefined, argType)
      if (result.isErr()) {
        return err(result.error)
      }
      relationships.push(...result.value)
    }

    return ok(relationships)
  }

  gimmeFalseStuffWith(
    runtime: TypeRuntime,
    formula: RelationshipFormula | undefined,
    lhsType: Types.Type,
  ): GetRuntimeResult<Relationship[]> {
    if (!formula) {
      return ok([])
    }

    return this.getAsTypeExpression(runtime).map((type): Relationship[] => {
      if (formula) {
        return [{formula, comparison: {operator: '!instanceof', rhs: type}}]
      }

      return []
    })
  }

  toLisp() {
    const args = this.args.map(arg => arg.toLisp())

    return `[${args.join(' ')}]`
  }

  toCode() {
    const args = this.args.map(arg => arg.toCode())

    return `[${args.join(', ')}]`
  }
}

export class CaseExpression extends MatchExpression {
  constructor(
    range: Range,
    precedingComments: Comment[],
    readonly matches: MatchExpression[],
    readonly bodyExpression: Expression,
  ) {
    super(range, precedingComments)
  }

  matchAssignReferences() {
    return this.matches.flatMap(match => match.matchAssignReferences())
  }

  gimmeTrueStuffWith(
    runtime: TypeRuntime,
    formula: RelationshipFormula | undefined,
    lhsType: Types.Type,
  ): GetRuntimeResult<Relationship[]> {
    return err(new RuntimeError(this, 'TODO'))
  }

  gimmeFalseStuffWith(
    runtime: TypeRuntime,
    formula: RelationshipFormula | undefined,
    lhsType: Types.Type,
  ): GetRuntimeResult<Relationship[]> {
    return err(new RuntimeError(this, 'TODO'))
  }

  toLisp() {
    const caseCode = this.matches.map(match => match.toLisp()).join(' ')
    return `(case (${caseCode}) : ${this.bodyExpression.toCode()})`
  }

  toCode() {
    const cases = this.matches.map(match => match.toCode()).join(' or ')
    const hasNewline = cases.includes('\n') || cases.length > MAX_LEN

    let code = 'case '
    if (hasNewline) {
      code += this.matches[0].toCode()
      code += this.matches.slice(1).map(match => ' or\n' + indent(match.toCode()))
    } else {
      code += cases
    }
    code += ':\n'
    code += indent(this.bodyExpression.toCode())
    return code
  }
}

//|
//|  Application Expressions
//|

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

  getType(): GetTypeResult {
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

  getType(): GetTypeResult {
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

  getType(): GetTypeResult {
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

  getType(): GetTypeResult {
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

  getType(): GetTypeResult {
    return err(new RuntimeError(this, 'StateDefinition does not have a type'))
  }

  eval(): GetValueResult {
    return err(new RuntimeError(this, 'StateDefinition cannot be evaluated'))
  }
}

export class BuiltinCommandIdentifier extends Identifier {
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

  getType(): GetTypeResult {
    return err(new RuntimeError(this, '& does not have a type'))
  }

  eval(): GetValueResult {
    return err(new RuntimeError(this, '& cannot be evaluated'))
  }
}

export class HelperDefinition extends Expression {
  constructor(
    range: Range,
    precedingComments: Comment[],
    readonly value: NamedFormulaExpression,
    readonly isPublic: boolean,
  ) {
    super(range, precedingComments)
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

    code += this.value.toLispPrefixed(false)

    return `(fn ${code})`
  }

  toCode() {
    let code = ''
    if (this.isPublic) {
      code += 'public '
    }

    code += 'fn '
    code += `${this.value.toCodePrefixed(false, true)}`
    return code
  }

  getType(runtime: TypeRuntime): GetTypeResult {
    return getChildType(this, this.value, runtime)
  }

  eval(runtime: ValueRuntime) {
    return this.value.eval(runtime)
  }
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

  getType(): GetTypeResult {
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

function wrapValues(lhs: string, expressions: Expression[], rhs: string, precedence = 0) {
  const codes = expressions.map(it => it.toCode(precedence))
  return wrapStrings(lhs, codes, rhs)
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
    if (result.isErr() && result.error instanceof RuntimeError) {
      result.error.pushParent(expr)
    }
    return result
  }
}
