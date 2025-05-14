import {err, ok, type Result} from '@extra-lang/result'
import {intersection} from '~/formulaParser/set'
import {splitter} from '~/graphemes'
import * as Narrowed from '~/narrowed'

export const FN = 'fn'
export const VIEW = 'view'
export const BOOLEAN = 'Boolean'
export const INT = 'Int'
export const FLOAT = 'Float'
export const STRING = 'String'
export const TUPLE = 'Tuple'
export const OBJECT = 'Object'
export const ARRAY = 'Array'
export const DICT = 'Dict'
export const SET = 'Set'

// constructor functions
export function never() {
  return NeverType
}

export function all() {
  return AllType
}

export function always() {
  return AlwaysType
}

export function nullType() {
  return NullType
}

export function booleanType() {
  return BooleanType
}

export function int(narrowed?: Partial<Narrowed.NarrowedInt>) {
  if (narrowed) {
    return new MetaIntType(
      narrowed
        ? {...Narrowed.DEFAULT_NARROWED_NUMBER, ...narrowed}
        : Narrowed.DEFAULT_NARROWED_NUMBER,
    )
  }

  return IntType
}

export function float(narrowed?: Partial<Narrowed.NarrowedFloat>) {
  if (narrowed) {
    return new MetaFloatType(
      narrowed
        ? {...Narrowed.DEFAULT_NARROWED_NUMBER, ...narrowed}
        : Narrowed.DEFAULT_NARROWED_NUMBER,
    )
  }

  return FloatType
}

export function string({min, max, regex}: {min?: number; max?: number; regex?: RegExp[]} = {}) {
  if (min !== undefined || max !== undefined || regex !== undefined) {
    return StringType.narrowString({length: {min: min ?? 0, max}, regex: regex ?? []})
  }

  return StringType
}

export function literal(value: boolean | number | string | RegExp, isFloat?: 'float') {
  if (value instanceof RegExp) {
    return new LiteralRegexType(value)
  }

  return LiteralType.from(value, isFloat)
}

export function tuple(props: Type[]) {
  return new ObjectType(props.map(type => ({is: 'positional', type})))
}

export function positionalProp(type: Type): PositionalProp {
  return {is: 'positional', type}
}

export function namedProp(name: string, type: Type): NamedProp {
  return {is: 'named', name, type}
}

export function object(props: ObjectProp[]) {
  return new ObjectType(props)
}

export function namedObject(name: string, props: ObjectProp[]) {
  return new NamedObjectType(name, props)
}

export function klass(props: Map<string, Type>, parent?: ClassType) {
  return new ClassType(props, parent)
}

export function array(type: Type, narrowed?: Partial<Narrowed.NarrowedLength>) {
  return new ArrayType(
    type,
    narrowed
      ? {...Narrowed.DEFAULT_NARROWED_LENGTH, ...narrowed}
      : Narrowed.DEFAULT_NARROWED_LENGTH,
  )
}

export function dict(type: Type, narrowed?: Partial<Narrowed.NarrowedLength>, names?: Set<Key>) {
  return new DictType(
    type,
    narrowed
      ? {...Narrowed.DEFAULT_NARROWED_LENGTH, ...narrowed}
      : Narrowed.DEFAULT_NARROWED_LENGTH,
    names,
  )
}

export function set(type: Type, narrowed?: Partial<Narrowed.NarrowedLength>) {
  return new SetType(
    type,
    narrowed
      ? {...Narrowed.DEFAULT_NARROWED_LENGTH, ...narrowed}
      : Narrowed.DEFAULT_NARROWED_LENGTH,
  )
}

export function range(type: Type) {
  return new RangeType(type)
}

export function namedClass(
  name: string,
  props: Map<string, Type>,
  parent?: ClassType,
): NamedClassType {
  return new NamedClassType(name, props, parent)
}

export function optional(type: Type) {
  return OptionalType.createOptional(type)
}

export function oneOf(types: Type[]) {
  return OneOfType.createOneOf(types)
}

export function formula(args: Argument[], returnType: Type, genericTypes: GenericType[] = []) {
  return new FormulaType(returnType, args, genericTypes)
}

export function lazy(returnType: Type) {
  return new FormulaType(returnType, [], [])
}

export function namedFormula(
  name: string,
  args: Argument[],
  returnType: Type,
  genericTypes: GenericType[] = [],
) {
  return new NamedFormulaType(name, returnType, args, genericTypes)
}

export function generic(name: string, resolvedType?: Type) {
  return new GenericType(name, resolvedType)
}

export function withGenericT<T>(fn: (generic: GenericType) => T): T {
  return GenericType.with(['T'], fn)
}

export function withGenericTU<T>(fn: (genericT: GenericType, genericU: GenericType) => T): T {
  return GenericType.with(['T', 'U'], fn)
}

export function positionalArgument(args: {
  name: string
  type: Type
  isRequired: boolean
}): PositionalArgument {
  return {
    is: 'positional-argument',
    spread: false,
    name: args.name,
    type: args.type,
    alias: undefined,
    isRequired: args.isRequired,
  }
}

export function spreadPositionalArgument(args: {
  name: string
  type: ArrayType
}): SpreadPositionalArgument {
  return {
    is: 'spread-positional-argument',
    spread: 'spread',
    name: args.name,
    type: args.type,
    alias: undefined,
    isRequired: false,
  }
}

export function namedArgument(args: {
  name: string
  alias?: string
  type: Type
  isRequired: boolean
}): NamedArgument {
  const alias = args.alias ?? args.name

  return {
    is: 'named-argument',
    spread: false,
    name: args.name,
    type: args.type,
    alias,
    isRequired: args.isRequired,
  }
}

export type BuiltinTypeNames = 'boolean' | 'float' | 'int' | 'null' | 'string' | 'regex'
export type Key = string | number | boolean | null
export type KeyType = 'string' | 'int' | 'boolean' | 'null'
type Literals = 'boolean' | 'float' | 'int' | 'string' | 'regex'

export abstract class Type {
  abstract readonly is: string

  toString() {
    return this.toCode(false)
  }

  /**
   * Returns the type with all generics resolved - if they cannot be resolved, returns an error
   */
  resolve(_resolvedGenerics: Map<GenericType, GenericType>): Result<Type, string> {
    return ok(this)
  }

  /**
   * GenericType returns [self], FormulaType searches args and return type for
   * generics and returns all of them. Similarly for ArrayType, DictType, ObjectType,
   * and OneOfType.
   *
   * Used to construct a mutable list of generics, suitable for resolution.
   */
  generics(): Set<GenericType> {
    return new Set()
  }

  toCode(_embedded = false) {
    return this.is
  }

  /**
   * If the type is a TypeConstructor, returns the intended type.
   *
   * Container types (Array, Dict, Tuple, Object) map their container type using
   * `fromTypeConstructor()`.
   *
   * All other types return `this`.
   *
   * Basically, it's a way of mapping `[Int]` to Array(of: IntType) (where 'Int'
   * could be used as the TypeConstructor 'Int("f00"): Int | null').
   */
  fromTypeConstructor(): Type {
    return this
  }

  /**
   * Returns the type constructor for this type (the function to call to create a new
   * instance).
   *
   *     typeof a => a.type.typeConstructor
   *
   * This is how Type is represented in the runtime
   */
  abstract typeConstructor(): TypeConstructor

  /**
   * Only `null` types are optional, e.g. `Int | null`
   */
  isOptional() {
    return false
  }

  /**
   * Only `GenericType` types are generic
   */
  isGeneric(): this is GenericType {
    return false
  }

  hasGeneric() {
    return this.isGeneric()
  }

  isNull(): this is MetaNullType {
    return false
  }

  isBoolean(): this is MetaBooleanType | LiteralBooleanType {
    return false
  }

  isFloat(): this is MetaFloatType | MetaIntType | LiteralFloatType {
    return this.isInt()
  }

  isInt(): this is MetaIntType | LiteralIntType {
    return false
  }

  isString(): this is MetaStringType | LiteralStringType {
    return false
  }

  isRegex() {
    return false
  }

  isRange() {
    return false
  }

  isKey(): boolean {
    return this.isInt() || this.isString() || this.isNull() || this.isBoolean()
  }

  isObject(): this is ObjectType {
    return false
  }

  isView(): this is ViewType {
    return false
  }

  isLiteral(type: 'boolean'): this is LiteralBooleanType
  isLiteral(type: 'float'): this is LiteralFloatType
  isLiteral(type: 'int'): this is LiteralIntType
  isLiteral(type: 'string'): this is LiteralStringType
  isLiteral(type: 'regex'): this is LiteralRegexType
  isLiteral(
    type: 'key',
  ): this is
    | MetaNullType
    | LiteralBooleanType
    | LiteralFloatType
    | LiteralIntType
    | LiteralStringType
  isLiteral(): this is LiteralType
  isLiteral(type?: 'boolean' | 'float' | 'int' | 'string' | 'regex' | 'key'): this is LiteralType {
    if (type === 'key') {
      return (
        this.isNull() ||
        this.isLiteral('boolean') ||
        this.isLiteral('float') ||
        this.isLiteral('string')
      )
    }

    if (this instanceof LiteralType) {
      if (type) {
        return this.is === `literal-${type}` || (type === 'float' && this.is === 'literal-int')
      }

      return true
    }

    return false
  }

  /**
   * Certain types are always true – these should not be used in `if`/`and`/`or` expressions.
   *
   * However, literals are kept off this list – so that you can do debugging with
   * `if(true)…` without hitting a compiler error.
   */
  isOnlyTruthyType(): boolean {
    return false
  }

  /**
   * Certain types are never true - these should not be used in `if`/`and`/`or` expressions.
   *
   * However, literals are kept off this list – so that you can do debugging with
   * `if(false)…` without hitting a compiler error.
   */
  isOnlyFalseyType(): boolean {
    return false
  }

  /**
   * Returns true if the type _could_ be a truthy type.
   *
   * For instance arrays *could* be truthy (but not if the maxLength is 0, which is
   * always falsey).
   */
  isEverTruthyType(): boolean {
    return !this.isOnlyFalseyType()
  }

  toTruthyType(): Type {
    if (this.isOnlyFalseyType()) {
      return NeverType
    }

    return this
  }

  toFalseyType(): Type {
    if (this.isOnlyTruthyType()) {
      return NeverType
    }

    return this
  }

  combineLiteral(_literal: LiteralType): Type | undefined {
    return undefined
  }

  replacingProp(propName: string, _type: Type): Result<Type, string> {
    return err(`Type ${this.toCode()} does not have property ${propName}`)
  }

  /**
   * The PropertyAccessOperator '.' calls this method to get properties.
   */
  abstract propAccessType(name: string): Type | undefined
}

export class GenericType extends Type {
  is = 'generic'
  _resolvedResult: Result<Type, string> | undefined

  static with<T>(names: [string], fn: (generic: GenericType) => T): T
  static with<T>(names: [string, string], fn: (generic: GenericType, generic2: GenericType) => T): T
  static with<T>(
    names: [string, string, string],
    fn: (generic: GenericType, generic2: GenericType, generic3: GenericType) => T,
  ): T
  static with<T>(
    names: string[],
    fn: (generic: GenericType, generic2: GenericType, generic3: GenericType) => T,
  ): T {
    const generics = names.map(name => new GenericType(name))
    return fn(generics[0], generics[1], generics[2])
  }

  constructor(
    public name: string,
    /**
     * All done, the hints and requirements must be assignable to this type. This type
     * can be derived from the hints, or given explicitly.
     *
     * @example
     *     example: <T>(#callback: (input: T): [T], #arg: T)
     *
     * Derived:
     *     example((#foo: Int | String): [String], '')
     *
     * Explicit:
     *     example<String>((#foo: Int | String): [String], '')
     */
    public resolvedType?: Type | undefined,
    /**
     * If there's no explicit/resolved type, hints can be used to derive one, otherwise they are
     * treated as requirements. Hints can come from arguments or return types
     * (`arg: T` or `callback: fn(): T`), but not from fn arguments (`callback: fn(arg: T): …`)
     */
    public hints: Type[] = [],
    /**
     * These come from fn arguments, which can't be used to derive
     * the resolved type, but the resolved type must be assignable to them.
     *
     * @example
     *     example: <T>(#callback: (input: T): Array(T), #arg: T)
     *     callback: fn(#foo: Int | String): Array(String)
     *
     *     example(callback, '')
     *
     * --> `#foo: Int | String` is a requirement
     * --> `[String]` is a hint
     * --> `''` is a hint
     *
     * `T` will resolve to `String`, because it is derived from the two hints, and
     * also satisfies the requirement of `T: Int | String`
     */
    public requirements: Type[] = [],
  ) {
    super()
    Object.defineProperty(this, '_resolvedResult', {enumerable: false})
  }

  typeConstructor(): TypeConstructor {
    if (this.resolvedType) {
      return this.resolvedType.typeConstructor()
    }

    return new TypeConstructor(this.name, this, this, [
      positionalArgument({name: 'input', type: this, isRequired: true}),
    ])
  }

  isGeneric(): this is GenericType {
    return true
  }

  resolve(resolvedGenerics: Map<GenericType, GenericType>): Result<Type, string> {
    const self = resolvedGenerics.get(this)
    if (!self) {
      return err(`Invalid generic '${this.name}', was not part of generics resolution`)
    }

    return self.resolveSelf()
  }

  resolveSelf(): Result<Type, string> {
    if (this._resolvedResult) {
      return this._resolvedResult
    }

    const errorMessages: string[] = []
    let resolvedType: Type

    if (this.resolvedType) {
      for (const type of this.hints) {
        if (!canBeAssignedTo(type, this.resolvedType)) {
          errorMessages.push(cannotAssignToError(type, this.resolvedType))
        }
      }
      resolvedType = this.resolvedType
    } else {
      resolvedType = oneOf(this.hints)
    }

    for (const type of this.requirements) {
      if (!canBeAssignedTo(type, resolvedType)) {
        errorMessages.push(cannotAssignToError(type, resolvedType))
      }
    }

    const errorMessage = combineErrorMessages(errorMessages)
    if (errorMessage) {
      this._resolvedResult = err(errorMessage)
      return this._resolvedResult
    }

    this.resolvedType ??= resolvedType
    this._resolvedResult = ok(resolvedType)
    return this._resolvedResult
  }

  generics() {
    return new Set([this])
  }

  copy() {
    return new GenericType(this.name, this.resolvedType, [...this.hints], [...this.requirements])
  }

  toCode() {
    return `${this.name}${this.resolvedType ? ' = ' + this.resolvedType.toCode() : ''}`
  }

  propAccessType(name: string): Type | undefined {
    return undefined
  }
}

/**
 * ArgumentsList can come in any combination/order of positional and named arguments.
 *
 * ArgumentsList can have one SpreadPositionalArgument, and one RemainingNamedArgument,
 * and any number of RepeatedNamedArgument.
 */
export type Argument =
  | PositionalArgument
  | SpreadPositionalArgument
  | NamedArgument
  | RepeatedNamedArgument
  | RemainingNamedArgument

