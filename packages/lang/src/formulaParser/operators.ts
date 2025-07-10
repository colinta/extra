import {err, mapAll, ok} from '@extra-lang/result'
import * as Types from '../types'
import * as Values from '../values'
import {
  MutableTypeRuntime,
  MutableValueRuntime,
  type TypeRuntime,
  type ValueRuntime,
} from '../runtime'
import {combineConcatLengths} from '../narrowed'
import {
  assignNextRuntime,
  findEventualRef,
  relationshipFormula,
  verifyRelationship,
  type RelationshipComparison,
  type RelationshipFormula,
} from '../relationship'
import * as Expressions from './expressions'
import {Operation, type Expression, type Range} from './expressions'
import {stringSort} from './stringSort'
import {
  type AbstractOperator,
  RuntimeError,
  type Comment,
  type GetRuntimeResult,
  type GetTypeResult,
  type GetValueResult,
  type Operator,
} from './types'

export const NAMED_BINARY_OPS = ['and', 'or', 'has', '!has', 'is', '!is', 'matches', 'if'] as const
export const NAMED_BINARY_ALIAS = {
  '&&': 'and',
  '||': 'or',
  '≤': '<=',
  '≥': '>=',
  '≠': '!=',
} as const
export const NAMED_UNARY_OPS = ['not', 'typeof'] as const

export const LOWEST_PRECEDENCE = -10
export const HIGHEST_PRECEDENCE = 100

export const SPREAD_OPERATOR = '...'

const PRECEDENCE = {
  BINARY: {
    onlyif: 1,
    '|>': 2,
    '?|>': 2,
    // I had ternary operators at one point;
    // then: 3,
    // else: 3,
    '??': 4,
    or: 5,
    and: 6,
    '^': 7,
    '|': 8,
    '&': 9,
    matches: 11,
    '==': 11,
    '!=': 11,
    '>': 11,
    '>=': 11,
    '<': 11,
    '<=': 11,
    '<=>': 11,
    has: 11,
    '!has': 11,
    is: 11,
    '!is': 11,
    '++': 12,
    '<>': 12,
    '~~': 12,
    '...': 12,
    '<..': 12,
    '..<': 12,
    '<.<': 12,
    '<<': 13,
    '>>': 13,
    '+': 13,
    '-': 13,
    '*': 14,
    '/': 14,
    '//': 14,
    '%': 14,
    '**': 16,
    // property chain operators
    '[]': 19,
    '?.[]': 19,
    fn: 19,
    '?.()': 19,
    '.': 19,
    '?.': 19,
  } as const,
  UNARY: {
    // unary range operators
    '=': 11,
    '>': 11,
    '>=': 11,
    '<': 11,
    '<=': 11,
    not: 16,
    '-': 16,
    '~': 16,
    $: 20,
    '.': 21,
    typeof: 18,
  } as const,
} as const

type BinaryOpSymbols = keyof typeof PRECEDENCE.BINARY | (typeof NAMED_BINARY_OPS)[number] // has, is --> 10
type UnaryOpSymbols = keyof typeof PRECEDENCE.UNARY | (typeof NAMED_UNARY_OPS)[number] // typeof --> 16

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
  return {...op, precedingComments, followingOperatorComments: followingOperatorComments}
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

  if (lhs.isFloat()) {
    return err(new RuntimeError(expr.args[1], expectedNumberMessage(expr.args[1])))
  } else {
    return err(new RuntimeError(expr.args[0], expectedNumberMessage(expr.args[0])))
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

    if (lhs.isFloat()) {
      return err(new RuntimeError(expr.args[1], expectedNumberMessage(expr.args[1])))
    } else {
      return err(new RuntimeError(expr.args[0], expectedNumberMessage(expr.args[0])))
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

    return err(new RuntimeError(expr.args[0], expectedNumberMessage(expr.args[0])))
  }
}

