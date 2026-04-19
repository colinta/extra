import * as Types from '@/types'
import {Expression, Reference} from './expressions'

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
    readonly rhsName: string | number,
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
