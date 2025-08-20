import {err, mapAll, ok, type Result} from '@extra-lang/result'
import * as Types from '../types'
import * as Values from '../values'
import {
  MutableTypeRuntime,
  MutableValueRuntime,
  type TypeRuntime,
  type ValueRuntime,
} from '../runtime'
import {combineConcatLengths, combineSetLengths} from '../narrowed'
import {
  findEventualRef,
  verifyRelationship,
  relationshipFormula,
  type RelationshipMathSymbol,
  type RelationshipFormula,
  type RelationshipAssign,
  relationshipToType,
  isAssign,
  combineEitherTypeRuntimes,
} from '../relationship'
import * as Expressions from './expressions'
import {
  comparisonOperation,
  expectedNumberMessage,
  expectedType,
  getChildType,
  Operation,
  RuntimeError,
  type Expression,
  type Range,
} from './expressions'
import {stringSort} from './stringSort'
import {
  type AbstractOperator,
  type Comment,
  type GetRuntimeResult,
  type GetTypeResult,
  type GetValueResult,
  type GetValueRuntimeResult,
  type Operator,
} from './types'
import {indent, SMALL_LEN} from './util'
import {KWARG_OP} from '../types'
import {difference} from './set'

export const BINARY_OP_NAMES = ['and', 'or', 'has', '!has', 'is', '!is', 'matches'] as const
export const BINARY_OP_ALIASES = {
  '&&': 'and',
  '||': 'or',
  '!?': 'onlyif',
  '?!': 'onlyif',
  '≤': '<=',
  '≥': '>=',
  '≠': '!=',
} as const
export const UNARY_OP_NAMES = ['not'] as const
export const UNARY_OP_ALIASES = {
  '!': 'not',
} as const

export const LOWEST_PRECEDENCE = -1
export const HIGHEST_PRECEDENCE = 100

export const SPREAD_OPERATOR = '...'
export const STRING_CONCAT_OPERATOR = '..'
export const INCLUSION_OPERATOR = 'onlyif'
export const NULL_COALESCING_OPERATOR = '?.'

export const BINARY_ASSIGN_OPERATORS = [
  {name: 'logical-and-assign', symbol: '&=', binarySymbol: '&'},
  {name: 'logical-or-assign', symbol: '|=', binarySymbol: '|'},
  {name: 'logical-xor-assign', symbol: '^=', binarySymbol: '^'},
  {name: 'array-concat-assign', symbol: '++=', binarySymbol: '++'},
  {name: 'string-concat-assign', symbol: '..=', binarySymbol: '..'},
  {name: 'object-merge-assign', symbol: '~~=', binarySymbol: '~~'},
  {name: 'left-shift-assign', symbol: '<<=', binarySymbol: '<<'},
  {name: 'right-shift-assign', symbol: '>>=', binarySymbol: '>>'},
  {name: 'addition-assign', symbol: '+=', binarySymbol: '+'},
  {name: 'subtraction-assign', symbol: '-=', binarySymbol: '-'},
  {name: 'multiplication-assign', symbol: '*=', binarySymbol: '*'},
  {name: 'division-assign', symbol: '/=', binarySymbol: '/'},
  {name: 'floor-division-assign', symbol: '//=', binarySymbol: '//'},
  {name: 'modulo-assign', symbol: '%=', binarySymbol: '%'},
  {name: 'exponentiation-assign', symbol: '**=', binarySymbol: '**'},
] as const

export const BINARY_ASSIGN_SYMBOLS = BINARY_ASSIGN_OPERATORS.map(({symbol}) => symbol)
export const BINARY_OP_SYMBOLS = [
  '=',
  '|>',
  '?|>',
  '??',
  '^',
  '|',
  '&',
  '==',
  '!=',
  '>',
  '>=',
  '<',
  '<=',
  '<=>',
  '::',
  '++',
  '..',
  '~~',
  '...',
  '<..',
  '..<',
  '<.<',
  '<<',
  '>>',
  '+',
  '-',
  '*',
  '/',
  '//',
  '%',
  '**',
  '.',
  '?.',
  '&&',
  '||',
  '!?',
  '?!',
  '≤',
  '≥',
  '≠',
] as const

export const UNARY_OP_SYMBOLS = ['=', '>', '>=', '<', '<=', '-', '~', '$', '.', '!'] as const

const PRECEDENCE = {
  BINARY: {
    onlyif: 0,
    '=': 1,
    '|>': 2,
    '?|>': 2,
    // I had ternary operators at one point;
    // then: 3,
    // else: 3,
    '??': 4,
    or: 5,
    and: 6,
    // match operators is
    is: 7,
    '!is': 7,
    '^': 8, // binary xor
    '|': 9, // binary or
    '&': 10, // binary and
    // 'is' unary operator: 11
    '==': 12,
    '!=': 12,
    '>': 12,
    '>=': 12, // please update MatchBinaryExpression
    '<': 12, //  if these change
    '<=': 12,
    '<=>': 12,
    '::': 13,
    '++': 13,
    '..': 13,
    '~~': 13,
    '...': 13,
    '<..': 13,
    '..<': 13,
    '<.<': 13,
    '<<': 14,
    '>>': 14,
    '+': 14,
    '-': 14,
    '*': 15,
    '/': 15,
    '//': 15,
    '%': 15,
    '**': 16,
    // property chain operators
    has: 17,
    '!has': 17,
    '[]': 18,
    '?.[]': 18,
    fn: 18,
    '?.()': 18,
    '.': 18,
    '?.': 18,
  } as const,
  UNARY: {
    // unary range operators
    '=': 12,
    '>': 12,
    '>=': 12, // please update MatchUnaryExpression
    '<': 12, //  if these change
    '<=': 12,
    // unary logic
    not: 16,
    // unary math
    '-': 16,
    '~': 16,
    // meta data operators has/is
    typeof: 17,
    // toString binds higher than property access
    //     $name.length --> ($name).length
    $: 19,
    // enum shorthand - this _only_ works when the type can be inferred...
    // if you are applying operators, the type _cannot_ be inferred.
    '.': 20,
  } as const,
} as const

type BinaryOpSymbols = keyof typeof PRECEDENCE.BINARY | (typeof BINARY_OP_NAMES)[number] // has, is --> 10
type UnaryOpSymbols = keyof typeof PRECEDENCE.UNARY | (typeof UNARY_OP_NAMES)[number] // typeof --> 16

type OperationArgs = Omit<AbstractOperator, 'arity'>

const BINARY_OPERATORS = new Map<string, AbstractOperator>()
const UNARY_OPERATORS = new Map<string, AbstractOperator>()

export function isBinaryOperator(symbol: string): symbol is BinaryOpSymbols {
  return BINARY_OPERATORS.has(symbol)
}

export function isUnaryOperator(symbol: string): symbol is UnaryOpSymbols {
  return UNARY_OPERATORS.has(symbol)
}

export function binaryOperatorNamed(
  symbol: BinaryOpSymbols,
  precedingComments: Comment[] = [],
  followingOperatorComments: Comment[] = [],
): Operator {
  const op = BINARY_OPERATORS.get(symbol)!
  if (!op) {
    return op
  }
  return {...op, precedingComments, followingOperatorComments}
}

export function unaryOperatorNamed(
  symbol: UnaryOpSymbols,
  precedingComments: Comment[] = [],
  followingOperatorComments: Comment[] = [],
): Operator {
  const op = UNARY_OPERATORS.get(symbol)!
  return {...op, precedingComments, followingOperatorComments: followingOperatorComments}
}

export function isOperator(operator: AbstractOperator, symbol: string, arity: 1 | 2) {
  return operator.symbol === symbol && operator.arity === arity
}

function addBinaryOperator(op: OperationArgs) {
  const operator: AbstractOperator = {
    ...op,
    arity: 2,
  }
  BINARY_OPERATORS.set(op.symbol, operator)

  return operator
}

function addUnaryOperator(op: OperationArgs) {
  const operator: AbstractOperator = {
    ...op,
    arity: 1,
  }
  UNARY_OPERATORS.set(op.symbol, operator)

  return operator
}

function numericType(expr: Operation, lhs: Types.Type, rhs: Types.Type): GetTypeResult
function numericType(expr: Operation, lhs: Types.Type): GetTypeResult
function numericType(expr: Operation, lhs: Types.Type, rhs?: Types.Type): GetTypeResult {
  if (lhs.isInt() && (rhs?.isInt() ?? true)) {
    return ok(Types.IntType)
  } else if (lhs.isFloat() && (rhs?.isFloat() ?? true)) {
    return ok(Types.FloatType)
  }

  if (lhs.isFloat() && rhs) {
    return err(new RuntimeError(expr.args[1], expectedNumberMessage(expr.args[1], rhs)))
  } else {
    return err(new RuntimeError(expr.args[0], expectedNumberMessage(expr.args[0], lhs)))
  }
}

function numericOperation(
  expr: Operation,
  lhs: Values.Value,
  rhs: Values.Value,
  op: (lhs: number, rhs: number) => number | Values.Value,
): GetValueResult
function numericOperation(
  expr: Operation,
  lhs: Values.Value,
  op: (lhs: number) => number | Values.Value,
): GetValueResult
function numericOperation(
  expr: Operation,
  ...args:
    | [Values.Value, Values.Value, (lhs: number, rhs: number) => number | Values.Value]
    | [Values.Value, (lhs: number) => number | Values.Value]
): GetValueResult {
  if (args.length === 3) {
    const [lhs, rhs, op] = args
    if (lhs === Values.NaNValue || rhs === Values.NaNValue) {
      return ok(Values.NaNValue)
    }

    if (lhs.isInt() && rhs.isInt()) {
      const result = op(lhs.value, rhs.value)
      if (result instanceof Values.Value) {
        return ok(result)
      }

      if (Number.isInteger(result)) {
        return ok(Values.int(result))
      } else {
        return ok(Values.float(result))
      }
    }

    if (lhs.isFloat() && rhs.isFloat()) {
      const result = op(lhs.value, rhs.value)
      if (result instanceof Values.Value) {
        return ok(result)
      }

      return ok(Values.float(result))
    }

    if (lhs.isFloat() && rhs) {
      return err(new RuntimeError(expr.args[1], expectedNumberMessage(expr.args[1], rhs)))
    } else {
      return err(new RuntimeError(expr.args[0], expectedNumberMessage(expr.args[0], lhs)))
    }
  } else {
    const [lhs, op] = args
    if (lhs === Values.NaNValue) {
      return ok(Values.NaNValue)
    }

    if (lhs.isInt()) {
      const result = op(lhs.value)
      if (result instanceof Values.Value) {
        return ok(result)
      }

      return ok(Values.int(result))
    }

    if (lhs.isFloat()) {
      const result = op(lhs.value)
      if (result instanceof Values.Value) {
        return ok(result)
      }

      return ok(Values.float(result))
    }

    return err(new RuntimeError(expr.args[0], expectedNumberMessage(expr.args[0], lhs)))
  }
}

abstract class OperatorOperation extends Operation {
  abstract symbol: string

  joiner() {
    return ` ${this.symbol} `
  }

  toLisp(): string {
    return `(${this.symbol} ${this.args.map(it => it.toLisp()).join(' ')})`
  }

  formatCode(args: string[]): string {
    return args.join(this.joiner())
  }

  toCode(prevPrecedence = LOWEST_PRECEDENCE): string {
    if (prevPrecedence > this.operator.precedence) {
      return `(${this.toCode(LOWEST_PRECEDENCE)})`
    }

    if (this.operator.arity === 1) {
      if (this.symbol.match(/\w+/)) {
        return `${this.symbol} ${this.args[0].toCode(this.operator.precedence)}`
      }

      return `${this.symbol}${this.args[0].toCode(this.operator.precedence)}`
    }

    return this.formatCode(this.args.map(it => it.toCode(this.operator.precedence)))
  }

  replaceWithType(runtime: TypeRuntime, withType: Types.Type) {
    const [lhsExpr] = this.args
    return lhsExpr.replaceWithType(runtime, withType)
  }
}

function guardNeverType(lhsType: Types.Type, rhsType?: Types.Type): GetTypeResult | undefined {
  if (lhsType instanceof Types.OneOfType) {
    return lhsType.of.every(type => type === Types.NeverType) ? ok(Types.NeverType) : undefined
  } else if (lhsType === Types.NeverType) {
    return ok(Types.NeverType)
  }

  if (rhsType) {
    return guardNeverType(rhsType)
  }
}

abstract class UnaryOperator extends OperatorOperation {
  /**
   * No need to enclose unary operators in `{}`
   */
  toViewPropCode() {
    return this.toCode()
  }

  /**
   * Gives some operators - `not` in particular - a chance to early-exit if
   * the lhs is always true or always false.
   */
  checkLhsType(_lhs: Types.Type, _lhsExpr: Expression): GetRuntimeResult<Types.Type | undefined> {
    return ok(undefined)
  }

  abstract operatorType(
    runtime: TypeRuntime,
    lhs: Types.Type,
    lhsExpr: Expression,
    originalLhs: Types.Type,
  ): GetTypeResult

  getType(runtime: TypeRuntime): GetTypeResult {
    const [lhsExpr] = this.args
    return getChildType(this, lhsExpr, runtime).map(lhType => {
      return this.checkLhsType(lhType, lhsExpr).map(checkType => {
        if (checkType) {
          return checkType
        }

        if (lhType instanceof Types.OneOfType) {
          return mapAll(
            lhType.of.map(
              oneLhType =>
                guardNeverType(oneLhType) ?? this.operatorType(runtime, oneLhType, lhsExpr, lhType),
            ),
          ).map(Types.oneOf)
        }

        if (lhType === Types.NeverType) {
          return ok(Types.NeverType)
        }

        return guardNeverType(lhType) ?? this.operatorType(runtime, lhType, lhsExpr, lhType)
      })
    })
  }

  abstract operatorEval(
    runtime: ValueRuntime,
    lhs: Values.Value,
    lhsExpr: Expression,
  ): GetValueResult

  eval(runtime: ValueRuntime) {
    const [lhsExpr] = this.args
    return lhsExpr.eval(runtime).map(lhValue => {
      return this.operatorEval(runtime, lhValue, lhsExpr)
    })
  }
}

abstract class BinaryOperator extends OperatorOperation {
  /**
   * All binary operators are surrounded in `(…)` by default
   */
  toViewPropCode() {
    return this.toCode(HIGHEST_PRECEDENCE)
  }

  getRelationshipFormulas(runtime: TypeRuntime): [RelationshipFormula, RelationshipFormula] | [] {
    const [lhsExpr, rhsExpr] = this.args
    const lhsFormula = lhsExpr.relationshipFormula(runtime)
    const rhsFormula = rhsExpr.relationshipFormula(runtime)
    if (!lhsFormula || !rhsFormula) {
      return []
    }

    return [lhsFormula, rhsFormula]
  }

  /**
   * The RHS type can be affected in many ways by the evaluation of the LHS.
   * - |>/?|> pipe operators provide the LHS type as the #pipe type
   * - `and / or` use the truthy/falsey type of the lhs in the evaluation of the RHS
   */
  rhsType(
    runtime: TypeRuntime,
    _lhsType: Types.Type,
    _lhsExpr: Expression,
    rhsExpr: Expression,
  ): GetTypeResult {
    return getChildType(this, rhsExpr, runtime)
  }

  /**
   * Gives some operators - `or` `and` in particular - a chance to early-exit if
   * the lhs is always true or always false.
   */
  checkLhsType(_lhs: Types.Type, _lhsExpr: Expression): GetRuntimeResult<Types.Type | undefined> {
    return ok(undefined)
  }

  abstract operatorType(
    runtime: TypeRuntime,
    lhs: Types.Type,
    rhs: Types.Type,
    lhsExpr: Expression,
    rhsExpr: Expression,
    originalLhs: Types.Type,
    originalRhs: Types.Type,
  ): GetTypeResult

  getType(runtime: TypeRuntime): GetTypeResult {
    const [lhsExpr, rhsExpr] = this.args
    return getChildType(this, lhsExpr, runtime).map(lhType => {
      return this.checkLhsType(lhType, lhsExpr).map(type => {
        if (type) {
          return type
        }

        const rhResult = this.rhsType(runtime, lhType, lhsExpr, rhsExpr)
        return rhResult.map((rhType): GetTypeResult => {
          // if we have a OneOfType, we need to map every combination into op.getType, and
          // then collect all the errors, or return Types.oneOf()
          if (lhType instanceof Types.OneOfType && rhType instanceof Types.OneOfType) {
            return mapAll(
              lhType.of.flatMap(oneLhType =>
                rhType.of.map(
                  oneRhType =>
                    guardNeverType(oneLhType, oneRhType) ??
                    this.operatorType(
                      runtime,
                      oneLhType,
                      oneRhType,
                      lhsExpr,
                      rhsExpr,
                      lhType,
                      rhType,
                    ),
                ),
              ),
            ).map(Types.oneOf)
          }

          if (lhType instanceof Types.OneOfType) {
            return mapAll(
              lhType.of.map(
                oneLhType =>
                  guardNeverType(oneLhType, rhType) ??
                  this.operatorType(runtime, oneLhType, rhType, lhsExpr, rhsExpr, lhType, rhType),
              ),
            ).map(Types.oneOf)
          }

          if (rhType instanceof Types.OneOfType) {
            return mapAll(
              rhType.of.map(
                oneRhType =>
                  guardNeverType(lhType, oneRhType) ??
                  this.operatorType(runtime, lhType, oneRhType, lhsExpr, rhsExpr, lhType, rhType),
              ),
            ).map(Types.oneOf)
          }

          return (
            guardNeverType(lhType, rhType) ??
            this.operatorType(runtime, lhType, rhType, lhsExpr, rhsExpr, lhType, rhType)
          )
        })
      })
    })
  }

  rhsEval(
    runtime: ValueRuntime,
    _lhsValue: Values.Value,
    _lhsExpr: Expression,
    rhsExpr: Expression,
  ): GetValueResult {
    return rhsExpr.eval(runtime)
  }

  abstract operatorEval(
    runtime: ValueRuntime,
    lhs: Values.Value,
    rhs: () => GetValueResult,
    lhsExpr: Expression,
    rhsExpr: Expression,
  ): GetValueResult