/**
 * Positional arguments:
 * - never have an alias
 * - may be optional or required
 *
 * Example:
 *     fn filterUsers(#user: User): String
 *
 *     filterUsers(kevin)
 */
export interface PositionalArgument {
  is: 'positional-argument'
  spread: false
  name: string
  type: Type
  isRequired: boolean
  alias?: undefined
}

/**
 * Spread positional argument:
 * - there can only be one in the formula
 * - must be of type Array
 * - always optional (until narrowed array is supported)
 * - never have an alias
 *
 * Example:
 *     fn filterUsers(...users: Array(User)): String
 *
 *     filterUsers(kevin, angie)
 */
export interface SpreadPositionalArgument {
  is: 'spread-positional-argument'
  spread: 'spread'
  name: string
  type: ArrayType
  isRequired: boolean
  alias?: undefined
}

/**
 * Named arguments:
 * - are always named
 * - always has an alias (may be the same value as name)
 * - may be optional or required
 *
 * Example:
 *     fn nameOfUser(user: User): String
 *
 *     nameOfUser(user: kevin)
 */
export interface NamedArgument {
  is: 'named-argument'
  spread: false
  name: string
  type: Type
  isRequired: boolean
  alias: string
}

/**
 * Repeated named arguments:
 * - are always named
 * - always has an alias (may be the same value as name)
 * - always optional (until narrowed array is supported)
 *
 * Example:
 *     fn filterUsers(...user users: Array(User)): Array(User)
 *
 *     filterUsers(user: foo, user: bar)
 */
export interface RepeatedNamedArgument {
  is: 'repeated-named-argument'
  spread: 'spread'
  name: string
  type: ArrayType
  isRequired: boolean
  alias: string
}

/**
 * Remaining named argument:
 * - there can only be one in the formula
 * - must be of type Dict
 * - always optional (until narrowed dict is supported)
 * - never has an alias
 *
 * Example:
 *     fn groupUsers(*users: Dict(User)): Dict(Array(User))
 *
 *     groupUsers(kevin: user1, angie: user2)
 */
export interface RemainingNamedArgument {
  is: 'kwarg-list-argument'
  spread: 'kwargs'
  name: string
  type: DictType
  isRequired: boolean
  alias?: undefined
}

export class FormulaType extends Type {
  readonly is: 'formula' | 'named-formula' | 'view' = 'formula'
  name: string | undefined
  /**
   * The list of arguments, in the order declared in the formula.
   */
  public args: Argument[]
  private _positional: (PositionalArgument | SpreadPositionalArgument)[] = []
  private _named: Map<string, NamedArgument | RepeatedNamedArgument> = new Map()
  private _kwargs: RemainingNamedArgument | undefined

  constructor(
    public returnType: Type,
    args: Argument[],
    readonly genericTypes: GenericType[],
  ) {
    super()

    for (const argument of args) {
      if (argument.is === 'named-argument' || argument.is === 'repeated-named-argument') {
        this._named.set(argument.alias, argument)
      } else if (argument.is === 'kwarg-list-argument') {
        this._kwargs = argument
      } else {
        this._positional.push(argument)
      }
    }

    this.args = args
    Object.defineProperty(this, '_named', {enumerable: false})
    Object.defineProperty(this, '_positional', {enumerable: false})
    Object.defineProperty(this, '_kwargs', {enumerable: false})
  }

  typeConstructor(): TypeConstructor {
    return new TypeConstructor(FN, this, this, [
      positionalArgument({name: 'input', type: this, isRequired: true}),
    ])
  }

  hasGeneric() {
    if (this.args.some(({type}) => type.hasGeneric())) {
      return true
    }

    return this.returnType.hasGeneric()
  }

  generics() {
    const generics = new Set<GenericType>()
    const allTypes = this.args.map(({type}) => type)
    for (const type of allTypes) {
      for (const generic of type.generics()) {
        generics.add(generic)
      }
    }

    for (const generic of this.returnType.generics()) {
      generics.add(generic)
    }

    return generics
  }

  /**
   * In `compatibleWithBothTypes`, the argument-definitions of both formulas are
   * compared, either by position or by name.
   *
   * In `checkFormulaTypes`, each argument passed to the formula is checked against
   * the argument-definition of the formula.
   */
  positionalArg(at: number): Argument | undefined {
    return this._positional[at]
  }

  /**
   * In `compatibleWithBothTypes`, the argument-definitions of both formulas are
   * compared, either by position or by name.
   *
   * In `checkFormulaTypes`, each argument passed to the formula is checked against
   * the argument-definition of the formula.
   */
  namedArg(name: string) {
    return this._named.get(name) ?? this._kwargs
  }

  toCode(embedded = false) {
    let desc = FN
    if (this.name !== undefined) {
      desc += ` ${this.name}`
    }

    const generics = this.genericTypes.map(generic => generic.name).join(', ')
    if (generics.length) {
      desc += `<${generics}>`
    }

    const args = this.args
      .map(({spread, name, type, alias}) => {
        let argDesc = ''

        // spread === 'spread' =>  ...
        // spread === 'kwargs' =>  *
        argDesc += spread === 'spread' ? '...' : spread === 'kwargs' ? '*' : ''

        // alias === undefined =>  #name: type
        // alias === name      =>  name: type
        // alias !== name      =>  alias name: type
        argDesc += alias ? (alias === name ? '' : alias + ' ') : '#'
        argDesc += name
        argDesc += ': ' + type.toCode(false)

        return argDesc
      })
      .join(', ')
    desc += `(${args}): ${this.returnType.toCode(false)}`

    return embedded ? `(${desc})` : desc
  }

  propAccessType(name: string) {
    return undefined
  }
}

export class ViewFormulaType extends FormulaType {
  readonly is = 'view'

  /**
   * ViewFormulaType must only be named arguments
   */
  public args: NamedArgument[]

  constructor(args: NamedArgument[], genericTypes: GenericType[]) {
    const returnType: Type = UserViewType
    super(returnType, args, genericTypes)

    this.args = args
    Object.defineProperty(this, '_named', {enumerable: false})
  }

  typeConstructor(): TypeConstructor {
    return new TypeConstructor(FN, this, this, [
      positionalArgument({name: 'input', type: this, isRequired: true}),
    ])
  }

  positionalArg(): Argument | undefined {
    return undefined
  }

  toCode(embedded = false) {
    const args = this.args
      .map(({name, type, alias}) => {
        // alias === name      =>  name: type
        // alias !== name      =>  alias name: type
        let desc = alias === name ? '' : alias + ' '
        desc += name
        desc += ': ' + type.toCode(false)

        return desc
      })
      .join(', ')
    let desc = VIEW
    if (this.name !== undefined) {
      desc += ` ${this.name}`
    }

    desc += `(${args}): ${this.returnType.toCode(false)}`
    return embedded ? `(${desc})` : desc
  }
}

export class NamedFormulaType extends FormulaType {
  readonly is = 'named-formula'

  constructor(
    readonly name: string,
    returnType: Type,
    args: Argument[] = [],
    genericTypes: GenericType[],
  ) {
    super(returnType, args, genericTypes)
    this.name = name
  }
}

export class TypeConstructor extends NamedFormulaType {
  constructor(
    name: string,
    readonly intendedType: Type,
    returnType: Type,
    args: Argument[] = [],
    genericTypes: GenericType[] = [],
  ) {
    super(name, returnType, args, genericTypes)
  }

  fromTypeConstructor(): Type {
    return this.returnType
  }
}

export abstract class OneOfType extends Type {
  abstract readonly is: 'oneOf' | 'optional'

  constructor(readonly of: Type[]) {
    super()
  }

  typeConstructor(): TypeConstructor {
    return new TypeConstructor('oneOf', this, this, [
      positionalArgument({name: 'input', type: this, isRequired: true}),
    ])
  }

  toTruthyType(): Type {
    const truthyTypes = this.of.filter(type => type.isEverTruthyType())
    if (truthyTypes.length === 0) {
      return NeverType
    }

    if (truthyTypes.length === 1) {
      return truthyTypes[0]
    }

    return _privateOneOf(truthyTypes)
  }

  hasGeneric() {
    return this.of.some(type => type.hasGeneric())
  }

  generics() {
    return this.of.reduce((memo, type) => {
      for (const generic of type.generics()) {
        memo.add(generic)
      }

      return memo
    }, new Set<GenericType>())
  }

  resolve(resolvedGenerics: Map<GenericType, GenericType>): Result<Type, string> {
    const types: Type[] = []
    for (const type of this.of) {
      const resolved = maybeResolve(type, type, resolved => resolved, resolvedGenerics)
      if (resolved.isErr()) {
        return err(resolved.error)
      }
      types.push(resolved.get())
    }

    return ok(oneOf(types))
  }

  toCode(embedded = false) {
    const types = this.of.map(type => `${type.toCode(false)}`)

    if (embedded) {
      return `(${types.join(' | ')})`
    }

    return types.join(' | ')
  }

  isOptional() {
    return this.of.some(type => type.isOptional())
  }

  static createOneOf(types: Type[]): Type {
    // remove duplicates - especially important to remove duplicate NullType
    // and remove NeverTypes
    types = types
      .reduce((memo, type) => {
        if (!memo.includes(type)) {
          memo.push(type)
        }

        return memo
      }, [] as Type[])
      .filter(type => type !== NeverType)

    if (types.length === 0) {
      return NeverType
    }

    if (types.length === 1) {
      return types[0]
    }

    // special case for oneOf([Type, NullType]) => OptionalType
    const nonNullType = types.find(t => t !== NullType)
    if (
      // only 2
      types.length === 2 &&
      // one is NullType
      types.some(t => t === NullType) &&
      // the other isn't
      nonNullType
    ) {
      return OptionalType.createOptional(nonNullType)
    }

    return types.reduce((previous, current) => compatibleWithBothTypes(previous, current))
  }
}

export function _privateOneOf(types: Type[]): __OneOfType {
  return new __OneOfType(types)
}

/**
 * I gave this a weird name because in _most_ of the files I don't need to
 * distinguish between OneOfType and OptionalType - and so I use OneOfType as the
 * canonical name. In *here* though I need to distinguish them.
 */
class __OneOfType extends OneOfType {
  readonly is = 'oneOf'

  constructor(types: Type[]) {
    super(types)
  }

  propAccessType(name: string) {
    return undefined
  }
}
Object.defineProperty(__OneOfType, 'name', {value: 'OneOfType'})

export class OptionalType extends OneOfType {
  readonly is = 'optional'

  private constructor(type: Type) {
    const types = [type, NullType]
    super(types)
  }

  static _privateOptional(type: Type): OptionalType {
    return new OptionalType(type)
  }

  static createOptional(type: Type): Type {
    // shouldn't happen but just in case
    if (type instanceof OneOfType) {
      // if types includes NullType, return it, otherwise return OneOfType with NullType
      // added
      if (type.of.includes(NullType)) {
        return type
      } else {
        return new __OneOfType([...type.of, NullType])
      }
    }

    if (type === NullType) {
      return NullType
    }

    return new OptionalType(type)
  }

  toCode() {
    const type = this.of[0].toCode(true)
    return `${type}?`
  }

  propAccessType(name: string) {
    return undefined
  }
}

export class TypeError extends Error {}

/**
 * The type of an impossible value; aka the empty set / the set of types that has
 * no members.
 *
 * For instance, what is the type of 'a' in the final 'else' here:
 *
 *     let
 *       a: Int
 *     in
 *       if (a < 0) {
 *         then: …
 *         elseif(a >= 0): …
 *         else:
 *           -- what is 'a' here?
 *           never
 *           -- the if and elseif are exhaustive.
 *       }
 */
export const NeverType = new (class NeverType extends Type {
  readonly is = 'never'

  typeConstructor(): TypeConstructor {
    return new TypeConstructor('never', this, this, [])
  }

  propAccessType(name: string) {
    return undefined
  }
})()

/**
 * The set of all possible types. Because it includes all types, it's pretty much
 * *as useful* as the NeverType, except that it can be narrowed.
 *
 *     let
 *       a: all
 *     in
 *       if (a is Int, then: a, else: 0)
 */
export const AllType = new (class AllType extends Type {
  readonly is = 'all'

  typeConstructor(): TypeConstructor {
    return new TypeConstructor('all', this, this, [])
  }

  propAccessType(name: string) {
    return undefined
  }
})()

/**
 * 'never/NeverType' is the empty set, and 'all/AllType' is the set of all types.
 *
 * What is the type of 'a' here?
 *
 *     let
 *       a = []
 *       b = [1] ++ a  -- b: Array(1)
 *       c = [''] ++ a  -- c: Array('')
 *       names = a.join('')  -- join typically expects Array(String)
 *     in …
 *
 * 'a' can be... anything! This is the role of the 'always/AlwaysType'. It usually
 * shows up when dealing with empty container types, like above.
 */
export const AlwaysType = new (class AlwaysType extends Type {
  readonly is = 'always'

  typeConstructor(): TypeConstructor {
    return new TypeConstructor('always', this, this, [])
  }

  propAccessType(name: string) {
    return undefined
  }
})()

class MetaNullType extends Type {
  readonly is = 'null'
  // gives NullType LiteralType behaviour
  readonly value = null

  declare static types: Record<string, (() => Type) | undefined>

  constructor() {
    super()
  }

  typeConstructor(): TypeConstructor {
    return new TypeConstructor('null', this, this, [])
  }

  isOnlyFalseyType(): boolean {
    return true
  }

  isOptional() {
    return true
  }

  isNull(): this is MetaNullType {
    return true
  }

  propAccessType(name: string) {
    return MetaNullType.types[name]?.()
  }
}

class MetaBooleanType extends Type {
  readonly is = 'boolean'

  declare static types: Record<string, ((object: MetaBooleanType) => Type) | undefined>

  constructor() {
    super()
    Object.defineProperty(this, 'types', {enumerable: false, writable: true})
  }

  typeConstructor(): TypeConstructor {
    return new TypeConstructor('boolean', this, this, [
      positionalArgument({name: 'input', type: AllType, isRequired: true}),
    ])
  }

  isBoolean(): this is MetaBooleanType {
    return true
  }

  toFalseyType(): Type {
    return LiteralFalseType
  }

  combineLiteral(literal: LiteralType) {
    if (!literal.isBoolean()) {
      return
    }

    return this
  }

  toCode() {
    return BOOLEAN
  }

  propAccessType(name: string) {
    return MetaBooleanType.types[name]?.(this)
  }
}

export const ConditionType = new (class ConditionType extends Type {
  readonly is = 'condition'

  constructor() {
    super()
  }

  typeConstructor(): TypeConstructor {
    throw 'Cannot construct Condition instances'
  }

  toCode() {
    return ''
  }

  propAccessType(_name: string) {
    return undefined
  }
})()

export abstract class NumberType<
  T extends Narrowed.NarrowedInt | Narrowed.NarrowedFloat,
