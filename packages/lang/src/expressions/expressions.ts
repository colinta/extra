import {err, mapAll, mapMany, ok, type Result} from '@extra-lang/result'

import {
  indent,
  MAX_INNER_LEN,
  MAX_LEN,
  NEWLINE_INDENT,
  wrapStrings,
  difference,
  union,
  SMALL_LEN,
} from '@/util'
import {type Scope} from '@/scope'
import {
  type TypeRuntime,
  type ValueRuntime,
  MutableTypeRuntime,
  MutableValueRuntime,
} from '@/runtime'
import * as Types from '@/types'
import * as Nodes from '@/nodes'
import * as Values from '@/values'
import * as Narrowed from '@/narrowed'
import {
  assignRelationshipsToRuntime,
  combineEitherTypeRuntimes,
  invertSymbol,
  type Relationship,
  relationshipFormula,
  isAssign,
  relationshipToType,
  type RelationshipFormula,
  type RelationshipAssign,
} from '@/relationship'
import {
  type Comment,
  type Operator,
  type GetTypeResult,
  type GetValueResult,
  type GetNodeResult,
  type GetValueRuntimeResult,
  type GetRuntimeResult,
} from '@/formulaParser/types'
import {
  ARG_SEPARATOR,
  DICT_SEPARATOR,
  ENUM_START,
  STATE_START,
  SPREAD_OPERATOR,
  KWARG_OPERATOR,
} from '@/formulaParser/grammars'

export type Range = [number, number]
const HIGHEST_PRECEDENCE = 100

/**
 * Modules consist of Statements (ProvidesStatement, RequiresStatement,
 * ImportStatement) and Definitions (TypeDefinition, ViewDefinition,
 * EnumDefinition, ClassDefinition, HelperDefinition).
 *
 * Definitions have a 'name' and 'isExport' property
 */
export interface Definition {
  get isExport(): boolean
  get name(): string
}

/**
 * Generic catch-all error type that I need to improve if I want better error
 * messages.
 */
export class RuntimeError extends Error {
  parents: Expression[] = []

  constructor(
    readonly reference: Expression,
    public message: string,
    readonly children: RuntimeError[] = [],
  ) {
    super()
    this.parents.push(reference)
    this.message += `\n${reference.constructor.name}: ` + reference.toCode()
  }

  pushParent(parent: Expression) {
    this.parents.push(parent)
    this.message += `\n${parent.constructor.name}: ` + parent.toCode()
  }

  toString() {
    return this.message
  }
}

/**
 * Raised from ReferenceExpression and others when a variable refers to
 * something in scope that isn't available.
 */
export class ReferenceRuntimeError extends RuntimeError {
  constructor(
    readonly reference: Reference,
    message: string,
    children: RuntimeError[] = [],
  ) {
    super(reference, message, children)
  }
}

/**
 * Raised from PropertyAccessOperator and others when the property doesn't exist
 * on the receiver.
 */
export class PropertyAccessRuntimeError extends RuntimeError {
  constructor(
    readonly lhsExpression: Expression,
    readonly lhsType: Types.Type,
    readonly rhsExpression: Expression,
    readonly rhsName: string,
    message: string,
    children: RuntimeError[] = [],
  ) {
    super(rhsExpression, message, children)
  }
}

/**
 * Raised from FunctionInvocationOperator when the rhs is not invocable.
 */
export class FunctionInvocationRuntimeError extends RuntimeError {
  constructor(
    readonly lhsExpression: Expression,
    readonly lhsType: Types.Type,
    readonly rhsExpression: Expression,
    message: string,
    children: RuntimeError[] = [],
  ) {
    super(rhsExpression, message, children)
  }
}

export function isRuntimeError(error: any): error is RuntimeError {
  return error instanceof RuntimeError
}

/**
 * Each Expression represents a section of code, like a number, reference, or
 * compound expressions like Arrays, Objects, etc. They store references to the
 * original source, so that error messages can reference the code by line and
 * character.
 *
 * Expressions are compiled, which emit Node objects. Nodes are annotated with a
 * type (all Nodes have a type, which makes them not quite 1:1 with
 * Expressions), and can be compiled into more useful outputs, like normalized
 * code, JavaScript, WASM (one day!), etx.
 */
export abstract class Expression {
  constructor(
    readonly range: Range,
    /**
     * Comments are stored in a buffer when they are skipped as whitespace, and
     * when a new expression is reached, the buffer is cleared and passed in as
     * `precedingComments`.
     */
    public precedingComments: Comment[],
    /**
     * These are most often comments attached to the same line as the expression.
     */
    public followingComments: Comment[] = [],
  ) {
    Object.defineProperty(this, 'precedingComments', {enumerable: false})
    Object.defineProperty(this, 'followingComments', {enumerable: false})
    Object.defineProperty(this, 'range', {enumerable: false})
  }

  /**
   * Returns the names of all the variables this expression refers to.
   *
   * `parentScopes` is used to resolve static property access. ie.
   *
   *     namespace Extra {
   *       class Special {
   *         -- parentScopes => ['Extra', 'Special']
   *         -- in this scope, all of these refer to (and depend on) the same
   *         -- variable 'user'
   *
   *         static A = user
   *                    --> Reference('user').dependencies() -> Set('user')
   *         static A = Special.user
   *                    --> Reference('user').dependencies() -> Set('user')
   *         static A = Extra.Special.user
   *                    --> Reference('user').dependencies() -> Set('user')
   *       }
   *     }
   *
   * This is used mostly in PropertyAccessOperator.
   */
  dependencies(_parentScopes: Scope[]): Set<string> {
    return new Set()
  }

  /**
   * Returns the names of all the variables this expression provides
   */
  provides(): Set<string> {
    return new Set()
  }

  /**
   * Operations that need to walk the AST tree can use this function to do so -
   * simple searches are made tricky because many expressions add new context to
   * the runtime - `let`, `case`, function arguments, etc.
   */
  childExpressions(): Expression[] {
    return []
  }

  /**
   * Walks the expression tree and reduces the children to a single value - or
   * preforms a search. This function applies the search function to the current
   * Expression and its children, accumulating a return value. The search
   * function returns the accumulator and a stop value of `'stop'|'continue'`,
   * which indicates whether to stop searching that branch of the expression
   * tree.
   *
   * There is also a 'context' variable that is passed to child expressions.
   *
   * For example, if you are looking for references to a specific name, you
   * should return `'stop'` for the stop value when you reach a node that provides
   * that name.
   *
   *     if (expr.dependencies().has(searchName)) {
   *       expr.searchExpressions((nextExpr, acc, _context) => {
   *         if (nextExpr.provides().has(searchName)) {
   *           return ['continue', acc, _context]
   *         }
   *         if (nextExpr instanceof Reference && nextExpr.name == searchName) {
   *           // nextExpr refers to searchName
   *           return ['stop', nextExpr, _context]
   *         }
   *         return ['stop', acc, _context]
   *     }
   *
   * The search function is called breadth-first. The current Expression will be
   * passed, then its children, then the children of the first child, then the
   * children of the second child, etc, until `[false, T]` is returned.
   */
  searchExpressions<T, C>(
    searchFn: (expr: Expression, acc: T | undefined, context: C) => ['stop' | 'continue', T, C],
    context: C,
  ): T {
    const [stop, firstAcc, nextContext] = searchFn(this, undefined, context)
    if (stop === 'stop') {
      return firstAcc
    }

    let acc = firstAcc
    const childExpressions: [Expression, C][] = this.childExpressions().map(expr => [
      expr,
      nextContext,
    ])
    while (childExpressions.length) {
      const [child, context] = childExpressions.shift()!

      const [childStop, childAcc, nextContext] = searchFn(child, acc, context)
      acc = childAcc

      if (childStop === 'continue') {
        const next: [Expression, C][] = child.childExpressions().map(expr => [expr, nextContext])
        childExpressions.push(...next)
      }
    }

    return acc
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
   * For debugging purposes (makes it clear what was parsed / order of
   * operations)
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
   * The type of this expression
   */
  abstract getType(runtime: TypeRuntime): GetTypeResult
  getAsTypeExpression(_runtime: TypeRuntime): GetTypeResult {
    return err(new RuntimeError(this, `Invalid argument type ${this}`))
  }

  /**
   * The compiled "Node", which roughly corresponds to an expression, but
   * includes Type information.
   */
  compile(runtime: TypeRuntime): GetNodeResult {
    throw `compile is not yet implemented in ${this.constructor.name}`
  }

  /**
   * if `compile()` returns "the type of the runtime value", then
   * `compileAsTypeExpression` is "treat this as a type itself".
   *
   * The "type of an expression" can be different from the "type as type
   * expression".
   *
   * Literals have the same type as their type expression:
   * - `typeof 1` is `1` and
   * - `x: 1` says that x is `1`
   *
   * Other expressions like `1 | 2` are only meaningful as a type expression,
   * they don't have a runtime *value* and therefore don't have a `compile()`
   * implementation.
   *
   * Finally, type constructors have a runtime type (a function that returns an
   * instance of `T`) and as a type expression represent the type `T`
   */
  compileAsTypeExpression(_runtime: TypeRuntime): GetNodeResult {
    return err(new RuntimeError(this, `Invalid argument type ${this}`))
  }

  /**
   * Returns a Value for the expression. Literals return their literal value,
   * Operations perform their operation, etc.
   */
  abstract eval(runtime: ValueRuntime): GetValueResult

  /**
   * MatchExpressions return a modified runtime, effectively passing assignments
   * "sideways", very much unlike `let`, which only passes assignments "down"
   * (only the `body` receives the assignments - and, technically, subsequent
   * assignments within the same `let` expression).
   *
   * `evalReturningRuntime` is not called universally - it is only invoked from
   * `and`, `or`, `if`, `guard`, and `switch` expressions.
   */
  evalReturningRuntime(runtime: ValueRuntime): GetValueRuntimeResult {
    return this.eval(runtime).map(value => [value, runtime])
  }

  /**
   * After a type assertion or comparison, this will return a runtime with the
   * assertion stored. Only Reference and Property-access operators implement
   * this function. Used by 'and', 'or' and 'if'.
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
    const formula = this.relationshipFormula(runtime)
    if (!formula) {
      return ok([])
    }

    return ok([{formula, comparison: {operator: 'truthy'}}])
  }

  /**
   * 'and' operator uses this to find false assertions just like 'or' uses
   * gimmeTrueStuff to find true assertions.
   */
  gimmeFalseStuff(runtime: TypeRuntime): GetRuntimeResult<Relationship[]> {
    const formula = this.relationshipFormula(runtime)
    if (!formula) {
      return ok([])
    }

    return ok([{formula, comparison: {operator: 'falsey'}}])
  }

  /**
   * Ideally this would be an instanceof check on InclusionOperator, but then import
   * ordering would be impossible, so it's a method.
   */
  isInclusionOp(): this is Operation {
    return false
  }

  /**
   * Only `MatchExpression`s implement this - they return the names of the
   * variables that are introduced by the match. In `or` operations, unassigned
   * values (on one branch but not the other) are defaulted to `null`.
   */
  matchAssignReferences(): string[] {
    return []
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

  dependencies(parentScopes: Scope[]) {
    return allDependencies(this.args, parentScopes)
  }

  childExpressions() {
    return this.args
  }
}

//|
//|  Literal Expressions
//|

/**
 * Literal of any kind: Boolean, Int, Float, Regex, null.
 *
 * StringTemplateOperation is composed of StringLiteral and expressions.
 *
 * RegexLiteral is its own type because it stores capture group names (for use
 * in matching expressions).
 */
export abstract class Literal extends Expression {
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

  /**
   * Literals represent themself as a type... ie the literal `1` has type `1`,
   * and as a type expression `x: 1` it still represents `1`.
   */
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

export class LiteralNull extends Literal {
  readonly name = 'null'

  constructor(range: Range, precedingComments: Comment[]) {
    super(range, precedingComments, Values.NullValue)
  }

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

  compile(): GetNodeResult {
    return ok(new Nodes.LiteralNull(toSource(this)))
  }
}

export class LiteralTrue extends Literal {
  readonly name = 'true'
  readonly value: Values.BooleanValue

  constructor(range: Range, precedingComments: Comment[]) {
    super(range, precedingComments, Values.TrueValue)
    this.value = Values.TrueValue
  }

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
    return okBoolean(true)
  }

  compile() {
    return ok(new Nodes.LiteralTrue(toSource(this)))
  }
}

export class LiteralFalse extends Literal {
  readonly name = 'false'
  readonly value: Values.BooleanValue

  constructor(range: Range, precedingComments: Comment[]) {
    super(range, precedingComments, Values.FalseValue)
    this.value = Values.FalseValue
  }

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
    return okBoolean(false)
  }

  compile() {
    return ok(new Nodes.LiteralFalse(toSource(this)))
  }
}

export class LiteralFloat extends Literal {
  constructor(
    range: Range,
    precedingComments: Comment[],
    // TODO: refactor this to `number`, avoid Values.FloatValue
    readonly value: Values.FloatValue,
  ) {
    super(range, precedingComments, value)
  }

  compile() {
    return ok(new Nodes.LiteralFloat(toSource(this), this.value.value))
  }
}

export class LiteralInt extends Literal {
  constructor(
    range: Range,
    precedingComments: Comment[],
    // TODO: refactor this to `number/base`, avoid Values.FloatValue
    readonly value: Values.IntValue,
  ) {
    super(range, precedingComments, value)
  }

  compile() {
    return ok(new Nodes.LiteralInt(toSource(this), this.value.value, this.value.base))
  }
}

export class LiteralRegex extends Literal {
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