  eval(runtime: ValueRuntime) {
    const [lhsExpr, rhsExpr] = this.args
    return lhsExpr.eval(runtime).map(lhs => {
      return this.operatorEval(
        runtime,
        lhs,
        () => this.rhsEval(runtime, lhs, lhsExpr, rhsExpr),
        lhsExpr,
        rhsExpr,
      )
    })
  }
}

class PipeOperator extends BinaryOperator {
  symbol = '|>'

  rhsType(runtime: TypeRuntime, lhs: Types.Type, _lhsExpr: Expression, rhsExpr: Expression) {
    let myRuntime = new MutableTypeRuntime(runtime)
    myRuntime.setPipeType(lhs)

    return getChildType(this, rhsExpr, myRuntime)
  }

  operatorType(_runtime: TypeRuntime, _lhs: Types.Type, rhs: Types.Type) {
    return ok(rhs)
  }

  rhsEval(runtime: ValueRuntime, lhs: Values.Value, _lhsExpr: Expression, rhsExpr: Expression) {
    let myRuntime = new MutableValueRuntime(runtime)
    myRuntime.setPipeValue(lhs)

    return rhsExpr.eval(myRuntime)
  }

  operatorEval(_runtime: ValueRuntime, _lhs: Values.Value, rhs: () => GetValueResult) {
    return rhs()
  }
}

addBinaryOperator({
  name: 'pipe operator',
  symbol: '|>',
  precedence: PRECEDENCE.BINARY['|>'],
  associativity: 'left',
  create(
    range: [number, number],
    precedingComments: Comment[],
    followingOperatorComments: Comment[],
    operator: Operator,
    args: Expression[],
  ) {
    return new PipeOperator(range, precedingComments, followingOperatorComments, operator, args)
  },
})

class NullColescingPipeOperator extends BinaryOperator {
  symbol = '?|>'

  rhsType(runtime: TypeRuntime, lhs: Types.Type, _lhsExpr: Expression, rhsExpr: Expression) {
    const hasNullType =
      lhs instanceof Types.OneOfType && lhs.of.some(type => type === Types.NullType)
    if (!hasNullType) {
      return err(
        new RuntimeError(
          _lhsExpr,
          `Left hand side of '?|>' operator must be a nullable-type. Found '${lhs}'`,
        ),
      )
    }

    const safeTypes = Types.oneOf(lhs.of.filter(type => type !== Types.NullType))
    let myRuntime = new MutableTypeRuntime(runtime)
    myRuntime.setPipeType(safeTypes)

    return getChildType(this, rhsExpr, myRuntime)
  }

  operatorType(
    _runtime: TypeRuntime,
    _lhs: Types.Type,
    rhs: Types.Type,
    lhsExpr: Expression,
    _rhsExpr: Expression,
    originalLhs: Types.Type,
  ) {
    const hasNullType =
      originalLhs instanceof Types.OneOfType && originalLhs.of.some(type => type === Types.NullType)
    if (!hasNullType) {
      return err(
        new RuntimeError(
          lhsExpr,
          `Left hand side of '?|>' operator must be a nullable-type. Found '${originalLhs}'`,
        ),
      )
    }

    return ok(Types.optional(rhs))
  }

  rhsEval(runtime: ValueRuntime, lhs: Values.Value, _lhsExpr: Expression, rhsExpr: Expression) {
    if (lhs === Values.NullValue) {
      return ok(Values.NullValue)
    }

    let myRuntime = new MutableValueRuntime(runtime)
    myRuntime.setPipeValue(lhs)

    return rhsExpr.eval(myRuntime)
  }

  operatorEval(_runtime: ValueRuntime, _lhs: Values.Value, rhs: () => GetValueResult) {
    return rhs()
  }
}

addBinaryOperator({
  name: 'null coalescing pipe operator',
  symbol: '?|>',
  precedence: PRECEDENCE.BINARY['?|>'],
  associativity: 'left',
  create(
    range: [number, number],
    precedingComments: Comment[],
    followingOperatorComments: Comment[],
    operator: Operator,
    args: Expression[],
  ) {
    return new NullColescingPipeOperator(
      range,
      precedingComments,
      followingOperatorComments,
      operator,
      args,
    )
  },
})

// a || b ?? c || d
// =>
// a || (b ?? c) || d
class NullCoalescingOperator extends BinaryOperator {
  symbol = '??'

  rhsType(runtime: TypeRuntime, lhs: Types.Type, lhsExpr: Expression, rhsExpr: Expression) {
    const hasNullType =
      lhs instanceof Types.OneOfType && lhs.of.some(type => type === Types.NullType)
    if (!hasNullType) {
      return err(
        new RuntimeError(
          lhsExpr,
          `Left hand side of '??' operator must be a nullable-type. Found '${lhs}'`,
        ),
      )
    }

    return super.rhsType(runtime, lhs, lhsExpr, rhsExpr)
  }

  operatorType(_runtime: TypeRuntime, lhs: Types.Type, rhs: Types.Type) {
    if (lhs === Types.NullType) {
      return ok(rhs)
    }

    return ok(lhs)
  }

  operatorEval(_runtime: ValueRuntime, lhs: Values.Value, rhs: () => GetValueResult) {
    if (lhs === Values.NullValue) {
      return rhs()
    }

    return ok(lhs)
  }
}

addBinaryOperator({
  name: 'null coalescing',
  symbol: '??',
  precedence: PRECEDENCE.BINARY['??'],
  associativity: 'left',
  create(
    range: [number, number],
    precedingComments: Comment[],
    followingOperatorComments: Comment[],
    operator: Operator,
    args: Expression[],
  ) {
    return new NullCoalescingOperator(
      range,
      precedingComments,
      followingOperatorComments,
      operator,
      args,
    )
  },
})

function mapCombineEitherError(
  lhs: Expression,
  rhs: Expression,
  result: Result<TypeRuntime, [string, string]>,
  combineOp: 'and' | 'or',
): GetRuntimeResult<TypeRuntime> {
  if (result.isErr()) {
    const missingExpr = result.error[0] === 'missing-lhs' ? lhs : rhs
    const hasExpr = result.error[0] === 'missing-lhs' ? rhs : lhs
    const assign = result.error[1]
    return err(
      new RuntimeError(
        missingExpr,
        `Invalid expressions in '${combineOp}'. '${hasExpr}' assigns to '${assign}', but '${missingExpr}' does not.`,
      ),
    )
  }

  return ok(result.value)
}

class LogicalOrOperator extends BinaryOperator {
  symbol = 'or'

  assumeTrue(runtime: TypeRuntime) {
    const [lhs, rhs] = this.args
    return lhs
      .assumeFalse(runtime)
      .map(lhsFalseRuntime => rhs.assumeTrue(lhsFalseRuntime))
      .map(rhsTrueRuntime =>
        lhs
          .assumeTrue(runtime)
          .map(lhsTrueRuntime =>
            combineEitherTypeRuntimes(runtime, lhsTrueRuntime, rhsTrueRuntime, 'or').mapResult(
              result => mapCombineEitherError(lhs, rhs, result, 'or'),
            ),
          ),
      )
  }

  assumeFalse(runtime: TypeRuntime) {
    const [lhs, rhs] = this.args
    return lhs.assumeFalse(runtime).map(lhsFalseRuntime => rhs.assumeFalse(lhsFalseRuntime))
  }

  matchAssignReferences() {
    const [lhsExpr, rhsExpr] = this.args
    const lhsAssigns = lhsExpr.matchAssignReferences()
    const rhsAssigns = rhsExpr.matchAssignReferences()

    return lhsAssigns.concat(rhsAssigns.filter(assign => !lhsAssigns.includes(assign)))
  }

  checkLhsType(lhs: Types.Type, lhsExpr: Expression) {
    if (lhs.isOnlyTruthyType()) {
      return err(
        new RuntimeError(
          this,
          `Left hand side of 'or' operator is always true. '${lhsExpr}' is of type '${lhs}', which is never false.`,
        ),
      )
    }
    if (lhs.isOnlyFalseyType()) {
      return err(
        new RuntimeError(
          this,
          `Left hand side of 'or' operator is always false. '${lhsExpr}' is of type '${lhs}', which is never true.`,
        ),
      )
    }
    return ok(undefined)
  }

  /**
   * rhs needs to be run assuming lhs is false.
   */
  rhsType(runtime: TypeRuntime, _lhsType: Types.Type, lhsExpr: Expression, rhsExpr: Expression) {
    return lhsExpr
      .assumeFalse(runtime)
      .map(falseyRuntime => getChildType(this, rhsExpr, falseyRuntime))
  }

  operatorType(_runtime: TypeRuntime, lhs: Types.Type, rhs: Types.Type) {
    if (lhs.isLiteral()) {
      if (lhs.value) {
        return ok(lhs)
      }

      if (rhs.isLiteral()) {
        return ok(Types.literal(rhs.value))
      } else {
        return ok(rhs)
      }
    }

    return ok(Types.oneOf([lhs.toTruthyType(), rhs]))
  }

  operatorEval(): GetValueResult {
    throw 'LogicalOrOperator.eval() should be evaluated via evalReturningRuntime'
  }

  /**
   * Reverse of the default implementation of eval/evalReturningRuntime. Most
   * operations call `eval`, so we need to intercept here to do the right thing.
   */
  eval(runtime: ValueRuntime) {
    return this.evalReturningRuntime(runtime).map(([value]) => value)
  }

  /**
   * If lhs is truthy, the value and runtime are returned, otherwise rhs is run.
   * Whichever runtime is returned, it is checked for all assignments from lhs
   * and rhs.
   */
  evalReturningRuntime(runtime: ValueRuntime): GetValueRuntimeResult {
    const [lhsExpr, rhsExpr] = this.args
    const allAssigns = allNamesFrom(this.args)

    return lhsExpr
      .evalReturningRuntime(runtime)
      .map(([lhs, lhsRuntime]): GetValueRuntimeResult => {
        if (lhs.isTruthy()) {
          return ok([lhs, lhsRuntime])
        } else {
          return rhsExpr.evalReturningRuntime(runtime)
        }
      })
      .map(([value, nextRuntime]) => {
        const reconciledRuntime = includeMissingNames(nextRuntime, allAssigns, lhsExpr)
        return [value, reconciledRuntime]
      })
  }
}

addBinaryOperator({
  name: 'logical or',
  symbol: 'or',
  precedence: PRECEDENCE.BINARY['or'],
  associativity: 'left',
  create(
    range: [number, number],
    precedingComments: Comment[],
    followingOperatorComments: Comment[],
    operator: Operator,
    args: Expression[],
  ) {
    return new LogicalOrOperator(
      range,
      precedingComments,
      followingOperatorComments,
      operator,
      args,
    )
  },
})

class LogicalAndOperator extends BinaryOperator {
  symbol = 'and'

  assumeTrue(runtime: TypeRuntime) {
    const [lhs, rhs] = this.args
    return lhs.assumeTrue(runtime).map(lhsFalseRuntime => rhs.assumeTrue(lhsFalseRuntime))
  }

  assumeFalse(runtime: TypeRuntime) {
    const [lhs, rhs] = this.args
    return lhs
      .assumeTrue(runtime)
      .map(lhsTrueRuntime => rhs.assumeFalse(lhsTrueRuntime))
      .map(rhsFalseRuntime =>
        lhs
          .assumeFalse(runtime)
          .map(lhsFalseRuntime =>
            combineEitherTypeRuntimes(runtime, lhsFalseRuntime, rhsFalseRuntime, 'and'),
          ),
      )
  }

  matchAssignReferences() {
    const [lhsExpr, rhsExpr] = this.args
    const lhsAssigns = lhsExpr.matchAssignReferences()
    const rhsAssigns = rhsExpr.matchAssignReferences()
    if (rhsAssigns.filter(assign => lhsAssigns.includes(assign)).length) {
      throw 'TODO: Remove this check - duplicative of the scanMatch function that looks for duplicate assigns.'
    }

    return lhsAssigns.concat(rhsAssigns)
  }

  /**
   * Reverse of the default implementation of eval/evalReturningRuntime. Most
   * operations call `eval`, so we need to intercept here to do the right thing.
   */
  eval(runtime: ValueRuntime) {
    return this.evalReturningRuntime(runtime).map(([value]) => value)
  }

  /**
   * If lhs is truthy rhs is run with its runtime, otherwise the original
   * runtime is returned (along with the falsey value).
   */
  evalReturningRuntime(runtime: ValueRuntime): GetValueRuntimeResult {
    const [lhsExpr, rhsExpr] = this.args
    return lhsExpr.evalReturningRuntime(runtime).map(([lhs, lhsRuntime]): GetValueRuntimeResult => {
      if (lhs.isTruthy()) {
        return rhsExpr.evalReturningRuntime(lhsRuntime)
      } else {
        return ok([lhs, runtime])
      }
    })
  }

  checkLhsType(lhs: Types.Type, lhsExpr: Expression) {
    if (lhs.isOnlyTruthyType()) {
      return err(
        new RuntimeError(
          this,
          `Left hand side of 'and' operator is always true. '${lhsExpr}' is of type '${lhs}', which is never false.`,
        ),
      )
    }
    if (lhs.isOnlyFalseyType()) {
      return err(
        new RuntimeError(
          this,
          `Left hand side of 'or' operator is always false. '${lhsExpr}' is of type '${lhs}', which is never true.`,
        ),
      )
    }
    return ok(undefined)
  }

  /**
   * rhs needs to be run assuming lhs is true.
   */
  rhsType(runtime: TypeRuntime, _lhsType: Types.Type, lhsExpr: Expression, rhsExpr: Expression) {
    return lhsExpr
      .assumeTrue(runtime)
      .map(falseyRuntime => getChildType(this, rhsExpr, falseyRuntime))
  }

  operatorType(_runtime: TypeRuntime, lhs: Types.Type, rhs: Types.Type) {
    return ok(Types.oneOf([lhs.toFalseyType(), rhs]))
  }

  operatorEval(): GetValueResult {
    throw 'LogicalAndOperator.eval() should be evaluated via evalReturningRuntime'
  }
}

addBinaryOperator({
  name: 'logical and',
  symbol: 'and',
  precedence: PRECEDENCE.BINARY['and'],
  associativity: 'left',
  create(
    range: [number, number],
    precedingComments: Comment[],
    followingOperatorComments: Comment[],
    operator: Operator,
    args: Expression[],
  ) {
    return new LogicalAndOperator(
      range,
      precedingComments,
      followingOperatorComments,
      operator,
      args,
    )
  },
})

class BinaryXorOperator extends BinaryOperator {
  symbol = '^'

  operatorType(_runtime: TypeRuntime, lhs: Types.Type, rhs: Types.Type) {
    if (lhs.isLiteral('float') && rhs.isLiteral('float')) {
      return ok(Types.literal(lhs.value ^ rhs.value))
    }

    return numericType(this, lhs, rhs)
  }

  operatorEval(_runtime: ValueRuntime, lhs: Values.Value, rhs: () => GetValueResult) {
    return rhs().map(rhs => numericOperation(this, lhs, rhs, (a, b) => a ^ b))
  }
}

addBinaryOperator({
  name: 'binary xor',
  symbol: '^',
  precedence: PRECEDENCE.BINARY['^'],
  associativity: 'left',
  create(
    range: [number, number],
    precedingComments: Comment[],
    followingOperatorComments: Comment[],
    operator: Operator,
    args: Expression[],
  ) {
    return new BinaryXorOperator(
      range,
      precedingComments,
      followingOperatorComments,
      operator,
      args,
    )
  },
})

class BinaryOrOperator extends BinaryOperator {
  symbol = '|'

  operatorType(_runtime: TypeRuntime, lhs: Types.Type, rhs: Types.Type) {
    if (lhs.isLiteral('float') && rhs.isLiteral('float')) {
      return ok(Types.literal(lhs.value | rhs.value))
    }

    return numericType(this, lhs, rhs)
  }

  operatorEval(_runtime: ValueRuntime, lhs: Values.Value, rhs: () => GetValueResult) {
    return rhs().map(rhs => numericOperation(this, lhs, rhs, (a, b) => a | b))
  }
}

addBinaryOperator({
  name: 'binary or',
  symbol: '|',
  precedence: PRECEDENCE.BINARY['|'],
  associativity: 'left',
  create(
    range: [number, number],
    precedingComments: Comment[],
    followingOperatorComments: Comment[],
    operator: Operator,
    args: Expression[],
  ) {
    return new BinaryOrOperator(range, precedingComments, followingOperatorComments, operator, args)
  },
})

class BinaryAndOperator extends BinaryOperator {
  symbol = '&'

  operatorType(_runtime: TypeRuntime, lhs: Types.Type, rhs: Types.Type) {
    if (lhs.isLiteral('float') && rhs.isLiteral('float')) {
      return ok(Types.literal(lhs.value & rhs.value))
    }

    return numericType(this, lhs, rhs)
  }

  operatorEval(_runtime: ValueRuntime, lhs: Values.Value, rhs: () => GetValueResult) {
    return rhs().map(rhs => numericOperation(this, lhs, rhs, (a, b) => a & b))
  }
}

addBinaryOperator({
  name: 'binary and',
  symbol: '&',
  precedence: PRECEDENCE.BINARY['&'],
  associativity: 'left',
  create(
    range: [number, number],
    precedingComments: Comment[],
    followingOperatorComments: Comment[],
    operator: Operator,
    args: Expression[],
  ) {
    return new BinaryAndOperator(
      range,
      precedingComments,
      followingOperatorComments,
      operator,
      args,
    )
  },
})

abstract class ComparisonOperator extends BinaryOperator {
  abstract symbol: RelationshipMathSymbol
  abstract inverseSymbol: RelationshipMathSymbol

  gimmeTrueStuff(runtime: TypeRuntime) {
    const [lhsFormula, rhsFormula] = this.getRelationshipFormulas(runtime)
    if (!lhsFormula || !rhsFormula) {
      return ok([])
    }

    return ok([{formula: lhsFormula, comparison: {operator: this.symbol, rhs: rhsFormula}}])
  }

  gimmeFalseStuff(runtime: TypeRuntime) {
    const [lhsFormula, rhsFormula] = this.getRelationshipFormulas(runtime)
    if (!lhsFormula || !rhsFormula) {
      return ok([])
    }

    return ok([{formula: lhsFormula, comparison: {operator: this.inverseSymbol, rhs: rhsFormula}}])
  }
}