> extends Type {
  readonly narrowed: T

  constructor(narrowed: T) {
    super()

    this.narrowed = Narrowed.isDefaultNarrowedNumber(narrowed)
      ? (Narrowed.DEFAULT_NARROWED_NUMBER as T)
      : narrowed

    Object.defineProperty(this, 'types', {enumerable: false, writable: true})
  }

  isFloat(): this is MetaFloatType | MetaIntType | LiteralFloatType {
    return true
  }

  abstract narrow(min: T['min'], max: T['max']): Type
  abstract adjustNarrow(amount: number): Type
  abstract negateNarrow(amount: number): Type
}

export class MetaFloatType extends NumberType<Narrowed.NarrowedFloat> {
  readonly is = 'float'

  declare static types: Record<string, ((object: MetaFloatType) => Type) | undefined>

  constructor(narrowed: Narrowed.NarrowedFloat = Narrowed.DEFAULT_NARROWED_NUMBER) {
    super(narrowed)
  }

  typeConstructor(): TypeConstructor {
    return new TypeConstructor('float', this, optional(this), [
      positionalArgument({name: 'input', type: oneOf([string(), float()]), isRequired: true}),
    ])
  }

  toFalseyType(): Type {
    return new LiteralFloatType(0)
  }

  combineLiteral(literal: LiteralType) {
    if (!literal.isFloat()) {
      return
    }

    // if the literal is in the range of this FloatType, return the FloatType.
    // otherwise `compatibleWithBothTypes` will return oneOf(literal, this)
    if (Narrowed.testNumber(literal.value, this.narrowed)) {
      return this
    }
  }

  toCode() {
    if (Narrowed.isDefaultNarrowedNumber(this.narrowed)) {
      return FLOAT
    } else {
      const narrow = Narrowed.numberDesc(this.narrowed)
      return `${FLOAT}(${narrow})`
    }
  }

  compatibleWithBothNarrowed(rhs: MetaFloatType | MetaIntType) {
    const narrowed = Narrowed.compatibleWithBothFloats(this.narrowed, rhs.narrowed)
    // comparing narrowed and this.narrowed looks "wrong" because NarrowedFloat
    // could be an array, but compatibleWithBothFloats assigns that array without
    // copying.
    if (narrowed === this.narrowed) {
      return this
    } else if (narrowed === rhs.narrowed) {
      return rhs
    }

    return new MetaFloatType(narrowed)
  }

  narrow(min: number | [number] | undefined, max: number | [number] | undefined) {
    const next = Narrowed.narrowFloats(this.narrowed, {min, max})

    if (next === undefined) {
      return NeverType
    }

    if (Narrowed.isDefaultNarrowedNumber(next)) {
      return FloatType
    }

    if (typeof next.max === 'number' && typeof next.min === 'number' && next.min === next.max) {
      return new LiteralFloatType(next.min)
    }

    return new MetaFloatType(next)
  }

  adjustNarrow(amount: number) {
    if (amount === 0 || Narrowed.isDefaultNarrowedNumber(this.narrowed)) {
      return this
    }

    const next = {...this.narrowed}

    if (Array.isArray(next.min)) {
      next.min = [next.min[0] + amount]
    } else if (next.min !== undefined) {
      next.min += amount
    }

    if (Array.isArray(next.max)) {
      next.max = [next.max[0] + amount]
    } else if (next.max !== undefined) {
      next.max += amount
    }

    return new MetaFloatType(next)
  }

  /**
   * Used with SubtractionOperation
   * 1 - x => negateNarrow(1)
   */
  negateNarrow(amount: number) {
    if (Narrowed.isDefaultNarrowedNumber(this.narrowed)) {
      return this
    }

    const next: Narrowed.NarrowedFloat = {min: undefined, max: undefined}

    if (Array.isArray(this.narrowed.min)) {
      next.max = [amount - this.narrowed.min[0]]
    } else if (this.narrowed.min !== undefined) {
      next.max = amount - this.narrowed.min
    }

    if (Array.isArray(this.narrowed.max)) {
      next.min = [amount - this.narrowed.max[0]]
    } else if (this.narrowed.max !== undefined) {
      next.min = amount - this.narrowed.max
    }

    return new MetaFloatType(next)
  }

  propAccessType(name: string) {
    return MetaFloatType.types[name]?.(this)
  }
}

/**
 * Handles narrowed Int types like `Int(>=5)`
 */
export class MetaIntType extends NumberType<Narrowed.NarrowedInt> {
  readonly is = 'int'

  declare static types: Record<string, ((object: MetaIntType) => Type) | undefined>

  constructor(narrowed: Narrowed.NarrowedInt = Narrowed.DEFAULT_NARROWED_NUMBER) {
    super(narrowed)
  }

  typeConstructor(): TypeConstructor {
    return new TypeConstructor('int', this, optional(this), [
      positionalArgument({name: 'input', type: oneOf([string(), int()]), isRequired: true}),
    ])
  }

  isInt(): this is MetaIntType | LiteralIntType {
    return true
  }

  toFalseyType(): Type {
    return new LiteralIntType(0)
  }

  combineLiteral(literal: LiteralType) {
    if (!literal.isInt()) {
      // if the float is in the range of this int, return float type version of this
      if (literal.isFloat() && Narrowed.testNumber(literal.value, this.narrowed)) {
        return new MetaFloatType(this.narrowed)
      }

      return
    }

    // we have a literal int - if it is compatible with this, return this
    // otherwise oneOf(literal | int) will be returned by `compatibleWithBothTypes`
    if (Narrowed.testNumber(literal.value, this.narrowed)) {
      return this
    }
  }

  toCode() {
    if (Narrowed.isDefaultNarrowedNumber(this.narrowed)) {
      return INT
    } else {
      const narrow = Narrowed.numberDesc(this.narrowed)
      return `${INT}(${narrow})`
    }
  }

  compatibleWithBothNarrowed(rhs: MetaIntType) {
    const narrowed = Narrowed.compatibleWithBothInts(this.narrowed, rhs.narrowed)
    if (narrowed === this.narrowed) {
      return this
    } else if (narrowed === rhs.narrowed) {
      return rhs
    }
    return new MetaIntType(narrowed)
  }

  narrow(min: number | undefined, max: number | undefined) {
    const next = Narrowed.narrowInts(this.narrowed, {min, max})

    if (next === undefined) {
      return NeverType
    }

    if (Narrowed.isDefaultNarrowedNumber(next)) {
      return IntType
    }

    if (next.max !== undefined && next.min !== undefined && next.min === next.max) {
      return new LiteralIntType(next.min)
    }

    return new MetaIntType(next)
  }

  adjustNarrow(amount: number) {
    if (amount === 0 || Narrowed.isDefaultNarrowedNumber(this.narrowed)) {
      return this
    }

    const next = {...this.narrowed}

    if (next.min !== undefined) {
      next.min += amount
    }

    if (next.max !== undefined) {
      next.max += amount
    }

    return new MetaIntType(next)
  }

  /**
   * Used with SubtractionOperation
   * 1 - x => negateNarrow(1)
   */
  negateNarrow(amount: number) {
    if (Narrowed.isDefaultNarrowedNumber(this.narrowed)) {
      return this
    }

    const next: Narrowed.NarrowedInt = {min: undefined, max: undefined}

    if (this.narrowed.min !== undefined) {
      next.max = amount - this.narrowed.min
    }

    if (this.narrowed.max !== undefined) {
      next.min = amount - this.narrowed.max
    }

    return new MetaIntType(next)
  }

  propAccessType(name: string) {
    return MetaIntType.types[name]?.(this)
  }
}

export class MetaStringType extends Type {
  readonly is = 'string'

  declare static types: Record<string, ((object: MetaStringType) => Type) | undefined>

  constructor(
    readonly narrowedString: Narrowed.NarrowedString = {
      length: Narrowed.DEFAULT_NARROWED_LENGTH,
      regex: [],
    },
  ) {
    super()
  }

  compatibleWithBothNarrowed(rhs: MetaStringType) {
    // originally I had concatenated lhs.narrowedString.regex and
    // rhs.narrowedString.regex, but I see that's incorrect.
    //     a: String(matches: /^foo/)
    //     b: String(matches: /^bar/)
    //     a | b => ?
    if (this.narrowedString.regex.length || rhs.narrowedString.regex.length) {
      // TODO: if the regex's are identical, we can keep that narrowed type
      return undefined
    }

    const length = Narrowed.compatibleWithBothLengths(
      this.narrowedString.length,
      rhs.narrowedString.length,
    )
    return new MetaStringType({length: length ?? Narrowed.DEFAULT_NARROWED_LENGTH, regex: []})
  }

  typeConstructor(): TypeConstructor {
    if (
      this.narrowedString.regex.length ||
      !Narrowed.isDefaultNarrowedLength(this.narrowedString.length)
    ) {
      return new TypeConstructor('string', this, optional(this), [
        positionalArgument({name: 'input', type: AllType, isRequired: true}),
      ])
    }

    return new TypeConstructor('string', this, this, [
      positionalArgument({name: 'input', type: AllType, isRequired: true}),
    ])
  }

  isString(): this is MetaStringType | LiteralStringType {
    return true
  }

  isOnlyFalseyType() {
    return this.narrowedString.length.max === 0
  }

  toTruthyType() {
    if (this.isOnlyFalseyType()) {
      return NeverType
    }

    return this.narrowLength(1, this.narrowedString.length.max)
  }

  /**
   * If the min-length is greater than 0, it's always truthy, and shouldn't be used
   * as a conditional
   */
  isOnlyTruthyType(): boolean {
    return this.narrowedString.length.min > 0
  }

  toFalseyType(): Type {
    if (this.isOnlyTruthyType()) {
      return NeverType
    }

    return new LiteralStringType('')
  }

  combineLiteral(literal: LiteralType) {
    // make sure the literal is a string,
    // with a length that fits the narrowed length
    // and matches any regex
    if (!literal.isString()) {
      return
    }

    if (!Narrowed.testLength(literal.length, this.narrowedString.length)) {
      return
    }

    if (
      this.narrowedString.regex.length &&
      !Narrowed.testRegex(literal.value, this.narrowedString.regex)
    ) {
      return
    }

    return this
  }

  narrowString(narrowed: Narrowed.NarrowedString) {
    const nextLength = Narrowed.narrowLengths(this.narrowedString.length, narrowed.length)

    if (!nextLength) {
      return NeverType
    }

    if (nextLength.max !== undefined && nextLength.max <= 0 && nextLength.min <= 0) {
      return new LiteralStringType('')
    }

    let nextRegex: RegExp[]
    if (narrowed.regex.length) {
      nextRegex = this.narrowedString.regex.concat(narrowed.regex)
    } else {
      nextRegex = this.narrowedString.regex
    }

    if (Narrowed.isDefaultNarrowedLength(nextLength) && !nextRegex.length) {
      return StringType
    } else if (nextLength.max !== undefined && nextLength.max <= 0 && nextLength.min <= 0) {
      return new LiteralStringType('')
    }

    return new MetaStringType({length: nextLength, regex: nextRegex})
  }

  narrowLength(minLength: number, maxLength: number | undefined): Type {
    return this.narrowString({length: {min: minLength, max: maxLength}, regex: []})
  }

  toCode() {
    const isDefaultNarrowedLength = Narrowed.isDefaultNarrowedLength(this.narrowedString.length)
    if (isDefaultNarrowedLength && !this.narrowedString.regex.length) {
      return STRING
    }

    let code = `${STRING}(`
    const lengths = Narrowed.lengthDesc(this.narrowedString.length)
    if (lengths) {
      code += `length: ${lengths}`
    }

    if (!isDefaultNarrowedLength && this.narrowedString.regex.length) {
      code += ', '
    }

    if (this.narrowedString.regex.length) {
      const regexes = this.narrowedString.regex
        .map(regex => {
          const {source, flags} = regex
          return `/${source}/${flags}`
        })
        .join(', ')
      code += 'matches: '
      if (this.narrowedString.regex.length > 1) {
        code += '[' + regexes + ']'
      } else {
        code += regexes
      }
    }
    code += ')'

    return code
  }

  /**
   * If propName is length and type is MetaIntType (with narrowedLength), return a
   * new MetaStringType.
   */
  replacingProp(propName: string, type: Type): Result<Type, string> {
    if (propName === 'length') {
      if (type instanceof LiteralIntType) {
        return ok(this.narrowLength(Math.max(type.value, 0), type.value))
      }

      if (type instanceof MetaIntType) {
        return ok(this.narrowLength(Math.max(type.narrowed.min ?? 0, 0), type.narrowed.max))
      }

      return err(
        `Type ${type.toCode()} is not a valid length type for string. Expected Range or Int`,
      )
    }

    return super.replacingProp(propName, type)
  }

  propAccessType(name: string): Type | undefined {
    if (name === 'length') {
      if (this.narrowedString.length.min === this.narrowedString.length.max) {
        return new LiteralIntType(this.narrowedString.length.min)
      }

      return new MetaIntType(this.narrowedString.length)
    }

    return MetaStringType.types[name]?.(this)
  }
}

class MetaRegexType extends Type {
  readonly is = 'regex'

  declare static types: Record<string, ((object: MetaRegexType) => Type) | undefined>

  typeConstructor(): TypeConstructor {
    return new TypeConstructor('regex', this, this, [
      positionalArgument({name: 'input', type: oneOf([StringType, this]), isRequired: true}),
    ])
  }

  isRegex() {
    return true
  }

  /**
   * Instances of Regex are always true – and shouldn't be used as a conditional
   */
  isOnlyTruthyType() {
    return true
  }

  propAccessType(name: string) {
    return MetaRegexType.types[name]?.(this)
  }
}

class RangeType extends Type {
  readonly is = 'range'

  declare static types: Record<string, ((object: RangeType) => Type) | undefined>

  constructor(readonly type: Type) {
    super()
  }

  typeConstructor(): TypeConstructor {
    return new TypeConstructor('range', this, this, [])
  }

  isRange() {
    return true
  }

  propAccessType(name: string) {
    return RangeType.types[name]?.(this)
  }
}

class ViewType extends Type {
  readonly is = VIEW

  declare static types: Record<string, ((object: ViewType) => Type) | undefined>

  typeConstructor(): TypeConstructor {
    return new TypeConstructor(VIEW, this, this, [])
  }

  isView(): this is ViewType {
    return true
  }

  /**
   * Instances of a View are always true – and shouldn't be used as a conditional
   */
  isOnlyTruthyType(): boolean {
    return true
  }

  propAccessType(name: string) {
    return ViewType.types[name]?.(this)
  }
}

export abstract class LiteralType extends Type {
  abstract readonly is: `literal-${Literals}`
  abstract value: boolean | number | string | RegExp