  compile() {
    return ok(new Nodes.LiteralRegex(toSource(this), this.pattern, this.flags, this.groups))
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
export class LiteralString extends Literal {
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

  compile() {
    const string = this.value.value
    const chars = this.value.chars
    return ok(new Nodes.LiteralString(toSource(this), string, chars))
  }
}

/**
 * A string literal starting with `:` and only containing letters, numbers, dashes,
 * and underscores.
 */
export class LiteralStringAtom extends LiteralString {
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
        if (it instanceof LiteralString) {
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
      if (arg instanceof LiteralString) {
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

  getSafeType(): Types.Type {
    let allLiterals = true
    let literal = ''
    const minLength = this.args.reduce((length, expression) => {
      if (!(expression instanceof LiteralString)) {
        allLiterals = false
        return length
      }
      literal += expression.value.value
      return length + expression.value.length
    }, 0)

    if (allLiterals) {
      return Types.literal(literal)
    }

    return Types.StringType.narrowLength(minLength, undefined)
  }

  // TODO: map over this.args and use the type information
  // literals => calculate exact length
  // containers => containing all literals?
  // strings => use min/max length
  // remaining => calculate min/max
  getType(): GetTypeResult {
    return ok(this.getSafeType())
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

  compile(runtime: TypeRuntime) {
    return mapAll(this.args.map(arg => arg.compile(runtime))).map(args =>
      ok(new Nodes.StringTemplate(toSource(this), args, this.getSafeType())),
    )
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

    // name doesn't exist, but @name does
    if (runtime.getStateType(this.name)) {
      return err(
        new ReferenceRuntimeError(
          this,
          `There is no reference in scope named '${this.name}', did you mean '@${this.name}'?`,
        ),
      )
    }

    return err(
      new ReferenceRuntimeError(this, `There is no reference in scope named '${this.name}'`),
    )
  }

  /**
   * Explanation for declaring a reference as an instance of a class: Let's say
   * we're looking at `x: Foo`, and 'Foo' is the type expression we're
   * interested in. `Foo` will be stored in TypeRuntime as a Type instance,
   * ie `ClassDefinitionType`. But `x` is not an instance of
   * `ClassDefinitionType`, it's a `ClassInstanceType`, which is the value
   * returned by `fromTypeConstructor()`.
   */
  getAsTypeExpression(runtime: TypeRuntime): GetTypeResult {
    // get the type from runtime, this should be a named type, like
    //     type Foo = Int
    // which means Foo is a type-constructor. Calling fromTypeConstructor will
    // get the desired return type `Int`.
    return this.getType(runtime).map(type => type.fromTypeConstructor())
  }

  eval(runtime: ValueRuntime) {
    const value = runtime.getLocalValue(this.name)
    if (value) {
      return ok(value)
    }

    return err(
      new ReferenceRuntimeError(this, `There is no reference in scope named '${this.name}'`),
    )
  }

  replaceWithType(runtime: TypeRuntime, withType: Types.Type): GetRuntimeResult<TypeRuntime> {
    let nextRuntime = new MutableTypeRuntime(runtime)
    nextRuntime.replaceTypeByName(this.name, withType)
    return ok(nextRuntime)
  }

  compile(runtime: TypeRuntime) {
    return this.getType(runtime).map(type => new Nodes.Reference(toSource(this), type, this.name))
  }
}

export class StateReference extends Reference {
  dependencies() {
    return new Set([this.stateName])
  }

  get stateName() {
    return STATE_START + this.name
  }

  toLisp() {
    return this.stateName
  }

  toCode() {
    return this.stateName
  }

  getType(runtime: TypeRuntime): GetTypeResult {
    const type = runtime.getStateType(this.name)
    if (type) {
      return ok(type)
    }

    return err(new RuntimeError(this, `Cannot get type of state variable '${this.stateName}'`))
  }

  eval(runtime: ValueRuntime) {
    const value = runtime.getStateValue(this.name)
    if (value) {
      return ok(value)
    }

    return err(new RuntimeError(this, `Cannot get value of state variable '${this.stateName}'`))
  }

  replaceWithType(runtime: TypeRuntime, withType: Types.Type): GetRuntimeResult<TypeRuntime> {
    const thisType = runtime.getThisType()
    if (!thisType) {
      return err(new RuntimeError(this, `Cannot get value of 'this'`))
    }

    return thisType
      .replacingProp(this.name, withType)
      .mapError(message => new RuntimeError(this, message))
      .map(type => new MutableTypeRuntime(runtime, type))
  }

  compile(runtime: TypeRuntime) {
    return this.getType(runtime).map(
      type => new Nodes.StateReference(toSource(this), type, this.name),
    )
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
    // - DictEntry (most "common" key-value pair for an object type)
    // - SpreadObjectArgument (returns ObjectProp[] and is merged into this object)
    // - all other Expressions => Tuple values
    readonly values: Expression[],
  ) {
    super(range, precedingComments)
  }

  dependencies(parentScopes: Scope[]) {
    return allDependencies(this.values, parentScopes)
  }

  childExpressions() {
    return this.values
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
        }

        if (arg instanceof DictEntry) {
          const key = arg.name
          if (!(key instanceof LiteralString)) {
            return err(
              new RuntimeError(
                key,
                `Expected a literal key, object does not support arbitrary key ${key}`,
              ),
            )
          }

          const value = arg.value ? arg.value : arg.name
          return getChildType(this, value, runtime).map(type => [
            {
              is: 'named',
              name: key.value.value,
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
        }

        if (arg instanceof DictEntry) {
          const key = arg.name
          if (!(key instanceof LiteralString)) {
            return err(
              new RuntimeError(
                key,
                `Expected a literal key, object does not support arbitrary key ${key}`,
              ),
            )
          }

          const value = arg.value ? arg.value : arg.name
          return value
            .eval(runtime)
            .map(
              value =>
                [[], new Map([[key.value.value, value]])] as [
                  Values.Value[],
                  Map<string, Values.Value>,
                ],
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

  compile(runtime: TypeRuntime) {
    return this.getType(runtime).map(type =>
      mapAll(
        this.values.map((arg): GetRuntimeResult<Nodes.ObjectEntry> => {
          if (arg instanceof SpreadObjectArgument) {
            return arg.compile(runtime).map(node => ({is: 'spread-object', node}))
          }

          if (arg instanceof DictEntry) {
            return arg.name.compile(runtime).map(key => {
              if (arg.value) {
                return arg.value.compile(runtime).map(node => ({is: 'key-value-pair', key, node}))
              }
              return ok({is: 'key-value-pair', key, node: key})
            })
          }

          return arg.compile(runtime).map(node => ({is: 'positional-value', node}))
        }),
      ).map(nodes => new Nodes.ObjectLiteral(toSource(this), type, nodes)),
    )
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
    readonly generic: Expression | undefined,
  ) {
    super(range, precedingComments, [])
  }

  dependencies(parentScopes: Scope[]) {
    return allDependencies(this.values, parentScopes)
  }

  childExpressions() {
    return this.values
  }

  toLisp() {
    if (this.generic) {
      return `(Array(${this.generic.toLisp()}) (${this.values.map(it => it.toLisp()).join(' ')}))`
    }

    return `[${this.values.map(it => it.toLisp()).join(' ')}]`
  }

  toCode() {
    if (this.generic) {
      return `Array<${this.generic.toCode()}>${wrapValues('(', this.values, ')')}`
    }

    return wrapValues('[', this.values, ']')
  }

  // SpreadArgument works pretty easily here, its type signature is an
  // ArrayType so we just need to grab its 'of' property and merge it with the
  // rest of the types... and merge in the narrowed information.
  getType(runtime: TypeRuntime): GetTypeResult {
    return combineAllTypesForArray(this, runtime)
  }

  // SpreadArgument has to be special cased - it returns an array that should
  // be flattened. All arguments could be an instance of isInclusionOp()
  eval(runtime: ValueRuntime): GetRuntimeResult<Values.ArrayValue> {
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
      .map(values => new Values.ArrayValue(values))
  }

  compile(runtime: TypeRuntime) {
    return this.getType(runtime).map(type =>
      mapAll(
        this.values.map((arg): GetRuntimeResult<Nodes.ArrayEntry> => {
          if (arg instanceof SpreadArrayArgument && arg.value.isInclusionOp()) {
            const [lhs, rhs] = arg.value.args
            return mapMany(lhs.compile(runtime), rhs.compile(runtime)).map(([node, condition]) => ({
              is: 'inclusion-array',
              node: {is: 'spread-array', node},
              condition,
            }))
          }

          if (arg.isInclusionOp()) {
            const [lhs, rhs] = arg.args
            return mapMany(lhs.compile(runtime), rhs.compile(runtime)).map(([node, condition]) => ({
              is: 'inclusion-array',
              node: {is: 'positional-value', node},
              condition,
            }))
          }

          if (arg instanceof SpreadArrayArgument) {
            return arg.value.compile(runtime).map(node => ({is: 'spread-array', node}))
          }

          return arg.compile(runtime).map(node => ({is: 'positional-value', node}))
        }),
      ).map(nodes => new Nodes.ArrayLiteral(toSource(this), type, nodes)),
    )
  }
}

export class DictEntry extends Expression {
  constructor(
    range: Range,
    precedingComments: Comment[],
    readonly name: Expression,
    readonly value: Expression | undefined,
  ) {
    super(range, precedingComments)
  }

  dependencies(parentScopes: Scope[]) {
    if (!this.value) {
      return this.name.dependencies(parentScopes)
    }

    return union(this.name.dependencies(parentScopes), this.value.dependencies(parentScopes))
  }

  childExpressions() {
    return [this.name].concat(this.value ? [this.value] : [])
  }

  toLisp() {
    let name: string
    if (this.isLiteralKey(this.name)) {
      name = this.name.value.value
    } else {
      name = this.name.toLisp()
    }

    if (this.value) {
      return `(${name}: ${this.value.toLisp()})`
    } else {
      return `(${name}:)`
    }
  }

  isLiteralKey(key: Expression): key is LiteralString {
    return (
      key instanceof LiteralString &&
      !!key.value.value.match(
        /^([a-zA-Z_]|\p{Extended_Pictographic})([a-zA-Z0-9_-]|\p{Extended_Pictographic})*$/u,
      )
    )
  }

  toCode() {
    let name: string
    if (this.isLiteralKey(this.name)) {
      name = this.name.value.value
    } else {
      name = this.name.toCode(HIGHEST_PRECEDENCE)
    }

    if (!this.value || (this.value instanceof Reference && this.value.name === name)) {
      return name + DICT_SEPARATOR
    }

    const value = this.value.toCode()
    if (value.length > MAX_INNER_LEN) {
      return `${name}${DICT_SEPARATOR}\n${indent(value)}`
    }

    return `${name}${DICT_SEPARATOR} ${value}`
  }

  getType(): GetTypeResult {
    return err(new RuntimeError(this, 'DictEntry does not have a type'))
  }

  eval(): GetValueResult {
    return err(new RuntimeError(this, 'DictEntry cannot be evaluated'))
  }

  compile(runtime: TypeRuntime) {
    return err(new RuntimeError(this, 'DictEntry cannot be compiled'))
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
    readonly generic: Expression | undefined,
  ) {
    super(range, precedingComments)
  }

  dependencies(parentScopes: Scope[]) {
    return allDependencies(this.values, parentScopes)
  }

  toLisp() {
    const values = this.values
      .map(entry => {
        return entry.toLisp()
      })
      .join(' ')

    if (this.generic) {
      return `(Dict(${this.generic.toLisp()}) (${values}))`
    }

    return `Dict(${values})`
  }

  toCode() {
    if (this.generic) {
      return `Dict<${this.generic.toCode()}>${wrapValues('(', this.values, ')')}`
    }

    return wrapValues('Dict(', this.values, ')')
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

              const value: GetValueResult = valueExpr.value
                ? valueExpr.value.eval(runtime)
                : ok(name)
              return value.map(value => [key, value] as [Types.Key, Values.Value])
            })
            .map(kv => [kv])
        }
      }),
    )
      .map(values => values.flat())
      .map(values => Values.dict(new Map(values)))
  }

  compile(runtime: TypeRuntime): GetNodeResult {
    return this.getType(runtime).map(type =>
      mapAll(
        this.values.map((arg): GetRuntimeResult<Nodes.DictEntry> => {
          if (arg instanceof SpreadDictArgument && arg.value.isInclusionOp()) {
            const [lhs, rhs] = arg.value.args
            return mapMany(lhs.compile(runtime), rhs.compile(runtime)).map(([node, condition]) => ({
              is: 'inclusion-dict',
              node: {is: 'spread-dict', node},
              condition,
            }))
          }

          if (arg.isInclusionOp()) {
            const [lhs, rhs] = arg.args
            return mapMany(lhs.compile(runtime), rhs.compile(runtime)).map(([node, condition]) => ({
              is: 'inclusion-dict',
              node: {is: 'positional-value', node},
              condition,
            }))
          }

          if (arg instanceof SpreadDictArgument) {
            return arg.value.compile(runtime).map(node => ({is: 'spread-dict', node}))
          }

          return arg.compile(runtime).map(node => ({is: 'positional-value', node}))
        }),
      ).map(nodes => new Nodes.DictLiteral(toSource(this), type, nodes)),
    )
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
    readonly generic: Expression | undefined,
  ) {
    super(range, precedingComments)
  }

  dependencies(parentScopes: Scope[]) {
    return allDependencies(this.values, parentScopes)
  }

  childExpressions() {
    return this.values
  }

  toLisp() {
    if (this.generic) {
      return `(Set(${this.generic.toLisp()}) (${this.values.map(it => it.toLisp()).join(' ')}))`
    }

    return `Set(${this.values.map(it => it.toLisp()).join(' ')})`
  }

  toCode() {
    if (this.generic) {
      return `Set<${this.generic.toCode()}>${wrapValues('(', this.values, ')')}`
    }

    return wrapValues('Set(', this.values, ')')
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

  compile(runtime: TypeRuntime) {
    return this.getType(runtime).map(type =>
      mapAll(
        this.values.map((arg): GetRuntimeResult<Nodes.SetEntry> => {
          if (arg instanceof SpreadSetArgument && arg.value.isInclusionOp()) {
            const [lhs, rhs] = arg.value.args
            return mapMany(lhs.compile(runtime), rhs.compile(runtime)).map(([node, condition]) => ({
              is: 'inclusion-set',
              node: {is: 'spread-set', node},
              condition,
            }))
          }

          if (arg.isInclusionOp()) {
            const [lhs, rhs] = arg.args
            return mapMany(lhs.compile(runtime), rhs.compile(runtime)).map(([node, condition]) => ({
              is: 'inclusion-set',
              node: {is: 'positional-value', node},
              condition,
            }))
          }

          if (arg instanceof SpreadSetArgument) {
            return arg.value.compile(runtime).map(node => ({is: 'spread-set', node}))
          }

          return arg.compile(runtime).map(node => ({is: 'positional-value', node}))
        }),
      ).map(values => new Nodes.SetLiteral(toSource(this), type, values)),
    )
  }
}

function combineAllTypesForArray(expr: ArrayExpression, runtime: TypeRuntime) {
  return mapAll(
    // returns [isSpread, isInclusionOp, Type][]
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
        } else if (entry.value) {
          return getChildType(expr, entry.value, runtime).map(valueType =>
            getChildType(expr, entry.name, runtime).map(keyType => [false, valueType, keyType]),
          )
        } else {
          return getChildType(expr, entry.name, runtime).map(keyType => [false, keyType, keyType])
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
 * This class doesn't provide much convenience, mostly it groups together a
 * bunch of related classes:
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

  eval(runtime: ValueRuntime) {
    return this.getAsTypeExpression(runtime).map(type => new Values.TypeValue(type))
  }
}

/**
 * While scanning a type, we might come across a module or namespace "type access"
 * operation, ie
 *
 *     fn foo(bar: Namespace.TypeName) => …
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

  getType() {
    return err(new RuntimeError(this, 'NamespaceAccessExpression does not have a type'))
  }

  eval() {
    return err(new RuntimeError(this, 'NamespaceAccessExpression cannot be evaluated'))
  }

  /**
   * The parser restricts namespace lookups. Examples:
   *     x: module.TypeName
   *     y: module.submodule.TypeName
   */
  getAsTypeExpression(runtime: TypeRuntime): GetTypeResult {
    if (this.lhs instanceof NamespaceAccessExpression) {
      return getChildAsTypeExpression(this, this.lhs, runtime).map(type => {
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
      if (!runtime.hasNamespace(namespace)) {
        return err(new RuntimeError(this, `No type named '${namespace}'`))
      }

      const typeName = this.rhs.name
      const lhsType = runtime.getNamespaceType(namespace, typeName)
      if (!lhsType) {
        return err(new RuntimeError(this, `No type named '${namespace}.${typeName}'`))
      }

      return ok(lhsType)
    }
  }

  compile(runtime: TypeRuntime): GetRuntimeResult<Nodes.Namespace> {
    return this.getAsTypeExpression(runtime).map(type => {
      if (this.lhs instanceof NamespaceAccessExpression) {
        return this.lhs
          .compile(runtime)
          .map(node => new Nodes.Namespace(toSource(this), type, node, this.rhs.name))
      }
      return ok(new Nodes.Namespace(toSource(this), type, this.lhs.name, this.rhs.name))
    })
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

  dependencies(parentScopes: Scope[]) {
    return allDependencies(this.of, parentScopes)
  }

  childExpressions() {
    return this.of
  }

  toLisp() {
    return `(${this.of.map(ref => ref.toLisp()).join(' | ')})`
  }

  toCode(precedence = 0): string {
    if (precedence > this.precedence) {
      return `(${this.toCode(0)})`
    }

    if (this.of.length === 2 && this.of.some(type => type instanceof LiteralNull)) {
      if (this.of[0] instanceof LiteralNull) {
        return `${this.of[1].toCode(this.precedence)}?`
      } else {
        return `${this.of[0].toCode(this.precedence)}?`
      }
    }

    return `${this.of.map(ref => ref.toCode(this.precedence)).join(' | ')}`
  }

  getType(runtime: TypeRuntime): GetTypeResult {
    return err(new RuntimeError(this, 'OneOfTypeExpression does not have a type'))
  }

  getAsTypeExpression(runtime: TypeRuntime): GetTypeResult {
    return mapAll(
      this.of.map(type => {
        return getChildAsTypeExpression(this, type, runtime)
      }),
    ).map(types => Types.oneOf(types))
  }

  compile(runtime: TypeRuntime) {
    return this.getAsTypeExpression(runtime).map(type => new Nodes.OneOfType(toSource(this), type))
  }
}

/**
 * A & B
 * A & { a: … }
 */
export class CombineTypeExpression extends TypeExpression {
  precedence = 7

  constructor(
    range: Range,
    precedingComments: Comment[],
    readonly of: Expression[],
  ) {
    super(range, precedingComments)
  }

  dependencies(parentScopes: Scope[]) {
    return allDependencies(this.of, parentScopes)
  }

  childExpressions() {
    return this.of
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
    return err(new RuntimeError(this, 'CombineTypeExpression does not have a type'))
  }

  getAsTypeExpression(runtime: TypeRuntime): GetTypeResult {
    throw `TODO - (${this.of.map(t => t.toCode()).join(' & ')}).getAsTypeExpression()`
  }

  compile(runtime: TypeRuntime) {
    return this.getAsTypeExpression(runtime).map(
      type => new Nodes.CombineType(toSource(this), type),
    )
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

  dependencies(parentScopes: Scope[]) {
    return allDependencies(this.childExpressions(), parentScopes)
  }

  childExpressions() {
    return this.values.map(([_, value]) => value)
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
      // if we want to support `{ fn foo() => Value }`
      // (currently this is `{ foo: fn() => Value }`)
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

  getType(runtime: TypeRuntime) {
    return err(new RuntimeError(this, 'ObjectTypeExpression does not have a type'))
  }

  getAsTypeExpression(runtime: TypeRuntime): GetTypeResult {
    return mapAll(
      this.values.map(([name, expr]) =>
        expr
          .getAsTypeExpression(runtime)
          .map(type => [name, type] as [string | undefined, Types.Type]),
      ),
    ).map(
      types =>
        new Types.ObjectType(
          types.map(([name, type]) =>
            name ? Types.namedProp(name, type) : Types.positionalProp(type),
          ),
        ),
    )
  }

  compile(runtime: TypeRuntime) {
    return this.getAsTypeExpression(runtime).map(type => new Nodes.ObjectType(toSource(this), type))
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

  dependencies(parentScopes: Scope[]) {
    return this.of.dependencies(parentScopes)
  }

  childExpressions() {
    return [this.of]
  }

  toLisp() {
    return Types.ArrayType.desc(this.of.toLisp(), this.narrowed)
  }

  toCode() {
    return Types.ArrayType.desc(this.of.toCode(0), this.narrowed)
  }

  getType(runtime: TypeRuntime) {
    return err(new RuntimeError(this, 'ArrayTypeExpression does not have a type'))
  }

  getAsTypeExpression(runtime: TypeRuntime): GetTypeResult {
    return this.of
      .getAsTypeExpression(runtime)
      .map(type => new Types.ArrayType(type, this.narrowed))
  }

  compile(runtime: TypeRuntime) {
    return this.getAsTypeExpression(runtime).map(type => new Nodes.ArrayType(toSource(this), type))
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

  dependencies(parentScopes: Scope[]) {
    return this.of.dependencies(parentScopes)
  }

  childExpressions() {
    return [this.of]
  }

  toLisp() {
    return Types.DictType.desc(this.of.toLisp(), this.narrowedNames, this.narrowedLength)
  }

  toCode() {
    return Types.DictType.desc(this.of.toCode(0), this.narrowedNames, this.narrowedLength)
  }

  getType(runtime: TypeRuntime) {
    return err(new RuntimeError(this, 'DictTypeExpression does not have a type'))
  }

  getAsTypeExpression(runtime: TypeRuntime): GetTypeResult {
    return getChildAsTypeExpression(this, this.of, runtime).map(type => {
      return new Types.DictType(type, this.narrowedLength, this.narrowedNames)
    })
  }

  compile(runtime: TypeRuntime) {
    return this.getAsTypeExpression(runtime).map(type => new Nodes.DictType(toSource(this), type))
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

  dependencies(parentScopes: Scope[]) {
    return this.of.dependencies(parentScopes)
  }

  childExpressions() {
    return [this.of]
  }

  toLisp() {
    return Types.SetType.desc(this.of.toLisp(), this.narrowedLength)
  }

  toCode() {
    return Types.SetType.desc(this.of.toCode(0), this.narrowedLength)
  }

  getType(runtime: TypeRuntime) {
    return err(new RuntimeError(this, 'SetTypeExpression does not have a type'))
  }

  getAsTypeExpression(runtime: TypeRuntime): GetTypeResult {
    return getChildAsTypeExpression(this, this.of, runtime).map(type => {
      return new Types.SetType(type, this.narrowedLength)
    })
  }

  compile(runtime: TypeRuntime) {
    return this.getAsTypeExpression(runtime).map(type => new Nodes.SetType(toSource(this), type))
  }
}

/**
 * An example will make the most sense:
 *
 *     type TupleType<T, U> = { T, U }
 *
 *     fn intStringTuple(): TupleType(Int, String) => …
 *                          ^^^^^^^^^^^^^^^^^^^^^^
 *     fn anotherExample(): TupleType(Array(Int), String?) => …
 *                          ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
 * A TypeConstructor is a function, but used in the context of creating a Type.
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

  dependencies(parentScopes: Scope[]) {
    return allDependencies(this.types, parentScopes)
  }

  childExpressions() {
    return this.types
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
    throw 'TODO - TypeConstructorExpression getType'
  }

  getAsTypeExpression(_runtime: TypeRuntime): GetTypeResult {
    throw 'TODO - TypeConstructorExpression getAsTypeExpression'
  }

  compile(runtime: TypeRuntime) {
    return this.getAsTypeExpression(runtime).map(
      type => new Nodes.TypeConstructor(toSource(this), type),
    )
  }
}

//|
//|  Argument and Spread Expressions
//|

type SpreadArgumentInfo = [string | undefined, Values.Value, 'spread' | 'arg']

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

  dependencies(parentScopes: Scope[]) {
    return this.value.dependencies(parentScopes)
  }

  childExpressions() {
    return [this.value]
  }

  isPositional() {
    return this.alias === undefined
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
      return this.alias + ARG_SEPARATOR
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

  compile(runtime: TypeRuntime) {
    return this.value.compile(runtime)
  }

  private evalToSpreadArguments(value: Values.Value) {
    if (value instanceof Values.ObjectValue) {
      return value.tupleValues
        .map(value => [undefined, value, 'spread'] as SpreadArgumentInfo)
        .concat(
          Array.from(value.namedValues).map(
            ([alias, value]) => [alias, value, 'spread'] as SpreadArgumentInfo,
          ),
        )
    }

    if (value instanceof Values.ArrayValue) {
      return value.values.map(value => [this.alias, value, 'spread'] as SpreadArgumentInfo)
    }

    return err(
      new RuntimeError(this, 'Expected an Object or Array, found ' + value.constructor.name),
    )
  }

  private evalToKwargsArguments(value: Values.Value) {
    return [[this.alias, value, 'spread'] as SpreadArgumentInfo]
  }

  /**
   * Called from ArgumentsList to receive the *flattened* arguments for the function
   * invocation. `...` and `**` are resolved into positional and named arguments.
   */
  evalToArguments(
    runtime: ValueRuntime,
    spreadArg: 'spread' | 'kwargs' | undefined = undefined,
  ): GetRuntimeResult<SpreadArgumentInfo[]> {
    return this.eval(runtime).map(value => {
      if (spreadArg === 'spread') {
        return this.evalToSpreadArguments(value)
      } else if (spreadArg === 'kwargs') {
        return this.evalToKwargsArguments(value)
      } else {
        return [[this.alias, value, 'arg'] as SpreadArgumentInfo]
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
 *     -- or dict *if* the function accepts keyword list `fn(**kwargs: Dict(T))`
 */
export abstract class SpreadArgument extends Argument {
  readonly alias: string | undefined = undefined

  toLisp() {
    return `(${SPREAD_OPERATOR} ${this.value.toLisp()})`
  }

  toCode() {
    if (this.value instanceof Operation && !this.value.isInclusionOp()) {
      return `${SPREAD_OPERATOR}(${this.value})`
    }

    return `${SPREAD_OPERATOR}${this.value}`
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
 *     [...arg]
 */
export class SpreadArrayArgument extends SpreadArgument {
  readonly alias = undefined

  getType(runtime: TypeRuntime): GetRuntimeResult<Types.ArrayType> {
    return getChildType(this, this.value, runtime).map(type => {
      // TODO: could support Set here - better to show an error message about how to turn
      // a Set into an Array. Similar for Dict - could show how to extract the values
      // into an Array/Set.
      if (!(type instanceof Types.ArrayType)) {
        return err(new RuntimeError(this, 'Expected an Array, found ' + type.constructor.name))
      }

      return type
    })
  }

  eval(runtime: ValueRuntime): GetRuntimeResult<Values.ArrayValue> {
    return this.value.eval(runtime).map(value => {
      if (!(value instanceof Values.ArrayValue)) {
        return err(new RuntimeError(this, 'Expected an Array, found ' + value.constructor.name))
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
      // an Array into an Set. Similar for Dict - could show how to extract the values
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
 *     foo(**kwargs) -- must be a Dict and foo must accept keyword-args-list
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

  getType(runtime: TypeRuntime): GetRuntimeResult<Types.ObjectType | Types.ArrayType> {
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

  evalToArguments(runtime: ValueRuntime): GetRuntimeResult<SpreadArgumentInfo[]> {
    return super.evalToArguments(runtime, this.spread)
  }
}

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

  dependencies(parentScopes: Scope[]) {
    return allDependencies(this.allArgs, parentScopes)
  }

  childExpressions() {
    return this.allArgs
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
    return err(new RuntimeError(this, 'ArgumentsList does not have a type'))
  }

  eval(): GetValueResult {
    return err(
      new RuntimeError(this, 'ArgumentsList cannot be evaluated (call formulaArgs(runtime))'),
    )
  }

  compile() {
    return err(new RuntimeError(this, 'ArgumentsList cannot be compiled'))
  }

  formulaArgs(runtime: ValueRuntime): GetRuntimeResult<Values.FormulaArgs> {
    return mapAll(this.allArgs.map(arg => arg.evalToArguments(runtime)))
      .map(arraysOfArgs => arraysOfArgs.flat())
      .map(args => new Values.FormulaArgs(args))
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
    readonly typeExpression: Expression | undefined,
    value: Expression,
  ) {
    super(range, precedingComments, alias, value)
  }

  dependencies(parentScopes: Scope[]) {
    return allDependencies(
      this.typeExpression ? [this.typeExpression, this.value] : [this.value],
      parentScopes,
    )
  }

  toLisp() {
    if (this.typeExpression === undefined) {
      return `(${this.alias} = ${this.value.toLisp()})`
    }

    return `(${this.alias}: ${this.typeExpression.toLisp()} = ${this.value.toLisp()})`
  }

  toCode() {
    if (this.typeExpression === undefined) {
      return `${this.alias} = ${this.value}`
    }

    return `${this.alias}: ${this.typeExpression} = ${this.value}`
  }
}

export class LetExpression extends Expression {
  readonly name = 'let'
  readonly bindings: [string, LetAssign | NamedFormulaExpression][]

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

    this.bindings = bindings.map(arg => {
      if (arg instanceof NamedFormulaExpression) {
        return [arg.nameRef.name, arg]
      }

      return [arg.alias, arg]
    })
  }

  /**
   * In a 'let' assignment, we must take care to remove the assigments from
   * the parent scope - ie
   *
   *     class User {
   *       static foo = let
   *           -- technically, references must be lower case and modules must be
   *           -- uppercase... but I want to cover this situation anyway
   *           User = { bla: 'bla' }
   *         in
   *           User.bla <-- 'User' refers to the let assignment,
   *                     -- not the class from parent scope
   *     }
   *
   * This is only really relevant to resolving static property resolution order,
   * which here would not treat 'foo' as depending on any static property of the
   * parent class User.
   */
  dependencies(parentScopes: Scope[]) {
    const bindingExprs: Expression[] = this.bindings.map(([_, arg]) => arg)
    const bindingNames = new Set(this.bindings.map(([name, _]) => name))
    const filteredScopes = parentScopes.filter(scope => !bindingNames.has(scope.name))
    return difference(
      allDependencies(bindingExprs.concat([this.body]), filteredScopes),
      this.provides(),
    )
  }

  provides() {
    return new Set(this.bindings.map(([name, _]) => name))
  }

  private sortedBindings(ignoreExternal: (name: string) => boolean, parentScopes: Scope[]) {
    return dependencySort(this.bindings, ignoreExternal, parentScopes)
  }

  toLisp() {
    const bindings = this.sortedBindings(() => true, []).getOr() ?? this.bindings
    const code = bindings.map(([_, arg]) => arg.toLisp()).join(' ')
    return `(let ${code} ${this.body.toLisp()})`
  }

  toCode() {
    let code = 'let\n'
    const bindings = this.sortedBindings(() => true, []).getOr() ?? this.bindings
    for (const [alias, arg] of bindings) {
      let line: string
      let exprCode: string
      if (arg instanceof NamedFormulaExpression) {
        line = ''
        exprCode = arg.toCode()
      } else {
        line = alias
        if (arg.typeExpression !== undefined) {
          line += `: ${arg.typeExpression}`
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

    const id = runtime.addLocalType(name, localType)

    if (localType === inferredType) {
      const refFormula = relationshipFormula.reference(name, id)
      const assignmentRelationship = assignment.value.relationshipFormula(runtime)
      if (assignmentRelationship) {
        runtime.addRelationshipFormula({
          formula: refFormula,
          comparison: {operator: '==', rhs: assignmentRelationship},
        })
      }
    }
  }

  getType(runtime: TypeRuntime): GetTypeResult {
    return this.compile(runtime).map(node => node.type)
  }

  compile(runtime: TypeRuntime) {
    let nextRuntime = new MutableTypeRuntime(runtime)
    return this.sortedBindings(name => runtime.has(name), runtime.parentScopes())
      .map(deps =>
        mapAll(
          deps.map(
            ([name, assignment]): GetRuntimeResult<Nodes.LetEntry> =>
              assignment
                .compile(nextRuntime)
                .map((inferredNode): GetRuntimeResult<[Nodes.Node, Nodes.Node | undefined]> => {
                  if (assignment instanceof LetAssign && assignment.typeExpression) {
                    return assignment.typeExpression
                      .compile(runtime)
                      .mapResult(decorateError(this))
                      .map(explicitType => [inferredNode, explicitType])
                  } else {
                    return ok([inferredNode, undefined])
                  }
                })
                .map(([inferredNode, explicitNode]) => {
                  if (
                    explicitNode &&
                    !Types.canBeAssignedTo(inferredNode.type, explicitNode.type)
                  ) {
                    return err(
                      new RuntimeError(
                        this,
                        `Cannot assign inferred type '${inferredNode.type.toCode()}' to '${explicitNode.type.toCode()}'`,
                      ),
                    )
                  }

                  if (assignment instanceof LetAssign) {
                    this.assignRelationships(
                      nextRuntime,
                      name,
                      assignment,
                      inferredNode.type,
                      explicitNode?.type,
                    )
                  }

                  return ok({is: 'let-assign', name, node: inferredNode, type: explicitNode})
                }),
          ),
        ),
      )
      .map(nodes =>
        this.body.compile(nextRuntime).map(body => new Nodes.Let(toSource(this), body, nodes)),
      )
  }

  eval(runtime: ValueRuntime) {
    let nextRuntime = new MutableValueRuntime(runtime)
    return this.sortedBindings(name => runtime.has(name), runtime.parentScopes())
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

  getType(_runtime: TypeRuntime) {
    return err(new RuntimeError(this, `${this.name} does not have a type`))
  }

  eval(_runtime: ValueRuntime) {
    return err(new RuntimeError(this, `${this.name} cannot be evaluated`))
  }

  compile(_runtime: TypeRuntime) {
    return err(new RuntimeError(this, `${this.name} cannot be compiled`))
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

export class DefaultArgumentIdentifier extends ReservedWord {
  readonly name = '#default'
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

export class ThisIdentifier extends ReservedWord {
  readonly name = 'this'

  getType(runtime: TypeRuntime): GetTypeResult {
    const thisType = runtime.getThisType()
    if (!thisType) {
      return err(new RuntimeError(this, '`this` is not available in this context'))
    }
    return ok(thisType)
  }

  eval(runtime: ValueRuntime): GetValueResult {
    const thisValue = runtime.getThisValue()
    if (!thisValue) {
      return err(new RuntimeError(this, '`this` is not available in this context'))
    }
    return ok(thisValue)
  }

  compile(runtime: TypeRuntime) {
    return this.getType(runtime).map(type => new Nodes.This(toSource(this), type))
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

  abstract safeTypeAssertion(): Types.Type
}

export class BooleanTypeIdentifier extends TypeIdentifier {
  readonly name = 'Boolean'

  toCode() {
    return this.safeTypeAssertion().toCode()
  }

  safeTypeAssertion(): Types.Type {
    return Types.BooleanType
  }

  getAsTypeExpression(): GetTypeResult {
    return ok(this.safeTypeAssertion())
  }

  getType() {
    return err(new RuntimeError(this, 'BooleanTypeExpression does not have a type'))
  }

  eval(): GetValueResult {
    return err(new RuntimeError(this, 'BooleanTypeExpression cannot be evaluated'))
  }

  compile() {
    return ok(new Nodes.BooleanType(toSource(this)))
  }
}

export class FloatTypeIdentifier extends TypeIdentifier {
  readonly name = 'Float'

  constructor(
    range: Range,
    precedingComments: Comment[],
    readonly narrowed: Narrowed.NarrowedFloat | undefined = undefined,
  ) {
    super(range, precedingComments)
  }

  toCode() {
    return this.safeTypeAssertion().toCode()
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

  getType() {
    return err(new RuntimeError(this, 'FloatTypeExpression does not have a type'))
  }

  eval(): GetValueResult {
    return err(new RuntimeError(this, 'FloatTypeExpression cannot be evaluated'))
  }

  compile() {
    return ok(new Nodes.FloatType(toSource(this), this.safeTypeAssertion()))
  }
}

export class IntTypeIdentifier extends TypeIdentifier {
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

  getType() {
    return err(new RuntimeError(this, 'IntTypeExpression does not have a type'))
  }

  eval(): GetValueResult {
    return err(new RuntimeError(this, 'IntTypeExpression cannot be evaluated'))
  }

  compile() {
    return ok(new Nodes.IntType(toSource(this), this.safeTypeAssertion()))
  }
}

export class StringTypeIdentifier extends TypeIdentifier {
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

  getType() {
    return err(new RuntimeError(this, 'StringTypeExpression does not have a type'))
  }

  eval(): GetValueResult {
    return err(new RuntimeError(this, 'StringTypeExpression cannot be evaluated'))
  }

  compile() {
    return ok(new Nodes.StringType(toSource(this), this.safeTypeAssertion()))
  }
}

//|
//|  Pipe Expressions
//|

export class PipePlaceholderExpression extends Expression {
  static Symbol = '#pipe'

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

  compile(runtime: TypeRuntime) {
    return this.getType(runtime).map(type => new Nodes.Pipe(toSource(this), type))
  }
}

//|
//|  Formula Expressions
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

  dependencies(parentScopes: Scope[]) {
    return this.argType.dependencies(parentScopes)
  }

  provides(): Set<string> {
    return new Set([this.nameRef.name])
  }

  childExpressions() {
    return [this.argType]
  }

  compile(runtime: TypeRuntime) {
    return err(new RuntimeError(this, 'ArgumentExpression cannot be compiled'))
  }

  getType(): GetTypeResult {
    return err(new RuntimeError(this, 'ArgumentExpression does not have a type'))
  }

  eval(): GetValueResult {
    return err(new RuntimeError(this, 'ArgumentExpression cannot be evaluated'))
  }
}

/**
 * An argument definition. Comes in many flavors: position, named (w/ optional
 * aliased), spread, and keyword-args. Position and named arguments can have a
 * default value. Spread arguments defaults to `[]` and kwargs defaults to `#{}`
 *
 *     # name: Type [=value]
 *     alias name: Type [= value]
 *     name: Type [= value]
 *     ...# spread: Array(Type), default = []
 *     ...spread: Array(Type), default = []
 *     **kwargs: Dict(Type), default = #{}
 */
export class FormulaArgumentDefinition extends ArgumentExpression {
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

  dependencies(parentScopes: Scope[]) {
    const superDeps = super.dependencies(parentScopes)
    if (!this.defaultValue) {
      return superDeps
    }

    return union(superDeps, allDependencies([this.defaultValue], parentScopes))
  }

  toLisp() {
    let code = ''
    if (this.spreadArg === 'spread') {
      code += SPREAD_OPERATOR
    } else if (this.spreadArg === 'kwargs') {
      code += KWARG_OPERATOR
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
      code += SPREAD_OPERATOR
    } else if (this.spreadArg === 'kwargs') {
      code += KWARG_OPERATOR
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
 * The argument name and type for a FormulaType expression. Argument types can
 * be declared as optional.
 *
 *     add: fn(# a: Int, b: Int, c?: Int): Int
 *               ^^^^^^  |       ^^^^^^^ optional
 *                       ^^^^^^
 *
 * Variadic arguments are also declared on the formula type:
 *     add: fn(...# values: Array(Int)): Int
 *     add: fn(...values: Array(Int)): Int
 *     add: fn(**named: Dict(Int)): Int
 */
export class FormulaTypeArgument extends ArgumentExpression {
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

  formulaArgumentType(runtime: TypeRuntime): GetRuntimeResult<Types.Argument> {
    return getChildAsTypeExpression(this, this.argType, runtime).map(type => {
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
      code += SPREAD_OPERATOR
    } else if (this.spreadArg === 'kwargs') {
      code += KWARG_OPERATOR
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
      code += SPREAD_OPERATOR
    } else if (this.spreadArg === 'kwargs') {
      code += KWARG_OPERATOR
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
 *     --        ^^^^^^^^^^^^^^^
 *     --        FormulaTypeExpression
 */
export class FormulaTypeExpression extends Expression {
  constructor(
    range: Range,
    precedingComments: Comment[],
    readonly argDefinitions: FormulaTypeArgument[],
    readonly returnType: Expression,
    readonly generics: GenericExpression[],
  ) {
    super(range, precedingComments)
  }

  dependencies(parentScopes: Scope[]) {
    const deps = union(
      allDependencies(this.argDefinitions, parentScopes),
      this.returnType.dependencies(parentScopes),
    )
    return difference(deps, allProvides(this.argDefinitions))
  }

  childExpressions() {
    return (this.argDefinitions as Expression[]).concat([this.returnType])
  }

  toLisp() {
    const argsCode = this.argDefinitions.map(expr => expr.toLisp()).join(' ')
    return `(fn (${argsCode}) : (${this.returnType.toLisp()}))`
  }

  toCode() {
    const returnType = ': ' + this.returnType.toCode()
    const argsCode = this.argDefinitions.map(expr => expr.toCode()).join(', ')
    return `fn(${argsCode})${returnType}`
  }

  getAsTypeExpression(runtime: TypeRuntime): GetTypeResult {
    const genericTypes: Types.GenericType[] = []
    const mutableRuntime = new MutableTypeRuntime(runtime)
    for (const generic of this.generics) {
      const genericType = new Types.GenericType(generic.name)
      genericTypes.push(genericType)
      mutableRuntime.addLocalType(generic.name, genericType)
    }

    return mapAll(this.argDefinitions.map(arg => arg.formulaArgumentType(mutableRuntime))).map(
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

export class GenericExpression extends Expression {
  constructor(
    range: Range,
    precedingComments: Comment[],
    readonly name: string,
  ) {
    super(range, precedingComments)
  }

  toCode() {
    return this.name
  }

  toLisp() {
    return this.name
  }

  compile(): GetRuntimeResult<Nodes.Generic> {
    const genericType = new Types.GenericType(this.name)
    return ok(new Nodes.Generic(toSource(this), genericType))
  }

  getType(): GetTypeResult {
    return ok(new Types.GenericType(this.name))
  }

  eval(): GetValueResult {
    return err(new RuntimeError(this, 'GenericExpression cannot be evaluated'))
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
     * Comments preceding the name of the function
     */
    readonly precedingNameComments: Comment[],
    /**
     * Comments attached to the opening '(' beginning the arguments list
     */
    readonly precedingArgumentsComments: Comment[],
    /**
     * Comments attached to the closing ')' ending the arguments list
     */
    readonly followingArgumentsComments: Comment[],
    /**
     * Comments after the return type
     */
    readonly precedingReturnTypeComments: Comment[],
    readonly nameRef: Reference | undefined,
    readonly argDefinitions: FormulaArgumentDefinition[],
    readonly returnType: Expression,
    readonly body: Expression,
    readonly generics: GenericExpression[],
  ) {
    super(range, precedingComments)
  }

  provides(): Set<string> {
    if (this.nameRef) {
      return new Set([this.nameRef.name])
    }
    return super.provides()
  }

  dependencies(parentScopes: Scope[]) {
    const filteredScopes = parentScopes.filter(scope => {
      if (this.nameRef && this.nameRef.name === scope.name) {
        return false
      }
      if (this.generics.some(g => g.name === scope.name)) {
        return false
      }
      if (this.argDefinitions.some(arg => arg.nameRef.name === scope.name)) {
        return false
      }

      return true
    })
    const deps = union(
      allDependencies(this.argDefinitions, filteredScopes),
      this.body.dependencies(filteredScopes),
      this.returnType.dependencies(filteredScopes),
    )
    const generics = this.generics.map(g => g.name)
    const provides = union(allProvides(this.argDefinitions), new Set(generics))
    return difference(deps, provides)
  }

  childExpressions() {
    return [this.body]
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
      code += ' <' + this.generics.map(g => g.toLisp()).join(' ') + '>'
    }
    code += `(${this.argDefinitions.map(expr => expr.toLisp()).join(' ')})`
    if (!(this.returnType instanceof InferIdentifier)) {
      code += ' : ' + this.returnType.toLisp()
    }
    code += ' => ' + this.body.toLisp()
    code += prefixed ? ')' : ''
    return code
  }

  toCode() {
    return this.toCodePrefixed(true)
  }

  toViewPropCode() {
    return `(${this.toCode()})`
  }

  toCodePrefixed(prefixed: boolean, forceNewline: boolean = false) {
    let code = ''
    code += formatComments(this.precedingComments)
    if (prefixed) {
      code += this.prefix
    }
    if (this.nameRef) {
      if (prefixed) {
        code += ' '
      }
      code += this.nameRef.name
    }

    if (this.generics.length) {
      code += wrapValues('<', this.generics, '>')
    }

    const argDefinitions = this.argDefinitions.map(expr => expr.toCode()).join(', ')
    const returnTypeCode = this.returnType.toCode()
    let hasNewline: boolean
    if (forceNewline) {
      hasNewline = true
    } else {
      const bodyCode = this.body.toCode()
      const testCode = code + argDefinitions + returnTypeCode + bodyCode
      hasNewline = testCode.includes('\n') || testCode.length > MAX_LEN
    }

    if (!argDefinitions.length) {
      code += '()'
    } else {
      const argDefinitionsHasNewline =
        argDefinitions.includes('\n') || argDefinitions.length > MAX_INNER_LEN
      if (argDefinitionsHasNewline) {
        code += `(\n${indent(argDefinitions)}\n)`
      } else {
        code += `(${argDefinitions})`
      }
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

  getType(
    runtime: TypeRuntime,
    formulaArgumentType?: Types.FormulaType | undefined,
  ): GetRuntimeResult<Types.FormulaType> {
    return this.compile(runtime, formulaArgumentType).map(node => node.type as Types.FormulaType)
  }

  compile(
    runtime: TypeRuntime,
    // in the context of passing an anonymous function as an argument to another
    // function, the argument types of the receiver can be used to infer the
    // argument types of the anonymous function.
    formulaArgumentType?: Types.FormulaType | undefined,
  ): GetRuntimeResult<Nodes.AnonymousFunction> {
    // this runtime is constructed in order to evaluate the body of the
    // function. It includes all generics and arguments.
    const mutableRuntime = new MutableTypeRuntime(runtime)

    const generics = mapAll(
      this.generics.map(generic =>
        generic.compile().map(node => {
          mutableRuntime.addLocalType(generic.name, node.type)
          return node
        }),
      ),
    )
    const argumentNodes = resolveArgumentNodes(this, mutableRuntime, formulaArgumentType)

    return mapMany(generics, argumentNodes).map(([generics, args]) => {
      args.forEach(arg => {
        mutableRuntime.addLocalType(arg.name, arg.type)
      })

      return this.body.compile(mutableRuntime).map(bodyNode => {
        const inferReturnType = this.returnType instanceof InferIdentifier
        let returnTypeResult: GetRuntimeResult<Nodes.Node | undefined>
        if (inferReturnType) {
          returnTypeResult = ok(undefined)
        } else {
          returnTypeResult = this.returnType
            .compileAsTypeExpression(mutableRuntime)
            .mapResult(decorateError(this))
            .map(returnTypeNode => {
              const returnType = returnTypeNode.type.fromTypeConstructor()

              if (!Types.canBeAssignedTo(bodyNode.type, returnType)) {
                return err(
                  new RuntimeError(
                    this,
                    `Function body result type '${bodyNode.type.toCode()}' is not assignable to explicit return type '${returnType.toCode()}'`,
                  ),
                )
              }

              return returnTypeNode
            })
        }

        return returnTypeResult.map(returnTypeNode =>
          this.compileFormulaTypeWith(generics, args, returnTypeNode, bodyNode),
        )
      })
    })
  }

  compileFormulaTypeWith(
    generics: Nodes.Generic[],
    args: Nodes.Argument[],
    returnTypeNode: Nodes.Node | undefined,
    bodyNode: Nodes.Node,
  ) {
    const argTypes = args.map(arg => arg.toArgumentType())
    const genericTypes = generics.map(g => g.type)
    const returnType = returnTypeNode?.type ?? bodyNode.type
    const type = new Types.FormulaType(returnType, argTypes, genericTypes)
    return new Nodes.AnonymousFunction(
      toSource(this),
      type,
      generics,
      args,
      returnTypeNode,
      bodyNode,
    )
  }

  eval(runtime: ValueRuntime): GetRuntimeResult<Values.FormulaValue> {
    const argDefinitions = this.argDefinitions
    // this is the function that is invoked by 'FunctionInvocationOperator', via
    // FormulaValue.call(args)
    const fn = (
      args: Values.FormulaArgs,
      boundThis: Values.ClassInstanceValue | undefined,
    ): Result<Values.Value, RuntimeError> =>
      argumentValues(runtime, argDefinitions, args, boundThis).map(nextRuntime =>
        this.body.eval(nextRuntime),
      )

    return ok(this.getFormulaValueWith(runtime, fn))
  }

  getFormulaValueWith(
    _runtime: ValueRuntime,
    fn: (
      args: Values.FormulaArgs,
      boundThis: Values.ClassInstanceValue | undefined,
    ) => Result<Values.Value, RuntimeError>,
  ) {
    return new Values.FormulaValue(fn, undefined)
  }
}

function resolveArgumentNodes(
  expr: FormulaExpression,
  runtime: TypeRuntime,
  formulaArgumentType?: Types.FormulaType | undefined,
): GetRuntimeResult<Nodes.Argument[]> {
  // for every arg, check the arg type _and_ the default type, and make sure
  // default type can be assigned to the arg type
  let nextPosition = 0
  return mapAll(
    expr.argDefinitions.map(argExpr => {
      let argType = argumentToArgumentType(argExpr, runtime, formulaArgumentType, nextPosition)

      if (formulaArgumentType) {
        const namedArg =
          !argExpr.isPositional && formulaArgumentType.namedArg(argExpr.aliasRef.name)
        if (!namedArg) {
          nextPosition += 1
        }
      }

      return argType.map(type => {
        if (argExpr.defaultValue) {
          const defaultNodeResult = getChildType(expr, argExpr.defaultValue, runtime)
          if (defaultNodeResult.isErr()) {
            return err(defaultNodeResult.error)
          }

          const defaultNode = defaultNodeResult.get()
          if (!Types.canBeAssignedTo(defaultNode, type)) {
            return decorateError(expr)(
              err(
                new RuntimeError(
                  argExpr.defaultValue,
                  Types.cannotAssignToError(defaultNode, type),
                ),
              ),
            )
          }
        }

        return argumentToArgumentNode(argExpr, type)
      })
    }),
  )
}

export function argumentToArgumentType(
  argExpr: FormulaArgumentDefinition,
  runtime: TypeRuntime,
  formulaArgumentType: Types.FormulaType | undefined,
  // this is only incremented when the caller treats the argExpr as a named
  // argument.
  atPosition: number,
) {
  if (argExpr.argType instanceof InferIdentifier) {
    if (argExpr.spreadArg) {
      throw `TODO: inferring type of ${argExpr.toCode()} in argumentTypes is not done`
    }

    let inferArgType: Types.Type | undefined
    if (formulaArgumentType) {
      const namedArg = !argExpr.isPositional && formulaArgumentType.namedArg(argExpr.aliasRef.name)
      if (namedArg) {
        inferArgType = namedArg.type
      } else {
        inferArgType = formulaArgumentType.positionalArg(atPosition)?.type
      }
    } else {
      inferArgType = undefined
    }

    if (!inferArgType) {
      // I know some programming languages are able to infer the argument type
      // based on how it's *used* but that just sounds like a ton of work,
      // for mediocre results.
      let message = 'Unable to infer type for argument '
      if (argExpr.isPositional) {
        message += `at position #${atPosition + 1}`
      } else if (argExpr instanceof PositionalArgument) {
        message += `'${argExpr.aliasRef.name}'`
      }
      return err(new RuntimeError(argExpr, message))
    }

    return ok(inferArgType)
  } else {
    return argExpr.argType.getAsTypeExpression(runtime)
  }
}

export function argumentToArgumentNode(
  argExpr: FormulaArgumentDefinition,
  type: Types.Type,
): GetRuntimeResult<Nodes.Argument> {
  if (argExpr.spreadArg === 'spread' && argExpr.isPositional) {
    if (!(type instanceof Types.ArrayType)) {
      return err(new RuntimeError(argExpr, 'Spread positional argument must be an array'))
    }
    return ok(new Nodes.SpreadPositionalArgument(toSource(argExpr), type, argExpr.nameRef.name))
  } else if (argExpr.spreadArg === 'spread') {
    if (!(type instanceof Types.ArrayType)) {
      return err(new RuntimeError(argExpr, 'Spread positional argument must be an array'))
    }
    return ok(
      new Nodes.RepeatedNamedArgument(
        toSource(argExpr),
        type,
        argExpr.nameRef.name,
        argExpr.aliasRef.name,
      ),
    )
  } else if (argExpr.spreadArg === 'kwargs') {
    if (!(type instanceof Types.DictType)) {
      return err(new RuntimeError(argExpr, 'Spread positional argument must be an dict'))
    }
    return ok(new Nodes.KwargsListArgument(toSource(argExpr), type, argExpr.nameRef.name))
  } else if (argExpr.isPositional) {
    const isRequired = !argExpr.defaultValue
    return ok(
      new Nodes.PositionalArgument(toSource(argExpr), type, argExpr.nameRef.name, isRequired),
    )
  } else {
    const isRequired = !argExpr.defaultValue
    return ok(
      new Nodes.NamedArgument(
        toSource(argExpr),
        type,
        argExpr.nameRef.name,
        argExpr.aliasRef.name,
        isRequired,
      ),
    )
  }
}

export function argumentValues(
  runtime: ValueRuntime,
  argDefinitions: FormulaArgumentDefinition[],
  invokedArgs: Values.FormulaArgs,
  boundThis: Values.ClassInstanceValue | undefined,
): GetRuntimeResult<MutableValueRuntime> {
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
    return argumentValues(
      runtime,
      argDefinitions.map(
        arg =>
          new FormulaArgumentDefinition(
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
      boundThis,
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
  } = organizeArguments(argDefinitions)
  const mutableRuntime = new MutableValueRuntime(runtime)
  let position = 0
  for (const arg of requiredPositional) {
    const value = invokedArgs.safeAt(position)
    if (!value) {
      throw `weird... (compiler should've caught this) - missing positional argument '${arg.nameRef.name}'. No argument passed at position #${position + 1}`
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
        throw `weird... (compiler should've caught this) - '${arg.aliasRef.name}'. No argument named '${arg.aliasRef.name}'`
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

  if (boundThis) {
    mutableRuntime.setThisValue(boundThis)
  }

  return ok(mutableRuntime)
}

function organizeArguments(argDefinitions: FormulaArgumentDefinition[]) {
  const requiredPositional: FormulaArgumentDefinition[] = []
  // const lastPositional: FormulaLiteralArgument[] = []
  const optionalPositional: [FormulaArgumentDefinition, Expression][] = []
  let remainingPositional: FormulaArgumentDefinition | undefined
  const singleNamed: Map<string, FormulaArgumentDefinition> = new Map()
  const repeatNamed: Map<string, FormulaArgumentDefinition> = new Map()
  let kwargs: FormulaArgumentDefinition | undefined

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

export class NamedFormulaExpression extends FormulaExpression {
  constructor(
    range: Range,
    precedingComments: Comment[],
    precedingNameComments: Comment[],
    precedingArgsComments: Comment[],
    followingArgsComments: Comment[],
    precedingReturnTypeComments: Comment[],
    readonly nameRef: Reference,
    argDefinitions: FormulaArgumentDefinition[],
    returnType: Expression,
    body: Expression,
    generics: GenericExpression[],
  ) {
    super(
      range,
      precedingComments,
      precedingNameComments,
      precedingArgsComments,
      followingArgsComments,
      precedingReturnTypeComments,
      nameRef,
      argDefinitions,
      returnType,
      body,
      generics,
    )
  }

  get name() {
    return this.nameRef.name
  }

  getType(
    runtime: TypeRuntime,
    formulaArgumentType?: Types.FormulaType | undefined,
  ): GetRuntimeResult<Types.NamedFormulaType> {
    return super.getType(runtime, formulaArgumentType) as GetRuntimeResult<Types.NamedFormulaType>
  }

  compileFormulaTypeWith(
    generics: Nodes.Generic[],
    args: Nodes.Argument[],
    returnTypeNode: Nodes.Node | undefined,
    bodyNode: Nodes.Node,
  ) {
    const name = this.nameRef.name
    const argTypes = args.map(arg => arg.toArgumentType())
    const genericTypes = generics.map(g => g.type)
    const returnType = returnTypeNode?.type ?? bodyNode.type
    const type = new Types.NamedFormulaType(name, returnType, argTypes, genericTypes)
    return new Nodes.NamedFunction(
      toSource(this),
      type,
      name,
      generics,
      args,
      returnTypeNode,
      bodyNode,
    )
  }

  eval(runtime: ValueRuntime): GetRuntimeResult<Values.NamedFormulaValue> {
    return super.eval(runtime) as GetRuntimeResult<Values.NamedFormulaValue>
  }

  getFormulaValueWith(
    _runtime: ValueRuntime,
    fn: (
      args: Values.FormulaArgs,
      boundThis: Values.ClassInstanceValue | undefined,
    ) => Result<Values.Value, RuntimeError>,
  ) {
    return new Values.NamedFormulaValue(this.nameRef.name, fn, undefined)
  }
}

export class InstanceFormulaExpression extends NamedFormulaExpression {
  constructor(
    range: Range,
    precedingComments: Comment[],
    precedingNameComments: Comment[],
    precedingArgsComments: Comment[],
    followingArgsComments: Comment[],
    precedingReturnTypeComments: Comment[],
    nameRef: Reference,
    argDefinitions: FormulaArgumentDefinition[],
    returnType: Expression,
    body: Expression,
    generics: GenericExpression[],
    readonly isOverride: boolean,
  ) {
    super(
      range,
      precedingComments,
      precedingNameComments,
      precedingArgsComments,
      followingArgsComments,
      precedingReturnTypeComments,
      nameRef,
      argDefinitions,
      returnType,
      body,
      generics,
    )
  }
}

abstract class JsxExpression extends Expression {
  readonly nameRef: Reference | undefined

  constructor(
    range: Range,
    precedingComments: Comment[],
    readonly props: NamedArgument[],
    readonly children: Expression[] | undefined,
  ) {
    super(range, precedingComments)
  }

  dependencies(parentScopes: Scope[]) {
    const argsDependencies = union(
      new Set(this.nameRef ? [this.nameRef.name] : []),
      allDependencies(this.props, parentScopes),
    )
    if (!this.children) {
      return argsDependencies
    }
    return union(argsDependencies, allDependencies(this.children, parentScopes))
  }

  childExpressions() {
    return (this.props as Expression[]).concat(this.children ? this.children : [])
  }

  toLispCode() {
    let code = '<'
    if (this.nameRef) {
      code += this.nameRef
    }

    if (this.props.length) {
      if (this.nameRef) {
        code += ' '
      }

      code += this.props
        .map(arg => {
          if (arg.value instanceof LiteralTrue) {
            return arg.alias
          } else if (arg.value instanceof LiteralFalse) {
            return `!${arg.alias}`
          }

          return `${arg.alias}=${arg.value.toViewPropCode()}`
        })
        .join(' ')
    }

    if (this.children && this.children.length) {
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
    } else if (this.children) {
      if (this.nameRef) {
        code += '></'
        code += this.nameRef
        code += '>'
      } else {
        code += '></>'
      }
      return [code]
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

    if (this.props.length) {
      if (this.nameRef) {
        code += ' '
      }

      code += this.props
        .map(arg => {
          if (arg.value instanceof LiteralTrue) {
            return arg.alias
          } else if (arg.value instanceof LiteralFalse) {
            return `!${arg.alias}`
          }

          return `${arg.alias}=${arg.value.toViewPropCode()}`
        })
        .join(' ')
    }

    if (this.children) {
      code += '>'
      const lines: string[] = [code]

      let childrenCode = this.children
        .map(child => {
          if (child instanceof JsxExpression) {
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
    return mapAll(this.children?.map(child => child.getType(runtime)) ?? []).map(_children => {
      // const children = this.children ? _children : undefined
      if (this.nameRef) {
        const refType = runtime.getViewType(this.nameRef.name)
        // TODO: validate this.args (NamedArgument[])
        // TODO: validate children (Type[])

        if (!refType) {
          return err(new RuntimeError(this, `No View named '${this.nameRef}'`))
        }

        // this returns:
        // - Types.ViewType (which is OK)
        // - or Types.ViewFormulaType / Types.ViewClassDefinitionType, which is
        //   not really the type we want from `<ViewName />`
        return ok(refType)
      }

      if (this.props.length) {
        return err(new RuntimeError(this, `Fragments cannot receive props.`))
      }

      return ok(Types.FragmentViewType)
    })
  }

  eval() {
    // cannot return a Nodes.NodeValue, because nodes.ts depends on values.ts
    return err(new RuntimeError(this, `JsxExpression cannot be eval'd (try 'render' instead)`))
  }
}

export class NamedJsxExpression extends JsxExpression {
  constructor(
    range: Range,
    precedingComments: Comment[],
    readonly nameRef: Reference,
    args: NamedArgument[],
    children: Expression[] | undefined,
  ) {
    super(range, precedingComments, args, children)
  }
}

export class FragmentJsxExpression extends JsxExpression {
  readonly nameRef: undefined = undefined

  constructor(
    range: Range,
    precedingComments: Comment[],
    args: NamedArgument[],
    children: Expression[],
  ) {
    super(range, precedingComments, args, children)
  }
}

//|
//|  Match Expressions
//|

export abstract class MatchExpression extends Expression {
  assumeTrueWith(
    runtime: TypeRuntime,
    formula: RelationshipFormula | undefined,
    subjectType: Types.Type,
  ) {
    return this.gimmeTrueStuffWith(runtime, formula, subjectType).map(stuff =>
      assignRelationshipsToRuntime(runtime, stuff, true),
    )
  }

  assumeFalseWith(
    runtime: TypeRuntime,
    formula: RelationshipFormula | undefined,
    subjectType: Types.Type,
  ) {
    return this.gimmeFalseStuffWith(runtime, formula, subjectType).map(stuff =>
      assignRelationshipsToRuntime(runtime, stuff, false),
    )
  }

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

  /**
   * MatchIdentifier type returns 'true', indicating a match that will always
   * succeed.
   */
  alwaysMatches(_lhs: Types.Type) {
    return false
  }

  getType(): GetTypeResult {
    return err(new RuntimeError(this, `${this.constructor.name} does not have a type`))
  }

  eval(): GetValueResult {
    return err(new RuntimeError(this, `${this.constructor.name} cannot be evaluated`))
  }

  evalWithSubject(_runtime: ValueRuntime, _op: Expression, _lhs: Values.Value): GetValueResult {
    return err(
      new RuntimeError(this, `TODO: implement evalWithSubject on ${this.constructor.name}`),
    )
  }

  evalWithSubjectReturningRuntime(
    runtime: ValueRuntime,
    op: Expression,
    lhs: Values.Value,
  ): GetValueRuntimeResult {
    return this.evalWithSubject(runtime, op, lhs).map(value => [value, runtime])
  }

  checkAssignRefs() {
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
    return getChildAsTypeExpression(this, this.argType, runtime)
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

    // I was tempted to just use 'instanceof' and store the desired type (i.e.
    // use `Types.narrowTypeIsNot` here). The problem is that operators like
    // `not` modify the return value of gimmeFalseStuff, changing `!instanceof`
    // to `instanceof`.
    return this.getAsTypeExpression(runtime).map(type => {
      return [{formula, comparison: {operator: '!instanceof', rhs: type}}]
    })
  }

  evalWithSubject(runtime: ValueRuntime, op: Expression, lhs: Values.Value) {
    return this.getAsTypeExpression(runtime).map(type => {
      const isType = Types.canBeAssignedTo(lhs.getType(), type)
      return okBoolean(isType)
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
  abstract readonly nameRef?: Identifier

  alwaysMatches(_lhs: Types.Type) {
    return true
  }

  matchAssignReferences() {
    return this.nameRef ? [this.nameRef.name] : []
  }

  gimmeTrueStuffWith(
    _runtime: TypeRuntime,
    formula: RelationshipFormula | undefined,
    lhsType: Types.Type,
  ): GetRuntimeResult<Relationship[]> {
    if (!this.nameRef) {
      return ok([])
    }

    const assign = relationshipFormula.assign(this.nameRef.name)
    const relationships: Relationship[] = [
      {
        formula: assign,
        comparison: {operator: 'instanceof', rhs: lhsType},
      },
    ]
    if (formula) {
      relationships.push({
        formula: relationshipFormula.reference(this.nameRef.name, assign.unstableId),
        comparison: {operator: '==', rhs: formula},
      })
    }
    return ok(relationships)
  }

  gimmeFalseStuffWith(
    _runtime: TypeRuntime,
    formula: RelationshipFormula | undefined,
    _lhsType: Types.Type,
  ): GetRuntimeResult<Relationship[]> {
    const relationships: Relationship[] = []
    if (formula) {
      relationships.push({
        formula,
        comparison: {operator: 'instanceof', rhs: Types.NeverType},
      })
    }

    if (this.nameRef) {
      const assign = relationshipFormula.assign(this.nameRef.name)
      relationships.push({
        formula: assign,
        comparison: {operator: 'instanceof', rhs: Types.NeverType},
      })
    }

    return ok(relationships)
  }

  provides() {
    if (!this.nameRef) {
      return super.provides()
    }

    return new Set([this.nameRef.name])
  }
}

/**
 * `_` will match anything, but will not assign it to scope.
 */
export class MatchIgnore extends MatchIdentifier {
  readonly nameRef?: Identifier = undefined

  toLisp() {
    return '_'
  }

  toCode() {
    return '_'
  }

  evalWithSubjectReturningRuntime(
    runtime: ValueRuntime,
    _op: Expression,
    lhs: Values.Value,
  ): GetValueRuntimeResult {
    return ok([Values.TrueValue, runtime])
  }
}

/**
 * `var-name` will match anything, and assigns it to scope. See MatchIdentifier for
 * implementation.
 */
export class MatchReference extends MatchIdentifier {
  constructor(readonly nameRef: Reference) {
    super(nameRef.range, nameRef.precedingComments)
  }

  toLisp() {
    return this.nameRef.toLisp()
  }

  toCode() {
    return this.nameRef.toCode()
  }

  evalWithSubjectReturningRuntime(
    runtime: ValueRuntime,
    _op: Expression,
    lhs: Values.Value,
  ): GetValueRuntimeResult {
    const mutableRuntime = new MutableValueRuntime(runtime)
    mutableRuntime.addLocalValue(this.nameRef.name, lhs)
    return ok([Values.TrueValue, mutableRuntime])
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
  readonly nameRef?: Identifier = undefined

  toLisp() {
    return SPREAD_OPERATOR
  }

  toCode() {
    return SPREAD_OPERATOR
  }
}

/**
 * [...values]
 */
export class MatchAssignRemainingExpression extends MatchIdentifier {
  constructor(
    range: Range,
    precedingComments: Comment[],
    readonly nameRef: Reference,
  ) {
    super(range, precedingComments)
  }

  toLisp() {
    return this.toCode()
  }

  toCode() {
    return `${SPREAD_OPERATOR}${this.nameRef.name}`
  }

  evalWithSubjectReturningRuntime(
    runtime: ValueRuntime,
    _op: Expression,
    lhs: Values.Value,
  ): GetValueRuntimeResult {
    const mutableRuntime = new MutableValueRuntime(runtime)
    mutableRuntime.addLocalValue(this.nameRef.name, lhs)
    return ok([lhs, mutableRuntime])
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

  evalWithSubject(runtime: ValueRuntime, op: Expression, lhs: Values.Value) {
    return this.matchExpr.evalWithSubject(runtime, op, lhs)
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
    return allProvides(this.args)
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
  ): GetRuntimeResult<[Types.AnonymousEnumDefinitionType, Types.EnumCase]> {
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
  ): GetRuntimeResult<[Types.AnonymousEnumDefinitionType, Types.EnumCase]> | undefined {
    if (type instanceof Types.OneOfType) {
      let enumInfo: [Types.AnonymousEnumDefinitionType, Types.EnumCase] | undefined
      for (const oneType of type.of) {
        const oneCheckResult = this._findOptionalEnumTypeThatMatchesCase(oneType)
        if (!oneCheckResult) {
          continue
        }

        if (oneCheckResult.isErr()) {
          return err(oneCheckResult.error)
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
    if (!(type instanceof Types.AnonymousEnumDefinitionType)) {
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

  evalWithSubject(_runtime: ValueRuntime, _op: Expression, lhs: Values.Value) {
    if (!(lhs instanceof Values.EnumValue)) {
      return okBoolean(false)
    }

    return okBoolean(lhs.name === this.name)
  }

  toLisp() {
    let code = ENUM_START + this.name
    const args = this.args.map(arg => arg.toLisp())

    if (this.args.length) {
      code += `(${args.join(' ')})`
    }

    return code
  }

  toCode() {
    let code = ENUM_START + this.name
    const args = this.args.map(arg => arg.toCode())

    if (args.length) {
      code += `(${args.join(', ')})`
    }

    return code
  }
}

export abstract class MatchLiteral extends MatchExpression {
  constructor(readonly literal: Literal) {
    super(literal.range, literal.precedingComments)
  }

  matchAssignReferences(): string[] {
    return []
  }

  getAsTypeExpression(runtime: TypeRuntime): GetTypeResult {
    return this.literal.getAsTypeExpression()
  }

  gimmeTrueStuffWith(
    runtime: TypeRuntime,
    formula: RelationshipFormula | undefined,
    _lhsType: Types.Type,
  ): GetRuntimeResult<Relationship[]> {
    if (!formula) {
      return ok([])
    }

    return this.getAsTypeExpression(runtime).map((type): Relationship[] => [
      {formula, comparison: {operator: 'instanceof', rhs: type}},
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

    return this.getAsTypeExpression(runtime).map(type => {
      return [{formula, comparison: {operator: '!instanceof', rhs: type}}]
    })
  }

  evalWithSubject(_runtime: ValueRuntime, _op: Expression, lhs: Values.Value) {
    if (this.literal.value.isInt() && !lhs.isInt()) {
      return okBoolean(false)
    }
    return okBoolean(this.literal.value.isEqual(lhs))
  }

  toLisp() {
    return this.literal.toLisp()
  }

  toCode() {
    return this.literal.toCode()
  }
}

export class MatchLiteralFloat extends MatchLiteral {}
export class MatchLiteralInt extends MatchLiteral {}

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
    // TODO: replace Literal with FloatValue and remove this check
    if (!this.start.value.isFloat()) {
      return Types.NeverType
    }

    if (hint.isRange()) {
      const numberType = this.getTypeWithHint(hint.type)
      if (numberType.isInt()) {
        return Types.intRange(numberType.narrowed)
      } else if (numberType.isFloat()) {
        return Types.floatRange(numberType.narrowed)
      }
      return Types.NeverType
    }

    // repeated in MatchBinaryRange
    let hintIsInt: boolean
    if (hint instanceof Types.OneOfType) {
      // if one of the types is an int and *none* of the types are a float
      hintIsInt =
        hint.of.some(type => type.isInt()) && !hint.of.some(type => type.isFloat() && !type.isInt())
    } else {
      hintIsInt = hint.isInt()
    }

    const value = this.start.value.value
    if (hintIsInt) {
      switch (this.op) {
        case '=':
          if (Math.round(value) !== value) {
            return Types.never()
          }
          return Types.int({min: value, max: value})
        case '>':
          return Types.int({min: Math.floor(value) + 1})
        case '>=':
          return Types.int({min: Math.ceil(value)})
        case '<':
          return Types.int({max: Math.ceil(value) - 1})
        case '<=':
          return Types.int({max: Math.floor(value)})
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

    return ok([{formula, comparison: {operator: 'instanceof', rhs: type}}])
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
      relationships.push({formula, comparison: {operator: invertSymbol(operator), rhs}})
    }
    return ok(relationships)
  }

  evalWithSubject(_runtime: ValueRuntime, op: Expression, lhs: Values.Value) {
    if (lhs.isRange()) {
      const [min, exclusiveMin] = lhs.start ?? []
      const [max, exclusiveMax] = lhs.stop ?? []
      switch (this.op) {
        case '=':
          if (exclusiveMin || exclusiveMax || !min || !max || min.value !== max.value) {
            return okBoolean(false)
          }
          return comparisonOperation(op, min, this.start.value, (lhs, rhs) => lhs === rhs)
        case '>':
        case '>=':
          if (!min) {
            return okBoolean(false)
          }
          return comparisonOperation(op, min, this.start.value, (lhsMin, match) =>
            // exclusiveMin implies that the range's minimum is open-ended:
            //     range = 0<..10
            // Whether the match is `range is >0` or `range is >=0`, both of
            // these are true. On the other hand, a closed range
            //     range = 0...10
            //  will only match `range is >=0`, otherwise it needs to be
            //  *greater* than the range value, e.g. `range is > -1`
            exclusiveMin || this.op === '>=' ? lhsMin >= match : lhsMin > match,
          )
        case '<':
        case '<=':
          if (!max) {
            return okBoolean(false)
          }
          // see above discussion for why exclusiveMax or this.op === '<=' use
          // the '<=' comparison, and only inclusive ranges matching against '<'
          // use the '<' comparison
          return comparisonOperation(op, max, this.start.value, (lhsMax, match) =>
            exclusiveMax || this.op === '<=' ? lhsMax <= match : lhsMax < match,
          )
      }
    }

    if (!lhs.isFloat()) {
      return okBoolean(false)
    }
    switch (this.op) {
      case '=':
        return comparisonOperation(op, lhs, this.start.value, (lhs, rhs) => lhs === rhs)
      case '>':
        return comparisonOperation(op, lhs, this.start.value, (lhs, rhs) => lhs > rhs)
      case '>=':
        return comparisonOperation(op, lhs, this.start.value, (lhs, rhs) => lhs >= rhs)
      case '<':
        return comparisonOperation(op, lhs, this.start.value, (lhs, rhs) => lhs < rhs)
      case '<=':
        return comparisonOperation(op, lhs, this.start.value, (lhs, rhs) => lhs <= rhs)
    }
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
    // TODO: replace Literal with FloatValue and remove this check
    if (!this.start.value.isFloat() || !this.stop.value.isFloat()) {
      return Types.NeverType
    }

    if (hint.isRange()) {
      const numberType = this.getTypeWithHint(hint.type)
      if (numberType.isInt()) {
        return Types.intRange(numberType.narrowed)
      } else if (numberType.isFloat()) {
        return Types.floatRange(numberType.narrowed)
      }
      return Types.NeverType
    }

    // repeated in MatchUnaryRange
    let hintIsInt: boolean
    if (hint instanceof Types.OneOfType) {
      // if one of the types is an int and *none* of the types are a float
      const hasInt = hint.of.some(type => type.isInt() || hint.isIntRange())
      const hasFloatIntOrRange =
        // don't bother checking if there is no int
        hasInt &&
        hint.of.some(
          type => (type.isFloat() && !type.isInt()) || (type.isFloatRange() && !type.isIntRange()),
        )
      hintIsInt = hasInt && !hasFloatIntOrRange
    } else {
      hintIsInt = hint.isInt() || hint.isIntRange()
    }

    const minValue = this.start.value.value
    const maxValue = this.stop.value.value
    if (hintIsInt) {
      switch (this.op) {
        case '...':
          return Types.int({min: Math.ceil(minValue), max: Math.floor(maxValue)})
        case '<..':
          return Types.int({min: Math.floor(minValue) + 1, max: Math.floor(maxValue)})
        case '..<':
          return Types.int({min: Math.ceil(minValue), max: Math.ceil(maxValue) - 1})
        case '<.<':
          return Types.int({min: Math.floor(minValue) + 1, max: Math.ceil(maxValue) - 1})
      }
    }

    switch (this.op) {
      case '...':
        return Types.float({min: minValue, max: maxValue})
      case '<..':
        return Types.float({min: [minValue], max: maxValue})
      case '..<':
        return Types.float({min: minValue, max: [maxValue]})
      case '<.<':
        return Types.float({min: [minValue], max: [maxValue]})
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

    return ok([{formula, comparison: {operator: 'instanceof', rhs: type}}])
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

    // no more information available here (the number is either less than the
    // minimum, or greater than the maximum)
    return ok([{formula, comparison: {operator: '!instanceof', rhs: type}}])
  }

  evalWithSubject(_runtime: ValueRuntime, op: Expression, lhs: Values.Value) {
    if (lhs.isRange()) {
      const [min, exclusiveMin] = lhs.start ?? []
      const [max, exclusiveMax] = lhs.stop ?? []
      if (!min || !max) {
        return okBoolean(false)
      }

      // these comparisons are similarly calculated as MatchUnaryRange
      // comparisons. The min of the lhs-range should be >= the min of the
      // match, and the max of the lhs-range should be <= the max of the match.
      // Exclusive comparisons `<` or `>` are used if the lhs-range is inclusive
      // and the comparison is exclusive.
      const minCompare: (lhs: number, rhs: number) => boolean =
        exclusiveMin || this.op === '...' || this.op === '<..'
          ? (lhsMin, matchMin) => lhsMin >= matchMin
          : (lhsMin, matchMin) => lhsMin > matchMin
      return comparisonOperation(op, min, this.start.value, minCompare).map(minOk => {
        if (!minOk.isEqual(Values.TrueValue)) {
          return okBoolean(false)
        }
        const maxCompare: (lhs: number, rhs: number) => boolean =
          exclusiveMax || this.op === '...' || this.op === '..<'
            ? (lhxMax, matchMax) => lhxMax <= matchMax
            : (lhxMax, matchMax) => lhxMax < matchMax
        return comparisonOperation(op, max, this.stop.value, maxCompare)
      })
    }

    if (!lhs.isFloat()) {
      return okBoolean(false)
    }

    const minCompare: (lhsMin: number, matchMin: number) => boolean =
      this.op === '...' || this.op === '..<'
        ? (lhsMin, matchMin) => lhsMin >= matchMin
        : (lhsMin, matchMin) => lhsMin > matchMin
    return comparisonOperation(op, lhs, this.start.value, minCompare).map(minOk => {
      if (!minOk.isEqual(Values.TrueValue)) {
        return okBoolean(false)
      }

      const maxCompare: (lhsMax: number, matchMax: number) => boolean =
        this.op === '...' || this.op === '<..'
          ? (lhsMax, matchMax) => lhsMax <= matchMax
          : (lhsMax, matchMax) => lhsMax < matchMax
      return comparisonOperation(op, lhs, this.stop.value, maxCompare)
    })
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

export class MatchLiteralString extends MatchLiteral {
  constructor(readonly literal: LiteralString) {
    super(literal)
  }
}

export class MatchLiteralRegex extends MatchLiteral {
  constructor(readonly literal: LiteralRegex) {
    super(literal)
  }

  matchAssignReferences() {
    return Array.from(this.literal.groups.keys())
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
        relationships.push({
          formula: relationshipFormula.assign(name),
          comparison: {operator: 'instanceof', rhs: type},
        })
      }

      return relationships
    })
  }

  gimmeFalseStuffWith(
    _runtime: TypeRuntime,
    formula: RelationshipFormula | undefined,
    _lhsType: Types.Type,
  ): GetRuntimeResult<Relationship[]> {
    const relationships: Relationship[] = []
    if (formula) {
      const relationships: Relationship[] = []
      if (formula) {
        const ref = {
          formula,
          comparison: {
            operator: 'instanceof',
            rhs: Types.string({regex: [this.literal.value.value]}),
          },
        } as const
        relationships.push(ref)
      }
    }

    return ok(relationships)
  }

  evalWithSubjectReturningRuntime(
    runtime: ValueRuntime,
    _op: Expression,
    lhs: Values.Value,
  ): GetValueRuntimeResult {
    if (!lhs.isString()) {
      return ok([Values.FalseValue, runtime])
    }

    const matchInfo = lhs.value.match(this.literal.value.value)
    if (!matchInfo || !this.literal.groups.size || !matchInfo.groups) {
      return ok([Values.booleanValue(!!matchInfo), runtime])
    }

    const mutableRuntime = new MutableValueRuntime(runtime)
    for (const [name, value] of Object.entries(matchInfo.groups)) {
      mutableRuntime.addLocalValue(name, Values.string(value))
    }
    return ok([Values.TrueValue, mutableRuntime])
  }
}

/**
 * The types of prefix, matches, and last enforce the alternation requirement:
 *     foo is "prefix"
 *     -- prefix = "prefix"
 *     -- matches = []
 *     -- lastRef = undefined
 *
 *     foo is "prefix" .. value
 *     -- prefix = "prefix"
 *     -- matches = []
 *     -- lastRef = value
 *
 *     foo is value .. "suffix"
 *     -- prefix = undefined
 *     -- matches = [value, 'suffix']
 *     -- lastRef = undefined
 *
 *     foo is "pre" .. value .. "post"
 *     -- prefix = "pre"
 *     -- matches = [value, 'post']
 *     -- lastRef = undefined
 *
 *     foo is "pre" .. value .. "post" .. remainder
 *     -- prefix = "pre"
 *     -- matches = [value, 'post']
 *     -- lastRef = remainder
 */
export class MatchStringExpression extends MatchExpression {
  constructor(
    range: Range,
    precedingComments: Comment[],
    readonly prefix: MatchLiteralString | undefined,
    readonly matches: [MatchReference, MatchLiteralString][],
    readonly lastRef: MatchReference | undefined,
  ) {
    super(range, precedingComments)
  }

  all(): (MatchReference | MatchLiteralString)[] {
    const all: (MatchReference | MatchLiteralString)[] = this.prefix ? [this.prefix] : []
    for (const [match, literal] of this.matches) {
      all.push(match)
      all.push(literal)
    }
    if (this.lastRef) {
      all.push(this.lastRef)
    }
    return all
  }

  refs(): MatchReference[] {
    return this.matches.map(([match]) => match).concat(this.lastRef ? [this.lastRef] : [])
  }

  literals(): MatchLiteralString[] {
    return (this.prefix ? [this.prefix] : []).concat(this.matches.map(([, literal]) => literal))
  }

  matchAssignReferences() {
    return this.refs().flatMap(match => match.matchAssignReferences())
  }

  provides() {
    return new Set(this.matchAssignReferences())
  }

  private calcMatchLength() {
    return this.literals().reduce((minLength, arg) => {
      return minLength + arg.literal.value.length
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

    for (const arg of this.all()) {
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

  /**
   * Returns a tuple of either
   *     [didMatch: true, assignments, remainder]`
   * or
   *     [didMatch: false, [], '']
   */
  private searchRemainder(
    remainder: string,
    // array of [ref-name, literal]
    matches: [string, string][],
    assigns: [string, string][] = [],
  ): [boolean, [string, string][], string] {
    if (matches.length === 0) {
      return [true, assigns, remainder]
    }

    if (remainder === '') {
      throw "TODO: this should never happen - MatchStringLiteral is ''"
    }

    // find all the indices of 'remainder' that contain matches[0],
    // for every match, search for the remaining matches. this is a
    // breadth-first search.
    const [matchInfo, ...remaining] = matches
    const [ref, match] = matchInfo
    let index = remainder.indexOf(match)
    while (index !== -1) {
      const skipped = remainder.slice(0, index)
      const nextRemainder = remainder.slice(index + match.length)

      assigns.push([ref, skipped])
      const [found, finalAssigns, finalRemainder] = this.searchRemainder(
        nextRemainder,
        remaining,
        assigns,
      )
      if (found) {
        return [true, finalAssigns, finalRemainder]
      }
      assigns.pop()

      index = remainder.indexOf(match)
    }

    return [false, [], '']
  }

  evalWithSubjectReturningRuntime(
    runtime: ValueRuntime,
    _op: Expression,
    lhs: Values.Value,
  ): GetValueRuntimeResult {
    if (!lhs.isString()) {
      return ok([Values.FalseValue, runtime])
    }

    let subject = lhs.value
    // check the first arg for MatchStringLiteral, and see if it's the prefix
    if (this.prefix) {
      const firstMatch = this.prefix.literal.value.value
      if (!subject.startsWith(firstMatch)) {
        return ok([Values.FalseValue, runtime])
      }
      subject = subject.slice(firstMatch.length)
    }

    // because of how args are parsed, we always have an alternation of
    // [literal, ref, literal, ref, ...]. We removed the first and last literal
    // (if they exist), so if we have anything, we have a reference, followed by
    // (if any) a string, and another reference.
    const matches: [string, string][] = this.matches.map(([ref, lit]) => [
      ref.nameRef.name,
      lit.literal.value.value,
    ])

    // small optimization: if the last arg is a MatchStringLiteral, check for
    // suffix (and pop it from the args stack)
    const lastAssign: [string, string][] = []
    const lastMatch = this.lastRef === undefined && matches.pop()
    if (lastMatch) {
      const [matchRef, matchString] = lastMatch
      if (!subject.endsWith(matchString)) {
        return ok([Values.FalseValue, runtime])
      }

      subject = subject.slice(0, -matchString.length)
      lastAssign.push([matchRef, subject])
    }

    // check the remainders and return. if didMatch is false, assigns is empty.
    const [didMatch, assigns, remainder] = this.searchRemainder(subject, matches)
    if (!didMatch) {
      ok([Values.FalseValue, runtime])
    }

    const mutableRuntime = new MutableValueRuntime(runtime)
    for (const [name, value] of assigns) {
      mutableRuntime.addLocalValue(name, Values.string(value))
    }
    if (this.lastRef) {
      mutableRuntime.addLocalValue(this.lastRef.nameRef.name, Values.string(remainder))
    }
    return ok([Values.booleanValue(didMatch), mutableRuntime])
  }

  toLisp() {
    const args = this.all().map(arg => arg.toLisp())

    return `(${args.join(' .. ')})`
  }

  toCode() {
    const args = this.all().map(arg => arg.toCode())

    return args.join(' .. ')
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
    readonly initialExprs: MatchExpression[],
    readonly remainingExpr:
      | MatchIgnoreRemainingExpression
      | MatchAssignRemainingExpression
      | undefined,
    readonly trailingExprs: MatchExpression[],
  ) {
    super(range, precedingComments)
  }

  all() {
    return this.initialExprs
      .concat(this.remainingExpr ? [this.remainingExpr] : [])
      .concat(this.trailingExprs)
  }

  alwaysMatches(lhs: Types.Type): boolean {
    if (lhs instanceof Types.OneOfType) {
      return lhs.of.every(type => this.alwaysMatches(lhs))
    }
    if (!(lhs instanceof Types.ArrayType)) {
      return false
    }
    if (this.remainingExpr) {
      return this.remainingExpr.alwaysMatches(lhs.of)
    }

    const minLength = this.initialExprs.length + this.trailingExprs.length
    if (
      lhs.narrowedLength.min === undefined ||
      lhs.narrowedLength.max === undefined ||
      lhs.narrowedLength.min !== minLength ||
      lhs.narrowedLength.max !== minLength
    ) {
      return false
    }

    return this.initialExprs.concat(this.trailingExprs).every(expr => expr.alwaysMatches(lhs.of))
  }

  matchAssignReferences() {
    return this.all().flatMap(match => match.matchAssignReferences())
  }

  provides() {
    return allProvides(this.all())
  }

  gimmeTrueStuffWith(
    runtime: TypeRuntime,
    formula: RelationshipFormula | undefined,
    lhsType: Types.Type,
  ): GetRuntimeResult<Relationship[]> {
    // if no types are an array, raise an error
    let checkType = lhsType
    if (lhsType instanceof Types.OneOfType) {
      for (const type of lhsType.of) {
        if (type instanceof Types.ArrayType) {
          checkType = type
          break
        }
      }
    }

    if (!(checkType instanceof Types.ArrayType)) {
      return err(
        new RuntimeError(
          this,
          `Invalid match expression - '${this}: ${lhsType}' does not match array expression '${this}'`,
        ),
      )
    }

    const relationships: Relationship[] = []
    if (this.remainingExpr) {
      const result = this.gimmeTrueStuffKeepingArrays(runtime, formula, lhsType)
      if (result.isErr()) {
        return err(result.error)
      }
      relationships.push(...result.value)
    }

    if (formula || this.initialExprs.length || this.trailingExprs.length) {
      const result = this.gimmeTrueTypes(lhsType).map(type => {
        if (formula) {
          relationships.push({
            formula,
            comparison: {
              operator: 'instanceof',
              rhs: type,
            },
          })
        }

        const ofType = this.arrayTypeFromTypes(type)
        for (const expr of this.initialExprs.concat(this.trailingExprs)) {
          const result = expr.gimmeTrueStuffWith(runtime, undefined, ofType)
          if (result.isErr()) {
            return err(result.error)
          }
          relationships.push(...result.value)
        }
      })

      if (result.isErr()) {
        return err(result.error)
      }
    }

    // TODO: add relationships for matching expressions in initialExprs and
    // trailingExprs

    return ok(relationships)
  }

  /**
   * returns `type.of` if it is an ArrayType, or combines all the 'of' types if
   * type is a one-of type (it should contain arrays in that case). Otherwise
   * returns `never`.
   */
  private arrayTypeFromTypes(type: Types.Type) {
    if (type instanceof Types.OneOfType) {
      return Types.oneOf(
        type.of.flatMap(type => (type instanceof Types.ArrayType ? [type.of] : [])),
      )
    } else if (type instanceof Types.ArrayType) {
      return type.of
    } else {
      return Types.NeverType
    }
  }

  private gimmeTrueTypes(type: Types.Type): GetTypeResult {
    if (type instanceof Types.OneOfType) {
      return mapAll(
        type.of
          .filter(lhsType => lhsType instanceof Types.ArrayType)
          .map(lhsType => this.gimmeTrueTypes(lhsType)),
      )
        .map(types => types.filter(lhsType => lhsType !== Types.NeverType))
        .map(types => Types.oneOf(types))
    } else if (!(type instanceof Types.ArrayType)) {
      return ok(Types.NeverType)
    }

    const arrayOfType = type.of
    const minLength = this.initialExprs.length + this.trailingExprs.length
    const maxLength = this.remainingExpr ? undefined : minLength
    const nextNarrow = Narrowed.narrow(type.narrowedLength, {min: minLength, max: maxLength})
    if (nextNarrow === undefined) {
      return ok(Types.NeverType)
    }

    return ok(Types.array(arrayOfType, nextNarrow))
  }

  /**
   * After an exhaustive array check, only array types are left. Remove
   * all other types from one-of. Inverse of gimmeFalseStuffRemovingArrays
   */
  gimmeTrueStuffKeepingArrays(
    runtime: TypeRuntime,
    formula: RelationshipFormula | undefined,
    type: Types.Type,
  ): GetRuntimeResult<Relationship[]> {
    let rhsType: Types.Type
    if (type instanceof Types.OneOfType) {
      rhsType = Types.oneOf(type.of.filter(type => type instanceof Types.ArrayType))
    } else if (type instanceof Types.ArrayType) {
      rhsType = type
    } else {
      rhsType = Types.NeverType
    }

    const relationships: Relationship[] = []
    if (formula) {
      relationships.push({formula, comparison: {operator: 'instanceof', rhs: rhsType}})
    }

    if (this.remainingExpr?.nameRef) {
      const ofType = this.arrayTypeFromTypes(rhsType)
      const name = this.remainingExpr.nameRef.name
      const assign = {
        formula: relationshipFormula.assign(name),
        comparison: {operator: 'instanceof', rhs: ofType},
      } as const
      relationships.push(assign)
      const result = this.remainingExpr.gimmeTrueStuffWith(runtime, undefined, ofType)
      if (result.isErr()) {
        return err(result.error)
      }
      relationships.push(...result.value)
    }

    return ok(relationships)
  }

  /**
   * In the false case, we might be able to refine the array type.
   * - If the array matches all elements, then the array type is 'never'
   * - If the array matches the minimum array length, then the false case has
   * the minimum increased by one
   * - Likewise if the array matches the maximum array length, the false case
   * has the maximum decreased by one
   * - It gets weirder... if the array matches *somewhere* in the length
   * range, the array could have less OR more than the matched items.
   *
   * But oh, good news, it's all handled by asserting against the length, using
   * `Array(all, minLength ... minLength)`. This comment was a lot more relevant
   * when this implementation was a hundred+ lines.
   */
  gimmeFalseStuffWith(
    _runtime: TypeRuntime,
    formula: RelationshipFormula | undefined,
    lhsType: Types.Type,
  ): GetRuntimeResult<Relationship[]> {
    const relationships: Relationship[] = []
    if (formula) {
      if (this.remainingExpr) {
        return this.gimmeFalseStuffRemovingArrays(formula, lhsType)
      }

      const minLength = this.initialExprs.length + this.trailingExprs.length
      const type = Types.array(Types.all(), {min: minLength, max: minLength})
      relationships.push({
        formula,
        comparison: {
          operator: '!instanceof',
          rhs: type,
        },
      })
    }

    return ok(relationships)
  }

  /**
   * Used to implement the logic of gimmeFalseStuffWith, and will again when I
   * add support for scanning initialExprs/trailingExprs for array types.
   */
  gimmeFalseTypes(lhsType: Types.Type): GetTypeResult {
    if (lhsType instanceof Types.OneOfType) {
      return mapAll(
        lhsType.of
          .filter(lhsType => lhsType instanceof Types.ArrayType)
          .map(lhsType => this.gimmeFalseTypes(lhsType)),
      )
        .map(types => types.filter(lhsType => lhsType !== Types.NeverType))
        .map(types => Types.oneOf(types))
    } else if (!(lhsType instanceof Types.ArrayType)) {
      // in the false case, `lhs is []` will never match, and so if lhs isn't an
      // array, it will always be whatever it was at the start. Also, this
      // case raises an error in 'gimmeTrueStuffWith'.
      return ok(lhsType)
    }

    const arrayOfType = lhsType.of
    const minLength = this.initialExprs.length + this.trailingExprs.length
    const nextNarrow = Narrowed.exclude(lhsType.narrowedLength, {min: minLength, max: minLength})
    return ok(Types.oneOf(nextNarrow.map(nextNarrow => Types.array(arrayOfType, nextNarrow))))
  }

  /**
   * After an exhaustive array check, only non-array types are left. Remove
   * arrays from one-of, return 'never' if lhs is Array, otherwise return lhs.
   */
  gimmeFalseStuffRemovingArrays(
    formula: RelationshipFormula,
    lhsType: Types.Type,
  ): GetRuntimeResult<Relationship[]> {
    let rhsType: Types.Type
    if (lhsType instanceof Types.OneOfType) {
      rhsType = Types.oneOf(lhsType.of.filter(type => !(type instanceof Types.ArrayType)))
    } else if (lhsType instanceof Types.ArrayType) {
      rhsType = Types.NeverType
    } else {
      rhsType = lhsType
    }
    return ok([{formula, comparison: {operator: 'instanceof', rhs: rhsType}}])
  }

  evalWithSubjectReturningRuntime(
    runtime: ValueRuntime,
    _op: Expression,
    lhs: Values.Value,
  ): GetValueRuntimeResult {
    if (!(lhs instanceof Values.ArrayValue)) {
      return ok([Values.FalseValue, runtime])
    }

    const minLength = this.initialExprs.length + this.trailingExprs.length
    if ((!this.remainingExpr && lhs.values.length !== minLength) || lhs.values.length < minLength) {
      return ok([Values.FalseValue, runtime])
    }

    const initialValues = lhs.values.slice(0, this.initialExprs.length)
    const trailingValues = lhs.values.slice(-this.trailingExprs.length)

    let nextRuntime = runtime
    for (const index in this.initialExprs) {
      const matchExpr = this.initialExprs[index]
      const value = initialValues[index]
      const nextRuntimeResult = matchExpr.evalWithSubjectReturningRuntime(nextRuntime, this, value)
      if (nextRuntimeResult.isErr()) {
        return err(nextRuntimeResult.error)
      }
      nextRuntime = nextRuntimeResult.value[1]
    }

    if (this.remainingExpr) {
      const remainingValues = lhs.values.slice(this.initialExprs.length, -this.trailingExprs.length)
      const nextRuntimeResult = this.remainingExpr.evalWithSubjectReturningRuntime(
        nextRuntime,
        this,
        new Values.ArrayValue(remainingValues),
      )
      if (nextRuntimeResult.isErr()) {
        return err(nextRuntimeResult.error)
      }
      nextRuntime = nextRuntimeResult.value[1]
    }

    for (const index in this.trailingExprs) {
      const matchExpr = this.trailingExprs[index]
      const value = trailingValues[index]
      const nextRuntimeResult = matchExpr.evalWithSubjectReturningRuntime(nextRuntime, this, value)
      if (nextRuntimeResult.isErr()) {
        return err(nextRuntimeResult.error)
      }
      nextRuntime = nextRuntimeResult.value[1]
    }

    return ok([Values.TrueValue, nextRuntime])
  }

  toLisp() {
    const args = this.all().map(arg => arg.toLisp())

    return `[${args.join(' ')}]`
  }

  toCode() {
    const args = this.all().map(arg => arg.toCode())

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

  /**
   * H'okay, so. Case expressions can have multiple matches:
   *     switch (subject) {
   *       case [first] or [_, first] or …
   *
   * We combine all these matches using the same logic as we do with 'or'
   *
   *      subject is [first] or subject is [_, first]
   *
   * Except, unlike 'or' expressions, cases need not have the same assignments
   * in all branches (missing assignments default to 'null').
   *
   * To calculate this, we need to iterate through the matches, keeping track
   * of the previous match-expression (so that we can calculate its
   * `assumeFalse` runtime) and previous truthy-runtime (so that we can combine
   * it with the current match's `assumeTrue` runtime). The return value is the
   * final `combineEitherTypeRuntimes` (or if there is only one match
   * expression, this all reduces to just calculating its `assumeTrue` runtime)
   */
  assumeTrueWith(
    runtime: TypeRuntime,
    formula: RelationshipFormula | undefined,
    subjectType: Types.Type,
  ) {
    let currentRuntime = runtime
    let nextRuntime: TypeRuntime | undefined
    let prevExpr: MatchExpression | undefined
    for (const matchExpr of this.matches) {
      if (prevExpr) {
        const prevFalseRuntimeResult = prevExpr.assumeFalseWith(
          currentRuntime,
          formula,
          subjectType,
        )
        if (prevFalseRuntimeResult.isErr()) {
          return err(prevFalseRuntimeResult.error)
        }

        currentRuntime = prevFalseRuntimeResult.value
      }

      const nextRuntimeResult = matchExpr.assumeTrueWith(currentRuntime, formula, subjectType)
      if (nextRuntimeResult.isErr()) {
        return err(nextRuntimeResult.error)
      }

      if (nextRuntime && prevExpr) {
        const combinedRuntimeResult = combineEitherTypeRuntimes(
          currentRuntime,
          nextRuntime,
          nextRuntimeResult.value,
          'case',
        )
        nextRuntime = combinedRuntimeResult.get()
      } else {
        nextRuntime = nextRuntimeResult.value
      }

      prevExpr = matchExpr
    }

    return ok(nextRuntime ?? runtime)
  }

  /**
   * The false condition is much simpler - `assumeFalse` of every match
   * expression (again, the same logic as `or` expressions).
   */
  assumeFalseWith(
    runtime: TypeRuntime,
    formula: RelationshipFormula | undefined,
    subjectType: Types.Type,
  ) {
    return this.matches.reduce((runtime, matchExpr): GetRuntimeResult<TypeRuntime> => {
      if (runtime.isErr()) {
        return err(runtime.error)
      }

      return matchExpr.assumeFalseWith(runtime.value, formula, subjectType)
    }, ok(runtime))
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
    code += '\n'
    code += indent(this.bodyExpression.toCode())
    return code
  }
}

/**
 * This is the return type indicator for the `Msg` type, regardless of where
 * that message is being returned. Messages constructors are always bound
 * functions, so the value of 'this' determines the recipient.
 */
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

//|
//|  Control Flow Expressions
//|

export class IfExpression extends Expression {
  symbol = 'if'

  constructor(
    range: Range,
    precedingComments: Comment[],
    followingComments: Comment[],
    readonly conditionExpr: Expression,
    readonly thenExpr: Expression,
    readonly elseExpr: Expression | undefined,
    readonly preferCode: 'oneline' | 'multiline',
  ) {
    super(range, precedingComments, followingComments)
  }

  /**
   * No need to enclose function invocations in `(…)`
   */
  toViewPropCode() {
    return this.toCode()
  }

  toLisp() {
    return `(if ${this.conditionExpr.toLisp()} (then: ${this.thenExpr.toLisp()})${
      this.elseExpr ? ` (else: ${this.elseExpr.toLisp()})` : ''
    })`
  }

  toCode(precedence: number = 0): string {
    if (precedence > 0) {
      return `(${this.toCode()})`
    }

    return this.toIfCode()
  }

  toIfCode(forceNewline = false) {
    const conditionCode = this.conditionExpr.toCode()
    const thenCode = this.thenExpr.toCode()
    const elseCode =
      this.elseExpr instanceof IfExpression
        ? this.elseExpr.toIfCode(true)
        : (this.elseExpr?.toCode() ?? '')

    let totalLength = 0
    const hasNewline =
      forceNewline ||
      this.preferCode === 'multiline' ||
      conditionCode.includes('\n') ||
      thenCode.includes('\n') ||
      elseCode.includes('\n')
    if (!hasNewline) {
      totalLength += conditionCode.length + thenCode.length + elseCode.length
      totalLength += ' then '.length
      totalLength += elseCode ? ' else '.length : 0
    }

    if (hasNewline || totalLength > SMALL_LEN) {
      let code = 'if '
      if (conditionCode.includes('\n')) {
        code += indent(conditionCode)
      } else {
        code += conditionCode
      }
      code += '\n'

      code += indent(thenCode) + '\n'
      if (elseCode && this.elseExpr instanceof IfExpression) {
        code += 'else '
        code += elseCode
      } else if (elseCode) {
        code += 'else\n'
        code += indent(elseCode)
      }
      return code
    } else {
      let code = 'if '
      code += conditionCode
      code += ' then '
      code += thenCode
      if (elseCode) {
        code += ' else '
        code += elseCode
      }
      return code
    }
  }

  getType(runtime: TypeRuntime): GetTypeResult {
    const conditionExpr = this.conditionExpr
    const thenExpr = this.thenExpr
    const elseExpr = this.elseExpr
    if (!conditionExpr) {
      return err(new RuntimeError(this, expectedIfCondition()))
    }

    if (!thenExpr) {
      return err(new RuntimeError(this, expectedIfThenResult()))
    }

    return getChildType(this, conditionExpr, runtime).map(conditionType => {
      // allow literal 'true/false' expressions (for testing)
      // TODO: disallow for "production" builds
      if (!(conditionExpr instanceof LiteralTrue) && !(conditionExpr instanceof LiteralFalse)) {
        if (conditionType.isOnlyTruthyType()) {
          return err(new RuntimeError(this, unexpectedOnlyType(conditionType, true)))
        }

        if (conditionType.isOnlyFalseyType()) {
          return err(new RuntimeError(this, unexpectedOnlyType(conditionType, false)))
        }
      }

      // Evaluate 'then' as if conditionExpr is true
      const returnResult = conditionExpr
        .assumeTrue(runtime)
        .map(truthyRuntime => getChildType(this, thenExpr, truthyRuntime))
      if (returnResult.isErr()) {
        return err(returnResult.error)
      }

      let returnType = returnResult.value

      // Evaluate 'elseif' conditions as if conditionExpr is false.
      // merge the results of the 'then' and 'elseif' expressions into one type
      // returnType = Types.compatibleWithBothTypes(returnType, elseifThenType)
      // falseyType then becomes the toFalseyType of the elseif conditionType.
      const nextRuntimeResult = conditionExpr.assumeFalse(runtime)
      if (nextRuntimeResult.isErr()) {
        return err(nextRuntimeResult.error)
      }
      let nextRuntime = nextRuntimeResult.value

      if (elseExpr) {
        const elseType = getChildType(this, elseExpr, nextRuntime)
        if (elseType.isErr()) {
          return err(elseType.error)
        }

        returnType = Types.compatibleWithBothTypes(returnType, elseType.value)
      } else {
        returnType = Types.optional(returnType)
      }

      // damn y'all, we made it
      return ok(returnType)
    })
  }

  eval(runtime: ValueRuntime): GetValueResult {
    const conditionExpr = this.conditionExpr
    const thenExpr = this.thenExpr
    const elseExpr = this.elseExpr
    if (!conditionExpr) {
      return err(new RuntimeError(this, expectedIfCondition()))
    }

    if (!thenExpr) {
      return err(new RuntimeError(this, expectedIfThenResult()))
    }

    return conditionExpr.evalReturningRuntime(runtime).map(([conditionValue, thenRuntime]) => {
      if (conditionValue.isTruthy()) {
        return thenExpr.eval(thenRuntime)
      }

      if (elseExpr) {
        return elseExpr.eval(runtime)
      }

      // that wasn't so bad
      return ok(Values.NullValue)
    })
  }
}

export class GuardExpression extends Expression {
  symbol = 'guard'

  constructor(
    range: Range,
    precedingComments: Comment[],
    followingComments: Comment[],
    readonly conditionExpr: Expression,
    readonly thenExpr: Expression,
    readonly elseExpr: Expression,
  ) {
    super(range, precedingComments, followingComments)
  }

  /**
   * No need to enclose function invocations in `(…)`
   */
  toViewPropCode() {
    return this.toCode()
  }

  toLisp() {
    return `(guard ${this.conditionExpr.toLisp()} (else: ${this.elseExpr.toLisp()}) (then: ${this.thenExpr.toLisp()}))`
  }

  toCode(precedence: number = 0): string {
    if (precedence > 0) {
      return `(${this.toCode()})`
    }
    const condition = this.conditionExpr.toCode()
    const elseCode = this.elseExpr.toCode()
    const bodyCode = this.thenExpr.toCode()

    let code = 'guard\n'
    code += indent(condition) + '\n'
    code += 'else\n'
    code += indent(elseCode) + '\n'
    code += '\n'
    code += bodyCode
    return code
  }

  getType(runtime: TypeRuntime): GetTypeResult {
    const bodyExpr = this.thenExpr
    const conditionExpr = this.conditionExpr
    const elseExpr = this.elseExpr
    if (!bodyExpr || !conditionExpr) {
      return err(new RuntimeError(this, expectedGuardArguments()))
    }

    if (!elseExpr) {
      return err(new RuntimeError(this, expectedGuardElseResult()))
    }

    let nextRuntime = runtime
    let elseRuntime = runtime
    const conditionType = getChildType(this, conditionExpr, nextRuntime)
    if (conditionType.isErr()) {
      return err(conditionType.error)
    }

    // allow literal 'true/false' expressions (for testing)
    // TODO: disallow for "production" builds

    if (!(conditionExpr instanceof LiteralTrue) && !(conditionExpr instanceof LiteralFalse)) {
      if (conditionType.value.isOnlyTruthyType()) {
        return err(new RuntimeError(this, unexpectedOnlyType(conditionType.value, true)))
      }

      if (conditionType.value.isOnlyFalseyType()) {
        return err(new RuntimeError(this, unexpectedOnlyType(conditionType.value, false)))
      }
    }

    const nextRuntimeResult = conditionExpr.assumeTrue(runtime)
    if (nextRuntimeResult.isErr()) {
      return err(nextRuntimeResult.error)
    }

    const elseRuntimeResult = conditionExpr.assumeFalse(runtime)
    if (elseRuntimeResult.isErr()) {
      return err(elseRuntimeResult.error)
    }
    elseRuntime = elseRuntimeResult.value

    nextRuntime = nextRuntimeResult.value

    return bodyExpr
      .getType(nextRuntime)
      .map(bodyType =>
        elseExpr
          .getType(elseRuntime)
          .map(elseType => Types.compatibleWithBothTypes(bodyType, elseType)),
      )
  }

  eval(runtime: ValueRuntime): GetValueResult {
    const bodyExpr = this.thenExpr
    const conditionExpr = this.conditionExpr
    const elseExpr = this.elseExpr
    if (!bodyExpr || !conditionExpr) {
      return err(new RuntimeError(this, expectedGuardArguments()))
    }

    if (!elseExpr) {
      return err(new RuntimeError(this, expectedGuardElseResult()))
    }

    return conditionExpr.evalReturningRuntime(runtime).map(([conditionValue, bodyRuntime]) => {
      if (!conditionValue.isTruthy()) {
        return elseExpr.eval(runtime)
      }

      return bodyExpr.eval(bodyRuntime)
    })
  }
}

export class SwitchExpression extends Expression {
  symbol = 'switch'

  constructor(
    range: Range,
    precedingComments: Comment[],
    followingComments: Comment[],
    readonly subjectExpr: Expression,
    readonly caseExprs: CaseExpression[],
    readonly elseExpr?: Expression,
  ) {
    super(range, precedingComments, followingComments)
  }

  /**
   * No need to enclose function invocations in `(…)`
   */
  toViewPropCode() {
    return this.toCode()
  }

  toLisp() {
    return `(switch ${this.subjectExpr.toLisp()} ${this.caseExprs
      .map(expr => expr.toLisp())
      .join(' ')}${this.elseExpr ? ` (else: ${this.elseExpr.toLisp()})` : ''})`
  }

  toCode(): string {
    const subjectCode = this.subjectExpr.toCode()
    let lines: string[] = ['switch ' + subjectCode]
    for (const caseExpr of this.caseExprs) {
      lines.push(caseExpr.toCode())
    }
    if (this.elseExpr) {
      lines.push('else')
      lines.push(indent(this.elseExpr.toCode()))
    }

    return lines.join('\n')
  }

  // rhsType(runtime: TypeRuntime, lhsType: Types.Type, lhsExpr: Expression, rhsExpr: Expression) {
  rhsType(): GetTypeResult {
    return ok(Types.AllType)
  }

  getType(runtime: TypeRuntime): GetTypeResult {
    const subjectExpr = this.subjectExpr
    const caseExprs = this.caseExprs
    const elseExpr = this.elseExpr

    if (!subjectExpr) {
      return err(new RuntimeError(this, expectedSubjectCondition()))
    }

    if (!caseExprs) {
      return err(new RuntimeError(this, expectedCaseConditions()))
    }

    const subjectFormula = subjectExpr.relationshipFormula(runtime)
    let nextRuntime: TypeRuntime = runtime
    return getChildType(this, subjectExpr, runtime)
      .map(initialSubjectType => {
        let trackingFormula: RelationshipAssign
        if (subjectFormula && isAssign(subjectFormula)) {
          trackingFormula = subjectFormula
        } else {
          // Let me explain this hack. No, it will take too long. Let me sum up.
          // If subjectFormula is not defined, or not expressible as an
          // assignment, then relationshipToType below will fail. We need an
          // assignable relationship in order to check the type of the subject
          // in each caseExpr 'false' branch. So we fake it! We "assign" the
          // subject to a variable named after the expression... the runtime
          // only cares about strings, so we are guaranteed this expression will
          // not be expressible by "user-land" references, and it makes
          // debugging a joy.
          const mutableRuntime = new MutableTypeRuntime(runtime)
          const id = mutableRuntime.addLocalType(subjectExpr.toCode(), initialSubjectType)
          trackingFormula = relationshipFormula.reference(subjectExpr.toCode(), id)
          nextRuntime = mutableRuntime
        }

        return caseExprs.reduce(
          (info, caseExpr): GetRuntimeResult<[Types.Type, Types.Type[]]> => {
            if (info.isErr()) {
              return err(info.error)
            }

            const [subjectType, bodyTypes] = info.get()
            if (subjectType === Types.NeverType) {
              return err(
                new RuntimeError(
                  caseExpr,
                  `Unreachable case detected. '${subjectExpr}' is of type '${subjectType}' because the previous cases are exhaustive.`,
                ),
              )
            }

            const typeResult = caseExpr
              .assumeTrueWith(nextRuntime, trackingFormula, subjectType)
              .map(truthyRuntime => caseExpr.bodyExpression.getType(truthyRuntime))

            if (typeResult.isErr()) {
              return err(typeResult.error)
            }
            bodyTypes.push(typeResult.get())

            const runtimeResult = caseExpr.assumeFalseWith(
              nextRuntime,
              trackingFormula,
              subjectType,
            )

            if (runtimeResult.isErr()) {
              return err(runtimeResult.error)
            }

            nextRuntime = runtimeResult.get()
            const caseSubjectType = relationshipToType(nextRuntime, trackingFormula)
            if (!caseSubjectType) {
              throw new RuntimeError(
                this,
                "No subjectType type in SwitchExpression? that shouldn't happen",
              )
            }

            const nextSubjectType = Types.narrowTypeIs(subjectType, caseSubjectType)
            return ok([nextSubjectType, bodyTypes])
          },
          ok([initialSubjectType, []] as [Types.Type, Types.Type[]]),
        )
      })
      .map(([subjectType, bodyTypes]) => {
        if (elseExpr) {
          if (subjectType === Types.NeverType) {
            return err(
              new RuntimeError(
                elseExpr,
                `Unreachable case detected. '${subjectExpr}' is of type '${subjectType}' because the previous cases are exhaustive.`,
              ),
            )
          }

          const typeResult = elseExpr.getType(nextRuntime)
          if (typeResult.isErr()) {
            return err(typeResult.error)
          }

          bodyTypes.push(typeResult.get())
          return [Types.NeverType, bodyTypes]
        } else {
          return [subjectType, bodyTypes]
        }
      })
      .map(([subjectType, bodyTypes]) => {
        if (subjectType !== Types.NeverType) {
          return err(
            `Switch is not exhaustive, '${subjectExpr}' has unhandled type '${subjectType}'`,
          )
        }

        return Types.oneOf(bodyTypes)
      })
  }

  eval(runtime: ValueRuntime): GetValueResult {
    const subjectExpr = this.subjectExpr
    const caseExprs = this.caseExprs
    const elseExpr = this.elseExpr

    if (!subjectExpr) {
      return err(new RuntimeError(this, expectedSubjectCondition()))
    }

    if (!caseExprs) {
      return err(new RuntimeError(this, expectedCaseConditions()))
    }

    return subjectExpr.eval(runtime).map(subject => {
      for (const caseExpr of caseExprs) {
        const allAssigns = allNamesFrom(caseExpr.matches)

        for (const matchExpr of caseExpr.matches) {
          const didMatchResult = matchExpr.evalWithSubjectReturningRuntime(
            runtime,
            caseExpr,
            subject,
          )
          if (didMatchResult.isErr()) {
            return err(didMatchResult.error)
          }

          const [didMatch, matchRuntimeUnchecked] = didMatchResult.value
          if (didMatch.isTruthy()) {
            const matchRuntime = includeMissingNames(matchRuntimeUnchecked, allAssigns, matchExpr)
            return caseExpr.bodyExpression.eval(matchRuntime)
          }
        }
      }

      if (elseExpr) {
        return elseExpr.eval(runtime)
      }

      throw 'TODO: hm, should never reach here - no cases (or else) matched'
    })
  }
}

//|
//| Dice rolling!? Look up the history of Extra.
//|

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

/**
 * toCode formatting helper. Calls 'toCode' on every expression, then wraps it
 * in lhs/rhs using wrapStrings helper, which handles wrapping max
 * string-length.
 */
export function wrapValues(
  lhs: string,
  expressions: Expression[],
  rhs: string,
  joiner: string = ', ',
) {
  const codes = expressions.map(it => it.toCode())
  return wrapStrings(lhs, codes, rhs, joiner)
}

/**
 * Gets the type of 'expr', and on error it decorates the RuntimeError with the
 * parent expression.
 */
export function getChildType<T extends Expression>(
  parent: Expression,
  expr: T,
  runtime: TypeRuntime,
): ReturnType<T['getType']> {
  return expr.getType(runtime).mapResult(decorateError(parent)) as ReturnType<T['getType']>
}

/**
 * Gets the type of 'expr', and on error it decorates the RuntimeError with the
 * parent expression.
 */
export function getChildNode<T extends Expression>(
  parent: Expression,
  expr: T,
  runtime: TypeRuntime,
): ReturnType<T['compile']> {
  return expr.compile(runtime).mapResult(decorateError(parent)) as ReturnType<T['compile']>
}

/**
 * Gets the type of 'expr', and on error it decorates the RuntimeError with the
 * parent expression.
 */
export function getChildAsTypeExpression<T extends Expression>(
  parent: Expression,
  expr: T,
  runtime: TypeRuntime,
): ReturnType<T['getType']> {
  return expr.getAsTypeExpression(runtime).mapResult(decorateError(parent)) as ReturnType<
    T['getAsTypeExpression']
  >
}

function decorateError(expr: Expression) {
  return function mapError<T>(result: GetRuntimeResult<T>): GetRuntimeResult<T> {
    if (result.isErr() && result.error instanceof RuntimeError) {
      result.error.pushParent(expr)
    }
    return result
  }
}

export function comparisonOperation(
  expr: Expression,
  lhs: Values.Value,
  rhs: Values.Value,
  op: (lhs: number, rhs: number) => boolean,
): GetValueResult {
  if (lhs === Values.NaNValue || rhs === Values.NaNValue) {
    return okBoolean(false)
  }

  if (lhs.isInt() && rhs.isInt()) {
    return okBoolean(op(lhs.value, rhs.value))
  } else if (lhs.isFloat() && rhs.isFloat()) {
    return okBoolean(op(lhs.value, rhs.value))
  }

  const [lhsExpr, rhsExpr] = expr instanceof Operation ? expr.args : [expr, expr]
  if (lhs.isFloat()) {
    return err(new RuntimeError(rhsExpr, expectedNumberMessage(rhsExpr, rhs)))
  } else {
    return err(new RuntimeError(lhsExpr, expectedNumberMessage(lhsExpr, lhs)))
  }
}

export function expectedType(expected: string, expr: Expression, type?: Types.Type | Values.Value) {
  const message = `Expected ${expected}, found '${expr}'`
  if (type) {
    type = type instanceof Values.Value ? type.getType() : type
    return `${message} of type '${type}'`
  } else {
    return message
  }
}

export function expectedNumberMessage(found: Expression, type?: Types.Type | Values.Value) {
  return expectedType('Int or Float', found, type)
}

function expectedIfCondition() {
  return "Missing '# condition: Condition' in 'if()' expression"
}

function expectedIfThenResult() {
  return "Missing 'then: T' in 'if()' expression"
}

function expectedGuardArguments() {
  return "Missing '# condition: Condition' and '# body: T' in 'guard()' expression"
}

function expectedGuardElseResult() {
  return "Missing 'else: T' in 'guard()' expression"
}

function expectedSubjectCondition() {
  return "Missing subject argument '# subject: T' in 'switch()' expression"
}

function expectedCaseConditions() {
  return "Missing case expressions '...# cases: T' in 'switch()' expression"
}

function unexpectedOnlyType(conditionType: Types.Type, only: boolean): string {
  return `Type '${conditionType}' is invalid as an if condition, because it is always ${only ? 'true' : 'false'}.`
}

/**
 * Looks at all the match expressions and returns the assigned names
 *     case Int as foo <-- returns 'foo' from this match expression
 *     case [foo, bar] <-- returns 'foo', 'bar'
 */
export function allNamesFrom(expressions: Expression[]) {
  const names = new Set<string>()
  for (const matchExpr of expressions) {
    for (const name of matchExpr.matchAssignReferences()) {
      names.add(name)
    }
  }
  return names
}

/**
 * Assigns NullValue to any names that aren't already assigned, useful for
 * 'or'-ing match expressions that have different assigned names.
 */
export function includeMissingNames(
  runtime: ValueRuntime,
  allNames: Set<string>,
  fromExpr: Expression,
) {
  const matchNames = new Set(fromExpr.matchAssignReferences())
  const missingNames = difference(allNames, matchNames)
  if (!missingNames.size) {
    return runtime
  }

  const mutableRuntime = new MutableValueRuntime(runtime)
  for (const missingName of missingNames) {
    mutableRuntime.addLocalValue(missingName, Values.NullValue)
  }
  return mutableRuntime
}

export function allDependencies(expressions: Expression[], parentScopes: Scope[]) {
  return expressions.reduce(
    (set, expr) => union(set, expr.dependencies(parentScopes)),
    new Set<string>(),
  )
}

export function allProvides(expressions: Expression[]) {
  return expressions.reduce((set, expr) => union(set, expr.provides()), new Set<string>())
}

function findChain(
  needles: string[],
  haystack: string,
  visited: Set<string>,
  circular: Map<string, string[]>,
): Set<string> | undefined {
  if (!needles.length) {
    return
  }

  for (const needle of needles) {
    if (needle === haystack) {
      return new Set(needle)
    }

    if (visited.has(needle)) {
      continue
    }

    visited.add(needle)
    const next = circular.get(needle) ?? []
    const found = findChain(next, haystack, visited, circular)
    if (found) {
      return new Set([needle, ...found])
    }
  }
}

export function dependencySort<T extends Expression>(
  expressions: [string, T][],
  // returns 'true' if the dependency is available via the parent context
  providedInScope: (name: string) => boolean,
  parentScopes: Scope[],
): GetRuntimeResult<[string, T][]> {
  let expressionDeps: {
    name: string
    expr: T
    deps: string[]
  }[] = expressions.map(([name, expr]) => ({
    name,
    expr,
    deps: Array.from(expr.dependencies(parentScopes)),
  }))
  // locallyResolved are names that are being provided locally, which *may also*
  // be provided externally, but in this case the local override "wins" (we
  // should resolve it and use it locally, rather than use the external)
  //
  // let
  //   a = 1
  // in
  //   let
  //     c = a -- this will be resolved to 'a = 2'
  //     a = 2
  //     b = a -- and this will be resolved to 'a = 2'
  //   in
  //     ...
  const locallyResolved = new Set(expressions.map(([name]) => name))

  let nextIter: typeof expressionDeps = []
  const orderedExpressions: [string, T][] = []
  const resolved = new Set<string>()
  const nextResolved = new Set<string>()
  while (expressionDeps.length) {
    const circular = new Map<string, string[]>()
    for (const {name, expr, deps} of expressionDeps) {
      if (resolved.has(name)) {
        continue
      }
      // deps has the list of all the references that expr depends on. We want to:
      // - Remove expressions that have been resolved `resolved.has(depName)`
      // - Remove references that already exist in the parent scope
      //   (`providedInScope(depName)`) but that aren't defined in the list of
      //   expressions (!locallyResolved.has(depName))
      const unresolvedDeps = deps.filter(
        depName =>
          !(resolved.has(depName) || (providedInScope(depName) && !locallyResolved.has(depName))),
      )

      // less efficient... but only resolving one means that the next pass can
      // try to resolve *earlier* items in the array. The array is sorted in
      // "user" preference, so keeping that order (as much as possible) is good
      // for code formatting operations.
      if (!unresolvedDeps.length && !nextResolved.size) {
        nextResolved.add(name)
        orderedExpressions.push([name, expr])
      } else {
        circular.set(name, unresolvedDeps)
        nextIter.push({name, expr, deps})
      }
    }

    for (const name of nextResolved) {
      resolved.add(name)
      nextResolved.delete(name)
    }

    // expressionDeps should always be decreasing, if it stays the same we've hit an
    // unresolvable loop. Here's a first stab at a helpful error message.
    if (expressionDeps.length === nextIter.length) {
      const firstName = expressionDeps[0].name
      const dependencies = expressionDeps[0].expr.dependencies(parentScopes)
      const chain = findChain(circular.get(firstName) ?? [], firstName, new Set(), circular)
      if (chain && chain.size) {
        return err(
          new RuntimeError(
            expressionDeps[0].expr,
            `Circular dependency detected: ${firstName} --> ${[...chain].join(
              ' --> ',
            )} (dependencies: ${[...dependencies].join(', ')})`,
          ),
        )
      } else {
        const remainingDependencies = difference(dependencies, resolved)
        return err(
          new RuntimeError(
            expressionDeps[0].expr,
            `Unresolvable dependency detected: ${firstName} --> ${[...remainingDependencies].join(
              ', ',
            )}`,
          ),
        )
      }
    }

    expressionDeps = nextIter
    nextIter = []
  }

  return ok(orderedExpressions)
}

export function formatComments(comments: Comment[]) {
  let code = ''
  for (const comment of comments) {
    switch (comment.type) {
      case 'line':
      case 'arrow':
        code += comment.delim + comment.comment + '\n'
        break
      case 'box':
        code += comment.comment + '\n'
        break
      case 'block':
        code += '{-' + comment.comment + '-}'
        break
    }
  }
  return code
}

function okBoolean(value: boolean): GetValueResult {
  return ok(Values.booleanValue(value))
}

export function toSource(expression: Expression): Nodes.Source {
  return {
    start: expression.range[0],
    stop: expression.range[1],
    precedingComments: expression.precedingComments,
    followingComments: expression.followingComments,
  }
}