abstract class EqualityOperator extends ComparisonOperator {
  abstract symbol: '==' | '!='
  abstract inverseSymbol: '==' | '!='

  operatorType(_runtime: TypeRuntime, lhs: Types.Type, rhs: Types.Type): GetTypeResult {
    if (lhs.isLiteral() && rhs.isLiteral()) {
      return ok(Types.literal(lhs.value === rhs.value))
    }

    if (Types.canBeAssignedTo(lhs, rhs) || Types.canBeAssignedTo(rhs, lhs)) {
      return ok(Types.BooleanType)
    }

    return ok(Types.literal(false))
  }

  operatorEval(
    _runtime: ValueRuntime,
    lhs: Values.Value,
    rhs: () => GetValueResult,
  ): GetRuntimeResult<Values.BooleanValue> {
    return rhs().map(rhs => ok(Values.booleanValue(lhs.isEqual(rhs))))
  }
}

class EqualsOperator extends EqualityOperator {
  readonly symbol = '=='
  readonly inverseSymbol = '!='
}

addBinaryOperator({
  name: 'equals',
  symbol: '==',
  precedence: PRECEDENCE.BINARY['=='],
  associativity: 'left',
  create(
    range: [number, number],
    precedingComments: Comment[],
    followingOperatorComments: Comment[],
    operator: Operator,
    args: Expression[],
  ) {
    return new EqualsOperator(range, precedingComments, followingOperatorComments, operator, args)
  },
})

class NotEqualsOperator extends EqualityOperator {
  readonly symbol = '!='
  readonly inverseSymbol = '=='

  operatorType(runtime: TypeRuntime, lhs: Types.Type, rhs: Types.Type) {
    return super.operatorType(runtime, lhs, rhs).map(type => {
      if (type.isLiteral()) {
        return ok(Types.literal(!type.value))
      }

      return type
    })
  }

  operatorEval(runtime: ValueRuntime, lhs: Values.Value, rhs: () => GetValueResult) {
    return super.operatorEval(runtime, lhs, rhs).map(value => ok(Values.booleanValue(!value.value)))
  }
}

addBinaryOperator({
  name: 'not equals',
  symbol: '!=',
  precedence: PRECEDENCE.BINARY['!='],
  associativity: 'left',
  create(
    range: [number, number],
    precedingComments: Comment[],
    followingOperatorComments: Comment[],
    operator: Operator,
    args: Expression[],
  ) {
    return new NotEqualsOperator(
      range,
      precedingComments,
      followingOperatorComments,
      operator,
      args,
    )
  },
})

class GreaterThanOperator extends ComparisonOperator {
  readonly symbol = '>'
  readonly inverseSymbol = '<='

  operatorType(_runtime: TypeRuntime, lhs: Types.Type, rhs: Types.Type) {
    if (lhs.isLiteral('float') && rhs.isLiteral('float')) {
      return ok(Types.literal(lhs.value > rhs.value))
    }

    return numericType(this, lhs, rhs).map(() => Types.BooleanType)
  }

  operatorEval(_runtime: ValueRuntime, lhs: Values.Value, rhs: () => GetValueResult) {
    return rhs().map(rhs => comparisonOperation(this, lhs, rhs, (a, b) => a > b))
  }
}

addBinaryOperator({
  name: 'greater than',
  symbol: '>',
  precedence: PRECEDENCE.BINARY['>'],
  associativity: 'left',
  create(
    range: [number, number],
    precedingComments: Comment[],
    followingOperatorComments: Comment[],
    operator: Operator,
    args: Expression[],
  ) {
    return new GreaterThanOperator(
      range,
      precedingComments,
      followingOperatorComments,
      operator,
      args,
    )
  },
})

class GreaterOrEqualOperator extends ComparisonOperator {
  readonly symbol = '>='
  readonly inverseSymbol = '<'

  operatorType(_runtime: TypeRuntime, lhs: Types.Type, rhs: Types.Type) {
    if (lhs.isLiteral('float') && rhs.isLiteral('float')) {
      return ok(Types.literal(lhs.value >= rhs.value))
    }

    return numericType(this, lhs, rhs).map(() => Types.BooleanType)
  }

  operatorEval(_runtime: ValueRuntime, lhs: Values.Value, rhs: () => GetValueResult) {
    return rhs().map(rhs => comparisonOperation(this, lhs, rhs, (a, b) => a >= b))
  }
}

addBinaryOperator({
  name: 'greater than or equal',
  symbol: '>=',
  precedence: PRECEDENCE.BINARY['>='],
  associativity: 'left',
  create(
    range: [number, number],
    precedingComments: Comment[],
    followingOperatorComments: Comment[],
    operator: Operator,
    args: Expression[],
  ) {
    return new GreaterOrEqualOperator(
      range,
      precedingComments,
      followingOperatorComments,
      operator,
      args,
    )
  },
})

class LessThanOperator extends ComparisonOperator {
  readonly symbol = '<'
  readonly inverseSymbol = '>='

  operatorType(_runtime: TypeRuntime, lhs: Types.Type, rhs: Types.Type) {
    if (lhs.isLiteral('float') && rhs.isLiteral('float')) {
      return ok(Types.literal(lhs.value < rhs.value))
    }

    return numericType(this, lhs, rhs).map(() => Types.BooleanType)
  }

  operatorEval(_runtime: ValueRuntime, lhs: Values.Value, rhs: () => GetValueResult) {
    return rhs().map(rhs => comparisonOperation(this, lhs, rhs, (a, b) => a < b))
  }
}

addBinaryOperator({
  name: 'less than',
  symbol: '<',
  precedence: PRECEDENCE.BINARY['<'],
  associativity: 'left',
  create(
    range: [number, number],
    precedingComments: Comment[],
    followingOperatorComments: Comment[],
    operator: Operator,
    args: Expression[],
  ) {
    return new LessThanOperator(range, precedingComments, followingOperatorComments, operator, args)
  },
})

class LessOrEqualOperator extends ComparisonOperator {
  readonly symbol = '<='
  readonly inverseSymbol = '>'

  operatorType(_runtime: TypeRuntime, lhs: Types.Type, rhs: Types.Type) {
    if (lhs.isLiteral('float') && rhs.isLiteral('float')) {
      return ok(Types.literal(lhs.value <= rhs.value))
    }

    return numericType(this, lhs, rhs).map(() => Types.BooleanType)
  }

  operatorEval(_runtime: ValueRuntime, lhs: Values.Value, rhs: () => GetValueResult) {
    return rhs().map(rhs => comparisonOperation(this, lhs, rhs, (a, b) => a <= b))
  }
}

addBinaryOperator({
  name: 'less than or equal',
  symbol: '<=',
  precedence: PRECEDENCE.BINARY['<='],
  associativity: 'left',
  create(
    range: [number, number],
    precedingComments: Comment[],
    followingOperatorComments: Comment[],
    operator: Operator,
    args: Expression[],
  ) {
    return new LessOrEqualOperator(
      range,
      precedingComments,
      followingOperatorComments,
      operator,
      args,
    )
  },
})

class AssignmentOperator extends BinaryOperator {
  symbol = '='

  operatorType(
    _runtime: TypeRuntime,
    _lhs: Types.Type,
    _rhs: Types.Type,
    _lhsExpr: Expression,
    _rhsExpr: Expression,
  ): GetTypeResult {
    return ok(new Types.MessageType())
  }

  operatorEval(
    _runtime: ValueRuntime,
    _lhs: Values.Value,
    _rhs: () => GetValueResult,
    lhsExpr: Expression,
    rhsExpr: Expression,
  ): GetRuntimeResult<Values.BooleanValue> {
    return err(
      new RuntimeError(lhsExpr, 'Still working on assignment ' + lhsExpr + ' = ' + rhsExpr),
    )
  }
}

addBinaryOperator({
  name: 'assignment',
  symbol: '=',
  precedence: -1,
  associativity: 'left',
  create(
    range: [number, number],
    precedingComments: Comment[],
    followingOperatorComments: Comment[],
    operator: Operator,
    args: Expression[],
  ) {
    return new AssignmentOperator(
      range,
      precedingComments,
      followingOperatorComments,
      operator,
      args,
    )
  },
})

class SortOperator extends BinaryOperator {
  symbol = '<=>'

  operatorType(_runtime: TypeRuntime, lhs: Types.Type, rhs: Types.Type) {
    if (lhs.isLiteral('float') && rhs.isLiteral('float')) {
      const compare = lhs.value - rhs.value
      let sort: number
      if (compare < 0) {
        sort = -1
      } else if (compare > 0) {
        sort = 1
      } else {
        sort = 0
      }
      return ok(Types.literal(sort))
    }

    if (lhs.isLiteral('string') && rhs.isLiteral('string')) {
      return ok(Types.literal(stringSort(lhs.value, rhs.value)))
    }

    return ok(Types.oneOf([Types.literal(-1), Types.literal(0), Types.literal(1)]))
  }

  operatorEval(_runtime: ValueRuntime, lhs: Values.Value, rhs: () => GetValueResult) {
    return rhs().map(rhs => comparisonOperation(this, lhs, rhs, (a, b) => a <= b))
  }
}

addBinaryOperator({
  name: 'sort',
  symbol: '<=>',
  precedence: PRECEDENCE.BINARY['<=>'],
  associativity: 'left',
  create(
    range: [number, number],
    precedingComments: Comment[],
    followingOperatorComments: Comment[],
    operator: Operator,
    args: Expression[],
  ) {
    return new SortOperator(range, precedingComments, followingOperatorComments, operator, args)
  },
})

/**
 * Verifies the existence of a key in an object or dict.
 *
 * Returns true if the key exists, false otherwise.
 *
 * Does not return true for built-in properties like `.map` and `.length`
 */
class PropertyExistsOperator extends BinaryOperator {
  symbol = 'has'

  operatorType(
    _runtime: TypeRuntime,
    lhs: Types.Type,
    rhs: Types.Type,
    lhsExpr: Expression,
    rhsExpr: Expression,
  ) {
    if (lhs instanceof Types.DictType) {
      return this.existsInDictType(lhs, rhs, rhsExpr)
    }

    if (lhs instanceof Types.ObjectType) {
      return this.existsInObjectType(lhs, rhs, rhsExpr)
    }

    return err(new RuntimeError(lhsExpr, expectedType('Object or Dict', lhsExpr, lhs)))
  }

  existsInDictType(haystack: Types.DictType, needle: Types.Type, rhsExpr: Expression) {
    if (needle.isLiteral('key')) {
      // if lhs is in narrowedNames, it is definitely true
      const hasName = haystack.narrowedNames.has(needle.value)
      // if it isn't in narrowedNames, it _could_ be true, unless the number of items
      // in dict === the size of narrowedNames
      const allProps = haystack.narrowedNames.size === haystack.narrowedLength.max
      return ok(hasName ? Types.literal(true) : allProps ? Types.literal(false) : Types.BooleanType)
    } else if (needle.isKey()) {
      return ok(Types.BooleanType)
    } else {
      return err(
        new RuntimeError(
          rhsExpr,
          expectedType('Dict key (String, Int, Boolean, or null)', rhsExpr, needle),
        ),
      )
    }
  }

  existsInObjectType(haystack: Types.ObjectType, needle: Types.Type, rhsExpr: Expression) {
    if (needle.isLiteral('string')) {
      const hasProp = haystack.literalAccessType(needle.value) !== undefined
      return ok(Types.literal(hasProp))
    } else if (needle.isString()) {
      return ok(Types.BooleanType)
    } else {
      return err(
        new RuntimeError(
          rhsExpr,
          expectedType('String (objects can only be indexed by string)', rhsExpr, needle),
        ),
      )
    }
  }

  operatorEval(
    _runtime: ValueRuntime,
    lhs: Values.Value,
    rhs: () => GetValueResult,
    lhsExpr: Expression,
    rhsExpr: Expression,
  ) {
    return rhs().map(rhs => {
      if (lhs instanceof Values.DictValue) {
        return this.existsInDictValue(lhs, rhs, lhsExpr)
      }

      if (lhs instanceof Values.ObjectValue) {
        return this.existsInObjectValue(lhs, rhs, lhsExpr)
      }

      return err(new RuntimeError(rhsExpr, expectedType('Object or Dict', rhsExpr, rhs)))
    })
  }

  existsInDictValue(haystack: Values.DictValue, needle: Values.Value, lhsExpr: Expression) {
    const key = needle.validKey()
    if (key === undefined) {
      return err(
        new RuntimeError(
          lhsExpr,
          expectedType('valid Dict key (String, Int, Boolean, or null)', lhsExpr, needle),
        ),
      )
    }

    const hasProp = haystack.arrayAccessValue(key) !== undefined
    return ok(Values.booleanValue(hasProp))
  }

  existsInObjectValue(haystack: Values.ObjectValue, needle: Values.Value, lhsExpr: Expression) {
    if (!needle.isString()) {
      return err(new RuntimeError(lhsExpr, expectedType('String', lhsExpr, needle)))
    }

    const hasProp = haystack.arrayAccessValue(needle.value) !== undefined
    return ok(Values.booleanValue(hasProp))
  }
}

addBinaryOperator({
  name: 'property exists in object',
  symbol: 'has',
  precedence: PRECEDENCE.BINARY['has'],
  associativity: 'left',
  create(
    range: [number, number],
    precedingComments: Comment[],
    followingOperatorComments: Comment[],
    operator: Operator,
    args: Expression[],
  ) {
    return new PropertyExistsOperator(
      range,
      precedingComments,
      followingOperatorComments,
      operator,
      args,
    )
  },
})

class PropertyMissingOperator extends PropertyExistsOperator {
  symbol = '!has'

  operatorType(
    runtime: TypeRuntime,
    lhs: Types.Type,
    rhs: Types.Type,
    lhsExpr: Expression,
    rhsExpr: Expression,
  ) {
    return super.operatorType(runtime, lhs, rhs, lhsExpr, rhsExpr).map(type => {
      if (type.isLiteral('boolean')) {
        return ok(Types.literal(!type.value))
      } else {
        return type
      }
    })
  }

  operatorEval(
    runtime: ValueRuntime,
    lhs: Values.Value,
    rhs: () => GetValueResult,
    lhsExpr: Expression,
    rhsExpr: Expression,
  ) {
    return super
      .operatorEval(runtime, lhs, rhs, lhsExpr, rhsExpr)
      .map(booleanValue => Values.booleanValue(!booleanValue.value))
  }
}

addBinaryOperator({
  name: 'property does not exist in object',
  symbol: '!has',
  precedence: PRECEDENCE.BINARY['!has'],
  associativity: 'left',
  create(
    range: [number, number],
    precedingComments: Comment[],
    followingOperatorComments: Comment[],
    operator: Operator,
    args: Expression[],
  ) {
    return new PropertyMissingOperator(
      range,
      precedingComments,
      followingOperatorComments,
      operator,
      args,
    )
  },
})

abstract class MatchOperator extends BinaryOperator {
  abstract symbol: 'is' | '!is'

  rhsType(): GetTypeResult {
    return ok(Types.AllType)
  }

  gimmeTrueStuff(runtime: TypeRuntime) {
    const [lhsExpr, rhsExpr] = this.args

    const formula = lhsExpr.relationshipFormula(runtime)
    if (!formula || !(rhsExpr instanceof Expressions.MatchExpression)) {
      return ok([])
    }

    return getChildType(this, lhsExpr, runtime).map(lhsType => {
      if (this.symbol === 'is') {
        return rhsExpr.gimmeTrueStuffWith(runtime, formula, lhsType)
      } else {
        return rhsExpr.gimmeFalseStuffWith(runtime, formula, lhsType)
      }
    })
  }

  gimmeFalseStuff(runtime: TypeRuntime) {
    const [lhsExpr, rhsExpr] = this.args

    const formula = lhsExpr.relationshipFormula(runtime)
    if (!formula || !(rhsExpr instanceof Expressions.MatchExpression)) {
      return ok([])
    }

    return getChildType(this, lhsExpr, runtime).map(lhsType => {
      if (this.symbol === 'is') {
        return rhsExpr.gimmeFalseStuffWith(runtime, formula, lhsType)
      } else {
        return rhsExpr.gimmeTrueStuffWith(runtime, formula, lhsType)
      }
    })
  }

  operatorType(
    runtime: TypeRuntime,
    lhs: Types.Type,
    rhs: Types.Type,
    lhsExpr: Expression,
    rhsExpr: Expression,
  ) {
    if (!(rhsExpr instanceof Expressions.MatchExpression)) {
      return err(new RuntimeError(rhsExpr, expectedType('match expression', rhsExpr, rhs)))
    }

    // this little gem prevents 'expr is bar and bar', which might look fine,
    // but try to calculate the 'false' branch of that thing... expr should be
    // 'never', but it... assigns to bar? Doesn't assign? I don't know. So it's
    // a compile-time error instead. 😎
    if (rhsExpr.alwaysMatches(lhs)) {
      return ok(Types.LiteralTrueType)
    }

    return ok(Types.BooleanType)
  }

  operatorEval(): GetValueResult {
    throw 'MatchOperator.eval() should be evaluated via evalReturningRuntime'
  }

  /**
   * Reverse of the default implementation of eval/evalReturningRuntime. Most
   * operations call `eval`, so we need to intercept here to do the right thing.
   */
  eval(runtime: ValueRuntime) {
    return this.evalReturningRuntime(runtime).map(([value]) => value)
  }

  /**
   * If lhs is truthy rhs is run with its runtime, otherwise the original
   * runtime is returned (along with the falsey value).
   */
  evalReturningRuntime(runtime: ValueRuntime): GetValueRuntimeResult {
    const [lhsExpr, rhsExpr] = this.args
    if (!(rhsExpr instanceof Expressions.MatchExpression)) {
      return err(new RuntimeError(rhsExpr, expectedType('match expression', rhsExpr)))
    }

    return lhsExpr
      .eval(runtime)
      .map(lhs => rhsExpr.evalWithSubjectReturningRuntime(runtime, this, lhs))
  }
}

class MatchAssertionOperator extends MatchOperator {
  readonly symbol = 'is'
}