  valueType(): Type {
    const value = this.value
    switch (this.is) {
      case 'literal-boolean':
        return BooleanType
      case 'literal-float':
        return new MetaFloatType({min: value as number, max: value as number})
      case 'literal-int':
        return new MetaIntType({min: value as number, max: value as number})
      case 'literal-string':
        return new MetaStringType({
          length: {
            min: (this as unknown as LiteralStringType).length,
            max: (this as unknown as LiteralStringType).length,
          },
          regex: [],
        })
      case 'literal-regex':
        return RegexType
    }
  }

  isBoolean(): this is LiteralBooleanType {
    return this.is === 'literal-boolean'
  }

  isFloat(): this is LiteralFloatType {
    return this.is === 'literal-float' || this.is === 'literal-int'
  }

  isInt(): this is LiteralIntType {
    return this.is === 'literal-int'
  }

  isString(): this is MetaStringType | LiteralStringType {
    return this.is === 'literal-string'
  }

  isRegex(): this is LiteralRegexType {
    return this.is === 'literal-regex'
  }

  toCode() {
    return JSON.stringify(this.value)
  }

  static from(value: boolean | number | string, isFloat?: 'float') {
    switch (typeof value) {
      case 'boolean':
        return LiteralBooleanType.from(value)
      case 'string':
        return new LiteralStringType(value)
      case 'number':
        if (Number.isInteger(value) && isFloat !== 'float') {
          return new LiteralIntType(value)
        } else {
          return new LiteralFloatType(value)
        }
    }
  }
}

export abstract class LiteralBooleanType extends LiteralType {
  readonly is = 'literal-boolean'
  abstract readonly value: boolean

  typeConstructor(): TypeConstructor {
    return new TypeConstructor(`${this.value}`, this, optional(this), [
      positionalArgument({name: 'input', type: AllType, isRequired: true}),
    ])
  }

  // `true` literal type is allowed in `if(false)` so that you can debug
  isOnlyTruthyType(): boolean {
    return this === LiteralTrueType
  }

  // `false` literal type is allowed in `if(false)` so that you can debug
  isOnlyFalseyType(): boolean {
    return this === LiteralFalseType
  }

  toFalseyType(): Type {
    return LiteralFalseType
  }

  static from(value: boolean) {
    if (value) {
      return LiteralTrueType
    } else {
      return LiteralFalseType
    }
  }

  propAccessType(name: string): Type | undefined {
    return BooleanType.propAccessType(name)
  }
}

export class LiteralFloatType extends LiteralType {
  readonly is: 'literal-float' | 'literal-int' = 'literal-float'

  constructor(public value: number) {
    super()

    this.value = value
  }

  typeConstructor(): TypeConstructor {
    return new TypeConstructor(`${this.value}`, this, optional(this), [
      positionalArgument({name: 'input', type: oneOf([string(), int()]), isRequired: true}),
    ])
  }

  isOnlyFalseyType(): boolean {
    return this.value === 0
  }

  toFalseyType(): Type {
    return new LiteralFloatType(0)
  }

  toCode() {
    const s = JSON.stringify(this.value)
    if (!s.includes('.') && !s.includes('e')) {
      return s + '.0'
    }

    return s
  }

  propAccessType(name: string): Type | undefined {
    return FloatType.propAccessType(name)
  }
}

export class LiteralIntType extends LiteralFloatType {
  readonly is = 'literal-int'

  constructor(
    value: number,
    readonly magnitude = 0,
  ) {
    super(Math.floor(value))
  }

  typeConstructor(): TypeConstructor {
    return IntType.typeConstructor()
  }

  toFalseyType(): Type {
    return new LiteralIntType(0)
  }

  toCode() {
    return JSON.stringify(this.value)
  }

  propAccessType(name: string): Type | undefined {
    return IntType.propAccessType(name)
  }
}

export class LiteralStringType extends LiteralType {
  readonly is = 'literal-string'

  readonly length: number
  readonly value: string

  constructor(value: string) {
    super()

    this.value = value
    const graphemes = splitter.splitGraphemes(value)
    this.length = graphemes.length
  }

  typeConstructor(): TypeConstructor {
    return new TypeConstructor(JSON.stringify(this.value), this, optional(this), [
      positionalArgument({name: 'input', type: AllType, isRequired: true}),
    ])
  }

  isOnlyFalseyType(): boolean {
    return this.value === ''
  }

  toFalseyType(): Type {
    return new LiteralStringType('')
  }
  /**
   * If propName is length and type is MetaIntType (with narrowedLength), return a
   * new MetaStringType.
   */
  replacingProp(propName: string, type: Type): Result<Type, string> {
    return err(`I didn't bother implementing replacingProp on ${type.toCode()}`)
  }

  propAccessType(name: string): Type | undefined {
    if (name === 'length') {
      return new LiteralIntType(this.length)
    }

    return StringType.propAccessType(name)
  }
}

export class LiteralRegexType extends LiteralType {
  readonly is = 'literal-regex'

  constructor(public value: RegExp) {
    super()

    this.value = value
  }

  typeConstructor(): TypeConstructor {
    return new TypeConstructor(this.toCode(), this, optional(this), [
      positionalArgument({name: 'input', type: string(), isRequired: true}),
    ])
  }

  toCode() {
    return `/${this.value.source}/${this.value.flags}`
  }

  propAccessType(name: string): Type | undefined {
    return RegexType.propAccessType(name)
  }
}

abstract class ContainerType<T extends ContainerType<T>> extends Type {
  abstract is: 'array' | 'dict' | 'set'

  readonly narrowedLength: Narrowed.NarrowedLength

  constructor(
    readonly of: Type,
    narrowedLength: Narrowed.NarrowedLength = Narrowed.DEFAULT_NARROWED_LENGTH,
  ) {
    super()

    if (Narrowed.isDefaultNarrowedLength(narrowedLength)) {
      this.narrowedLength = Narrowed.DEFAULT_NARROWED_LENGTH
    } else {
      this.narrowedLength = {
        min: Math.floor(Math.max(0, narrowedLength.min)),
        max:
          narrowedLength.max === undefined
            ? undefined
            : Math.floor(Math.max(0, narrowedLength.max)),
      }
    }
  }

  typeConstructor(): TypeConstructor {
    return new TypeConstructor(this.is, this, this, [
      positionalArgument({name: 'input', type: this, isRequired: true}),
    ])
  }

  hasGeneric() {
    return this.of.hasGeneric()
  }

  generics() {
    return this.of.generics()
  }

  /**
   * Make sure the array/dict/set type is not empty (max > 0 or undefined).
   */
  isOnlyFalseyType() {
    return this.narrowedLength.max === 0
  }

  toTruthyType() {
    return this.narrowLengthGuard(1, this.narrowedLength.max)
  }

  /**
   * If the min-length is greater than 0, it's always truthy, and shouldn't be used
   * as a conditional
   */
  isOnlyTruthyType(): boolean {
    return this.narrowedLength.min > 0
  }

  toFalseyType() {
    if (0 < this.narrowedLength.min) {
      return NeverType
    }

    if (this.narrowedLength.max !== undefined && 0 > this.narrowedLength.max) {
      return NeverType
    }

    return this.narrowLengthGuard(0, 0)
  }

  /**
   * Internal function - called from narrowLengthGuard after the combined narrow type
   * has been checked. The values minLength, maxLength are guaranteed to be
   * compatible with the ContainerType.
   */
  abstract narrowLengthSafe(minLength: number, maxLength: number | undefined): T

  narrowLength(minLength: number, maxLength: number | undefined) {
    return this.narrowLengthGuard(minLength, maxLength)
  }

  private narrowLengthGuard(minLength: number, maxLength: number | undefined) {
    const next = Narrowed.narrowLengths(this.narrowedLength, {min: minLength, max: maxLength})
    if (next === undefined) {
      return NeverType
    }

    return this.narrowLengthSafe(minLength, maxLength)
  }
}

export const AnyViewType = new (class AnyViewType extends ViewType {})()
export const UserViewType = new (class UserViewType extends ViewType {})()
export const FragmentViewType = new (class FragmentViewType extends ViewType {})()
export const NullType = new MetaNullType()
export const BooleanType = new MetaBooleanType()
export const FloatType = new MetaFloatType()
export const IntType = new MetaIntType()
export const StringType = new MetaStringType()
export const RegexType = new MetaRegexType()
export const IntRangeType = new RangeType(IntType)
export const FloatRangeType = new RangeType(FloatType)

export const LiteralTrueType = new (class LiteralTrueType extends LiteralBooleanType {
  readonly value: boolean = true
})()

export const LiteralFalseType = new (class LiteralFalseType extends LiteralBooleanType {
  readonly value: boolean = false
})()

export type PositionalProp = {is: 'positional'; name?: undefined; type: Type}
export type NamedProp = {is: 'named'; name: string; type: Type}
export type ObjectProp = PositionalProp | NamedProp

export class NamespaceType extends Type {
  readonly is = 'namespace'

  constructor(
    readonly name: string,
    readonly types: Map<string, Type>,
  ) {
    super()
  }

  typeConstructor(): TypeConstructor {
    throw 'Cannot construct Namespace instances'
  }

  propAccessType(_name: string) {
    return undefined
  }
}

export class ObjectType extends Type {
  readonly is: 'object' | 'named-object' = 'object'

  declare static types: Record<string, ((object: ObjectType) => Type) | undefined>

  constructor(readonly props: ObjectProp[]) {
    // TODO: props are not being checked for duplicate names (later names should
    // override earlier names, positional props concatenate)
    super()
  }

  isObject(): this is ObjectType {
    return true
  }

  fromTypeConstructor() {
    const props: ObjectProp[] = []
    for (const arg of this.props) {
      props.push({
        ...arg,
        type: arg.type.fromTypeConstructor(),
      })
    }

    return new ObjectType(props)
  }

  typeConstructor(): TypeConstructor {
    return new TypeConstructor('object', this, this, [
      positionalArgument({name: 'input', type: this, isRequired: true}),
    ])
  }

  hasGeneric() {
    for (const {type} of this.props) {
      if (type.hasGeneric()) {
        return true
      }
    }

    return false
  }

  generics() {
    const generics: Set<GenericType> = new Set()
    for (const {type} of this.props) {
      for (const generic of type.generics()) {
        generics.add(generic)
      }
    }

    return generics
  }

  resolve(resolvedGenerics: Map<GenericType, GenericType>): Result<Type, string> {
    const props: ObjectProp[] = []
    for (const arg of this.props) {
      const {type} = arg
      const resolved = maybeResolve(type, type, resolved => resolved, resolvedGenerics)
      if (resolved.isErr()) {
        return err(resolved.error)
      }
      props.push({
        ...arg,
        type: resolved.get(),
      })
    }
    return ok(new ObjectType(props))
  }

  toCode() {
    const propDesc = this.props
      .map(({name, type}) =>
        name === undefined ? `${type.toCode()}` : `${name}: ${type.toCode()}`,
      )
      .join(', ')
    return `{${propDesc}}`
  }

  arrayAccessType(propType: KeyType, _rhs: Type): Type | undefined {
    if (propType === 'null' || propType === 'boolean') {
      return NeverType
    }

    let reducedType: Type | undefined
    let foundAny = false
    for (const prop of this.props) {
      if (
        (prop.is === 'positional' && propType === 'int') ||
        (prop.is === 'named' && propType === 'string')
      ) {
        foundAny = true
        reducedType = reducedType
          ? compatibleWithBothTypes(reducedType, prop.type)
          : optional(prop.type)
      }

      if (reducedType === NeverType) {
        return NeverType
      }
    }

    if (!foundAny) {
      return NeverType
    }
  }

  literalAccessType(propName: Key): Type | undefined {
    if (propName === null || typeof propName === 'boolean') {
      return undefined
    }

    if (typeof propName === 'string') {
      return this.props.find(prop => prop.name === propName)?.type
    }

    let propIndex = 0
    for (const prop of this.props) {
      if (prop.is === 'positional') {
        if (propName === propIndex) {
          return prop.type
        }
        propIndex++
      }
    }

    return undefined
  }

  /**
   * Returns a copy of the ObjectType, replacing the type of one property. This is
   * used by the type narrowing code to return a more specific type.
   */
  replacingProp(propName: string, type: Type): Result<ObjectType, string> {
    return ok(
      new ObjectType(
        this.props.map(prop => {
          if (prop.name !== propName) {
            return prop
          }

          return {...prop, type}
        }),
      ),
    )
  }

  propAccessType(prop: string): Type | undefined {
    return ObjectType.types[prop]?.(this) ?? this.literalAccessType(prop)
  }
}

export class ArrayType extends ContainerType<ArrayType> {
  readonly is = 'array'

  declare static types: Record<string, ((array: ArrayType) => Type) | undefined>

  constructor(
    of: Type,
    narrowedLength: Narrowed.NarrowedLength = Narrowed.DEFAULT_NARROWED_LENGTH,
  ) {
    super(of, narrowedLength)
  }

  fromTypeConstructor() {
    return new ArrayType(this.of.fromTypeConstructor(), this.narrowedLength)
  }

  resolve(resolvedGenerics: Map<GenericType, GenericType>): Result<Type, string> {
    return maybeResolve(this.of, this, type => new ArrayType(type), resolvedGenerics)
  }

  static desc(typeDesc: string, narrowedLength: Narrowed.NarrowedLength) {
    const length = Narrowed.lengthDesc(narrowedLength)
    if (length) {
      return `Array(${typeDesc}, length: ${length})`
    }
    return `Array(${typeDesc})`
  }

  toCode() {
    return ArrayType.desc(this.of.toCode(false), this.narrowedLength)
  }

  narrowLengthSafe(minLength: number, maxLength: number | undefined) {
    return new ArrayType(this.of, {min: minLength, max: maxLength})
  }

  compatibleWithBothNarrowed(rhs: ArrayType) {
    const length = Narrowed.compatibleWithBothLengths(this.narrowedLength, rhs.narrowedLength)
    return new ArrayType(this.of, length)
  }

  arrayAccessType(propType: KeyType, rhs: Type): Type | undefined {
    if (propType === 'string') {
      return NeverType
    }

    if (
      rhs instanceof MetaIntType &&
      rhs.narrowed.min !== undefined &&
      rhs.narrowed.min >= 0 &&
      rhs.narrowed.max !== undefined &&
      this.narrowedLength.max !== undefined &&
      rhs.narrowed.max <= this.narrowedLength.max
    ) {
      return this.of
    }

    return optional(this.of)
  }

  literalAccessType(propName: Key): Type | undefined {
    if (typeof propName !== 'number') {
      return NeverType
    }

    if (this.narrowedLength.max !== undefined && this.narrowedLength.max <= propName) {
      return NullType
    }

    // so if min: 3 > N --> true
    if (this.narrowedLength.min > propName) {
      return this.of
    }

    return optional(this.of)
  }

  /**
   * If propName is length and type is MetaIntType (with narrowedLength), return a
   * new ArrayType with that length.
   */
  replacingProp(propName: string, type: Type): Result<Type, string> {
    if (propName === 'length') {
      if (type instanceof LiteralIntType) {
        return ok(this.narrowLength(Math.max(type.value, 0), type.value))
      }

      if (type instanceof MetaIntType) {
        return ok(this.narrowLength(Math.max(type.narrowed.min ?? 0, 0), type.narrowed.max))
      }

      return err(
        `Type ${type.toCode()} is not a valid length type for array. Expected Range or Int`,
      )
    }

    return super.replacingProp(propName, type)
  }

