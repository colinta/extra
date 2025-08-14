import {err, mapAll} from '@extra-lang/result'
import {ModuleRuntime, type TypeRuntime} from '../runtime'

import * as Expressions from './expressions'
import * as Types from '../types'
import * as Values from '../values'
import {Expression} from './expressions'
import {type Comment, type GetTypeResult, type GetValueResult} from './types'
import {dependencySort} from './dependencySort'

export class Module extends Expression {
  readonly imports: Expressions.ImportStatement[]

  constructor(
    range: Expressions.Range,
    comments: Comment[],
    readonly providesStmt: Expressions.ProvidesStatement | undefined,
    readonly requiresStmt: Expressions.RequiresStatement | undefined,
    imports: Expressions.ImportStatement[],
    readonly expressions: (
      | Expressions.TypeDefinition
      | Expressions.HelperDefinition
      | Expressions.ViewDefinition
      | Expressions.ClassDefinition
      | Expressions.EnumDefinition
    )[],
  ) {
    super(range, comments)

    this.imports = imports.sort((impA, impB) => {
      const impA_num =
        impA.source.location === 'scheme'
          ? 0
          : impA.source.location === 'package'
            ? 1
            : impA.source.location === 'project'
              ? 2
              : 3
      const impB_num =
        impB.source.location === 'scheme'
          ? 0
          : impB.source.location === 'package'
            ? 1
            : impB.source.location === 'project'
              ? 2
              : 3
      return impA_num - impB_num
    })
  }

  toLisp() {
    return this.toCode()
  }

  toCode() {
    let code = ''
    if (this.providesStmt) {
      code += this.providesStmt.toCode()
    }

    if (this.requiresStmt) {
      code += this.requiresStmt.toCode()
    }

    if (this.imports.length) {
      code += this.imports.map(imp => imp.toCode()).join('\n')
    }

    if (code.length) {
      code += '\n'
    }

    code += this.expressions
      .map(expression => {
        return expression.toCode()
      })
      .join('\n\n')

    code += '\n'

    return code
  }

  getType(runtime: TypeRuntime): GetTypeResult {
    if (this.providesStmt) {
      throw new Error('TODO: provides')
    }

    if (this.requiresStmt) {
      throw new Error('TODO: requires')
    }

    if (this.imports.length) {
      throw new Error('TODO: imports')
    }

    const sorted = dependencySort(
      this.expressions.map(typeExpr => [typeExpr.name, typeExpr]),
      _name => false, // TODO: imports would help here
    )
    if (sorted.isErr()) {
      return err(sorted.error)
    }

    return mapAll(
      sorted
        .get()
        .map(([name, expr]) =>
          expr.getType(runtime).map(value => [name, value] as [string, Types.Type]),
        ),
    ).map(typeTypes => {
      return new Types.ModuleType(new Map(typeTypes))
    })
  }

  eval(runtime: ModuleRuntime): GetValueResult {
    if (this.providesStmt) {
      throw new Error('TODO: provides')
    }

    if (this.requiresStmt) {
      throw new Error('TODO: requires')
    }

    if (this.imports.length) {
      throw new Error('TODO: imports')
    }

    const sorted = dependencySort(
      this.expressions.map(typeExpr => [typeExpr.name, typeExpr]),
      _name => false, // TODO: imports would help here
    )
    if (sorted.isErr()) {
      return err(sorted.error)
    }

    return mapAll(
      sorted
        .get()
        .map(([name, expr]) =>
          expr.eval(runtime).map(value => [name, value] as [string, Values.Value]),
        ),
    ).map(typeValues => {
      // TODO: return Module.
      // return new Types.ModuleType()
      return typeValues[0][1]
    })
  }
}