class MatchRefutationOperator extends MatchOperator {
  readonly symbol = '!is'
  evalReturningRuntime(runtime: ValueRuntime): GetValueRuntimeResult {
    const [lhsExpr, rhsExpr] = this.args
    if (!(rhsExpr instanceof Expressions.MatchExpression)) {
      return err(new RuntimeError(rhsExpr, expectedType('match expression', rhsExpr)))
    }
    return lhsExpr
      .eval(runtime)
      .map(lhs => rhsExpr.evalWithSubjectReturningRuntime(runtime, this, lhs))
      .map(([rhs, runtime]) => ok([Values.booleanValue(!rhs.isTruthy()), runtime]))
  }
}

addBinaryOperator({
  name: 'is match',
  symbol: 'is',
  precedence: PRECEDENCE.BINARY['is'],
  associativity: 'left',
  create(
    range: [number, number],
    precedingComments: Comment[],
    followingOperatorComments: Comment[],
    operator: Operator,
    args: Expression[],
  ) {
    return new MatchAssertionOperator(
      range,
      precedingComments,
      followingOperatorComments,
      operator,
      args,
    )
  },
})

addBinaryOperator({
  name: 'is not match',
  symbol: '!is',
  precedence: PRECEDENCE.BINARY['!is'],
  associativity: 'left',
  create(
    range: [number, number],
    precedingComments: Comment[],
    followingOperatorComments: Comment[],
    operator: Operator,
    args: Expression[],
  ) {
    return new MatchRefutationOperator(
      range,
      precedingComments,
      followingOperatorComments,
      operator,
      args,
    )
  },
})

class BinaryShiftLeftOperator extends BinaryOperator {
  symbol = '<<'

  operatorType(_runtime: TypeRuntime, lhs: Types.Type, rhs: Types.Type) {
    if (lhs.isLiteral('float') && rhs.isLiteral('float')) {
      return ok(Types.literal(lhs.value << rhs.value))
    }

    return numericType(this, lhs, rhs)
  }

  operatorEval(_runtime: ValueRuntime, lhs: Values.Value, rhs: () => GetValueResult) {
    return rhs().map(rhs =>
      numericOperation(this, lhs, rhs, (a, b) => {
        // this is the largest binary int supported by JavaScript
        return (a << b) & 0b1111111111111111111111111111111
      }),
    )
  }
}

addBinaryOperator({
  name: 'binary shift left',
  symbol: '<<',
  precedence: PRECEDENCE.BINARY['<<'],
  associativity: 'left',
  create(
    range: [number, number],
    precedingComments: Comment[],
    followingOperatorComments: Comment[],
    operator: Operator,
    args: Expression[],
  ) {
    return new BinaryShiftLeftOperator(
      range,
      precedingComments,
      followingOperatorComments,
      operator,
      args,
    )
  },
})

class BinaryShiftRightOperator extends BinaryOperator {
  symbol = '>>'

  operatorType(_runtime: TypeRuntime, lhs: Types.Type, rhs: Types.Type) {
    if (lhs.isLiteral('float') && rhs.isLiteral('float')) {
      return ok(Types.literal(lhs.value >> rhs.value))
    }

    return numericType(this, lhs, rhs)
  }

  operatorEval(_runtime: ValueRuntime, lhs: Values.Value, rhs: () => GetValueResult) {
    return rhs().map(rhs => numericOperation(this, lhs, rhs, (a, b) => a >> b))
  }
}

addBinaryOperator({
  name: 'binary shift right',
  symbol: '>>',
  precedence: PRECEDENCE.BINARY['>>'],
  associativity: 'left',
  create(
    range: [number, number],
    precedingComments: Comment[],
    followingOperatorComments: Comment[],
    operator: Operator,
    args: Expression[],
  ) {
    return new BinaryShiftRightOperator(
      range,
      precedingComments,
      followingOperatorComments,
      operator,
      args,
    )
  },
})

class AdditionOperator extends BinaryOperator {
  symbol = '+'

  relationshipFormula(runtime: TypeRuntime): RelationshipFormula | undefined {
    const lhsFormula = this.args[0].relationshipFormula(runtime)
    const rhsFormula = this.args[1].relationshipFormula(runtime)
    if (lhsFormula && rhsFormula) {
      return relationshipFormula.addition(lhsFormula, rhsFormula)
    }
  }

  operatorType(
    _runtime: TypeRuntime,
    lhs: Types.Type,
    rhs: Types.Type,
    lhsExpr: Expression,
    rhsExpr: Expression,
  ) {
    if (lhs instanceof Types.SetType && rhs instanceof Types.SetType) {
      const concatLength = combineSetLengths(lhs.narrowedLength, rhs.narrowedLength)
      return ok(Types.set(Types.compatibleWithBothTypes(lhs.of, rhs.of), concatLength))
    }

    if (!lhs.isFloat()) {
      return err(new RuntimeError(lhsExpr, expectedNumberMessage(lhsExpr, lhs)))
    }

    if (!rhs.isFloat()) {
      return err(new RuntimeError(rhsExpr, expectedNumberMessage(rhsExpr, rhs)))
    }

    return ok(Types.numericAdditionType(lhs, rhs))
  }

  operatorEval(_runtime: ValueRuntime, lhs: Values.Value, rhs: () => GetValueResult) {
    if (lhs instanceof Values.SetValue && rhs instanceof Values.SetValue) {
      return ok(new Values.SetValue(lhs.values.concat(rhs.values)))
    }

    return rhs().map(rhs => numericOperation(this, lhs, rhs, (a, b) => a + b))
  }
}

addBinaryOperator({
  name: 'addition',
  symbol: '+',
  precedence: PRECEDENCE.BINARY['+'],
  associativity: 'left',
  create(
    range: [number, number],
    precedingComments: Comment[],
    followingOperatorComments: Comment[],
    operator: Operator,
    args: Expression[],
  ) {
    return new AdditionOperator(range, precedingComments, followingOperatorComments, operator, args)
  },
})

class SubtractionOperator extends BinaryOperator {
  symbol = '-'

  relationshipFormula(runtime: TypeRuntime): RelationshipFormula | undefined {
    const lhsFormula = this.args[0].relationshipFormula(runtime)
    const rhsFormula = this.args[1].relationshipFormula(runtime)
    if (lhsFormula && rhsFormula) {
      return relationshipFormula.subtraction(lhsFormula, rhsFormula)
    }
  }

  operatorType(
    _runtime: TypeRuntime,
    lhs: Types.Type,
    rhs: Types.Type,
    lhsExpr: Expression,
    rhsExpr: Expression,
  ) {
    if (lhs.isLiteral('float') && rhs.isLiteral('float')) {
      return ok(Types.literal(lhs.value - rhs.value, anyFloaters(lhs, rhs)))
    }

    if (!lhs.isFloat()) {
      return err(new RuntimeError(lhsExpr, expectedNumberMessage(lhsExpr, lhs)))
    }

    if (!rhs.isFloat()) {
      return err(new RuntimeError(rhsExpr, expectedNumberMessage(rhsExpr, rhs)))
    }

    return ok(Types.numericSubtractionType(lhs, rhs))
  }

  operatorEval(_runtime: ValueRuntime, lhs: Values.Value, rhs: () => GetValueResult) {
    return rhs().map(rhs => numericOperation(this, lhs, rhs, (a, b) => a - b))
  }
}

addBinaryOperator({
  name: 'subtraction',
  symbol: '-',
  precedence: PRECEDENCE.BINARY['-'],
  associativity: 'left',
  create(
    range: [number, number],
    precedingComments: Comment[],
    followingOperatorComments: Comment[],
    operator: Operator,
    args: Expression[],
  ) {
    return new SubtractionOperator(
      range,
      precedingComments,
      followingOperatorComments,
      operator,
      args,
    )
  },
})

class ArrayConcatenationOperator extends BinaryOperator {
  symbol = '++'

  operatorType(
    _runtime: TypeRuntime,
    lhs: Types.Type,
    rhs: Types.Type,
    lhsExpr: Expression,
    rhsExpr: Expression,
  ) {
    if (!(lhs instanceof Types.ArrayType)) {
      return err(new RuntimeError(lhsExpr, expectedType('Array', lhsExpr, lhs)))
    }

    if (!(rhs instanceof Types.ArrayType)) {
      return err(new RuntimeError(rhsExpr, expectedType('Array', rhsExpr, rhs)))
    }

    const concatLength = combineConcatLengths(lhs.narrowedLength, rhs.narrowedLength)
    return ok(Types.array(Types.compatibleWithBothTypes(lhs.of, rhs.of), concatLength))
  }

  operatorEval(
    _runtime: ValueRuntime,
    lhs: Values.Value,
    rhs: () => GetValueResult,
    _lhsExpr: Expression,
    rhsExpr: Expression,
  ) {
    return rhs().map((rhs): GetValueResult => {
      if (lhs instanceof Values.ArrayValue && rhs instanceof Values.ArrayValue) {
        return ok(new Values.ArrayValue(lhs.values.concat(rhs.values)))
      }

      return err(new RuntimeError(rhsExpr, expectedType('Array', rhsExpr, rhs)))
    })
  }
}

addBinaryOperator({
  name: 'array-concatenation',
  symbol: '++',
  precedence: PRECEDENCE.BINARY['++'],
  associativity: 'left',
  create(
    range: [number, number],
    precedingComments: Comment[],
    followingOperatorComments: Comment[],
    operator: Operator,
    args: Expression[],
  ) {
    return new ArrayConcatenationOperator(
      range,
      precedingComments,
      followingOperatorComments,
      operator,
      args,
    )
  },
})

class ArrayConsOperator extends BinaryOperator {
  symbol = '::'

  operatorType(
    _runtime: TypeRuntime,
    lhs: Types.Type,
    rhs: Types.Type,
    _lhsExpr: Expression,
    rhsExpr: Expression,
  ) {
    if (!(rhs instanceof Types.ArrayType)) {
      return err(new RuntimeError(rhsExpr, expectedType('Array', rhsExpr, rhs)))
    }

    const concatLength = combineConcatLengths({min: 1, max: 1}, rhs.narrowedLength)
    return ok(Types.array(Types.compatibleWithBothTypes(lhs, rhs.of), concatLength))
  }

  operatorEval(
    _runtime: ValueRuntime,
    lhs: Values.Value,
    rhs: () => GetValueResult,
    _lhsExpr: Expression,
    rhsExpr: Expression,
  ) {
    return rhs().map((rhs): GetValueResult => {
      if (rhs instanceof Values.ArrayValue) {
        return ok(new Values.ArrayValue([lhs].concat(rhs.values)))
      }

      return err(new RuntimeError(rhsExpr, expectedType('Array', rhsExpr, rhs)))
    })
  }
}

addBinaryOperator({
  name: 'array-cons',
  symbol: '::',
  precedence: PRECEDENCE.BINARY['::'],
  associativity: 'left',
  create(
    range: [number, number],
    precedingComments: Comment[],
    followingOperatorComments: Comment[],
    operator: Operator,
    args: Expression[],
  ) {
    return new ArrayConsOperator(
      range,
      precedingComments,
      followingOperatorComments,
      operator,
      args,
    )
  },
})

class StringConcatenationOperator extends BinaryOperator {
  symbol = '..'

  relationshipFormula(runtime: TypeRuntime): RelationshipFormula | undefined {
    const lhsFormula = this.args[0].relationshipFormula(runtime)
    const rhsFormula = this.args[1].relationshipFormula(runtime)
    if (lhsFormula && rhsFormula) {
      return relationshipFormula.stringConcat(lhsFormula, rhsFormula)
    }
  }

  operatorType(
    _runtime: TypeRuntime,
    lhs: Types.Type,
    rhs: Types.Type,
    lhsExpr: Expression,
    rhsExpr: Expression,
  ) {
    if (!lhs.isString()) {
      return err(new RuntimeError(lhsExpr, expectedType('String', lhsExpr, lhs)))
    }

    if (!rhs.isString()) {
      return err(new RuntimeError(rhsExpr, expectedType('String', rhsExpr, rhs)))
    }

    return ok(Types.stringConcatenationType(lhs, rhs))
  }

  operatorEval(
    _runtime: ValueRuntime,
    lhs: Values.Value,
    rhs: () => GetValueResult,
    lhsExpr: Expression,
    rhsExpr: Expression,
  ) {
    return rhs().map((rhs): GetValueResult => {
      if (!lhs.isString()) {
        return err(new RuntimeError(lhsExpr, expectedType('String', lhsExpr, lhs)))
      }
      if (!rhs.isString()) {
        return err(new RuntimeError(rhsExpr, expectedType('String', rhsExpr, rhs)))
      }

      return ok(Values.string(lhs.value + rhs.value))
    })
  }
}

addBinaryOperator({
  name: 'string-concatenation',
  symbol: '..',
  precedence: PRECEDENCE.BINARY['..'],
  associativity: 'left',
  create(
    range: [number, number],
    precedingComments: Comment[],
    followingOperatorComments: Comment[],
    operator: Operator,
    args: Expression[],
  ) {
    return new StringConcatenationOperator(
      range,
      precedingComments,
      followingOperatorComments,
      operator,
      args,
    )
  },
})

class ObjectMergeOperator extends BinaryOperator {
  symbol = '~~'

  operatorType(
    _runtime: TypeRuntime,
    lhs: Types.Type,
    rhs: Types.Type,
    lhsExpr: Expression,
    rhsExpr: Expression,
  ) {
    if (!lhs.isObject()) {
      return err(new RuntimeError(lhsExpr, expectedType('Object', lhsExpr, lhs)))
    }

    if (!rhs.isObject()) {
      return err(new RuntimeError(rhsExpr, expectedType('Object', rhsExpr, rhs)))
    }

    return ok(Types.object([...lhs.props, ...rhs.props]))
  }

  operatorEval(
    _runtime: ValueRuntime,
    lhs: Values.Value,
    rhs: () => GetValueResult,
    lhsExpr: Expression,
    rhsExpr: Expression,
  ) {
    return rhs().map((rhs): GetValueResult => {
      if (!lhs.isObject()) {
        return err(new RuntimeError(lhsExpr, expectedType('Object', lhsExpr, lhs)))
      }

      if (!rhs.isObject()) {
        return err(new RuntimeError(rhsExpr, expectedType('Object', rhsExpr, rhs)))
      }

      const tupleValues = lhs.tupleValues.concat(rhs.tupleValues)
      const namedValues = new Map(lhs.namedValues)
      for (const [key, value] of rhs.namedValues) {
        namedValues.set(key, value)
      }

      return ok(Values.object(namedValues, tupleValues))
    })
  }
}

addBinaryOperator({
  name: 'object-merge',
  symbol: '~~',
  precedence: PRECEDENCE.BINARY['~~'],
  associativity: 'left',
  create(
    range: [number, number],
    precedingComments: Comment[],
    followingOperatorComments: Comment[],
    operator: Operator,
    args: Expression[],
  ) {
    return new ObjectMergeOperator(
      range,
      precedingComments,
      followingOperatorComments,
      operator,
      args,
    )
  },
})

class RangeOperator extends BinaryOperator {
  constructor(
    range: Range,
    precedingComments: Comment[],
    followingOperatorComments: Comment[],
    operator: Operator,
    args: Expression[],
    readonly symbol: '...' | '<..' | '..<' | '<.<',
  ) {
    super(range, precedingComments, followingOperatorComments, operator, args)
  }

  joiner() {
    return this.symbol
  }

  operatorType(
    _runtime: TypeRuntime,
    lhs: Types.Type,
    rhs: Types.Type,
    lhsExpr: Expression,
    rhsExpr: Expression,
  ) {
    if (lhs.isInt() && rhs.isInt()) {
      let min: number | undefined
      if (lhs.isLiteral('int')) {
        min = lhs.value
        if (this.symbol === '<..' || this.symbol === '<.<') {
          min += 1
        }
      }

      let max: number | undefined
      if (rhs.isLiteral('int')) {
        max = rhs.value
        if (this.symbol === '..<' || this.symbol === '<.<') {
          max -= 1
        }
      }

      return ok(Types.intRange({min, max}))
    } else if (lhs.isFloat() && rhs.isFloat()) {
      let min: number | [number] | undefined
      if (lhs.isLiteral('float')) {
        if (this.symbol === '<..' || this.symbol === '<.<') {
          min = [lhs.value]
        } else {
          min = lhs.value
        }
      }

      let max: number | [number] | undefined
      if (rhs.isLiteral('float')) {
        if (this.symbol === '..<' || this.symbol === '<.<') {
          max = [rhs.value]
        } else {
          max = rhs.value
        }
      }

      return ok(Types.floatRange({min, max}))
    }

    if (!lhs.isFloat()) {
      return err(new RuntimeError(lhsExpr, expectedType('Float or Int', lhsExpr, lhs)))
    }

    return err(new RuntimeError(rhsExpr, expectedType('Float or Int', rhsExpr, rhs)))
  }

  operatorEval(
    runtime: ValueRuntime,
    lhs: Values.Value,
    rhs: () => GetValueResult,
    lhsExpr: Expression,
    _rhsExpr: Expression,
  ) {
    return rhs().map((rhs): GetValueResult => {
      let exclusiveStart, exclusiveStop
      switch (this.symbol) {
        case '...':
          exclusiveStart = false
          exclusiveStop = false
          break
        case '<..':
          exclusiveStart = true
          exclusiveStop = false
          break
        case '..<':
          exclusiveStart = false
          exclusiveStop = true
          break
        case '<.<':
          exclusiveStart = true
          exclusiveStop = true
          break
      }

      if (lhs.isFloat() && rhs.isFloat()) {
        return ok(Values.range([lhs, exclusiveStart], [rhs, exclusiveStop]))
      }

      return err(new RuntimeError(lhsExpr, `Unexpected value`))
    })
  }
}

addBinaryOperator({
  name: 'range-inclusive',
  symbol: '...',
  precedence: PRECEDENCE.BINARY['...'],
  associativity: 'left',
  create(
    range: [number, number],
    precedingComments: Comment[],
    followingOperatorComments: Comment[],
    operator: Operator,
    args: Expression[],
  ) {
    return new RangeOperator(
      range,
      precedingComments,
      followingOperatorComments,
      operator,
      args,
      '...',
    )
  },
})