  propAccessType(name: string) {
    if (name === 'length') {
      if (this.narrowedLength.min === this.narrowedLength.max) {
        return new LiteralIntType(this.narrowedLength.min)
      }

      return new MetaIntType(this.narrowedLength)
    }

    return ArrayType.types[name]?.(this)
  }
}

export class DictType extends ContainerType<DictType> {
  readonly is = 'dict'

  declare static types: Record<string, ((dict: DictType) => Type) | undefined>

  constructor(
    of: Type,
    narrowed: Narrowed.NarrowedLength = Narrowed.DEFAULT_NARROWED_LENGTH,
    readonly narrowedNames: Set<Key> = new Set(),
  ) {
    if (
      narrowed.min < narrowedNames.size ||
      (narrowed.max !== undefined && narrowed.max < narrowedNames.size)
    ) {
      narrowed = {
        min: Math.max(narrowed.min, narrowedNames.size),
        max: narrowed.max === undefined ? undefined : Math.max(narrowed.max, narrowedNames.size),
      }
    }
    super(of, narrowed)
  }

  fromTypeConstructor() {
    return new DictType(this.of.fromTypeConstructor(), this.narrowedLength, this.narrowedNames)
  }

  resolve(resolvedGenerics: Map<GenericType, GenericType>): Result<Type, string> {
    return maybeResolve(this.of, this, type => new DictType(type), resolvedGenerics)
  }

  static desc(typeDesc: string, narrowedNames: Set<Key>, narrowedLength: Narrowed.NarrowedLength) {
    let namesDesc: string
    if (narrowedNames.size === 0) {
      namesDesc = ''
    } else {
      namesDesc = `keys: [${[...narrowedNames].map(name => ':' + name).join(', ')}]`
    }

    let lengthDesc = Narrowed.lengthDesc(narrowedLength)
    if (lengthDesc === `>=${narrowedNames.size}`) {
      // fun little optimization - if the minimum size is the same as the number of
      // specified keys, there's no reason to specify the size
      lengthDesc = ''
    } else if (lengthDesc) {
      lengthDesc = 'length: ' + lengthDesc
    }

    if (namesDesc && lengthDesc) {
      return `Dict(${typeDesc}, ${namesDesc}, ${lengthDesc})`
    }

    if (namesDesc) {
      return `Dict(${typeDesc}, ${namesDesc})`
    }

    if (lengthDesc) {
      return `Dict(${typeDesc}, ${lengthDesc})`
    }

    return `Dict(${typeDesc})`
  }

  toCode() {
    const typeDesc = this.of.toCode(false)
    return DictType.desc(typeDesc, this.narrowedNames, this.narrowedLength)
  }

  narrowLengthSafe(minLength: number, maxLength: number | undefined) {
    return new DictType(this.of, {min: minLength, max: maxLength}, this.narrowedNames)
  }

  narrowName(name: Key) {
    if (this.narrowedNames.has(name)) {
      return this
    }
    const names = new Set(this.narrowedNames)
    names.add(name)
    return new DictType(this.of, this.narrowedLength, names)
  }

  compatibleWithBothNarrowed(rhs: DictType) {
    const length = Narrowed.compatibleWithBothLengths(this.narrowedLength, rhs.narrowedLength)
    const names = intersection(this.narrowedNames, rhs.narrowedNames)
    return new DictType(this.of, length, names)
  }

  arrayAccessType(_type: KeyType, _rhs: Type) {
    return optional(this.of)
  }

  literalAccessType(name: Key) {
    // if lhs is in narrowedNames, it is `this.of`
    const hasName = this.narrowedNames.has(name)
    if (hasName) {
      return this.of
    }

    // if it isn't in narrowedNames, it _could_ exist, unless the number of items
    // in dict equals the size of narrowedNames (ie we just did an exhaustive check)
    const allProps = this.narrowedNames.size === this.narrowedLength.max
    if (allProps) {
      return NullType
    }

    return optional(this.of)
  }

  propAccessType(name: string) {
    return DictType.types[name]?.(this) ?? this.of
  }
}

export class SetType extends ContainerType<SetType> {
  readonly is = 'set'

  declare static types: Record<string, ((array: SetType) => Type) | undefined>

  constructor(
    of: Type,
    narrowedLength: Narrowed.NarrowedLength = Narrowed.DEFAULT_NARROWED_LENGTH,
  ) {
    super(of, narrowedLength)
  }

  fromTypeConstructor() {
    return new SetType(this.of.fromTypeConstructor(), this.narrowedLength)
  }

  resolve(resolvedGenerics: Map<GenericType, GenericType>): Result<Type, string> {
    return maybeResolve(this.of, this, type => new ArrayType(type), resolvedGenerics)
  }

  static desc(typeDesc: string, narrowedLength: Narrowed.NarrowedLength) {
    const length = Narrowed.lengthDesc(narrowedLength)
    if (length) {
      return `Set(${typeDesc}, length: ${length})`
    }

    return `Set(${typeDesc})`
  }

  toCode() {
    return SetType.desc(this.of.toCode(false), this.narrowedLength)
  }

  narrowLengthSafe(minLength: number, maxLength: number | undefined) {
    return new SetType(this.of, {min: minLength, max: maxLength})
  }

  compatibleWithBothNarrowed(rhs: SetType) {
    const length = Narrowed.compatibleWithBothLengths(this.narrowedLength, rhs.narrowedLength)
    return new SetType(this.of, length)
  }

  propAccessType(name: string) {
    return SetType.types[name]?.(this)
  }
}

export class ClassType extends Type {
  readonly is: 'class' | 'named-class' = 'class'
  props: Map<string, Type>

  declare static types: Record<string, ((object: ClassType) => Type) | undefined>

  constructor(
    props: Map<string, Type>,
    public parent?: ClassType | undefined,
  ) {
    super()
    props = new Map<string, Type>(props)

    while (parent) {
      for (const [key, value] of parent.props.entries()) {
        const existing = props.get(key)
        // if the parent prop is not defined in props, add it.
        // but also, if the parent prop is defined in props, *but not assignable*,
        // we assign the parent prop type instead
        // (this is a compile-time error that should've been caught already)
        if (!existing || !canBeAssignedTo(existing, value)) {
          props.set(key, value)
        }
      }

      parent = parent.parent
    }

    this.props = props
  }

  fromTypeConstructor() {
    const props = new Map<string, Type>()
    for (const [prop, type] of this.props.entries()) {
      props.set(prop, type.fromTypeConstructor())
    }

    return new ClassType(props)
  }

  typeConstructor(): TypeConstructor {
    return new TypeConstructor('class', this, this, [
      positionalArgument({name: 'input', type: this, isRequired: true}),
    ])
  }

  hasGeneric() {
    for (const type of this.props.values()) {
      if (type.hasGeneric()) {
        return true
      }
    }

    return false
  }

  generics() {
    const generics: Set<GenericType> = new Set()
    for (const type of this.props.values()) {
      for (const generic of type.generics()) {
        generics.add(generic)
      }
    }

    return generics
  }

  resolve(resolvedGenerics: Map<GenericType, GenericType>): Result<Type, string> {
    const props = new Map<string, Type>()
    for (const [key, type] of this.props.entries()) {
      const resolved = maybeResolve(type, type, resolved => resolved, resolvedGenerics)

      if (resolved.isErr()) {
        return err(resolved.error)
      }
      props.set(key, resolved.get())
    }

    return ok(new ClassType(props))
  }

  toCode() {
    const props = [...this.props.entries()]
    const propDesc = props.map(([name, type]) => `${name}: ${type.toCode()}`).join(', ')
    return `{${propDesc}}`
  }

  /**
   * Returns a copy of the ClassType, replacing the type of one property. This is
   * used by the type narrowing code to return a more specific type.
   */
  replacingProp(prop: string, type: Type): Result<ClassType, string> {
    const props = new Map(this.props)
    props.set(prop, type)
    return ok(new ClassType(props, this.parent))
  }

  propAccessType(prop: string): Type | undefined {
    return ClassType.types[prop]?.(this) ?? this.props.get(prop)
  }

  /**
   * Instances of a class are always true – and shouldn't be used as a conditional
   */
  isOnlyTruthyType(): boolean {
    return true
  }
}

export class NamedObjectType extends ObjectType {
  readonly is = 'named-object'

  constructor(
    readonly name: string,
    props: ObjectProp[],
  ) {
    super(props)
  }
}

export class NamedClassType extends ClassType {
  readonly is = 'named-class'

  constructor(
    public name: string,
    props: Map<string, Type>,
    parent: ClassType | undefined,
  ) {
    super(props, parent)
  }

  replacingProp(prop: string, type: Type): Result<NamedClassType, string> {
    const props = new Map(this.props)
    props.set(prop, type)
    return ok(new NamedClassType(this.name, props, this.parent))
  }

  toCode() {
    return this.name
  }
}

/******************************************************************************/
/******************************************************************************/
/*                           Helper Functions                                 */
/******************************************************************************/
/******************************************************************************/

/**
 * For `a is b` operator, this returns the subtypes of a that "are b"
 */
export function narrowTypeIs(lhsType: Type, typeAssertion: Type): Type {
  if (typeAssertion instanceof OneOfType) {
    return oneOf(
      typeAssertion.of.flatMap(typeAssertion => {
        const narrowed = narrowTypeIs(lhsType, typeAssertion)
        if (narrowed === NeverType) {
          return []
        } else {
          return [narrowed]
        }
      }),
    )
  }

  if (lhsType instanceof OneOfType) {
    return oneOf(
      lhsType.of.flatMap(lhsType => {
        const narrowed = narrowTypeIs(lhsType, typeAssertion)
        if (narrowed === NeverType) {
          return []
        } else {
          return [narrowed]
        }
      }),
    )
  }

  // covers "(String | Int) is Float --> Int", because Int can be assigned to Float
  // also covers "(student | null) is human --> human" because student can be assigned to human
  if (canBeAssignedTo(lhsType, typeAssertion)) {
    return typeAssertion
  }

  // covers type narrowing, e.g. "(human) is student --> student"
  // these types are only used _when the eval() value is true,
  // so in this case we got the runtime type of the value,
  // it's hypothetically "student", and so the 'is' assertion will be true
  if (canBeAssignedTo(typeAssertion, lhsType)) {
    return typeAssertion
  }

  return NeverType
}

/**
 * For false branch of the `a is b` operator, this returns the subtypes of `a` that
 * "are not b"
 */
export function narrowTypeIsNot(lhsType: Type, typeAssertion: Type): Type {
  if (typeAssertion instanceof OneOfType) {
    return oneOf(
      typeAssertion.of.flatMap(typeAssertion => {
        const narrowed = narrowTypeIsNot(lhsType, typeAssertion)
        if (narrowed === NeverType) {
          return []
        } else {
          return [narrowed]
        }
      }),
    )
  }

  if (lhsType instanceof OneOfType) {
    return oneOf(
      lhsType.of.flatMap(lhsType => {
        const narrowed = narrowTypeIsNot(lhsType, typeAssertion)
        if (narrowed === NeverType) {
          return []
        } else {
          return [narrowed]
        }
      }),
    )
  }

  if (canBeAssignedTo(lhsType, typeAssertion)) {
    return NeverType
  }

  return lhsType
}

/**
 * Finds a type that is compatible with both types, e.g. the smallest set that
 * includes both types.
 *
 * - NeverType never merges - nothing is compatible with it.
 * - if either type is AllType, return AllType
 * - if either type is AlwaysType, return the other type
 * - Identical types are easy, return the type
 * - OneOf types will be merged item by item, merging when possible. At most you'll
 *   have all the elements from both types, or they may be combined into generic types.
 * - String and String return String
 *   - If the type is narrowed to a range, the smallest range that includes both will
 *     be used.
 *   - If the strings have a regex, and the regex isn't identical, OneOf will be used
 * - Float and Int return Float
 *   - If the type is narrowed to a range, the smallest range that includes both will
 *     be used.
 * - Arrays return another Array type, combining the two types of each array
 * - Dicts: ditto
 * - Objects return a type with all the properties from both objects, with each prop being compatible.
 * - LiteralTypes will combine with their value-type, e.g. literal(1) & Int => Int
 * - otherwise LiteralTypes will be preserved in a OneOfType
 */