function comparisonOperation(
  expr: Operation,
  lhs: Values.Value,
  rhs: Values.Value,
  op: (lhs: number, rhs: number) => boolean,
): GetValueResult {
  if (lhs === Values.NaNValue || rhs === Values.NaNValue) {
    return ok(Values.FalseValue)
  }

  if (lhs.isInt() && rhs.isInt()) {
    return ok(Values.booleanValue(op(lhs.value, rhs.value)))
  } else if (lhs.isFloat() && rhs.isFloat()) {
    return ok(Values.booleanValue(op(lhs.value, rhs.value)))
  }

  if (lhs.isFloat()) {
    return err(new RuntimeError(expr.args[1], expectedNumberMessage(expr.args[1])))
  } else {
    return err(new RuntimeError(expr.args[0], expectedNumberMessage(expr.args[0])))
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

  abstract operatorType(
    runtime: TypeRuntime,
    lhs: Types.Type,
    lhsExpr: Expression,
    originalLhs: Types.Type,
  ): GetTypeResult

  getType(runtime: TypeRuntime): GetTypeResult {
    const [lhsExpr] = this.args
    return getChildType(this, lhsExpr, runtime).map(lhType => {
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

  getRelationshipFormulas(runtime: TypeRuntime) {
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
   * - |>/?|> pipe operators provide the LHS type as the # type
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
  }

  rhsEval(
    _runtime: ValueRuntime,
    _lhsValue: Values.Value,
    _lhsExpr: Expression,
    _rhsExpr: Expression,
  ): GetValueResult | undefined {
    return undefined
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
        () => this.rhsEval(runtime, lhs, lhsExpr, rhsExpr) ?? rhsExpr.eval(runtime),
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
    if (lhs === Types.NullType) {
      return ok(Types.NullType)
    }

    let myRuntime = new MutableTypeRuntime(runtime)
    myRuntime.setPipeType(lhs)

    return getChildType(this, rhsExpr, myRuntime)
  }

  operatorType(
    _runtime: TypeRuntime,
    _lhs: Types.Type,
    rhs: Types.Type,
    _lhsExpr: Expression,
    _rhsExpr: Expression,
    originalLhs: Types.Type,
  ) {
    const hasNullType =
      originalLhs instanceof Types.OneOfType && originalLhs.of.some(type => type === Types.NullType)
    if (!hasNullType) {
      return err(
        new RuntimeError(
          _lhsExpr,
          `Left hand side of '?|>' operator must be a nullable-type. Found '${originalLhs}'`,
        ),
      )
    }

    return ok(rhs)
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

class LogicalOrOperator extends BinaryOperator {
  symbol = 'or'

  rhsType(runtime: TypeRuntime, lhsType: Types.Type, lhsExpr: Expression, rhsExpr: Expression) {
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

    return ok(Types.oneOf([lhs, rhs]))
  }

  operatorEval(_runtime: ValueRuntime, lhs: Values.Value, rhs: () => GetValueResult) {
    if (lhs.isTruthy()) {
      return ok(lhs)
    } else {
      return rhs()
    }
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

  assumeTrue(runtime: TypeRuntime): GetRuntimeResult<TypeRuntime> {
    const [lhsExpr, rhsExpr] = this.args
    return lhsExpr
      .assumeTrue(runtime)
      .map(truthyRuntime => rhsExpr.assumeTrue(truthyRuntime).map(finalRuntime => finalRuntime))
  }

  rhsType(runtime: TypeRuntime, _lhsType: Types.Type, lhsExpr: Expression, rhsExpr: Expression) {
    return lhsExpr
      .assumeTrue(runtime)
      .map(truthyRuntime => getChildType(this, rhsExpr, truthyRuntime))
  }

  operatorType(_runtime: TypeRuntime, lhs: Types.Type, rhs: Types.Type) {
    if (lhs.isLiteral() && rhs.isLiteral()) {
      return ok(Types.literal(lhs.value && rhs.value))
    }

    return ok(Types.oneOf([lhs.toFalseyType(), rhs]))
  }

  operatorEval(_runtime: ValueRuntime, lhs: Values.Value, rhs: () => GetValueResult) {
    if (lhs.isTruthy()) {
      return rhs()
    } else {
      return ok(lhs)
    }
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

class RegexMatchesOperator extends BinaryOperator {
  symbol = 'matches'

  operatorType(
    _runtime: TypeRuntime,
    lhs: Types.Type,
    rhs: Types.Type,
    lhsExpr: Expression,
    rhsExpr: Expression,
  ) {
    if (lhs.isLiteral('string') && rhs.isLiteral('regex')) {
      return ok(Types.literal(rhs.value.test(lhs.value)))
    }

    if (!lhs.isString()) {
      return err(new RuntimeError(lhsExpr, expectedType('String', lhsExpr, lhs)))
    }

    if (!rhs.isRegex()) {
      return err(new RuntimeError(rhsExpr, expectedType('Regex', rhsExpr, rhs)))
    }

    return ok(Types.BooleanType)
  }

  operatorEval(
    runtime: ValueRuntime,
    lhs: Values.Value,
    rhs: () => GetValueResult,
    lhsExpr: Expression,
    rhsExpr: Expression,
  ) {
    if (!lhs.isString()) {
      return err(new RuntimeError(lhsExpr, expectedType('String', lhsExpr, lhs)))
    }

    return rhs().map(rhs => {
      if (rhs.isRegex()) {
        const stringify = lhs.value
        return stringify.match(rhs.value)
      } else {
        return err(new RuntimeError(rhsExpr, expectedType('Regex', rhsExpr, rhs)))
      }
    })
  }
}

addBinaryOperator({
  name: 'regex matches',
  symbol: 'matches',
  precedence: PRECEDENCE.BINARY['matches'],
  associativity: 'left',
  create(
    range: [number, number],
    precedingComments: Comment[],
    followingOperatorComments: Comment[],
    operator: Operator,
    args: Expression[],
  ) {
    return new RegexMatchesOperator(
      range,
      precedingComments,
      followingOperatorComments,
      operator,
      args,
    )
  },
})

abstract class ComparisonOperator extends BinaryOperator {
  abstract symbol: RelationshipComparison
  abstract inverseSymbol: RelationshipComparison

  assumeSymbolIsTrue(runtime: TypeRuntime, symbol: RelationshipComparison) {
    const [lhsFormula, rhsFormula] = this.getRelationshipFormulas(runtime)
    if (!lhsFormula || !rhsFormula) {
      return ok(runtime)
    }

    return assignNextRuntime(runtime, lhsFormula, symbol, rhsFormula)
  }

  assumeTrue(runtime: TypeRuntime): GetRuntimeResult<TypeRuntime> {
    return this.assumeSymbolIsTrue(runtime, this.symbol)
  }

  assumeFalse(runtime: TypeRuntime): GetRuntimeResult<TypeRuntime> {
    return this.assumeSymbolIsTrue(runtime, this.inverseSymbol)
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
    lhsExpr: Expression,
    rhsExpr: Expression,
  ): GetTypeResult {
    return err(new RuntimeError(lhsExpr, `Still working on assignment ${lhsExpr} = ${rhsExpr}`))
  }

  operatorEval(
    _runtime: ValueRuntime,
    _lhs: Values.Value,
    _rhs: () => GetValueResult,
    lhsExpr: Expression,
    rhsExpr: Expression,
  ): GetRuntimeResult<Values.BooleanValue> {
    return err(new RuntimeError(lhsExpr, `Still working on assignment ${lhsExpr} = ${rhsExpr}`))
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
      const hasProp = haystack.propAccessType(needle.value) !== undefined
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

abstract class TypeAssertionOperator extends BinaryOperator {
  abstract symbol: 'is' | '!is'

  assumeTypeAssertion(
    runtime: TypeRuntime,
    fn: (lhsType: Types.Type, rhsType: Types.Type) => Types.Type,
  ): GetRuntimeResult<TypeRuntime> {
    const [lhsExpr, rhsExpr] = this.args
    return rhsExpr
      .getAsTypeExpression(runtime)
      .map(rhsTypeAssertion =>
        getChildType(this, lhsExpr, runtime).map(lhsType => [lhsType, rhsTypeAssertion]),
      )
      .map(([lhsType, rhsTypeAssertion]) => {
        const assertType = fn(lhsType, rhsTypeAssertion)
        return lhsExpr.replaceWithType(runtime, assertType)
      })
  }

  operatorType(
    runtime: TypeRuntime,
    _lhs: Types.Type,
    rhs: Types.Type,
    _lhsExpr: Expression,
    rhsExpr: Expression,
  ) {
    return rhsExpr.getAsTypeExpression(runtime).map(() => Types.BooleanType)
  }

  operatorEval(
    runtime: ValueRuntime,
    lhs: Values.Value,
    _rhs: () => GetValueResult,
    _lhsExpr: Expression,
    rhsExpr: Expression,
  ): GetRuntimeResult<Values.BooleanValue> {
    return rhsExpr.getAsTypeExpression(runtime).map(rhsType => {
      return Values.booleanValue(Types.canBeAssignedTo(lhs.getType(), rhsType))
    })
  }
}

class TypeIsAssertionOperator extends TypeAssertionOperator {
  readonly symbol = 'is'

  assumeTrue(runtime: TypeRuntime): GetRuntimeResult<TypeRuntime> {
    return this.assumeTypeAssertion(runtime, (lhsType, rhsTypeAssertion) =>
      Types.narrowTypeIs(lhsType, rhsTypeAssertion),
    )
  }

  assumeFalse(runtime: TypeRuntime): GetRuntimeResult<TypeRuntime> {
    return this.assumeTypeAssertion(runtime, (lhsType, rhsTypeAssertion) =>
      Types.narrowTypeIsNot(lhsType, rhsTypeAssertion),
    )
  }
}

addBinaryOperator({
  name: 'type is assertion',
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
    return new TypeIsAssertionOperator(
      range,
      precedingComments,
      followingOperatorComments,
      operator,
      args,
    )
  },
})

class TypeIsRefutationOperator extends TypeAssertionOperator {
  readonly symbol = '!is'

  assumeTrue(runtime: TypeRuntime): GetRuntimeResult<TypeRuntime> {
    return this.assumeTypeAssertion(runtime, (lhsType, rhsTypeAssertion) =>
      Types.narrowTypeIsNot(lhsType, rhsTypeAssertion),
    )
  }

  assumeFalse(runtime: TypeRuntime): GetRuntimeResult<TypeRuntime> {
    return this.assumeTypeAssertion(runtime, (lhsType, rhsTypeAssertion) =>
      Types.narrowTypeIs(lhsType, rhsTypeAssertion),
    )
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
  name: 'type is not',
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
    return new TypeIsRefutationOperator(
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

  operatorType(_runtime: TypeRuntime, lhs: Types.Type, rhs: Types.Type) {
    if (lhs.isLiteral('float') && rhs.isLiteral('float')) {
      return ok(Types.literal(lhs.value + rhs.value, anyFloaters(lhs, rhs)))
    }

    // x: Int(>=1), x + 1 => Int(>=2)
    if (lhs instanceof Types.NumberType && rhs.isLiteral('float')) {
      return ok(lhs.adjustNarrow(rhs.value))
    }

    // x: Int(>=1), 1 + x => x + 1 => Int(>=2)
    if (lhs.isLiteral('float') && rhs instanceof Types.NumberType) {
      return ok(rhs.adjustNarrow(lhs.value))
    }

    return numericType(this, lhs, rhs)
  }

  operatorEval(_runtime: ValueRuntime, lhs: Values.Value, rhs: () => GetValueResult) {
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

  operatorType(_runtime: TypeRuntime, lhs: Types.Type, rhs: Types.Type) {
    if (lhs.isLiteral('float') && rhs.isLiteral('float')) {
      return ok(Types.literal(lhs.value - rhs.value, anyFloaters(lhs, rhs)))
    }

    // x: Int(>=1), x - 1 => Int(>=0)
    if (lhs instanceof Types.NumberType && rhs.isLiteral('float')) {
      return ok(lhs.adjustNarrow(-rhs.value))
    }

    // x: Int(>=1), 1 - x => Int(>=0)
    if (lhs.isLiteral('float') && rhs instanceof Types.NumberType) {
      return ok(rhs.negateNarrow(lhs.value))
    }

    return numericType(this, lhs, rhs)
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
      return err(new RuntimeError(lhsExpr, expectedType('array concatenation', lhsExpr, lhs)))
    }

    if (!(rhs instanceof Types.ArrayType)) {
      return err(new RuntimeError(rhsExpr, expectedType('array concatenation', rhsExpr, rhs)))
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
        return ok(lhs.concatenationOperator(rhs))
      }

      return err(new RuntimeError(rhsExpr, expectedType('array concatenation', rhsExpr, rhs)))
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

class StringConcatenationOperator extends BinaryOperator {
  symbol = '<>'

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
      return err(new RuntimeError(lhsExpr, expectedType('string to concatenate', lhsExpr, lhs)))
    }

    if (!rhs.isString()) {
      return err(new RuntimeError(rhsExpr, expectedType('string to concatenate', rhsExpr, rhs)))
    }

    // both literals -> return a literal
    if (lhs.isLiteral('string') && rhs.isLiteral('string')) {
      return ok(Types.literal(lhs.value + rhs.value))
    }

    // both strings, neither is literal
    // return a string, combining the lengths
    // we have to discard the 'regex' narrow, because there's no (reasonable) way to
    // determine whether the regex's are in any way compatible
    if (lhs.isString() && !lhs.isLiteral('string') && rhs.isString() && !rhs.isLiteral('string')) {
      return ok(
        Types.string(combineConcatLengths(lhs.narrowedString.length, rhs.narrowedString.length)),
      )
    }

    const anyLiteral = lhs.isLiteral('string') ? lhs : rhs.isLiteral('string') ? rhs : undefined
    if (anyLiteral) {
      const anyString =
        lhs.isString() && !lhs.isLiteral('string')
          ? lhs
          : rhs.isString() && !rhs.isLiteral('string')
            ? rhs
            : undefined
      if (anyString) {
        const min = anyString.narrowedString.length.min + anyLiteral.value.length
        return ok(Types.string({min}))
      }

      // unreachable, but TS doesn't know that
      return ok(Types.string({min: anyLiteral.value.length}))
    }

    return ok(Types.StringType)
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
        return err(new RuntimeError(lhsExpr, expectedType('string to concatenate', lhsExpr, lhs)))
      }
      if (!rhs.isString()) {
        return err(new RuntimeError(rhsExpr, expectedType('string to concatenate', rhsExpr, rhs)))
      }

      return ok(Values.string(lhs.value + rhs.value))
    })
  }
}

addBinaryOperator({
  name: 'string-concatenation',
  symbol: '<>',
  precedence: PRECEDENCE.BINARY['<>'],
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
      return err(new RuntimeError(lhsExpr, expectedType('object to merge', lhsExpr, lhs)))
    }

    if (!rhs.isObject()) {
      return err(new RuntimeError(rhsExpr, expectedType('object to merge', rhsExpr, rhs)))
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
        return err(new RuntimeError(lhsExpr, expectedType('object to merge', lhsExpr, lhs)))
      }

      if (!rhs.isObject()) {
        return err(new RuntimeError(rhsExpr, expectedType('object to merge', rhsExpr, rhs)))
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
      return ok(Types.IntRangeType)
    } else if (lhs.isFloat() && rhs.isFloat()) {
      return ok(Types.FloatRangeType)
    }

    if (!lhs.isFloat()) {
      return err(
        new RuntimeError(
          lhsExpr,
          expectedType(`number before range operator '${this.symbol}'`, lhsExpr, lhs),
        ),
      )
    }

    return err(
      new RuntimeError(
        lhsExpr,
        expectedType(`number before range operator '${this.symbol}'`, rhsExpr, rhs),
      ),
    )
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

    return err(new RuntimeError(lhsExpr, expectedNumberMessage(lhsExpr)))
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

      return err(new RuntimeError(lhsExpr, expectedNumberMessage(lhsExpr)))
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
    if (lhsExpr instanceof PropertyChainOperator) {
      return lhsExpr
        .getChainLhsType(runtime)
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

    return super.getType(runtime)
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
      return err(new RuntimeError(rhsExpr, expectedPropertyName(rhsExpr)))
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

  isLengthExpression(runtime: TypeRuntime): GetRuntimeResult<boolean> {
    const [lhs, rhs] = this.args
    if (!(rhs instanceof Expressions.Identifier) || rhs.name !== 'length') {
      return ok(false)
    }

    return getChildType(this, lhs, runtime).map(type => {
      if (
        type instanceof Types.ArrayType ||
        type instanceof Types.DictType ||
        type instanceof Types.SetType ||
        type.isString()
      ) {
        return ok(true)
      }

      return ok(false)
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
      return err(new RuntimeError(rhsExpr, expectedPropertyName(rhsExpr)))
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
      return err(new RuntimeError(rhsExpr, expectedPropertyName(rhsExpr)))
    }

    const value = lhs.propValue(rhsExpr.name)
    if (!value) {
      const lhsType = getChildType(this, lhsExpr, runtime).value
      return err(
        new RuntimeError(
          rhsExpr,
          `'${rhsExpr}' is not a property of '${lhsExpr}'${lhsType ? ` (type: ${lhsType})` : ''}`,
        ),
      )
    }

    return ok(value)
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
        return ok(type)
      }
    }

    const lhsRel = lhsExpr.relationshipFormula(runtime)
    const rhsRel = rhsExpr.relationshipFormula(runtime)
    if (lhsRel && rhsRel) {
      const lhsRef = findEventualRef(lhsRel)
      if (lhsRef) {
        const lhsLength = relationshipFormula.propertyAccess(lhsRef, 'length')
        const getRelationships = runtime.getRelationships.bind(runtime)
        const rhsIsGtZero = verifyRelationship(
          rhsRel,
          '>=',
          relationshipFormula.int(0),
          getRelationships,
        )
        const rhsIsLtLength = verifyRelationship(rhsRel, '<', lhsLength, getRelationships)
        if (rhsIsGtZero && rhsIsLtLength) {
          return ok(lhs.of)
        }
      }
    }

    if (rhs.isInt()) {
      const type = lhs.arrayAccessType(rhs)
      if (type) {
        return ok(type)
      }
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
    return `${lhsCode}${argListCode}`
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
    if (!(lhFormula instanceof Values.FormulaValue)) {
      return err(new RuntimeError(lhFormulaExpression, `Expected a Formula, found '${lhFormula}'`))
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

export class IfExpressionInvocation extends FunctionInvocationOperator {
  symbol = 'if'
  argList: Expression

  constructor(
    range: Range,
    precedingComments: Comment[],
    followingOperatorComments: Comment[],
    operator: Operator,
    args: Expression[],
  ) {
    super(range, precedingComments, followingOperatorComments, operator, args)
    this.argList = args[1]
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

    const argListCode = this.argList.toCode(0)
    return `if${argListCode}`
  }

  // rhsType(runtime: TypeRuntime, lhsType: Types.Type, lhsExpr: Expression, rhsExpr: Expression) {
  rhsType(): GetTypeResult {
    return ok(Types.AllType)
  }

  getType(runtime: TypeRuntime): GetTypeResult {
    const argList = this.argList
    if (!(argList instanceof Expressions.ArgumentsList)) {
      return err(new RuntimeError(this, expectedType('arguments list', argList)))
    }

    const conditionExpr = argList.positionalArg(0)
    if (!conditionExpr) {
      return err(new RuntimeError(this, expectedIfCondition()))
    }

    const thenExpr = argList.namedArg('then')
    if (!thenExpr) {
      return err(new RuntimeError(this, expectedIfThenResult()))
    }

    return conditionExpr.getType(runtime).map(conditionType => {
      // allow literal 'true/false' expressions (for testing)
      // todo: disallow for "production" builds
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
      const elseifExprs = argList.allPositionalArgs(1)

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

        const elseifArgList = elseif.argList
        if (!(elseifArgList instanceof Expressions.ArgumentsList)) {
          return err(new RuntimeError(this, expectedType('arguments list', elseifArgList)))
        }

        const elseifConditionExpr = elseifArgList.positionalArg(0)
        if (!elseifConditionExpr) {
          return err(new RuntimeError(elseif, expectedElseifConditionArgument()))
        }

        const nextRuntimeResult = elseifConditionExpr.assumeFalse(nextRuntime)
        if (nextRuntimeResult.isErr()) {
          return err(nextRuntimeResult.error)
        }
        nextRuntime = nextRuntimeResult.value
      }

      const elseExpr = argList.namedArg('else')
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
    const argList = this.argList
    if (!(argList instanceof Expressions.ArgumentsList)) {
      return err(new RuntimeError(this, expectedType('arguments list', argList)))
    }

    const conditionExpr = argList.positionalArg(0)
    if (!conditionExpr) {
      return err(new RuntimeError(this, expectedIfCondition()))
    }

    const thenExpr = argList.namedArg('then')
    if (!thenExpr) {
      return err(new RuntimeError(this, expectedIfThenResult()))
    }

    return conditionExpr.eval(runtime).map(conditionValue => {
      if (conditionValue.isTruthy()) {
        return thenExpr.eval(runtime)
      }

      const elseifExprs = argList.allPositionalArgs(1)

      for (const elseif of elseifExprs) {
        if (!(elseif instanceof ElseIfExpressionInvocation)) {
          return err(new RuntimeError(elseif, expectedElseifConditionExpression(elseif)))
        }

        const elseifArgList = elseif.argList
        if (!(elseifArgList instanceof Expressions.ArgumentsList)) {
          return err(new RuntimeError(this, expectedType('arguments list', elseifArgList)))
        }

        const elseifConditionExpr = elseifArgList.positionalArg(0)
        if (!elseifConditionExpr) {
          return err(new RuntimeError(elseif, expectedElseifConditionArgument()))
        }

        const elseifThen = elseifArgList.positionalArg(1)
        if (!elseifThen) {
          return err(new RuntimeError(elseif, expectedElseifConditionResult()))
        }

        const elseifCondition = elseifConditionExpr.eval(runtime)
        if (elseifCondition.isErr()) {
          return elseifCondition
        }

        if (elseifCondition.value.isTruthy()) {
          return elseifThen.eval(runtime)
        }
      }

      const elseExpr = argList.namedArg('else')
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

  constructor(
    range: Range,
    precedingComments: Comment[],
    followingOperatorComments: Comment[],
    operator: Operator,
    args: Expression[],
  ) {
    super(range, precedingComments, followingOperatorComments, operator, args)
    this.argList = args[1]
  }

  getReturnType(runtime: TypeRuntime): GetTypeResult {
    const argList = this.argList
    if (!(argList instanceof Expressions.ArgumentsList)) {
      return err(new RuntimeError(this, expectedType('arguments list', argList)))
    }

    const conditionExpr = argList.positionalArg(0)
    if (!conditionExpr) {
      return err(new RuntimeError(this, expectedIfCondition()))
    }

    const thenExpr = argList.positionalArg(1)
    if (!thenExpr) {
      return err(new RuntimeError(this, expectedIfThenResult()))
    }

    return conditionExpr.getType(runtime).map(conditionType => {
      // allow literal 'true/false' expressions (for testing)
      // todo: disallow for "production" builds
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

    const conditionExpr = argList.positionalArg(0)
    if (!conditionExpr) {
      return err(new RuntimeError(this, expectedIfCondition()))
    }

    const thenExpr = argList.positionalArg(1)
    if (!thenExpr) {
      return err(new RuntimeError(this, expectedIfThenResult()))
    }

    return ok(
      Values.formula(
        Types.lazy(
          Types.oneOf([
            Types.tuple([Types.LiteralTrueType, returnType.value]),
            Types.tuple([Types.LiteralFalseType, Types.NullType]),
          ]),
        ),
        () =>
          conditionExpr.eval(runtime).map(conditionValue => {
            if (conditionValue.isTruthy()) {
              return thenExpr
                .eval(runtime)
                .map(thenValue => ok(Values.tuple([Values.booleanValue(true), thenValue])))
            }

            return ok(Values.tuple([Values.booleanValue(false), Values.NullValue]))
          }),
      ),
    )
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
    if (args[0] instanceof Expressions.IfExpression) {
      return new IfExpressionInvocation(
        range,
        precedingComments,
        followingOperatorComments,
        operator,
        args,
      )
    }

    if (args[0] instanceof Expressions.ElseIfExpression) {
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

class LogicalNotOperator extends UnaryOperator {
  symbol = 'not'

  operatorType(_runtime: TypeRuntime, lhs: Types.Type) {
    if (lhs.isLiteral()) {
      return ok(Types.literal(!lhs.value))
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
    if (!type.isFloat()) {
      return err(
        new RuntimeError(expr, `Invalid type '${type}' passed to range operator '${this.symbol}'`),
      )
    }

    return ok(Types.range(type.isInt() ? Types.int() : Types.float()))
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

class TypeofOperator extends UnaryOperator {
  symbol = 'typeof'

  operatorType(_runtime: TypeRuntime, lhs: Types.Type) {
    return ok(lhs.typeConstructor())
  }

  operatorEval(_runtime: ValueRuntime, _lhs: Values.Value) {
    return err(new RuntimeError(this, 'TODO'))
  }
}

addUnaryOperator({
  name: 'type of',
  symbol: 'typeof',
  precedence: PRECEDENCE.UNARY['typeof'],
  associativity: 'right',
  create(
    range: [number, number],
    precedingComments: Comment[],
    followingOperatorComments: Comment[],
    operator: Operator,
    args: Expression[],
  ) {
    return new TypeofOperator(range, precedingComments, followingOperatorComments, operator, args)
  },
})

function unexpectedOnlyType(conditionType: Types.Type, only: boolean): string {
  return `Type '${conditionType}' is invalid as an if condition, because it is always ${only ? 'true' : 'false'}.`
}

function expectedPropertyName(found: Expression) {
  return expectedType('property name', found)
}

function expectedNumberMessage(found: Expression) {
  return expectedType('int or float', found)
}

type _IntermediateArgs =
  | ['positional', undefined, Types.Type]
  | ['named', string, Types.Type]
  | ['spread-array', undefined, Types.Type]
  | ['spread-dict', string, Types.Type]
  | ['keyword-list', undefined, Types.Type]

function functionInvocationOperatorType(
  runtime: TypeRuntime,
  formulaType: Types.Type,
  formulaExpression: Expression,
  argsList: Expression,
): GetTypeResult {
  if (!(formulaType instanceof Types.FormulaType)) {
    return err(
      new RuntimeError(
        formulaExpression,
        `Expected a formula, found '${formulaExpression}' of type '${formulaType}'`,
      ),
    )
  }

  if (!(argsList instanceof Expressions.ArgumentsList)) {
    return err(new RuntimeError(argsList, `Expected function arguments, found '${argsList}'`))
  }

  let positionIndex = 0
  let hasSpreadArrayType = false
  const hasSpreadDictName: Set<string> = new Set()
  const argsResult = mapAll(
    // argsList.args is an array of:
    // - NamedArgument `foo(bar: bar)`
    // - PositionalArgument `foo(bar)`
    // - or SpreadFunctionArgument `foo(...bar)`, `bar` must be an Object or Array
    // - TODO: or RepeatedFunctionArgument `foo(...name: bar)`, `bar` must be an Array
    // - TODO: Keyword Argument List `foo(*kwargs)`, `kwargs` must be a Dict
    argsList.allArgs.map((providedArg): GetRuntimeResult<_IntermediateArgs[]> => {
      // this is a buried bit of magic:
      //
      // to derive the type of a Formula argument, we should hand it the
      // argument (also a formula) that is invoking the formula
      if (providedArg.value instanceof Expressions.FormulaExpression) {
        // if providedArg is a FormulaExpression and doesn't declare its argument types, we
        // need to hand it a formula that it can use to derive its argument types.
        let defaultType: Types.Type | undefined

        if (providedArg instanceof Expressions.NamedArgument) {
          defaultType = formulaType.namedArg(providedArg.alias)?.type
        } else {
          defaultType = formulaType.positionalArg(positionIndex)?.type
          positionIndex += 1
        }

        if (!defaultType) {
          let message = 'No default type for argument '
          if (providedArg instanceof Expressions.NamedArgument) {
            message += `'${providedArg.alias}'`
          } else if (providedArg instanceof Expressions.PositionalArgument) {
            message += `at position #${positionIndex + 1}`
          }

          return err(new RuntimeError(providedArg, message))
        } else if (!(defaultType instanceof Types.FormulaType)) {
          let message = 'Expected argument of type Formula for argument'
          if (providedArg instanceof Expressions.NamedArgument) {
            message += `'${providedArg.alias}'`
          } else if (providedArg instanceof Expressions.PositionalArgument) {
            message += `at position #${positionIndex + 1}`
          }

          return err(new RuntimeError(providedArg, message))
        }

        return providedArg.value
          .getType(runtime, defaultType)
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

  const resolvedGenerics: Map<Types.GenericType, Types.GenericType> = new Map(
    Array.from(formulaType.generics()).map(generic => [generic, generic.copy()]),
  )

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

  const resolved = formulaType.returnType.resolve(resolvedGenerics)
  if (resolved.isErr()) {
    return err(new RuntimeError(formulaExpression, resolved.error))
  }

  return ok(resolved.get())
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
      err(new RuntimeError(providedArg, `Cannot use keyword list operator '*' on type ${type}`)),
    ]
  }
}

function expectedType(expected: string, expr: Expression, type?: Types.Type | Values.Value) {
  const message = `Expected ${expected}, found '${expr}'`
  if (type) {
    type = type instanceof Values.Value ? type.getType() : type
    return `${message} of type '${type}'`
  } else {
    return message
  }
}

function expectedIfCondition() {
  return "Missing '#condition: Condition' in 'if()' expression"
}

function expectedIfThenResult() {
  return "Missing 'then: T' in 'if()' expression"
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

/**
 * Gets the type of 'expr', and on error it decorates the RuntimeError with the
 * parent expression.
 */
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

type _LogicalAndOperator = LogicalAndOperator
export namespace TestingTypes {
  export type LogicalAndOperator = _LogicalAndOperator
}