addBinaryOperator({
  name: 'range-left-exclusive',
  symbol: '<..',
  precedence: PRECEDENCE.BINARY['<..'],
  associativity: 'left',
  create(
    range: [number, number],
    precedingComments: Comment[],
    followingOperatorComments: Comment[],
    operator: Operator,
    args: Expression[],
  ) {
    return new RangeOperator(
      range,
      precedingComments,
      followingOperatorComments,
      operator,
      args,
      '<..',
    )
  },
})

addBinaryOperator({
  name: 'range-right-exclusive',
  symbol: '..<',
  precedence: PRECEDENCE.BINARY['..<'],
  associativity: 'left',
  create(
    range: [number, number],
    precedingComments: Comment[],
    followingOperatorComments: Comment[],
    operator: Operator,
    args: Expression[],
  ) {
    return new RangeOperator(
      range,
      precedingComments,
      followingOperatorComments,
      operator,
      args,
      '..<',
    )
  },
})

addBinaryOperator({
  name: 'range-exclusive',
  symbol: '<.<',
  precedence: PRECEDENCE.BINARY['<.<'],
  associativity: 'left',
  create(
    range: [number, number],
    precedingComments: Comment[],
    followingOperatorComments: Comment[],
    operator: Operator,
    args: Expression[],
  ) {
    return new RangeOperator(
      range,
      precedingComments,
      followingOperatorComments,
      operator,
      args,
      '<.<',
    )
  },
})

class MultiplicationOperator extends BinaryOperator {
  symbol = '*'

  operatorType(_runtime: TypeRuntime, lhs: Types.Type, rhs: Types.Type) {
    if (lhs.isLiteral('float') && rhs.isLiteral('float')) {
      return ok(Types.literal(lhs.value * rhs.value, anyFloaters(lhs, rhs)))
    }

    return numericType(this, lhs, rhs)
  }

  operatorEval(_runtime: ValueRuntime, lhs: Values.Value, rhs: () => GetValueResult) {
    return rhs().map(rhs => numericOperation(this, lhs, rhs, (a, b) => a * b))
  }
}

addBinaryOperator({
  name: 'multiplication',
  symbol: '*',
  precedence: PRECEDENCE.BINARY['*'],
  associativity: 'left',
  create(
    range: [number, number],
    precedingComments: Comment[],
    followingOperatorComments: Comment[],
    operator: Operator,
    args: Expression[],
  ) {
    return new MultiplicationOperator(
      range,
      precedingComments,
      followingOperatorComments,
      operator,
      args,
    )
  },
})

/**
 * Always returns a float, because 5/2 --> float, except when dividing two literal
 * ints and the result is an int, e.g.
 *
 * 16 / 2 --> int(=8)
 */
class DivisionOperator extends BinaryOperator {
  symbol = '/'

  operatorType(_runtime: TypeRuntime, lhs: Types.Type, rhs: Types.Type) {
    if (lhs.isLiteral('float') && rhs.isLiteral('float')) {
      return ok(Types.literal(lhs.value / rhs.value, anyFloaters(lhs, rhs, lhs.value / rhs.value)))
    }

    return numericType(this, lhs, rhs).map(() => Types.FloatType)
  }

  operatorEval(_runtime: ValueRuntime, lhs: Values.Value, rhs: () => GetValueResult) {
    return rhs().map(rhs =>
      numericOperation(this, lhs, rhs, (a, b) => {
        if (b === 0) {
          return Values.NaNValue
        } else {
          return a / b
        }
      }),
    )
  }
}

addBinaryOperator({
  name: 'division',
  symbol: '/',
  precedence: PRECEDENCE.BINARY['/'],
  associativity: 'left',
  create(
    range: [number, number],
    precedingComments: Comment[],
    followingOperatorComments: Comment[],
    operator: Operator,
    args: Expression[],
  ) {
    return new DivisionOperator(range, precedingComments, followingOperatorComments, operator, args)
  },
})

/**
 * Requires number arguments, always returns an integer.
 *
 *  15 // 4   =  3  // 15/4 = 3.75, round down to 3
 *  15 // 4.1 =  3  // always returns an int
 * -15 // 4   = -4  // always round towards -Infinity
 */
class FloorDivisionOperator extends BinaryOperator {
  symbol = '//'

  operatorType(_runtime: TypeRuntime, lhs: Types.Type, rhs: Types.Type, lhsExpr: Expression) {
    if (lhs.isLiteral('float') && rhs.isLiteral('float')) {
      return ok(Types.literal(Math.floor(lhs.value / rhs.value)))
    }

    if (lhs.isFloat() && rhs.isFloat()) {
      return ok(Types.IntType)
    }

    return err(new RuntimeError(lhsExpr, expectedNumberMessage(lhsExpr, lhs)))
  }

  operatorEval(
    _runtime: ValueRuntime,
    lhs: Values.Value,
    rhs: () => GetValueResult,
    lhsExpr: Expression,
  ) {
    return rhs().map(rhs => {
      if (lhs.isFloat() && rhs.isFloat()) {
        if (rhs.value === 0) {
          return Values.NaNValue
        }

        return ok(Values.int(Math.floor(lhs.value / rhs.value)))
      }

      return err(new RuntimeError(lhsExpr, expectedNumberMessage(lhsExpr, lhs)))
    })
  }
}

addBinaryOperator({
  name: 'floor division',
  symbol: '//',
  precedence: PRECEDENCE.BINARY['//'],
  associativity: 'left',
  create(
    range: [number, number],
    precedingComments: Comment[],
    followingOperatorComments: Comment[],
    operator: Operator,
    args: Expression[],
  ) {
    return new FloorDivisionOperator(
      range,
      precedingComments,
      followingOperatorComments,
      operator,
      args,
    )
  },
})

class ModuloRemainderOperator extends BinaryOperator {
  symbol = '%'

  operatorType(_runtime: TypeRuntime, lhs: Types.Type, rhs: Types.Type) {
    if (lhs.isLiteral('float') && rhs.isLiteral('float')) {
      return ok(Types.literal(lhs.value % rhs.value, anyFloaters(lhs, rhs)))
    }

    return numericType(this, lhs, rhs)
  }

  operatorEval(_runtime: ValueRuntime, lhs: Values.Value, rhs: () => GetValueResult) {
    return rhs().map(rhs => numericOperation(this, lhs, rhs, (a, b) => a % b))
  }
}

addBinaryOperator({
  name: 'modulo remainder',
  symbol: '%',
  precedence: PRECEDENCE.BINARY['%'],
  associativity: 'left',
  create(
    range: [number, number],
    precedingComments: Comment[],
    followingOperatorComments: Comment[],
    operator: Operator,
    args: Expression[],
  ) {
    return new ModuloRemainderOperator(
      range,
      precedingComments,
      followingOperatorComments,
      operator,
      args,
    )
  },
})

class ExponentiationOperator extends BinaryOperator {
  symbol = '**'

  joiner() {
    return this.symbol
  }

  operatorType(_runtime: TypeRuntime, lhs: Types.Type, rhs: Types.Type) {
    if (lhs.isLiteral('float') && rhs.isLiteral('float')) {
      return ok(Types.literal(lhs.value ** rhs.value, anyFloaters(lhs, rhs)))
    }

    return numericType(this, lhs, rhs)
  }

  operatorEval(_runtime: ValueRuntime, lhs: Values.Value, rhs: () => GetValueResult) {
    return rhs().map(rhs => numericOperation(this, lhs, rhs, (a, b) => a ** b))
  }
}

addBinaryOperator({
  name: 'exponentiation',
  symbol: '**',
  precedence: PRECEDENCE.BINARY['**'],
  associativity: 'right',
  create(
    range: [number, number],
    precedingComments: Comment[],
    followingOperatorComments: Comment[],
    operator: Operator,
    args: Expression[],
  ) {
    return new ExponentiationOperator(
      range,
      precedingComments,
      followingOperatorComments,
      operator,
      args,
    )
  },
})

/**
 * This class groups together all the operators that "chain" at the same operator
 * precedence:
 * - property access foo.bar
 * - array access foo[bar]
 * - function invocation foo(bar)
 *
 * Each of these have a corresponding null-coalescing version: `?., ?.[], ?.()`.
 *
 * There's a small wrinkle when evaluating a chain with a null-coalescing
 * operator. Let's say your chain is `a?.b.c`. The AST will put `a?.b` on the lhs
 * of `.c` (`(a?.b).c`). The way we evaluate types in Extra is to simply ask the
 * lhs what type it is, and use that information in the rest of the operation.
 *
 * In this case, though, we want to *ignore* the `null` type.
 *
 * Enter the 'chain' family of functions:
 * - `getChainLhsType` - excludes `null` from the lhs
 * - `isNullCoalescing` - true if the lhs is a null-coalescing operator
 * - `hasNullCoalescing` - true if any descendents is null-coalescing operator
 * - `chainOperatorType` - the actual operator type
 */
abstract class PropertyChainOperator extends BinaryOperator {
  /**
   * No need to enclose property access operators in `(…)`
   */
  toViewPropCode() {
    return this.toCode()
  }

  joiner() {
    return this.symbol
  }

  /**
   * Like getType(), but null-coalescing operators exclude 'null'. If no null type is
   * found, a compile error is returned (null-coalescing operator should not be used
   * in that case).
   */
  getChainLhsType(runtime: TypeRuntime): GetTypeResult {
    return this.getType(runtime).map(type => {
      if (
        this.hasNullCoalescing() &&
        type instanceof Types.OneOfType &&
        type.of.some(of => of.isNull())
      ) {
        return Types.oneOf(type.of.filter(of => !of.isNull()))
      }

      return ok(type)
    })
  }

  isNullCoalescing(): boolean {
    return false
  }

  hasNullCoalescing(): boolean {
    if (this.isNullCoalescing()) {
      return true
    }

    const [lhs] = this.args
    if (lhs instanceof PropertyChainOperator) {
      return lhs.hasNullCoalescing()
    }

    return false
  }

  abstract chainOperatorType(
    runtime: TypeRuntime,
    lhs: Types.Type,
    lhsExpr: Expression,
    rhsExpr: Expression,
  ): GetTypeResult

  operatorType(
    runtime: TypeRuntime,
    lhs: Types.Type,
    _rhs: Types.Type,
    lhsExpr: Expression,
    rhsExpr: Expression,
    originalLhs: Types.Type,
  ) {
    if (
      this.isNullCoalescing() &&
      (!(originalLhs instanceof Types.OneOfType) || !originalLhs.of.some(of => of.isNull()))
    ) {
      return err(
        new RuntimeError(
          this,
          `Expected a nullable type on left hand side of '${this.symbol}' operator, found ${originalLhs}`,
        ),
      )
    }

    return this.chainOperatorType(runtime, lhs, lhsExpr, rhsExpr)
  }

  getType(runtime: TypeRuntime): GetTypeResult {
    const [lhsExpr, rhsExpr] = this.args
    let lhsResult: GetTypeResult
    if (lhsExpr instanceof PropertyChainOperator) {
      lhsResult = lhsExpr.getChainLhsType(runtime)
    } else {
      lhsResult = lhsExpr.getType(runtime)
    }

    return lhsResult
      .mapResult(decorateError(this))
      .map(lhs => {
        if (
          this.isNullCoalescing() &&
          (!(lhs instanceof Types.OneOfType) || !lhs.of.some(of => of.isNull()))
        ) {
          return err(
            new RuntimeError(
              this,
              `Expected a nullable type on left hand side of '${this.symbol}' operator, found ${lhs}`,
            ),
          )
        }

        if (lhs instanceof Types.OneOfType) {
          return mapAll(
            lhs.of.map(
              oneLhType =>
                guardNeverType(oneLhType) ??
                this.chainOperatorType(runtime, oneLhType, lhsExpr, rhsExpr),
            ),
          ).map(Types.oneOf)
        }

        return this.chainOperatorType(runtime, lhs, lhsExpr, rhsExpr)
      })
      .map(lhs => {
        if (this.hasNullCoalescing()) {
          return Types.optional(lhs)
        }
        return lhs
      })
  }
}

class PropertyAccessOperator extends PropertyChainOperator {
  symbol = '.'

  /**
   * Unlike most operators, the rhs is not a dependency
   *
   *     foo.bar <-- 'bar' is not a reference
   */
  dependencies() {
    return this.args[0].dependencies()
  }

  relationshipFormula(runtime: TypeRuntime): RelationshipFormula | undefined {
    const rhs = this.args[1]
    if (!(rhs instanceof Expressions.Identifier)) {
      return
    }

    const lhsFormula = this.args[0].relationshipFormula(runtime)
    if (lhsFormula) {
      return relationshipFormula.propertyAccess(lhsFormula, rhs.name)
    }
  }

  replaceWithType(runtime: TypeRuntime, withType: Types.Type): GetRuntimeResult<TypeRuntime> {
    const [lhsExpr, rhsExpr] = this.args
    if (!(rhsExpr instanceof Expressions.Identifier)) {
      return err(new RuntimeError(rhsExpr, expectedType('property name', rhsExpr)))
    }

    return getChildType(this, lhsExpr, runtime).map(lhsType => {
      return lhsType.replacingProp(rhsExpr.name, withType).mapResult(result => {
        if (result.isErr()) {
          return err(new RuntimeError(rhsExpr, result.error))
        }

        return lhsExpr.replaceWithType(runtime, result.value)
      })
    })
  }

  rhsType(): GetTypeResult {
    return ok(Types.AllType)
  }

  chainOperatorType(
    _runtime: TypeRuntime,
    lhs: Types.Type,
    _lhsExpr: Expression,
    rhsExpr: Expression,
  ): GetTypeResult {
    if (!(rhsExpr instanceof Expressions.Identifier)) {
      return err(new RuntimeError(rhsExpr, expectedType('property name', rhsExpr)))
    }

    const rhType = lhs.propAccessType(rhsExpr.name)
    if (!rhType) {
      return err(
        new RuntimeError(rhsExpr, `Property '${rhsExpr.name}' does not exist on ${lhs.toCode()}`),
      )
    }

    return ok(rhType)
  }

  operatorEval(
    runtime: ValueRuntime,
    lhs: Values.Value,
    _rhs: () => GetValueResult,
    lhsExpr: Expression,
    rhsExpr: Expression,
  ): GetValueResult {
    if (!(rhsExpr instanceof Expressions.Identifier)) {
      return err(new RuntimeError(rhsExpr, expectedType('property name', rhsExpr)))
    }

    const value = lhs.propValue(rhsExpr.name)
    if (!value) {
      const lhsType = getChildType(this, lhsExpr, runtime).value
      return err(
        new RuntimeError(
          rhsExpr,
          `'${rhsExpr}' is not a property of '${lhsExpr}' ${lhsType ? ` (type: ${lhsType})` : ''}`,
        ),
      )
    }

    return ok(value)
  }

  toCode(prevPrecedence = 0): string {
    if (prevPrecedence > this.operator.precedence) {
      return `(${this.toCode(0)})`
    }

    const [lhsExpr, rhsExpr] = this.args
    // remove '@' from rhs - it's ignored at compile/runtime, because I know
    // what you mean and I'm not *always* a fastidious monster.
    const rhsCode = rhsExpr instanceof Expressions.StateReference ? rhsExpr.name : rhsExpr.toCode()
    return `${lhsExpr.toCode(prevPrecedence)}${this.symbol}${rhsCode}`
  }
}

addBinaryOperator({
  name: 'property access',
  symbol: '.',
  precedence: PRECEDENCE.BINARY['.'],
  associativity: 'left',
  create(
    range: [number, number],
    precedingComments: Comment[],
    followingOperatorComments: Comment[],
    operator: Operator,
    args: Expression[],
  ) {
    return new PropertyAccessOperator(
      range,
      precedingComments,
      followingOperatorComments,
      operator,
      args,
    )
  },
})

class NullCoalescingPropertyAccessOperator extends PropertyAccessOperator {
  symbol = '?.'

  isNullCoalescing() {
    return true
  }

  chainOperatorType(
    runtime: TypeRuntime,
    lhs: Types.Type,
    lhsExpr: Expression,
    rhsExpr: Expression,
  ): GetTypeResult {
    if (lhs.isNull()) {
      return ok(lhs)
    }

    return super.chainOperatorType(runtime, lhs, lhsExpr, rhsExpr)
  }

  operatorEval(
    runtime: ValueRuntime,
    lhs: Values.Value,
    rhs: () => GetValueResult,
    lhsExpr: Expression,
    rhsExpr: Expression,
  ) {
    if (lhs === Values.NullValue) {
      return ok(Values.NullValue)
    }

    return super.operatorEval(runtime, lhs, rhs, lhsExpr, rhsExpr)
  }
}

addBinaryOperator({
  name: 'nullable property access',
  symbol: '?.',
  precedence: PRECEDENCE.BINARY['?.'],
  associativity: 'left',
  create(
    range: [number, number],
    precedingComments: Comment[],
    followingOperatorComments: Comment[],
    operator: Operator,
    args: Expression[],
  ) {
    return new NullCoalescingPropertyAccessOperator(
      range,
      precedingComments,
      followingOperatorComments,
      operator,
      args,
    )
  },
})

class ArrayAccessOperator extends PropertyChainOperator {
  symbol = '[]'

  /**
   * No need to enclose array access operators in `(…)`
   */
  toViewPropCode() {
    return this.toCode()
  }

  toCode(prevPrecedence = 0): string {
    if (prevPrecedence > this.operator.precedence) {
      return `(${this.toCode(0)})`
    }

    const [lhsExpr, rhsExpr] = this.args
    return `${lhsExpr.toCode(prevPrecedence)}[${rhsExpr}]`
  }

  relationshipFormula(runtime: TypeRuntime): RelationshipFormula | undefined {
    const lhsFormula = this.args[0].relationshipFormula(runtime)
    const rhsFormula = this.args[1].relationshipFormula(runtime)
    if (lhsFormula && rhsFormula) {
      return relationshipFormula.arrayAccess(lhsFormula, rhsFormula)
    }
  }