export function compatibleWithBothTypes(lhs: Type, rhs: Type): Type {
  if (lhs === rhs) {
    return lhs
  }

  if (lhs === NeverType || rhs === NeverType) {
    return NeverType
  }

  if (lhs === AllType || rhs === AllType) {
    return AllType
  }

  if (lhs === AlwaysType) {
    return rhs
  }

  if (rhs === AlwaysType) {
    return lhs
  }

  if (lhs instanceof OneOfType && rhs instanceof OneOfType) {
    // merge every type in rhs with the list of types in lhs
    // this ends up calling the next conditional
    let returnType: Type = lhs
    for (const rhType of rhs.of) {
      returnType = compatibleWithBothTypes(returnType, rhType)
    }

    return returnType
  } else if (lhs instanceof OneOfType) {
    // for every type in lhs, try to find a common type, otherwise add the type to
    // the list of types
    const types: Type[] = []
    let commonType: Type = rhs
    for (const lhType of lhs.of) {
      const commonParent = compatibleWithBothTypes(lhType, commonType)
      if (commonParent instanceof OneOfType) {
        // lhType, rhs
        types.push(lhType)
      } else {
        commonType = commonParent
      }
    }

    types.push(commonType)

    return _privateOneOf(types)
  } else if (rhs instanceof OneOfType) {
    return compatibleWithBothTypes(rhs, lhs)
  }

  if (lhs.isLiteral() && rhs.isLiteral()) {
    if (lhs.is === rhs.is && lhs.value === rhs.value) {
      return lhs
    } else if (lhs.value === rhs.value) {
      // only happens when one type is Int, other is Float, but they have the same
      // value => literal(Float) is compatible with both (and often indistinguishable)
      return literal(lhs.value, 'float')
    } else if (lhs.isBoolean() && rhs.isBoolean()) {
      // both booleans but different values, that's just a BooleanType
      return BooleanType
    }
    // otherwise values/types are different - fallback to OneOfType
  } else if (rhs.isLiteral()) {
    // defer to below logic (by switching the arg order)
    return compatibleWithBothTypes(rhs, lhs)
  } else if (lhs.isLiteral()) {
    // lhs is a literal, rhs is not;
    // if the "valueType" of lhs (ie if lhs wasn't a
    // literal, what type would it be) is the same, return that.
    // and of course special Float/Int check
    // otherwise oneOf(literal, type) fallback
    const type = rhs.combineLiteral(lhs)
    if (type) {
      return type
    }
  } else if (lhs.isFloat() && rhs.isFloat()) {
    // both are numbers, but not literal numbers.
    // If both are ints, use that narrowed type, otherwise coerce to Float.
    //
    // !isLiteral assertion needed for typescript
    if (!lhs.isLiteral('float') && !rhs.isLiteral('float')) {
      let type: Type | undefined
      // check for MetaFloatType in case we need to coerce into an int
      // (MetaIntType assumes only IntTypes)
      if (rhs instanceof MetaFloatType) {
        type = rhs.compatibleWithBothNarrowed(lhs)
      } else {
        // rhs is Int, lhs is _either_ Int or Float, but don't need to special case
        type = lhs.compatibleWithBothNarrowed(rhs)
      }

      if (type) {
        return type
      }
    }
  } else if (lhs instanceof MetaStringType && rhs instanceof MetaStringType) {
    // both are strings, but not literal strings
    const type = lhs.compatibleWithBothNarrowed(rhs)
    if (type) {
      return type
    }
  } else if (lhs instanceof ArrayType && rhs instanceof ArrayType) {
    // merge the types if they are compatible, otherwise retain their types
    // e.g. Array(Int) & Array(Float) --> Array(Float)
    // e.g. Array(Int) & Array(String) --> Array(Int) | Array(String)
    const common = compatibleWithBothTypes(lhs.of, rhs.of)
    if (!(common instanceof OneOfType)) {
      // try not to create a new ArrayType (optimize for lhs === rhs comparisons)
      // compatibleWithBothTypes will return lhs.of or rhs.of if one or the other is
      // the superset of both. In that case, we only need to check the narrowed length
      let type: ArrayType | undefined
      if (common === lhs.of) {
        type = lhs.compatibleWithBothNarrowed(rhs)
      } else if (common === rhs.of) {
        type = rhs.compatibleWithBothNarrowed(lhs)
      } else {
        type = new ArrayType(common, lhs.narrowedLength).compatibleWithBothNarrowed(rhs)
      }

      if (type) {
        return type
      }
    }
  } else if (lhs instanceof DictType && rhs instanceof DictType) {
    // same logic as ArrayType
    const common = compatibleWithBothTypes(lhs.of, rhs.of)
    if (!(common instanceof OneOfType)) {
      let type: DictType | undefined
      if (common === lhs.of) {
        type = lhs.compatibleWithBothNarrowed(rhs)
      } else if (common === rhs.of) {
        type = rhs.compatibleWithBothNarrowed(lhs)
      } else {
        type = new DictType(
          common,
          lhs.narrowedLength,
          lhs.narrowedNames,
        ).compatibleWithBothNarrowed(rhs)
      }

      if (type) {
        return type
      }
    }
  } else if (lhs instanceof SetType && rhs instanceof SetType) {
    // same logic as ArrayType
    const common = compatibleWithBothTypes(lhs.of, rhs.of)
    if (!(common instanceof OneOfType)) {
      let type: SetType | undefined
      if (common === lhs.of) {
        type = lhs.compatibleWithBothNarrowed(rhs)
      } else if (common === rhs.of) {
        type = rhs.compatibleWithBothNarrowed(lhs)
      } else {
        type = new SetType(common, lhs.narrowedLength).compatibleWithBothNarrowed(rhs)
      }

      if (type) {
        return type
      }
    }
  } else if (lhs instanceof ObjectType && rhs instanceof ObjectType) {
    const compatible = compatibleWithBothObjects(lhs, rhs)
    if (compatible) {
      return compatible
    }
  } else if (lhs instanceof ClassType && rhs instanceof ClassType) {
    // compatibleWithBothTypes tries to "preserve" types, ie
    // - if lhs is a parent of rhs (or vice versa), then we can't distinguish
    //   between the two, so return the parent type.
    // - otherwise, even if the two types share a common parent, return oneOf
    let parent: ClassType | undefined
    parent = lhs.parent
    while (parent) {
      if (parent === rhs) {
        return parent
      }
      parent = parent.parent
    }

    parent = rhs.parent
    while (parent) {
      if (parent === lhs) {
        return parent
      }
      parent = parent.parent
    }

    // if no common parent was found, fallback to OneOfType(lhs, rhs)
  } else if (lhs instanceof FormulaType && rhs instanceof FormulaType) {
    const compatible = compatibleWithBothFormulas(lhs, rhs)
    if (compatible) {
      return compatible
    }
  }

  return _privateOneOf([lhs, rhs])
}

function compatibleWithBothObjects(lhs: ObjectType, rhs: ObjectType): ObjectType | undefined {
  // If all properties of lhs and rhs are compatible, merge the two types.
  //
  // e.g. Object(foo: Int) & Object(foo: Float) --> Object(foo: Float)
  // e.g. Object(foo: Int) & Object(bar: String) --> Object(foo: Int) | Object(bar: String)
  const lhsPositionalArguments: PositionalProp[] = []
  const lhsNamedArguments: Map<string, NamedProp> = new Map()
  for (const arg of lhs.props) {
    if (arg.is === 'positional') {
      lhsPositionalArguments.push(arg)
    } else {
      lhsNamedArguments.set(arg.name, arg)
    }
  }

  const rhsPositionalArguments: PositionalProp[] = []
  const rhsNamedArguments: Map<string, NamedProp> = new Map()
  for (const arg of rhs.props) {
    if (arg.is === 'positional') {
      rhsPositionalArguments.push(arg)
    } else {
      rhsNamedArguments.set(arg.name, arg)
    }
  }

  if (
    lhsPositionalArguments.length != rhsPositionalArguments.length ||
    lhsNamedArguments.size != rhsNamedArguments.size
  ) {
    return
  }

  const props: ObjectProp[] = []
  for (const [index, lhArg] of lhsPositionalArguments.entries()) {
    const rhArg = rhsPositionalArguments[index]
    // PositionalProp = {is: 'positional'; name?: undefined; type: Type}
    // NamedProp = {is: 'named'; name: string; type: Type}

    // canBeAssignedTo(testType, assignTo) => true, implies that assignTo is a superset
    // of testType. So if rhArg.type is a subset of lhArg.type, we can use that as the
    // type in the returned ObjectType
    if (canBeAssignedTo(lhArg.type, rhArg.type)) {
      props.push(rhArg)
    } else if (canBeAssignedTo(rhArg.type, lhArg.type)) {
      props.push(lhArg)
    } else {
      return
    }
  }

  for (const [name, lhArg] of lhsNamedArguments.entries()) {
    const rhArg = rhsNamedArguments.get(name)
    if (!rhArg) {
      return
    }

    if (canBeAssignedTo(lhArg.type, rhArg.type)) {
      props.push(rhArg)
    } else if (canBeAssignedTo(rhArg.type, lhArg.type)) {
      props.push(lhArg)
    } else {
      return
    }
  }

  return new ObjectType(props)
}

function compatibleWithBothFormulas(lhs: FormulaType, rhs: FormulaType) {
  const lhsPositions = lhs.args.reduce((count, arg) => (arg.alias ? count : count + 1), 0)
  const rhsPositions = rhs.args.reduce((count, arg) => (arg.alias ? count : count + 1), 0)
  if (rhsPositions > lhsPositions) {
    // so that we can assume lhs has more positional arguments
    return compatibleWithBothFormulas(rhs, lhs)
  }

  const namedArgs = new Set(lhs.args.flatMap(arg => (arg.alias ? [arg.alias] : [])))
  rhs.args.forEach((arg, index) => {
    // if index < lhsPositions, we can't rely on that named argument
    if (index >= lhsPositions && arg.alias) {
      namedArgs.add(arg.alias)
    }
  })

  for (const [index, lhArg] of lhs.args.entries()) {
    let rhArg: Argument | undefined
    if (lhArg.alias) {
      rhArg = rhs.namedArg(lhArg.alias)
    } else {
      rhArg = rhs.positionalArg(index)
    }

    if (!rhArg) {
      continue
    }

    if (lhArg.type instanceof FormulaType || rhArg.type instanceof FormulaType) {
      if (lhArg.type instanceof FormulaType && rhArg.type instanceof FormulaType) {
        if (!compatibleWithBothFormulas(lhArg.type, rhArg.type)) {
          return
        }
      } else {
        return
      }
    } else if (
      !canBeAssignedTo(lhArg.type, rhArg.type) ||
      !canBeAssignedTo(rhArg.type, lhArg.type)
    ) {
      return
    }
  }

  const args: Argument[] = []
  for (const [index, lhArg] of lhs.args.entries()) {
    if (index >= lhsPositions) {
      break
    }

    const rhArg = rhs.positionalArg(index)
    if (rhArg) {
      const type = compatibleWithBothTypes(lhArg.type, rhArg.type)
      const name = lhArg.name === rhArg.name ? lhArg.name : lhArg.name + '_' + rhArg.name
      args.push(positionalArgument({name, type, isRequired: lhArg.isRequired && rhArg.isRequired}))
    } else {
      args.push({...lhArg, isRequired: false})
    }
  }

  for (const name of namedArgs) {
    const lhArg = lhs.namedArg(name)
    const rhArg = rhs.namedArg(name)

    if (lhArg && rhArg) {
      args.push(
        namedArgument({
          name,
          type: compatibleWithBothTypes(lhArg.type, rhArg.type),
          isRequired: lhArg.isRequired && rhArg.isRequired,
        }),
      )
    } else if (lhArg) {
      args.push({...lhArg, isRequired: false})
    } else if (rhArg) {
      args.push({...rhArg, isRequired: false})
    }
  }

  const returnType = compatibleWithBothTypes(lhs.returnType, rhs.returnType)

  if (lhs.genericTypes.length || rhs.genericTypes.length) {
    throw 'TODO'
  }

  return formula(args, returnType, [])
}

/**
 * Determines if a type can be assigned to another type, for instance if a ClassType
 * overrides a property of another ClassType, the child property must be
 * assignable to the parent class.
 *
 * Example: if a parent type defines
 *     foo: Int | String
 * a child type could narrow it to
 *     foo: Int -- or foo: String
 *
 * but not:
 *     foo: Float -- or foo: Int | String | Boolean
 * (Float isn't assignable to Int, Boolean isn't assignable to Int | String)
 */
export function canBeAssignedTo(
  testType: Type,
  assignTo: Type,
  resolvedGenerics?: Map<GenericType, GenericType>,
  reason?: {reason: string}, // if provided, this object will be modified to include an error message.
): boolean {
  function why(canBeAssigned: boolean, error: string) {
    if (!canBeAssigned && reason) {
      if (reason.reason) {
        reason.reason = error + '. ' + reason.reason
      } else {
        reason.reason = error
      }
    } else if (canBeAssigned && reason) {
      reason.reason = ''
    }

    return canBeAssigned
  }

  if (testType === NeverType || assignTo === NeverType) {
    return why(false, `Encountered unexpected type 'never'`)
  }

  if (assignTo === AllType) {
    return true
  }

  if (testType === AllType) {
    return why(false, `Encountered unexpected type 'any'`)
  }

  if (testType === AlwaysType) {
    return true
  }

  if (assignTo === AlwaysType) {
    return why(false, `Encountered unexpected type 'always'`)
  }

  if (assignTo.isGeneric()) {
    if (assignTo.resolvedType) {
      return canBeAssignedTo(testType, assignTo.resolvedType, resolvedGenerics, reason)
    } else {
      addHint(assignTo, testType, resolvedGenerics)
    }

    return true
  }

  if (testType.isGeneric()) {
    if (testType.resolvedType) {
      return canBeAssignedTo(testType.resolvedType, assignTo, resolvedGenerics, reason)
    } else {
      addRequirement(testType, assignTo, resolvedGenerics)
    }

    return true
  }

  if (testType instanceof OneOfType) {
    // every type in testType must be assignable to *one of* the types in assignTo
    return testType.of.every(lhType => canBeAssignedTo(lhType, assignTo, resolvedGenerics, reason))
  } else if (assignTo instanceof OneOfType) {
    const [nonGeneric, generic] = assignTo.of.reduce(
      ([nonGeneric, generic], current: Type) => {
        if (current.hasGeneric()) {
          return [nonGeneric, generic.concat([current])]
        } else {
          return [nonGeneric.concat([current]), generic]
        }
      },
      [[], []] as [Type[], Type[]],
    )

    if (nonGeneric.some(rhType => canBeAssignedTo(testType, rhType, resolvedGenerics, reason))) {
      return true
    }

    // testType must be assignable to one of the types in assignTo
    // (ie testType is a *narrowed* type of assignTo)
    return why(
      generic.some(rhType => canBeAssignedTo(testType, rhType, resolvedGenerics, reason)),
      `'${testType}' is not assignable to '${assignTo}'`,
    )
  }

  if (testType === assignTo) {
    return true
  } else if (testType.isLiteral() && assignTo.isLiteral()) {
    // note: int can be assigned to float, but float cannot be assigned to int
    if (testType.is === assignTo.is || (testType.isInt() && assignTo.isFloat())) {
      return why(
        testType.value === assignTo.value,
        `Different literal values ${testType.value} !== ${assignTo.value}`,
      )
    }

    return why(
      false,
      `Literal type ${testType.valueType()} is not assignable to ${assignTo.valueType()}`,
    )
  } else if (testType.isLiteral()) {
    return canBeAssignedTo(testType.valueType(), assignTo, resolvedGenerics, reason)
  } else if (assignTo.isLiteral()) {
    return why(
      false,
      `'${testType}' is not assignable to literal type '${assignTo.valueType().is}'`,
    )
  } else if (testType.isFloat() && assignTo.isFloat()) {
    // canBeAssignedToFloat checks the narrowed types,
    // and whether testType canBeAssignedTo assignTo (Int can be assigned to Float,
    // but Float cannot be assigned to Int)
    return canBeAssignedToFloat(testType, assignTo)
  } else if (testType.isString() && assignTo.isString()) {
    // canBeAssignedToString checks the narrowed types,
    return canBeAssignedToString(testType, assignTo)
  } else if (testType instanceof ArrayType && assignTo instanceof ArrayType) {
    // checks only the narrowed types
    if (!canBeAssignedToArray(testType, assignTo)) {
      return why(false, `Incompatible array types '${testType}' and '${assignTo}'`)
    }

    return why(
      canBeAssignedTo(testType.of, assignTo.of, resolvedGenerics, reason),
      `Incompatible array types '${testType}' and '${assignTo}'`,
    )
  } else if (testType instanceof DictType && assignTo instanceof DictType) {
    if (!canBeAssignedToDict(testType, assignTo)) {
      return why(false, `Incompatible dict types '${testType}' and '${assignTo}'`)
    }

    return why(
      canBeAssignedTo(testType.of, assignTo.of, resolvedGenerics, reason),
      `Incompatible dict types '${testType}' and '${assignTo}'`,
    )
  } else if (testType instanceof SetType && assignTo instanceof SetType) {
    if (!canBeAssignedToSet(testType, assignTo)) {
      return why(false, `Incompatible set types '${testType}' and '${assignTo}'`)
    }

    return why(
      canBeAssignedTo(testType.of, assignTo.of, resolvedGenerics, reason),
      `Incompatible set types '${testType}' and '${assignTo}'`,
    )
  } else if (testType instanceof ObjectType && assignTo instanceof ObjectType) {
    const assignToTupleProps: PositionalProp[] = []
    const assignToNamedProps: NamedProp[] = []
    for (const prop of assignTo.props) {
      if (prop.is === 'positional') {
        assignToTupleProps.push(prop)
      } else {
        assignToNamedProps.push(prop)
      }
    }

    const testTupleProps: PositionalProp[] = []
    const testNamedProps: NamedProp[] = []
    for (const prop of testType.props) {
      if (prop.is === 'positional') {
        testTupleProps.push(prop)
      } else {
        testNamedProps.push(prop)
      }
    }

    // every prop in testType also in assignTo must be assignable
    for (const {name, type: assignType} of assignToNamedProps) {
      const testProp = testType.literalAccessType(name) ?? NullType
      if (!canBeAssignedTo(testProp, assignType, resolvedGenerics, reason)) {
        return why(
          false,
          `Incompatible types in object property '${name}'. '${testProp.toCode()}' cannot be assigned to '${assignType.toCode()}'`,
        )
      }
    }

    for (const [index, {type: assignType}] of assignToTupleProps.entries()) {
      const testProp = testType.literalAccessType(index)
      if (testProp && !canBeAssignedTo(testProp, assignType, resolvedGenerics, reason)) {
        return why(
          false,
          `Incompatible types in object at index '${index}'. '${testProp.toCode()}' cannot be assigned to '${assignType.toCode()}'`,
        )
      }
    }

    return true
  } else if (testType instanceof ClassType && assignTo instanceof ClassType) {
    // quick test if assignTo is a parent type of testType
    let parent: ClassType | undefined = testType
    while (parent) {
      if (parent === assignTo) {
        return true
      }
      parent = parent.parent
    }

    // every prop in testType also in assignTo must be assignable
    for (const [name, assignType] of assignTo.props.entries()) {
      const testProp = testType.propAccessType(name) ?? NullType
      if (!canBeAssignedTo(testProp, assignType, resolvedGenerics, reason)) {
        return why(false, `Incompatible types in object property '${name}'`)
      }
    }

    return true
  } else if (testType instanceof FormulaType && assignTo instanceof FormulaType) {
    const errorMessage = canBeAssignedToFormula(testType, assignTo, resolvedGenerics)
    return why(errorMessage === undefined, errorMessage ?? '')
  }

  return why(false, `Type '${testType}' cannot be assigned to '${assignTo}'`)
}