  chainOperatorType(
    runtime: TypeRuntime,
    lhs: Types.Type,
    lhsExpr: Expression,
    rhsExpr: Expression,
  ) {
    return rhsExpr.getType(runtime).map(rhs => {
      if (rhs instanceof Types.OneOfType) {
        return err(
          new RuntimeError(rhsExpr, 'TODO: support one-of-type in rhs of array access operator'),
        )
      }

      if (lhs instanceof Types.MetaStringType) {
        return this.accessInStringType(runtime, lhs, rhs, lhsExpr, rhsExpr)
      }

      if (lhs instanceof Types.ArrayType) {
        return this.accessInArrayType(runtime, lhs, rhs, lhsExpr, rhsExpr)
      }

      if (lhs instanceof Types.DictType) {
        return this.accessInDictType(lhs, rhs, rhsExpr)
      }

      if (lhs instanceof Types.ObjectType) {
        return this.accessInObjectType(lhs, rhs, rhsExpr)
      }

      return err(new RuntimeError(lhsExpr, `Expected Object, Dict, or Array, found ${lhs}`))
    })
  }

  checkLengthInRange(runtime: TypeRuntime, lhsExpr: Expression, rhsExpr: Expression) {
    const lhsRel = lhsExpr.relationshipFormula(runtime)
    const rhsRel = rhsExpr.relationshipFormula(runtime)
    if (lhsRel && rhsRel) {
      const lhsRef = findEventualRef(lhsRel)
      if (lhsRef) {
        const lhsLength = relationshipFormula.propertyAccess(lhsRef, 'length')
        const getTypeById = runtime.getTypeById.bind(runtime)
        const getRelationships = runtime.getRelationships.bind(runtime)
        const rhsIsGtZero = verifyRelationship(
          rhsRel,
          '>=',
          relationshipFormula.int(0),
          getTypeById,
          getRelationships,
        )
        const rhsIsGtNegativeLength = verifyRelationship(
          rhsRel,
          '>=',
          relationshipFormula.negate(lhsLength),
          getTypeById,
          getRelationships,
        )
        const rhsIsLtLength = verifyRelationship(
          rhsRel,
          '<',
          lhsLength,
          getTypeById,
          getRelationships,
        )
        if ((rhsIsGtZero || rhsIsGtNegativeLength) && rhsIsLtLength) {
          return true
        }
      }
    }

    return false
  }

  accessInStringType(
    runtime: TypeRuntime,
    lhs: Types.MetaStringType,
    rhs: Types.Type,
    lhsExpr: Expression,
    rhsExpr: Expression,
  ) {
    if (rhs.isLiteral() && !(rhs.value instanceof RegExp)) {
      const type = lhs.literalAccessType(rhs.value)
      if (type) {
        return type
      }
    }

    const lengthCheck = this.checkLengthInRange(runtime, lhsExpr, rhsExpr)
    if (lengthCheck) {
      return Types.StringType
    }

    const type = lhs.arrayAccessType(rhs)
    if (type) {
      return type
    }

    return err(
      new RuntimeError(rhsExpr, `Expected Int (Strings can only be indexed by Int), found ${lhs}`),
    )
  }

  accessInArrayType(
    runtime: TypeRuntime,
    lhs: Types.ArrayType,
    rhs: Types.Type,
    lhsExpr: Expression,
    rhsExpr: Expression,
  ) {
    if (rhs.isLiteral() && !(rhs.value instanceof RegExp)) {
      const type = lhs.literalAccessType(rhs.value)
      if (type) {
        return type
      }
    }

    const lengthCheck = this.checkLengthInRange(runtime, lhsExpr, rhsExpr)
    if (lengthCheck) {
      return lhs.of
    }

    const type = lhs.arrayAccessType(rhs)
    if (type) {
      return type
    }

    return err(
      new RuntimeError(rhsExpr, `Expected Int (Arrays can only be indexed by Int), found ${lhs}`),
    )
  }

  accessInDictType(lhs: Types.DictType, rhs: Types.Type, rhsExpr: Expression) {
    if (rhs.isLiteral('key')) {
      return ok(lhs.literalAccessType(rhs.value))
    } else if (rhs.isInt() || rhs.isString() || rhs.isBoolean() || rhs.isNull()) {
      return ok(lhs.arrayAccessType(rhs))
    }

    return err(
      new RuntimeError(rhsExpr, `Expected Dict key (String, Int, Boolean, or null), found ${lhs}`),
    )
  }

  accessInObjectType(lhs: Types.ObjectType, rhs: Types.Type, rhsExpr: Expression) {
    if (rhs.isLiteral('key')) {
      const propType = lhs.literalAccessType(rhs.value)
      if (!propType) {
        return err(new RuntimeError(rhsExpr, `Invalid key ${rhs.value}`))
      }

      return ok(propType)
    } else if (rhs.isInt() || rhs.isString()) {
      const propType = lhs.arrayAccessType(rhs)
      return ok(propType ?? Types.NullType)
    }

    return err(
      new RuntimeError(
        rhsExpr,
        `Expected Object key (objects can only be indexed by string or int), found ${lhs}`,
      ),
    )
  }

  operatorEval(
    _runtime: ValueRuntime,
    lhs: Values.Value,
    rhs: () => GetValueResult,
    lhsExpr: Expression,
    rhsExpr: Expression,
  ): GetValueResult {
    return rhs().map(rhs => {
      if (lhs instanceof Values.StringValue) {
        return this.accessInStringValue(lhs, rhs, rhsExpr)
      }

      if (lhs instanceof Values.ArrayValue) {
        return this.accessInArrayValue(lhs, rhs, rhsExpr)
      }

      if (lhs instanceof Values.DictValue) {
        return this.accessInDictValue(lhs, rhs, rhsExpr)
      }

      if (lhs instanceof Values.ObjectValue) {
        return this.accessInObjectValue(lhs, rhs, rhsExpr)
      }

      return err(
        new RuntimeError(
          lhsExpr,
          `Expected to access Array, Dict, or Object type, found ${lhsExpr}: ${lhs.getType()}`,
        ),
      )
    })
  }

  accessInStringValue(lhs: Values.StringValue, rhs: Values.Value, rhsExpr: Expression) {
    if (!rhs.isInt()) {
      return err(new RuntimeError(rhsExpr, `${rhsExpr} is an invalid string index. Expected Int`))
    }

    const value = lhs.arrayAccessValue(rhs.value)
    return ok(value ?? Values.NullValue)
  }

  accessInArrayValue(lhs: Values.ArrayValue, rhs: Values.Value, rhsExpr: Expression) {
    if (!rhs.isInt()) {
      return err(new RuntimeError(rhsExpr, `${rhsExpr} is an invalid array index. Expected Int`))
    }

    const value = lhs.arrayAccessValue(rhs.value)
    return ok(value ?? Values.NullValue)
  }

  accessInDictValue(lhs: Values.DictValue, rhs: Values.Value, rhsExpr: Expression) {
    if (rhs.isNull()) {
      const value = lhs.arrayAccessValue(null)
      return ok(value ?? Values.NullValue)
    }

    if (!rhs.isString() && !rhs.isInt() && !rhs.isBoolean()) {
      return err(
        new RuntimeError(
          rhsExpr,
          `${rhsExpr} is an invalid dict index. Expected String, Int, Boolean, or null`,
        ),
      )
    }

    const value = lhs.arrayAccessValue(rhs.value)
    return ok(value ?? Values.NullValue)
  }

  accessInObjectValue(lhs: Values.ObjectValue, rhs: Values.Value, rhsExpr: Expression) {
    if (rhs.isInt()) {
      const value = lhs.arrayAccessValue(rhs.value)
      return ok(value ?? Values.NullValue)
    }

    if (!rhs.isString()) {
      return err(
        new RuntimeError(rhsExpr, `${rhsExpr} is an invalid object index. Expected String`),
      )
    }

    const value = lhs.arrayAccessValue(rhs.value)
    return ok(value ?? Values.NullValue)
  }
}

addBinaryOperator({
  name: 'array access',
  symbol: '[]',
  precedence: PRECEDENCE.BINARY['[]'],
  associativity: 'left',
  create(
    range: [number, number],
    precedingComments: Comment[],
    followingOperatorComments: Comment[],
    operator: Operator,
    args: Expression[],
  ) {
    return new ArrayAccessOperator(
      range,
      precedingComments,
      followingOperatorComments,
      operator,
      args,
    )
  },
})

class NullCoalescingArrayAccessOperator extends ArrayAccessOperator {
  symbol = '?.[]'

  isNullCoalescing() {
    return true
  }

  chainOperatorType(
    runtime: TypeRuntime,
    lhs: Types.Type,
    lhsExpr: Expression,
    rhsExpr: Expression,
  ): GetTypeResult {
    if (lhs.isNull()) {
      return ok(lhs)
    }

    return super.chainOperatorType(runtime, lhs, lhsExpr, rhsExpr)
  }

  operatorEval(
    runtime: ValueRuntime,
    lhs: Values.Value,
    rhs: () => GetValueResult,
    lhsExpr: Expression,
    rhsExpr: Expression,
  ) {
    if (lhs === Values.NullValue) {
      return ok(Values.NullValue)
    }

    return super.operatorEval(runtime, lhs, rhs, lhsExpr, rhsExpr)
  }
}

addBinaryOperator({
  name: 'null coalescing array access',
  symbol: '?.[]',
  precedence: PRECEDENCE.BINARY['?.[]'],
  associativity: 'right',
  create(
    range: [number, number],
    precedingComments: Comment[],
    followingOperatorComments: Comment[],
    operator: Operator,
    args: Expression[],
  ) {
    return new NullCoalescingArrayAccessOperator(
      range,
      precedingComments,
      followingOperatorComments,
      operator,
      args,
    )
  },
})

export class FunctionInvocationOperator extends PropertyChainOperator {
  symbol = 'fn'

  /**
   * No need to enclose function invocations in `(…)`
   */
  toViewPropCode() {
    return this.toCode()
  }

  toLisp() {
    return `(fn ${this.args.map(it => it.toLisp()).join(' ')})`
  }

  toCode(prevPrecedence = 0): string {
    if (prevPrecedence > this.operator.precedence) {
      return `(${this.toCode(0)})`
    }

    const [lhsExpr, argListExpr] = this.args
    const [lhsCode, argListCode] = [lhsExpr.toCode(prevPrecedence), argListExpr.toCode(0)]
    if (
      lhsExpr instanceof PropertyChainOperator ||
      lhsExpr instanceof Expressions.Identifier ||
      lhsExpr instanceof EnumLookupOperator
    ) {
      return `${lhsCode}${argListCode}`
    }

    return `(${lhsCode})${argListCode}`
  }

  // unused in 'chain' operations
  rhsType(): GetTypeResult {
    return ok(Types.AllType)
  }

  /**
   * See PropertyChainOperator
   */
  chainOperatorType(
    runtime: TypeRuntime,
    lhFormulaType: Types.Type,
    lhFormulaExpression: Expression,
    rhArgsExpression: Expression,
  ) {
    if (lhFormulaType instanceof Types.ClassDefinitionType) {
      lhFormulaType = lhFormulaType.konstructor
    }

    if (!(lhFormulaType instanceof Types.FormulaType)) {
      return err(
        new RuntimeError(
          lhFormulaExpression,
          `Expected a formula, found '${lhFormulaExpression}' of type '${lhFormulaType}'`,
        ),
      )
    }

    if (!(rhArgsExpression instanceof Expressions.ArgumentsList)) {
      return err(
        new RuntimeError(
          rhArgsExpression,
          `Expected function arguments, found '${rhArgsExpression}'`,
        ),
      )
    }

    return functionInvocationOperatorType(
      runtime,
      lhFormulaType,
      lhFormulaExpression,
      rhArgsExpression,
    )
  }

  operatorEval(
    runtime: ValueRuntime,
    lhFormula: Values.Value,
    _rhArgs: () => GetValueResult,
    lhFormulaExpression: Expression,
    rhArgsExpression: Expression,
  ): GetValueResult {
    if (lhFormula instanceof Values.ClassDefinitionValue) {
      lhFormula = lhFormula.konstructor(lhFormula)
    }

    if (!(lhFormula instanceof Values.FormulaValue)) {
      return err(
        new RuntimeError(
          lhFormulaExpression,
          `Expected a formula, found '${lhFormula}' of type '${lhFormula.getType()}'`,
        ),
      )
    }

    if (!(rhArgsExpression instanceof Expressions.ArgumentsList)) {
      return err(
        new RuntimeError(
          rhArgsExpression,
          `Expected function arguments, found '${rhArgsExpression}'`,
        ),
      )
    }

    return rhArgsExpression.formulaArgs(runtime).map(args => {
      return lhFormula.call(args).mapResult(result => {
        if (result.isOk()) {
          return ok(result.get())
        } else {
          if (result.error instanceof RuntimeError) {
            return err(result.error)
          }

          return err(new RuntimeError(lhFormulaExpression, result.error))
        }
      })
    })
  }
}

export class NullCoalescingFunctionInvocationOperator extends FunctionInvocationOperator {
  symbol = '?.()'

  /**
   * No need to enclose function invocations in `(…)`
   */
  isNullCoalescing() {
    return true
  }

  chainOperatorType(
    runtime: TypeRuntime,
    lhs: Types.Type,
    lhsExpr: Expression,
    rhsExpr: Expression,
  ): GetTypeResult {
    if (lhs.isNull()) {
      return ok(lhs)
    }

    return super.chainOperatorType(runtime, lhs, lhsExpr, rhsExpr)
  }

  operatorEval(
    runtime: ValueRuntime,
    lhs: Values.Value,
    rhs: () => GetValueResult,
    lhsExpr: Expression,
    rhsExpr: Expression,
  ) {
    if (lhs === Values.NullValue) {
      return ok(Values.NullValue)
    }

    return super.operatorEval(runtime, lhs, rhs, lhsExpr, rhsExpr)
  }
}

addBinaryOperator({
  name: 'null coalescing function invocation',
  symbol: '?.()',
  precedence: PRECEDENCE.BINARY['?.()'],
  associativity: 'right',
  create(
    range: [number, number],
    precedingComments: Comment[],
    followingOperatorComments: Comment[],
    operator: Operator,
    args: Expression[],
  ) {
    return new NullCoalescingFunctionInvocationOperator(
      range,
      precedingComments,
      followingOperatorComments,
      operator,
      args,
    )
  },
})

/**
 * In an array/dict/set/object literal, you can optionally include an element using `if`
 *
 *     [1, 2, 3 if x > 2]  -- will be [1,2] or [1,2,3] depending on `x`
 *
 * The operator doesn't really have a runtime meaning - it is used as a container,
 * and picked up by ArrayExpression.
 */
class InclusionOperator extends BinaryOperator {
  symbol = 'onlyif'

  isInclusionOp(): this is Operation {
    return true
  }

  operatorType(_runtime: TypeRuntime, lhs: Types.Type, _rhs: Types.Type, rhsExpr: Expression) {
    if (rhsExpr instanceof InclusionOperator) {
      return err(new RuntimeError(this, 'Inclusion operator cannot be nested'))
    }
    return ok(lhs)
  }

  operatorEval(_runtime: ValueRuntime, lhs: Values.Value): GetValueResult {
    return ok(lhs)
  }
}

addBinaryOperator({
  name: 'inclusion operator',
  symbol: 'onlyif',
  precedence: PRECEDENCE.BINARY['onlyif'],
  associativity: 'left',
  create(
    range: [number, number],
    precedingComments: Comment[],
    followingOperatorComments: Comment[],
    operator: Operator,
    args: Expression[],
  ) {
    return new InclusionOperator(
      range,
      precedingComments,
      followingOperatorComments,
      operator,
      args,
    )
  },
})

class LogicalNotOperator extends UnaryOperator {
  symbol = 'not'

  assumeTrue(runtime: TypeRuntime) {
    return this.args[0].assumeFalse(runtime)
  }

  assumeFalse(runtime: TypeRuntime) {
    return this.args[0].assumeTrue(runtime)
  }

  checkLhsType(lhs: Types.Type, lhsExpr: Expression) {
    if (lhs.isOnlyTruthyType()) {
      return err(
        new RuntimeError(
          this,
          `'not' operator always returns false. '${lhsExpr}' is of type '${lhs}', which is never false.`,
        ),
      )
    }
    if (lhs.isOnlyFalseyType()) {
      return err(
        new RuntimeError(
          this,
          `'not' operator always returns true. '${lhsExpr}' is of type '${lhs}', which is never true.`,
        ),
      )
    }
    return ok(undefined)
  }

  operatorType(_runtime: TypeRuntime, lhs: Types.Type) {
    if (lhs.isLiteral()) {
      return ok(Types.literal(!lhs.value))
    }
    if (lhs.isOnlyTruthyType()) {
      return ok(Types.LiteralFalseType)
    }
    if (lhs.isOnlyFalseyType()) {
      return ok(Types.LiteralTrueType)
    }

    return ok(Types.BooleanType)
  }

  operatorEval(_runtime: ValueRuntime, lhs: Values.Value) {
    return ok(Values.booleanValue(!lhs.isTruthy()))
  }
}

addUnaryOperator({
  name: 'logical not',
  symbol: 'not',
  precedence: PRECEDENCE.UNARY['not'],
  associativity: 'right',
  create(
    range: [number, number],
    precedingComments: Comment[],
    followingOperatorComments: Comment[],
    operator: Operator,
    args: Expression[],
  ) {
    return new LogicalNotOperator(
      range,
      precedingComments,
      followingOperatorComments,
      operator,
      args,
    )
  },
})

class NegateOperator extends UnaryOperator {
  symbol = '-'

  operatorType(_runtime: TypeRuntime, lhs: Types.Type) {
    if (lhs.isLiteral('float')) {
      return ok(Types.literal(-lhs.value, lhs.is === 'literal-float' ? 'float' : undefined))
    }

    // x: Int(>=1), x - 1 => Int(>=0)
    if (lhs instanceof Types.NumberType) {
      return ok(lhs.negateNarrow(0))
    }

    return numericType(this, lhs)
  }

  operatorEval(_runtime: ValueRuntime, lhs: Values.Value) {
    return numericOperation(this, lhs, a => -a)
  }

  relationshipFormula(runtime: TypeRuntime): RelationshipFormula | undefined {
    const lhsFormula = this.args[0].relationshipFormula(runtime)
    if (lhsFormula) {
      return relationshipFormula.negate(lhsFormula)
    }
  }
}

addUnaryOperator({
  name: 'negate',
  symbol: '-',
  precedence: PRECEDENCE.UNARY['-'],
  associativity: 'right',
  create(
    range: [number, number],
    precedingComments: Comment[],
    followingOperatorComments: Comment[],
    operator: Operator,
    args: Expression[],
  ) {
    return new NegateOperator(range, precedingComments, followingOperatorComments, operator, args)
  },
})

class BinaryNegateOperator extends UnaryOperator {
  symbol = '~'

  operatorType(_runtime: TypeRuntime, lhs: Types.Type) {
    if (lhs.isLiteral('float')) {
      return ok(Types.literal(~lhs.value))
    }

    return numericType(this, lhs)
  }

  operatorEval(_runtime: ValueRuntime, lhs: Values.Value) {
    return numericOperation(this, lhs, a => ~a)
  }
}

addUnaryOperator({
  name: 'binary negate',
  symbol: '~',
  precedence: PRECEDENCE.UNARY['~'],
  associativity: 'right',
  create(
    range: [number, number],
    precedingComments: Comment[],
    followingOperatorComments: Comment[],
    operator: Operator,
    args: Expression[],
  ) {
    return new BinaryNegateOperator(
      range,
      precedingComments,
      followingOperatorComments,
      operator,
      args,
    )
  },
})

class StringCoercionOperator extends UnaryOperator {
  symbol = '$'

  operatorType(_runtime: TypeRuntime, _lhs: Types.Type) {
    // todo be smarter about this (just about printable has String(length: >0))
    return ok(Types.StringType)
  }

  operatorEval(_runtime: ValueRuntime, lhs: Values.Value) {
    return ok(Values.string(lhs.printable()))
  }
}

addUnaryOperator({
  name: 'string-coercion',
  symbol: '$',
  precedence: PRECEDENCE.UNARY['$'],
  associativity: 'left',
  create(
    range: [number, number],
    precedingComments: Comment[],
    followingOperatorComments: Comment[],
    operator: Operator,
    args: Expression[],
  ) {
    return new StringCoercionOperator(
      range,
      precedingComments,
      followingOperatorComments,
      operator,
      args,
    )
  },
})

class UnaryRangeOperator extends UnaryOperator {
  constructor(
    range: Range,
    precedingComments: Comment[],
    followingOperatorComments: Comment[],
    operator: Operator,
    args: Expression[],
    readonly symbol: '=' | '<' | '<=' | '>=' | '>',
  ) {
    super(range, precedingComments, followingOperatorComments, operator, args)
  }

  operatorType(_runtime: TypeRuntime, type: Types.Type, expr: Expression) {
    if (type.isInt()) {
      let min: number | undefined
      let max: number | undefined
      if (type.isLiteral('int')) {
        switch (this.symbol) {
          case '=':
            min = type.value
            max = type.value
            break
          case '<':
            max = type.value - 1
            break
          case '<=':
            max = type.value
            break
          case '>=':
            min = type.value
            break
          case '>':
            min = type.value + 1
            break
        }
      }

      return ok(Types.intRange({min, max}))
    } else if (type.isFloat()) {
      let min: number | [number] | undefined
      let max: number | [number] | undefined
      if (type.isLiteral('float')) {
        switch (this.symbol) {
          case '=':
            min = type.value
            max = type.value
            break
          case '<':
            max = [type.value]
            break
          case '<=':
            max = type.value
            break
          case '>=':
            min = type.value
            break
          case '>':
            min = [type.value]
            break
        }
      }

      return ok(Types.floatRange({min, max}))
    }

    return err(new RuntimeError(expr, expectedType('Float or Int', expr, type)))
  }

  operatorEval(_runtime: ValueRuntime, value: Values.Value, expr: Expression) {
    if (!(value instanceof Values.FloatValue)) {
      return err(
        new RuntimeError(
          expr,
          `Invalid value '${value}' passed to range operator '${this.symbol}'`,
        ),
      )
    }

    switch (this.symbol) {
      case '=':
        return ok(Values.range([value, false], [value, false]))
      case '<':
        return ok(Values.range(undefined, [value, true]))
      case '<=':
        return ok(Values.range(undefined, [value, false]))
      case '>':
        return ok(Values.range([value, true], undefined))
      case '>=':
        return ok(Values.range([value, false], undefined))
    }
  }
}

addUnaryOperator({
  name: 'unary-range-equals',
  symbol: '=',
  precedence: PRECEDENCE.UNARY['='],
  associativity: 'right',
  create(
    range: [number, number],
    precedingComments: Comment[],
    followingOperatorComments: Comment[],
    operator: Operator,
    args: Expression[],
  ) {
    return new UnaryRangeOperator(
      range,
      precedingComments,
      followingOperatorComments,
      operator,
      args,
      '=',
    )
  },
})

addUnaryOperator({
  name: 'unary-range-max-exclusive',
  symbol: '<',
  precedence: PRECEDENCE.UNARY['<'],
  associativity: 'right',
  create(
    range: [number, number],
    precedingComments: Comment[],
    followingOperatorComments: Comment[],
    operator: Operator,
    args: Expression[],
  ) {
    return new UnaryRangeOperator(
      range,
      precedingComments,
      followingOperatorComments,
      operator,
      args,
      '<',
    )
  },
})

addUnaryOperator({
  name: 'unary-range-max',
  symbol: '<=',
  precedence: PRECEDENCE.UNARY['<='],
  associativity: 'right',
  create(
    range: [number, number],
    precedingComments: Comment[],
    followingOperatorComments: Comment[],
    operator: Operator,
    args: Expression[],
  ) {
    return new UnaryRangeOperator(
      range,
      precedingComments,
      followingOperatorComments,
      operator,
      args,
      '<=',
    )
  },
})

addUnaryOperator({
  name: 'unary-range-min-exclusive',
  symbol: '>',
  precedence: PRECEDENCE.UNARY['>'],
  associativity: 'right',
  create(
    range: [number, number],
    precedingComments: Comment[],
    followingOperatorComments: Comment[],
    operator: Operator,
    args: Expression[],
  ) {
    return new UnaryRangeOperator(
      range,
      precedingComments,
      followingOperatorComments,
      operator,
      args,
      '>',
    )
  },
})

addUnaryOperator({
  name: 'unary-range-min',
  symbol: '>=',
  precedence: PRECEDENCE.UNARY['>='],
  associativity: 'right',
  create(
    range: [number, number],
    precedingComments: Comment[],
    followingOperatorComments: Comment[],
    operator: Operator,
    args: Expression[],
  ) {
    return new UnaryRangeOperator(
      range,
      precedingComments,
      followingOperatorComments,
      operator,
      args,
      '>=',
    )
  },
})

class EnumLookupOperator extends UnaryOperator {
  symbol = '.'

  operatorType(_runtime: TypeRuntime, _: Types.Type, arg: Expression) {
    if (!(arg instanceof Expressions.Identifier)) {
      return ok(Types.NeverType)
    }

    return err(new RuntimeError(arg, `No enum value named ${this.symbol}${arg.name}`))
  }

  operatorEval(_runtime: ValueRuntime, _: Values.Value, arg: Expression) {
    if (!(arg instanceof Expressions.Identifier)) {
      return err(new RuntimeError(arg, `Expected a variable name`))
    }

    return err(new RuntimeError(arg, `No enum value named ${this.symbol}${arg.name}`))
  }
}

addUnaryOperator({
  name: 'enum lookup',
  symbol: '.',
  precedence: PRECEDENCE.UNARY['.'],
  associativity: 'right',
  create(
    range: [number, number],
    precedingComments: Comment[],
    followingOperatorComments: Comment[],
    operator: Operator,
    args: Expression[],
  ) {
    return new EnumLookupOperator(
      range,
      precedingComments,
      followingOperatorComments,
      operator,
      args,
    )
  },
})

class BinaryAssignmentOperator extends BinaryOperator {
  readonly symbol: string

  constructor(
    range: Range,
    precedingComments: Comment[],
    followingOperatorComments: Comment[],
    operator: Operator,
    args: Expression[],
  ) {
    super(range, precedingComments, followingOperatorComments, operator, args)
    this.symbol = operator.symbol
  }

  operatorType(
    _runtime: TypeRuntime,
    _lhs: Types.Type,
    _rhs: Types.Type,
    _lhsExpr: Expression,
    _rhsExpr: Expression,
  ): GetTypeResult {
    return ok(new Types.MessageType())
  }

  operatorEval(
    _runtime: ValueRuntime,
    _lhs: Values.Value,
    _rhs: () => GetValueResult,
    lhsExpr: Expression,
    rhsExpr: Expression,
  ): GetRuntimeResult<Values.BooleanValue> {
    return err(
      new RuntimeError(lhsExpr, 'Still working on assignment ' + lhsExpr + ' = ' + rhsExpr),
    )
  }

  toCode(prevPrecedence = LOWEST_PRECEDENCE): string {
    if (prevPrecedence > this.operator.precedence) {
      return `(${this.toCode(LOWEST_PRECEDENCE)})`
    }

    const lhs = this.args[0]
    const rhs = (this.args[1] as BinaryOperator).args[1]
    return this.formatCode([
      lhs.toCode(this.operator.precedence),
      rhs.toCode(this.operator.precedence),
    ])
  }
}

function addBinaryAssignmentOperator({
  name,
  symbol,
  binaryOp,
}: {
  name: string
  symbol: string
  binaryOp: Operator
}) {
  addBinaryOperator({
    name: name,
    symbol: symbol,
    precedence: -1,
    associativity: 'left',
    create(
      range: [number, number],
      precedingComments: Comment[],
      followingOperatorComments: Comment[],
      operator: Operator,
      args: Expression[],
    ) {
      const binaryOpArgs = binaryOp.create(range, [], [], binaryOp, [args[0], args[1]])
      return new BinaryAssignmentOperator(
        range,
        precedingComments,
        followingOperatorComments,
        operator,
        [args[0], binaryOpArgs],
      )
    },
  })
}

for (const {name, symbol, binarySymbol} of BINARY_ASSIGN_OPERATORS) {
  const binaryOp = binaryOperatorNamed(binarySymbol)
  if (!binaryOp) {
    throw new Error(
      `Binary operator '${binarySymbol}' not found for assignment operator '${symbol}'`,
    )
  }

  addBinaryAssignmentOperator({name, symbol, binaryOp})
}

export class IfExpressionInvocation extends FunctionInvocationOperator {
  symbol = 'if'
  argList: Expression
  conditionExpr?: Expression
  thenExpr?: Expression
  elseifExprs: Expression[] = []
  elseExpr?: Expression

  constructor(
    range: Range,
    precedingComments: Comment[],
    followingOperatorComments: Comment[],
    operator: Operator,
    args: Expression[],
  ) {
    super(range, precedingComments, followingOperatorComments, operator, args)
    this.argList = args[1]

    if (this.argList instanceof Expressions.ArgumentsList) {
      this.conditionExpr = this.argList.positionalArg(0)
      this.thenExpr = this.argList.namedArg('then')
      this.elseifExprs = this.argList.allPositionalArgs(1)
      this.elseExpr = this.argList.namedArg('else')
    }
  }

  /**
   * No need to enclose function invocations in `(…)`
   */
  toViewPropCode() {
    return this.toCode()
  }

  toLisp() {
    return `(if ${this.argList.toLisp()})`
  }

  toCode(prevPrecedence = 0): string {
    if (prevPrecedence > this.operator.precedence) {
      return `(${this.toCode(0)})`
    }

    if (this.conditionExpr && this.thenExpr) {
      const conditionCode = this.conditionExpr.toCode(0)
      const thenCode = this.thenExpr.toCode(0)
      const elseifs = this.elseifExprs.map(it => it.toCode(0))
      const elseCode = this.elseExpr?.toCode(0) ?? ''

      let totalLength = 0
      const hasNewline =
        conditionCode.includes('\n') ||
        thenCode.includes('\n') ||
        elseCode.includes('\n') ||
        elseifs.some(it => it.includes('\n'))
      if (!hasNewline) {
        totalLength +=
          elseifs.reduce((l, r) => l + r.length, 0) +
          conditionCode.length +
          thenCode.length +
          elseCode.length
        totalLength += ' () { then: }'.length
        totalLength += elseifs.length * 'elseif(): '.length
        totalLength += elseCode ? 'else: '.length : 0
      }
      if (hasNewline || totalLength > SMALL_LEN) {
        let code = ''
        if (conditionCode.includes('\n')) {
          code += 'if (\n'
          code += indent(conditionCode) + '\n'
          code += ') {\n'
        } else {
          code += `if (${conditionCode}) {\n`
        }
        let blockCode = ''
        blockCode += 'then:\n'
        blockCode += indent(thenCode) + '\n'
        for (const elseifExpr of this.elseifExprs) {
          if (elseifExpr instanceof ElseIfExpressionInvocation) {
            const conditionCode = elseifExpr.conditionExpr?.toCode() ?? ''
            if (conditionCode.includes('\n')) {
              blockCode += `elseif (\n`
              blockCode += conditionCode
              blockCode += `\n):\n`
            } else {
              blockCode += `elseif (`
              blockCode += conditionCode
              blockCode += `):\n`
            }
            const thenCode = elseifExpr.thenExpr?.toCode() ?? ''
            blockCode += indent(thenCode + '\n')
          } else {
            const elseifCode = elseifExpr.toCode(0)
            blockCode += indent(elseifCode) + '\n'
          }
        }
        if (elseCode) {
          blockCode += 'else:\n'
          blockCode += indent(elseCode) + '\n'
        }
        code += blockCode
        code += '}'
        return code
      } else {
        let code = `if (`
        code += conditionCode
        code += `, then: `
        code += thenCode
        for (const elseif of this.elseifExprs) {
          code += `, `
          code += elseif.toCode(0)
        }
        if (elseCode) {
          code += `, else: `
          code += elseCode
        }
        code += ')'
        return code
      }
    } else {
      const argListCode = this.argList.toCode(0)
      return `if ` + argListCode
    }
  }

  // rhsType(runtime: TypeRuntime, lhsType: Types.Type, lhsExpr: Expression, rhsExpr: Expression) {
  rhsType(): GetTypeResult {
    return ok(Types.AllType)
  }

  getType(runtime: TypeRuntime): GetTypeResult {
    const conditionExpr = this.conditionExpr
    const thenExpr = this.thenExpr
    const elseifExprs = this.elseifExprs
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
      if (
        !(conditionExpr instanceof Expressions.TrueExpression) &&
        !(conditionExpr instanceof Expressions.FalseExpression)
      ) {
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

      for (const elseif of elseifExprs) {
        if (!(elseif instanceof ElseIfExpressionInvocation)) {
          return err(new RuntimeError(elseif, expectedElseifConditionExpression(elseif)))
        }

        const elseifThenType = elseif.getReturnType(nextRuntime)
        if (elseifThenType.isErr()) {
          return err(elseifThenType.error)
        }

        returnType = Types.compatibleWithBothTypes(returnType, elseifThenType.value)

        const elseifConditionExpr = elseif.conditionExpr
        if (!elseifConditionExpr) {
          return err(new RuntimeError(elseif, expectedElseifConditionArgument()))
        }

        const nextRuntimeResult = elseifConditionExpr.assumeFalse(nextRuntime)
        if (nextRuntimeResult.isErr()) {
          return err(nextRuntimeResult.error)
        }
        nextRuntime = nextRuntimeResult.value
      }

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
    const elseifExprs = this.elseifExprs
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

      for (const elseif of elseifExprs) {
        if (!(elseif instanceof ElseIfExpressionInvocation)) {
          return err(new RuntimeError(elseif, expectedElseifConditionExpression(elseif)))
        }

        const elseifConditionExpr = elseif.conditionExpr
        if (!elseifConditionExpr) {
          return err(new RuntimeError(elseif, expectedElseifConditionArgument()))
        }

        const elseifThen = elseif.thenExpr
        if (!elseifThen) {
          return err(new RuntimeError(elseif, expectedElseifConditionResult()))
        }

        const elseifCondition = elseifConditionExpr.evalReturningRuntime(runtime)
        if (elseifCondition.isErr()) {
          return elseifCondition
        }

        const [elseifValue, elseifThenRuntime] = elseifCondition.value
        if (elseifValue.isTruthy()) {
          return elseifThen.eval(elseifThenRuntime)
        }
      }

      if (elseExpr) {
        return elseExpr.eval(runtime)
      }

      // that wasn't so bad
      return ok(Values.NullValue)
    })
  }
}

export class ElseIfExpressionInvocation extends FunctionInvocationOperator {
  symbol = 'elseif'
  argList: Expression
  conditionExpr?: Expression
  thenExpr?: Expression

  constructor(
    range: Range,
    precedingComments: Comment[],
    followingOperatorComments: Comment[],
    operator: Operator,
    args: Expression[],
  ) {
    super(range, precedingComments, followingOperatorComments, operator, args)
    this.argList = args[1]

    if (this.argList instanceof Expressions.ArgumentsList) {
      this.conditionExpr = this.argList.positionalArg(0)
      this.thenExpr = this.argList.positionalArg(1)
    }
  }

  toCode(prevPrecedence = 0): string {
    if (prevPrecedence > this.operator.precedence) {
      return `(${this.toCode(0)})`
    }

    const argListCode = this.argList.toCode(0)
    return `elseif ${argListCode}`
  }