function canBeAssignedToFloat(
  testType: LiteralFloatType | MetaFloatType | MetaIntType,
  assignTo: LiteralFloatType | MetaFloatType | MetaIntType,
) {
  if (assignTo instanceof LiteralFloatType) {
    if (testType instanceof LiteralIntType) {
      return testType.value === assignTo.value
    } else if (testType instanceof LiteralFloatType) {
      return !(assignTo instanceof LiteralIntType) && testType.value === assignTo.value
    }

    if (assignTo instanceof LiteralIntType && !(testType instanceof MetaIntType)) {
      return false
    }

    return Narrowed.testNumber(testType.narrowed, {
      min: assignTo.value,
      max: assignTo.value,
    })
  }

  if (testType instanceof LiteralIntType) {
    return Narrowed.testNumber({min: testType.value, max: testType.value}, assignTo.narrowed)
  } else if (testType instanceof LiteralFloatType) {
    return (
      !(assignTo instanceof MetaIntType) &&
      Narrowed.testNumber({min: testType.value, max: testType.value}, assignTo.narrowed)
    )
  }

  if (assignTo instanceof MetaIntType && !(testType instanceof MetaIntType)) {
    return false
  }

  return Narrowed.testNumber(testType.narrowed, assignTo.narrowed)
}

function canBeAssignedToString(
  testType: LiteralStringType | MetaStringType,
  assignTo: LiteralStringType | MetaStringType,
) {
  if (assignTo instanceof LiteralStringType) {
    if (testType instanceof LiteralStringType) {
      return testType.value === assignTo.value
    }

    return false
  }

  if (testType instanceof LiteralStringType) {
    if (!Narrowed.testLength(testType.length, assignTo.narrowedString.length)) {
      return false
    }

    return Narrowed.testRegex(testType.value, assignTo.narrowedString.regex)
  }

  if (assignTo.narrowedString.regex.length) {
    return false
  }

  if (!Narrowed.testLength(testType.narrowedString.length, assignTo.narrowedString.length)) {
    return false
  }

  return true
}

function canBeAssignedToArray(testType: ArrayType, assignTo: ArrayType) {
  if (!Narrowed.testLength(testType.narrowedLength, assignTo.narrowedLength)) {
    return false
  }

  return true
}

function canBeAssignedToDict(testType: DictType, assignTo: DictType) {
  if (!Narrowed.testLength(testType.narrowedLength, assignTo.narrowedLength)) {
    return false
  }

  if (!Narrowed.testNames(testType.narrowedNames, assignTo.narrowedNames)) {
    return false
  }

  return true
}

function canBeAssignedToSet(testType: SetType, assignTo: SetType) {
  if (!Narrowed.testLength(testType.narrowedLength, assignTo.narrowedLength)) {
    return false
  }

  return true
}

/**
 * "concrete" types (anything but a formula) can resolve a generic.
 * formula *return values* can resolve a generic, but arguments can only add
 * *requirements* to a generic.
 *
 * For instance, if we are executing the formula
 *     run<T>(fn: fn(#input: T): Int, #arg: T)
 * and we are resolving the first argument, say we get the function
 *     toInt(#input: String | Float): Int
 *
 * This function is compatible with `(#input: T): Int`, but doesn't resolve the type T,
 * it just adds a requirement that T be String | Float
 *
 * The next argument, `#arg: T` is expected to resolve T.
 *     #arg: Int --> T : Int
 *     #arg: String --> T : String
 *     #arg: Float --> T : Float
 *     #arg: String | Int --> T : String | Int
 *
 * Formula arguments must resolve all of their generics, but they need not resolve
 * the *formulaArgumentType*'s generics. For instance
 *
 *     run<T, U>(#fn: fn(#input: T): U, #arg: T)
 *
 * Can be "resolved" with the identity function `<W>(input: W): W`. When the first
 * argument resolves, `resolveGenerics` will return the formula `(input: T): T`,
 * "resolved" with the generics from formulaArgumentType. And the return type resolves
 * `U` to be whatever T *eventually* becomes.
 *
 *     T --> [unresolved]
 *     U --> T "resolved"
 *
 * The next argument, `#arg: T`, will resolve T to something concrete.
 */
export function checkFormulaArguments(
  assignToFormula: FormulaType,
  positionsLength: number,
  names: string[],
  argumentAt: (position: number) => Type | undefined,
  argumentsNamed: (name: string) => Type[],
  // array of arguments passed in via `...spread`
  spreadPositionalArguments: Type[],
  spreadDictArguments: Map<string, Type[]>,
  keywordListArguments: Type[],
  resolvedGenerics?: Map<GenericType, GenericType>,
) {
  const errorMessages = _checkFormulaArguments(
    assignToFormula,
    positionsLength,
    names,
    argumentAt,
    argumentsNamed,
    spreadPositionalArguments,
    spreadDictArguments,
    keywordListArguments,
    () => true,
    resolvedGenerics,
    true,
  )

  if (!errorMessages.length && resolvedGenerics?.size) {
    for (const generic of resolvedGenerics.values()) {
      const result = generic.resolveSelf()
      if (result.isErr()) {
        return result.error
      }
    }
  }

  return combineErrorMessages(errorMessages)
}

/**
 * Checks that the formula *implementation* is compatible with a formula *definition*.
 *
 * - formula *implementation* is the argument being passed as an argument
 * - formula *definition* is the expected FormulaType, as defined by the receiving formula
 *
 *     let
 *       mapFunc = fn(#a: Int, #b: Int) => a * b
 *       --        ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ implementation
 *       fn mapNumbers(#func: fn(#a: Int, #b): Int) => func(1, 2)
 *       --            ^^^^^^^^^^^^^^^^^^^^^^^^^^^ definition
 *     in
 *       mapNumbers(mapFunc)
 *       --> `mapFunc` is type checked against the `#func` argument type
 *
 * @param formulaArgument The function being passed as an argument
 * @param formulaType The expected formula type
 */
function canBeAssignedToFormula(
  formulaArgument: FormulaType,
  formulaType: FormulaType,
  resolvedGenerics?: Map<GenericType, GenericType>,
) {
  const positionsLength = formulaType.args.reduce(
    (count, arg) => (arg.is === 'positional-argument' ? count + 1 : count),
    0,
  )
  const names = formulaType.args.flatMap(arg => (arg.is === 'named-argument' ? [arg.alias] : []))
  const errorMessages = _checkFormulaArguments(
    formulaArgument,
    positionsLength,
    names,
    function argumentAt(position: number) {
      return formulaType.positionalArg(position)?.type
    },
    function argumentsNamed(name: string) {
      const type = formulaType.namedArg(name)?.type
      return type ? [type] : []
    },
    // spreadPositionalArguments:
    [],
    // spreadDictArguments:
    new Map(),
    // keywordListArguments
    [],
    function isRequired(id: string | number) {
      if (typeof id === 'number') {
        return formulaType.positionalArg(id)?.isRequired ?? false
      } else {
        return formulaType.namedArg(id)?.isRequired ?? false
      }
    },
    resolvedGenerics,
    false,
  )

  if (!canBeAssignedTo(formulaArgument.returnType, formulaType.returnType, resolvedGenerics)) {
    const returnTypeMessage = `Return type '${formulaArgument.returnType}' cannot be assigned to '${formulaType.returnType}'.`
    errorMessages.push(returnTypeMessage)
  }

  const errorMessage = combineErrorMessages(errorMessages)
  if (errorMessage) {
    return errorMessage
  }
}

/**
 * This function works *opposite* to how you might think.
 *
 * It is called from two places:
 * - canBeAssignedToFormula (above)
 * - functionInvocationOperatorType (operators.ts)
 *
 * When it is called from `canBeAssignedToFormula`, it is called with the *formula
 * instance* being passed in as `formulaBeingCalled` and the *formula type*'s
 * arguments being checked.
 *
 * It takes a second to figure out why.
 *
 * Imagine a formula is being passed as an argument that expects an int-to-string
 * mapping function. Here, `intToString` is the "outer" formula, which expects a
 * formula.
 *
 *     intToString: fn(#originalMap fn(#a: Int): String ) =>
 *       originalMap(0)
 *
 *     let
 *       myMap = fn(a: Int | String) => $a
 *     in
 *       intToString(myMap)
 *
 * This means that when `myMap` is called, it will be called *as if it is the
 * `originalMap` function. So ask yourself, should we check that `Int|String` can
 * be assigned to `Int`? Or the opposite; that `Int` can be assigned to `Int |
 * String`. The latter; `originalMap` will be called with an `Int` *only*.
 *
 * This also has implications for another feature we see above: myMap is defined
 * with only named arguments, but originalMap is called with positional arguments.
 *
 * So we need to verify that if myMap (`formulaBeingCalled`) only expects named
 * arguments, but the arguments are all positional, the named arguments are
 * *treated like* positional arguments.
 */
function _checkFormulaArguments(
  formulaBeingCalled: FormulaType,
  positionsLength: number,
  namedArgs: string[],
  argumentAt: (position: number) => Type | undefined,
  argumentsNamed: (name: string) => Type[],
  spreadPositionalArguments: Type[],
  spreadDictArguments: Map<string, Type[]>,
  keywordListArguments: Type[],
  isRequired: (id: string | number) => boolean,
  resolvedGenerics: Map<GenericType, GenericType> | undefined,
  useHints: boolean,
): string[] {
  // short-circuit the special case of all-named-expected and all-positional-provided
  if (
    // all named expected?
    formulaBeingCalled.args.every(arg => arg.is === 'named-argument') &&
    // and all positional provided?
    namedArgs.length === 0 &&
    positionsLength
  ) {
    const expectedNames = formulaBeingCalled.args.map(({alias}) => alias)
    return _checkFormulaArguments(
      formulaBeingCalled,
      0,
      expectedNames,
      function argumentAt_(position) {
        return undefined
      },
      function argumentsNamed(name) {
        const index = expectedNames.indexOf(name)
        const argument = argumentAt(index)
        return argument ? [argument] : []
      },
      spreadPositionalArguments,
      spreadDictArguments,
      keywordListArguments,
      function isRequired_(id) {
        if (typeof id === 'number') {
          return false
        }
        const index = expectedNames.indexOf(id)
        return isRequired(index)
      },
      resolvedGenerics,
      useHints,
    )
  }

  const errors: string[] = []
  const reason = {reason: ''}
  let position = 0
  const remainingNames: Set<string> = new Set(namedArgs)

  for (const formulaArgument of formulaBeingCalled.args) {
    let argumentType: Type | undefined
    let argumentIsRequired: boolean
    if (formulaArgument.is === 'positional-argument') {
      argumentType = argumentAt(position)
      argumentIsRequired = isRequired(position)
      position += 1
    } else if (formulaArgument.is === 'named-argument') {
      const {argumentType: argumentType_, argumentIsRequired: argumentIsRequired_} =
        namedArgumentType(argumentsNamed, isRequired, formulaArgument.alias, errors, remainingNames)

      argumentType = argumentType_
      argumentIsRequired = argumentIsRequired_
    } else if (formulaArgument.is === 'spread-positional-argument') {
      const {type, argumentIsRequired: argumentIsRequired_} = spreadPositionalArgumentType(
        position,
        positionsLength,
        argumentAt,
        isRequired,
        spreadPositionalArguments,
      )

      position = positionsLength
      argumentType = type
      argumentIsRequired = argumentIsRequired_
    } else if (formulaArgument.is === 'repeated-named-argument') {
      argumentType = repeatedNamedArgumentType(argumentsNamed, formulaArgument, remainingNames)
      argumentIsRequired = isRequired(formulaArgument.alias)
    } else if (formulaArgument.is === 'kwarg-list-argument') {
      argumentType = kwargListArgumentType(
        argumentsNamed,
        errors,
        keywordListArguments,
        remainingNames,
      )
      argumentIsRequired = false
    } else {
      throw formulaArgument
    }

    if (!argumentType) {
      if (formulaArgument.isRequired) {
        if (formulaArgument.alias) {
          errors.push(missingNamedArgumentInFormulaError(formulaBeingCalled, formulaArgument.alias))
        } else {
          errors.push(outOfArgumentsMessageError(formulaBeingCalled, position))
        }
      }

      continue
    } else if (!canBeAssignedTo(argumentType, formulaArgument.type, resolvedGenerics, reason)) {
      if (reason.reason) {
        errors.push(reason.reason)
        reason.reason = ''
      }

      if (formulaArgument.alias) {
        errors.push(
          cannotAssignToNamedArgumentError(
            argumentType,
            formulaArgument.type,
            formulaArgument.alias,
          ),
        )
      } else {
        errors.push(
          cannotAssignToPositionalArgumentError(argumentType, formulaArgument.type, position),
        )
      }
    } else if (formulaArgument.type.isGeneric() && resolvedGenerics) {
      if (useHints) {
        addHint(formulaArgument.type, argumentType, resolvedGenerics)
      } else {
        addRequirement(formulaArgument.type, argumentType, resolvedGenerics)
      }
    } else if (!argumentIsRequired && formulaArgument.isRequired) {
      if (formulaArgument.alias) {
        errors.push(
          requiredArgumentError(formulaArgument.alias, formulaArgument.type, formulaBeingCalled),
        )
      } else {
        errors.push(requiredArgumentError(position, formulaArgument.type, formulaBeingCalled))
      }
    }
  }

  return errors
}

function namedArgumentType(
  argumentsNamed: (name: string) => Type[],
  isRequired: (id: string | number) => boolean,
  alias: string,
  errors: string[],
  remainingNames: Set<string>,
) {
  const argumentTypes = argumentsNamed(alias)
  if (argumentTypes.length > 1) {
    errors.push(`Multiple arguments named '${alias}' provided. Only one is expected.`)
    return {argumentType: undefined, argumentIsRequired: false}
  } else {
    const argumentType = argumentTypes[0]
    const argumentIsRequired = isRequired(alias)
    remainingNames.delete(alias)
    return {argumentType, argumentIsRequired}
  }
}

function spreadPositionalArgumentType(
  position: number,
  positionsLength: number,
  argumentAt: (position: number) => Type | undefined,
  isRequired: (id: string | number) => boolean,
  spreadPositionalArguments: Type[],
) {
  // all remaining positional args need to be of type formulaArgument.type
  let type: Type = AlwaysType
  let argumentIsRequired = true
  for (let positionIndex = position; positionIndex < positionsLength; ++positionIndex) {
    const argTypeAtIndex = argumentAt(positionIndex)
    if (!argTypeAtIndex) {
      throw `Weird, positionsLength is ${positionsLength}, but no argument at position ${positionIndex}`
    }
    type = compatibleWithBothTypes(type, argTypeAtIndex)
    argumentIsRequired = argumentIsRequired && isRequired(positionIndex)
  }

  for (const spreadPositionalType of spreadPositionalArguments) {
    type = compatibleWithBothTypes(type, spreadPositionalType)
  }
  return {type: new ArrayType(type), argumentIsRequired}
}

function repeatedNamedArgumentType(
  argumentsNamed: (name: string) => Type[],
  formulaArgument: RepeatedNamedArgument,
  remainingNames: Set<string>,
) {
  remainingNames.delete(formulaArgument.alias)
  const argumentTypes = argumentsNamed(formulaArgument.alias)
  if (!argumentTypes.length) {
    return undefined
  }

  let type: Type = AlwaysType
  for (const argType of argumentTypes) {
    type = compatibleWithBothTypes(type, argType)
  }
  return new ArrayType(type)
}

function kwargListArgumentType(
  argumentsNamed: (name: string) => Type[],
  errors: string[],
  keywordListArguments: Type[],
  remainingNames: Set<string>,
) {
  let type: Type = AlwaysType
  for (const argName of remainingNames) {
    remainingNames.delete(argName)
    const argTypes = argumentsNamed(argName)
    if (argTypes.length > 1) {
      errors.push(`Multiple arguments named '${argName}' provided. Only one is expected.`)
      break
    } else if (argTypes.length === 0) {
      throw 'impossible'
    }
    type = compatibleWithBothTypes(type, argTypes[0])
  }

  for (const keywordListType of keywordListArguments) {
    type = compatibleWithBothTypes(type, keywordListType)
  }

  return new DictType(type)
}

export function combineErrorMessages(errorMessages: string[]) {
  const errorCount = errorMessages.length
  if (errorCount === 0) {
    return
  }

  if (errorCount === 1) {
    return errorMessages[0]
  }

  let errorMessage = `Multiple argument errors:\n- `
  errorMessage += errorMessages
    .flatMap(errorMessage => {
      if (errorMessage.startsWith('Multiple argument errors:')) {
        return errorMessage
          .split('\n')
          .slice(1)
          .map(message => message.replace(/^- /, ''))
      } else {
        return errorMessage
      }
    })
    .join('\n- ')
  return errorMessage
}

export function outOfArgumentsMessageError(formulaArgumentType: Type, position: number) {
  let errorMessage = `Expected argument at position #${position + 1}`
  errorMessage += ` of type '${formulaArgumentType.toCode()}'`

  return errorMessage
}

export function missingNamedArgumentInFormulaError(formulaArgumentType: Type, name: string) {
  let errorMessage = `Expected argument named ${name}`
  errorMessage += ` of type '${formulaArgumentType.toCode()}'`

  return errorMessage
}

export function cannotAssignToPositionalArgumentError(
  testType: Type,
  assignTo: Type,
  position: number,
) {
  return `Incorrect type for argument #${position + 1}. ${cannotAssignToError(testType, assignTo)}`
}

export function cannotAssignToNamedArgumentError(testType: Type, assignTo: Type, name: string) {
  return `Incorrect type for argument '${name}'. ${cannotAssignToError(testType, assignTo)}`
}

export function requiredArgumentError(
  id: string | number,
  assignTo: Type,
  formulaType: FormulaType,
) {
  const argDesc = typeof id === 'number' ? `at position #${id + 1}` : `named '${id}'`
  return `Argument ${argDesc} of type '${assignTo}' is required in '${formulaType}', but is being called optionally`
}

export function cannotAssignToError(testType: Type, assignTo: Type) {
  return `Type '${testType.toCode()}' cannot be assigned to '${assignTo.toCode()}'.`
}

/**
 * Called from "container" types, e.g. Array calls this as with its 'of' type. If
 * the of type is a generic, and is resolved, then a new array type is created
 * (`mappedType`). If the type is unchanged, we return the originalType.
 *
 * @example
 *     // this: Array(T)
 *     maybeResolve(this.of, this, type => new ArrayType(type), resolvedGenerics)
 */
function maybeResolve(
  maybeGeneric: Type,
  originalType: Type,
  mappedType: (resolved: Type) => Type,
  resolvedGenerics: Map<GenericType, GenericType>,
) {
  return maybeGeneric.resolve(resolvedGenerics).map(type => {
    if (type === maybeGeneric) {
      return originalType
    } else {
      return mappedType(type)
    }
  })
}

function addHint(
  generic: GenericType,
  type: Type,
  resolvedGenerics?: Map<GenericType, GenericType>,
) {
  resolvedGenerics?.get(generic)?.hints.push(type)
}

function addRequirement(
  generic: GenericType,
  type: Type,
  resolvedGenerics?: Map<GenericType, GenericType>,
) {
  resolvedGenerics?.get(generic)?.requirements.push(type)
}

// register props with types
// registering them here avoids issues with ordering the construction of types
// above
;(() => {
  /*            */
  /* NullType */
  /*            */
  MetaNullType.types = {}

  /*           */
  /* ArrayType */
  /*           */
  ArrayType.types = {
    length: () => IntType,
    map: (of: Type) =>
      withGenericT(genericT =>
        namedFormula(
          'map',
          [
            positionalArgument({
              name: FN,
              type: formula(
                [
                  positionalArgument({name: 'input', type: of, isRequired: true}),
                  positionalArgument({name: 'index', type: IntType, isRequired: true}),
                ],
                genericT,
              ),
              isRequired: true,
            }),
          ],
          genericT,
          [genericT],
        ),
      ),
  }

  /*           */
  /* DictType */
  /*           */
  DictType.types = {
    length: () => IntType,
    map: (of: Type) =>
      withGenericT(genericT =>
        namedFormula(
          'map',
          [
            positionalArgument({
              name: FN,
              type: formula(
                [
                  positionalArgument({name: 'input', type: of, isRequired: true}),
                  positionalArgument({name: 'index', type: StringType, isRequired: true}),
                ],
                genericT,
              ),
              isRequired: true,
            }),
          ],
          genericT,
          [genericT],
        ),
      ),
  }

  /*           */
  /* ObjectType */
  /*           */
  ObjectType.types = {}

  /*           */
  /* ClassType */
  /*           */
  ClassType.types = {}

  /*            */
  /* BooleanType */
  /*            */
  MetaBooleanType.types = {}

  /*            */
  /* NumberType */
  /*            */
  const roundStrategy = oneOf([
    literal('default'), // default rounding, rounds "toward infinity" in the case of 0.5
    literal('down'), // 0.5 rounds to smaller number
    literal('up'), // 0.5 rounds to larger number
    literal('toward-zero'), // 0.5 rounds to smaller number, or larger number if <0
    literal('toward-infinity'), // 0.5 rounds to larger number, or smaller number if <0
    literal('even'), // 0.5 rounds to nearest even number
    literal('odd'), // 0.5 rounds to nearest odd number
  ])

  MetaFloatType.types = {
    round: () =>
      namedFormula(
        'round',
        [positionalArgument({name: 'strategy', type: roundStrategy, isRequired: true})],
        IntType,
      ),
  }

  MetaIntType.types = {
    round: () =>
      namedFormula(
        'round',
        [positionalArgument({name: 'strategy', type: roundStrategy, isRequired: true})],
        IntType,
      ),
    // 5.times(fn(Int): T): T[]
    times: () =>
      withGenericT(genericT =>
        formula(
          [
            positionalArgument({
              name: 'do',
              type: formula(
                [positionalArgument({name: 'index', type: IntType, isRequired: true})],
                genericT,
              ),
              isRequired: true,
            }),
          ],
          array(genericT),
          [genericT],
        ),
      ),
  }

  /*            */
  /* StringType */
  /*            */
  MetaStringType.types = {
    // length: Int
    length: () => IntType,
    // mapChars(fn: fn(input: String): T): T[]
    mapChars: () =>
      withGenericT(genericT =>
        formula(
          [
            positionalArgument({
              name: FN,
              type: formula(
                [positionalArgument({name: 'input', type: StringType, isRequired: true})],
                genericT,
              ),
              isRequired: true,
            }),
          ],
          genericT,
          [genericT],
        ),
      ),
    // flatMapChars(fn: fn(input: String): T[]): T[]
    flatMapChars: () =>
      withGenericT(genericT =>
        formula(
          [
            positionalArgument({
              name: FN,
              type: formula(
                [positionalArgument({name: 'input', type: StringType, isRequired: true})],
                genericT,
              ),
              isRequired: true,
            }),
          ],
          genericT,
          [genericT],
        ),
      ),
    // compactMapChars(fn: fn(input: String): T | null): T[]
    compactMapChars: () =>
      withGenericT(genericT =>
        formula(
          [
            positionalArgument({
              name: FN,
              type: formula(
                [positionalArgument({name: 'input', type: StringType, isRequired: true})],
                oneOf([genericT, NullType]),
              ),
              isRequired: true,
            }),
          ],
          genericT,
          [genericT],
        ),
      ),
    // indexOf(String): Int | null
    indexOf: () =>
      namedFormula(
        'indexOf',
        [positionalArgument({name: 'input', type: StringType, isRequired: true})],
        oneOf([IntType, NullType]),
      ),
    // repeat(number): String
    repeat: () =>
      namedFormula(
        'repeat',
        [positionalArgument({name: 'times', type: IntType, isRequired: true})],
        StringType,
      ),
    // prepend(String): String
    prepend: () =>
      namedFormula(
        'prepend',
        [positionalArgument({name: 'input', type: StringType, isRequired: true})],
        StringType,
      ),
    // insert(String, at: Int): String
    insert: () =>
      namedFormula(
        'insert',
        [
          positionalArgument({name: 'input', type: StringType, isRequired: true}),
          namedArgument({name: 'at', type: IntType, isRequired: true}),
        ],
        StringType,
      ),
    // replace(String, with: String): String
    replace: () =>
      namedFormula(
        'replace',
        [
          positionalArgument({name: 'input', type: StringType, isRequired: true}),
          namedArgument({name: 'with', type: StringType, isRequired: true}),
        ],
        StringType,
      ),
    // substr(Int, length?: Int): String
    substr: () =>
      namedFormula(
        'substr',
        [
          positionalArgument({name: 'start', type: StringType, isRequired: true}),
          namedArgument({name: 'length', type: optional(IntType), isRequired: false}),
        ],
        StringType,
      ),
    // split(pattern, max?: Int): [String]
    split: () =>
      namedFormula(
        'split',
        [
          positionalArgument({
            name: 'pattern',
            type: oneOf([StringType, RegexType]),
            isRequired: true,
          }),
          namedArgument({name: 'max', type: optional(IntType), isRequired: false}),
        ],
        array(StringType),
      ),
    // hasPrefix(String): Boolean
    hasPrefix: () =>
      namedFormula(
        'hasPrefix',
        [positionalArgument({name: 'input', type: StringType, isRequired: true})],
        BooleanType,
      ),
    // hasSuffix(String): Boolean
    hasSuffix: () =>
      namedFormula(
        'hasSuffix',
        [positionalArgument({name: 'input', type: StringType, isRequired: true})],
        BooleanType,
      ),
    // hasSubstr(String): Boolean
    hasSubstr: () =>
      namedFormula(
        'hasSubstr',
        [positionalArgument({name: 'input', type: StringType, isRequired: true})],
        BooleanType,
      ),
  }

  /*           */
  /* RegexType */
  /*           */
  const RegexMatch = namedClass(
    'RegexMatch',
    new Map([
      // int-based group
      // match.at(0) --> String | null
      [
        'at',
        namedFormula(
          'at',
          [positionalArgument({name: 'index', type: IntType, isRequired: true})],
          optional(StringType),
        ),
      ],
      // named-group
      // match.at(0) --> String | null
      [
        'named',
        namedFormula(
          'named',
          [positionalArgument({name: 'name', type: StringType, isRequired: true})],
          optional(StringType),
        ),
      ],
    ]),
  )

  MetaRegexType.types = {
    // pattern: String
    pattern: () => StringType,
    // runs a regex against a String, returning a RegexMatch or null
    match: () =>
      namedFormula(
        'match',
        [positionalArgument({name: 'input', type: StringType, isRequired: true})],
        optional(RegexMatch),
      ),
    // runs a regex against a String, using global regex, and returning a list of matches (no groups)
    allMatches: () =>
      namedFormula(
        'allMatches',
        [positionalArgument({name: 'input', type: StringType, isRequired: true})],
        array(StringType),
      ),
    // runs a regex against a String, if if finds a match, it runs the named or indexed group
    matchGroup: () =>
      namedFormula(
        'matchGroup',
        [
          positionalArgument({name: 'input', type: StringType, isRequired: true}),
          positionalArgument({name: 'group', type: oneOf([IntType, StringType]), isRequired: true}),
        ],
        optional(StringType),
      ),
  }
})()