  getReturnType(runtime: TypeRuntime): GetTypeResult {
    const argList = this.argList
    if (!(argList instanceof Expressions.ArgumentsList)) {
      return err(new RuntimeError(this, expectedType('arguments list', argList)))
    }

    const conditionExpr = this.conditionExpr
    const thenExpr = this.thenExpr
    if (!conditionExpr) {
      return err(new RuntimeError(this, expectedElseIfCondition()))
    }

    if (!thenExpr) {
      return err(new RuntimeError(this, expectedElseIfThenResult()))
    }

    return getChildType(this, conditionExpr, runtime).map(conditionType => {
      // allow literal 'true/false' expressions (for testing)
      // TODO: disallow for "production" builds
      if (
        !(conditionExpr instanceof Expressions.TrueExpression) &&
        !(conditionExpr instanceof Expressions.FalseExpression)
      ) {
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

      return ok(returnResult.value)
    })
  }

  getType(runtime: TypeRuntime): GetTypeResult {
    return this.getReturnType(runtime).map(returnType => {
      return ok(
        Types.lazy(
          Types.oneOf([
            Types.tuple([Types.LiteralTrueType, returnType]),
            Types.tuple([Types.LiteralFalseType, Types.NullType]),
          ]),
        ),
      )
    })
  }

  eval(runtime: ValueRuntime) {
    const returnType = this.getReturnType(runtime)
    if (returnType.isErr()) {
      return err(returnType.error)
    }

    const argList = this.argList
    if (!(argList instanceof Expressions.ArgumentsList)) {
      return err(new RuntimeError(this, expectedType('arguments list', argList)))
    }

    const conditionExpr = this.conditionExpr
    const thenExpr = this.thenExpr
    if (!conditionExpr) {
      return err(new RuntimeError(this, expectedElseIfCondition()))
    }

    if (!thenExpr) {
      return err(new RuntimeError(this, expectedElseIfThenResult()))
    }

    return ok(
      Values.formula(() =>
        conditionExpr.evalReturningRuntime(runtime).map(([conditionValue, thenRuntime]) => {
          if (conditionValue.isTruthy()) {
            return thenExpr
              .eval(thenRuntime)
              .map(thenValue => ok(Values.tuple([Values.booleanValue(true), thenValue])))
          }

          return ok(Values.tuple([Values.booleanValue(false), Values.NullValue]))
        }),
      ),
    )
  }
}

export class GuardExpressionInvocation extends FunctionInvocationOperator {
  symbol = 'guard'
  argList: Expression
  conditionExpr?: Expression
  bodyExpr?: Expression
  elseExpr?: Expression

  constructor(
    range: Range,
    precedingComments: Comment[],
    followingOperatorComments: Comment[],
    operator: Operator,
    args: Expression[],
  ) {
    super(range, precedingComments, followingOperatorComments, operator, args)
    this.argList = args[1]

    if (this.argList instanceof Expressions.ArgumentsList) {
      const args = this.argList.allPositionalArgs()
      this.conditionExpr = args[0]
      this.bodyExpr = args[1]
      this.elseExpr = this.argList.namedArg('else')
    }
  }

  /**
   * No need to enclose function invocations in `(…)`
   */
  toViewPropCode() {
    return this.toCode()
  }

  toLisp() {
    return `(guard ${this.argList.toLisp()})`
  }

  toCode(): string {
    if (!this.bodyExpr || !this.conditionExpr || !this.elseExpr) {
      const argListCode = this.argList.toCode()
      return `guard ${argListCode}`
    }

    const condition = this.conditionExpr.toCode()
    const elseCode = this.elseExpr.toCode()
    let bodyCode: string
    if (
      this.bodyExpr instanceof Expressions.ArgumentsList &&
      this.bodyExpr.parenArgs.length === 0 &&
      this.bodyExpr.blockArgs.length === 1 &&
      this.bodyExpr.blockArgs[0] &&
      this.bodyExpr.blockArgs[0].isPositional()
    ) {
      bodyCode = this.bodyExpr.blockArgs[0].toCode()
    } else {
      bodyCode = this.bodyExpr.toCode()
    }
    let code = 'guard (\n'
    code += indent(condition) + '\n'
    code += 'else:\n'
    code += indent(elseCode) + '\n'
    code += '):\n\n'
    code += bodyCode
    return code
  }

  // rhsType(runtime: TypeRuntime, lhsType: Types.Type, lhsExpr: Expression, rhsExpr: Expression) {
  rhsType(): GetTypeResult {
    return ok(Types.AllType)
  }

  getType(runtime: TypeRuntime): GetTypeResult {
    const bodyExpr = this.bodyExpr
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

    if (
      !(conditionExpr instanceof Expressions.TrueExpression) &&
      !(conditionExpr instanceof Expressions.FalseExpression)
    ) {
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
    const bodyExpr = this.bodyExpr
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

export class SwitchExpressionInvocation extends FunctionInvocationOperator {
  symbol = 'switch'
  argList: Expression
  subjectExpr?: Expression
  caseExprs?: Expressions.CaseExpression[]
  elseExpr?: Expression

  constructor(
    range: Range,
    precedingComments: Comment[],
    followingOperatorComments: Comment[],
    operator: Operator,
    switchArgs: Expression[],
  ) {
    super(range, precedingComments, followingOperatorComments, operator, switchArgs)
    this.argList = switchArgs[1] as Expressions.ArgumentsList

    if (!(this.argList instanceof Expressions.ArgumentsList)) {
      throw new RuntimeError(this, 'Expected arguments list for switch expression')
    }

    const args = this.argList.allPositionalArgs()
    this.subjectExpr = args[0]
    this.caseExprs = args.slice(1) as Expressions.CaseExpression[]
    if (this.caseExprs.some(arg => !(arg instanceof Expressions.CaseExpression))) {
      throw new RuntimeError(this, expectedCaseConditions())
    }
    this.elseExpr = this.argList.namedArg('else')
    const names = new Set(this.argList.allNamedArgs().keys())
    names.delete('else')
    if (names.size) {
      throw new RuntimeError(
        this,
        `Unexpected named arguments in switch expression: '${Array.from(names).join("', '")}'`,
      )
    }
  }

  /**
   * No need to enclose function invocations in `(…)`
   */
  toViewPropCode() {
    return this.toCode()
  }

  toLisp() {
    return `(switch ${this.argList.toLisp()})`
  }

  toCode(): string {
    if (!this.subjectExpr || !this.caseExprs) {
      const argListCode = this.argList.toCode()
      return `switch ${argListCode}`
    }

    const subjectCode = this.subjectExpr.toCode()
    let code = 'switch (' + subjectCode + ') {\n'
    for (const caseExpr of this.caseExprs) {
      code += caseExpr.toCode() + '\n'
    }
    if (this.elseExpr) {
      code += 'else:\n'
      code += indent(this.elseExpr.toCode()) + '\n'
    }
    code += '}'
    return code
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

addBinaryOperator({
  name: 'function invocation',
  symbol: 'fn',
  precedence: PRECEDENCE.BINARY['fn'],
  associativity: 'left',
  create(
    range: [number, number],
    precedingComments: Comment[],
    followingOperatorComments: Comment[],
    operator: Operator,
    args: Expression[],
  ) {
    if (args[0] instanceof Expressions.GuardIdentifier) {
      return new GuardExpressionInvocation(
        range,
        precedingComments,
        followingOperatorComments,
        operator,
        args,
      )
    }

    if (args[0] instanceof Expressions.SwitchIdentifier) {
      return new SwitchExpressionInvocation(
        range,
        precedingComments,
        followingOperatorComments,
        operator,
        args,
      )
    }

    if (args[0] instanceof Expressions.IfIdentifier) {
      return new IfExpressionInvocation(
        range,
        precedingComments,
        followingOperatorComments,
        operator,
        args,
      )
    }

    if (args[0] instanceof Expressions.ElseIfIdentifier) {
      return new ElseIfExpressionInvocation(
        range,
        precedingComments,
        followingOperatorComments,
        operator,
        args,
      )
    }

    return new FunctionInvocationOperator(
      range,
      precedingComments,
      followingOperatorComments,
      operator,
      args,
    )
  },
})

type _IntermediateArgs =
  | ['positional', undefined, Types.Type]
  | ['named', string, Types.Type]
  | ['spread-array', undefined, Types.Type]
  | ['spread-dict', string, Types.Type]
  | ['keyword-list', undefined, Types.Type]

function functionInvocationOperatorType(
  runtime: TypeRuntime,
  formulaType: Types.FormulaType,
  formulaExpression: Expression,
  argsList: Expressions.ArgumentsList,
): GetTypeResult {
  let positionIndex = 0
  let hasSpreadArrayType = false
  const hasSpreadDictName: Set<string> = new Set()
  const argsResult = mapAll(
    // argsList.args is an array of:
    // - NamedArgument `foo(bar: bar)`
    // - PositionalArgument `foo(bar)`
    // - or SpreadFunctionArgument `foo(...bar)`, `bar` must be an Object or Array
    // - or RepeatedFunctionArgument `foo(...name: bar)`, `bar` must be an Array
    // - or Keyword Argument List `foo(**kwargs)`, `kwargs` must be a Dict
    argsList.allArgs.map((providedArg): GetRuntimeResult<_IntermediateArgs[]> => {
      const currentPosition = positionIndex
      // we can use the argument type (from formulaType) to derive the types of a formula
      // literal.
      if (providedArg.value instanceof Expressions.FormulaExpression) {
        // if providedArg is a FormulaExpression and *doesn't* declare its argument types,
        // we need to hand it a formula that it can use to derive its argument types.
        let expectedFormulaType: Types.Type | undefined

        if (providedArg instanceof Expressions.NamedArgument) {
          expectedFormulaType = formulaType.namedArg(providedArg.alias)?.type
        } else {
          expectedFormulaType = formulaType.positionalArg(positionIndex)?.type
          positionIndex += 1
        }

        // Guard for no argument expected
        if (!expectedFormulaType) {
          let message = 'Unexpected argument '
          if (providedArg instanceof Expressions.NamedArgument) {
            message += `'${providedArg.alias}'`
          } else if (providedArg instanceof Expressions.PositionalArgument) {
            message += `at position #${currentPosition + 1}`
          }

          return err(new RuntimeError(providedArg, message))
        }

        // Guard for wrong argument type
        if (!(expectedFormulaType instanceof Types.FormulaType)) {
          let message = `Expected argument of type '${expectedFormulaType.toCode()}' for argument`
          if (providedArg instanceof Expressions.NamedArgument) {
            message += `'${providedArg.alias}'`
          } else if (providedArg instanceof Expressions.PositionalArgument) {
            message += `at position #${currentPosition + 1}`
          }

          return err(new RuntimeError(providedArg, message))
        }

        // FormulaExpression.getType accepts a FormulaType which it can use to resolve inferred arguments.
        return providedArg.value
          .getType(runtime, expectedFormulaType)
          .mapResult(decorateError(formulaExpression))
          .map(type => [
            providedArg.alias
              ? ['named', providedArg.alias, type]
              : ['positional', undefined, type],
          ])
      }

      if (providedArg instanceof Expressions.SpreadFunctionArgument) {
        return getChildType(formulaExpression, providedArg.value, runtime).map(type => {
          const [foundSpreadArrayType, foundSpreadDictName, result] = (() => {
            if (providedArg.spread === 'spread' && providedArg.alias === undefined) {
              return spreadArrayArg(providedArg, type)
            } else if (providedArg.spread === 'spread' && providedArg.alias) {
              return spreadDictArg(providedArg.alias, providedArg, type)
            } else {
              return spreadKeywordArg(providedArg, type)
            }
          })()
          hasSpreadArrayType = hasSpreadArrayType || foundSpreadArrayType

          if (foundSpreadDictName) {
            hasSpreadDictName.add(foundSpreadDictName)
          }

          return result
        })
      }

      return getChildType(formulaExpression, providedArg.value, runtime).map(type => {
        if (providedArg.alias && hasSpreadDictName.has(providedArg.alias)) {
          return [['spread-dict', providedArg.alias, type]]
        } else if (providedArg.alias) {
          return [['named', providedArg.alias, type]]
        } else if (hasSpreadArrayType) {
          // a = [1,2,3]
          // foo(...a, 5) ->
          // foo(...[1,2,3], ...[5])
          return [['spread-array', undefined, type]]
        } else {
          return [['positional', undefined, type]]
        }
      })
    }),
  ).map(args => args.flat())

  if (argsResult.isErr()) {
    return err(argsResult.error)
  }

  const positional: Types.Type[] = []
  const named: Map<string, Types.Type[]> = new Map()
  const names: string[] = []
  const spreadPositionalArguments: Types.Type[] = []
  const spreadDictArguments: Map<string, Types.Type[]> = new Map()
  const keywordListArguments: Types.Type[] = []

  for (const [is, alias, type] of argsResult.value) {
    if (is === 'spread-array') {
      spreadPositionalArguments.push(type)
    } else if (is === 'spread-dict') {
      if (spreadDictArguments.has(alias)) {
        spreadDictArguments.get(alias)!.push(type)
      } else {
        spreadDictArguments.set(alias, [type])
      }
    } else if (alias) {
      if (named.has(alias)) {
        named.get(alias)!.push(type)
      } else {
        named.set(alias, [type])
      }
      names.push(alias)
    } else {
      positional.push(type)
    }
  }

  let resolvedGenerics: Map<Types.GenericType, Types.GenericType> | undefined
  if (formulaType.genericTypes.length) {
    resolvedGenerics = new Map()
    // for (const generic of formulaType.generics()) {
    for (const generic of formulaType.genericTypes) {
      resolvedGenerics.set(generic, generic.copy())
    }
    const argGenerics = argsResult.value.map(([_is, _alias, type]) => [...type.generics()]).flat()
    for (const generic of argGenerics) {
      resolvedGenerics.set(generic, generic.copy())
    }
  } else {
    resolvedGenerics = undefined
  }

  const errorMessage = Types.checkFormulaArguments(
    formulaType,
    positional.length,
    names,
    function argumentAt(position: number) {
      return positional[position]
    },
    function argumentsNamed(name: string) {
      return named.get(name) ?? []
    },
    spreadPositionalArguments,
    spreadDictArguments,
    keywordListArguments,
    resolvedGenerics,
  )

  if (errorMessage) {
    return err(new RuntimeError(formulaExpression, errorMessage))
  }

  if (!resolvedGenerics) {
    // this could easily be a generic type, for example, resolving the return type of a
    // generic formula:
    //     fn<T, U>(# v: T, # apply: fn(# in: T): U) => apply(v)
    // resolves to 'U'. It's not until *this* formula is invoked that all the generics
    // will (hopefully!) be resolved.
    return ok(formulaType.returnType)
  } else {
    const resolved = formulaType.returnType.resolve(resolvedGenerics)
    if (resolved.isErr()) {
      return err(new RuntimeError(formulaExpression, resolved.error))
    }

    return ok(resolved.get())
  }
}

// hasSpreadArrayType, spreadDictName, Result
type SpreadContext = [boolean, string | undefined, GetRuntimeResult<_IntermediateArgs[]>]

// what to do with foo(...value)
function spreadArrayArg(
  providedArg: Expressions.SpreadFunctionArgument,
  type: Types.Type,
): SpreadContext {
  if (type instanceof Types.ObjectType) {
    return [
      false,
      undefined,
      ok(
        type.props.map(prop =>
          prop.name ? ['named', prop.name, prop.type] : ['positional', undefined, prop.type],
        ),
      ),
    ]
  } else if (type instanceof Types.ArrayType) {
    // TODO: if ArrayType has known/constant min length == max length,
    // we could instead insert those as 'positional' types
    return [true, undefined, ok([['spread-array', undefined, type.of]])]
  } else {
    return [
      false,
      undefined,
      err(new RuntimeError(providedArg, `Cannot use spread operator '...' on type ${type}`)),
    ]
  }
}

// what to do with foo(...name: value)
function spreadDictArg(
  alias: string,
  providedArg: Expressions.SpreadFunctionArgument,
  type: Types.Type,
): SpreadContext {
  if (type instanceof Types.ArrayType) {
    return [false, alias, ok([['spread-dict', alias, type.of]])]
  } else {
    return [
      false,
      undefined,
      err(
        new RuntimeError(
          providedArg,
          `Cannot use named spread operator '...${alias}' on type ${type}`,
        ),
      ),
    ]
  }
}

function spreadKeywordArg(
  providedArg: Expressions.SpreadFunctionArgument,
  type: Types.Type,
): SpreadContext {
  if (type instanceof Types.DictType) {
    // TODO: if ArrayType has known/constant min length == max length,
    // we could instead insert those as 'positional' types
    return [false, undefined, ok([['keyword-list', undefined, type.of]])]
  } else {
    return [
      false,
      undefined,
      err(
        new RuntimeError(
          providedArg,
          `Cannot use keyword list operator '${KWARG_OP}' on type ${type}`,
        ),
      ),
    ]
  }
}

function expectedGuardArguments() {
  return "Missing '# condition: Condition' and '# body: T' in 'guard()' expression"
}

function expectedGuardElseResult() {
  return "Missing 'else: T' in 'guard()' expression"
}

function expectedIfCondition() {
  return "Missing '# condition: Condition' in 'if()' expression"
}

function expectedIfThenResult() {
  return "Missing 'then: T' in 'if()' expression"
}

function expectedElseIfCondition() {
  return "Missing '# condition: Condition' in 'elseif()' expression"
}

function expectedElseIfThenResult() {
  return "Missing 'then: T' in 'elseif()' expression"
}

function expectedElseifConditionExpression(found: Expression) {
  return `Expected 'elseif(condition): then' expression, found '${found}'`
}

function expectedElseifConditionArgument() {
  return "Missing condition in 'elseif(<condition>)' expression"
}

function expectedElseifConditionResult() {
  return `Missing result in 'elseif(): <result>' expression`
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

// yup, that's what I named this function. At me in the comments.
// the 'float' | undefined signature makes this easy to pass to the
// Types.literal function, which accepts the 'float' type hint.
function anyFloaters(
  lhs: Types.LiteralFloatType,
  rhs: Types.LiteralFloatType,
  value?: number,
): 'float' | undefined {
  // even if both sides are an 'int', if the result is a float, return 'float'
  // (only applies to '/' operator)
  if (value !== undefined && !Number.isInteger(value)) {
    return 'float'
  }

  return lhs.is === 'literal-float' || rhs.is === 'literal-float' ? 'float' : undefined
}

function decorateError(expr: Expression) {
  return function mapError(result: GetTypeResult): GetTypeResult {
    if (result.isErr() && result.error instanceof RuntimeError) {
      result.error.pushParent(expr)
    }
    return result
  }
}

function allNamesFrom(expressions: Expression[]) {
  const names = new Set<string>()
  for (const matchExpr of expressions) {
    for (const name of matchExpr.matchAssignReferences()) {
      names.add(name)
    }
  }
  return names
}

function includeMissingNames(runtime: ValueRuntime, allNames: Set<string>, fromExpr: Expression) {
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
