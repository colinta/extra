import {err} from '@extra-lang/result'
import {ApplicationRuntime, MutableTypeRuntime} from '../runtime'

import * as Expressions from './expressions'
// import * as Types from '../types'
// import * as Values from '../values'
import {Expression} from './expressions'
import {type Comment, RuntimeError, type GetTypeResult, type GetValueResult} from './types'

export class Application extends Expression {
  readonly requires: Expressions.RequiresStatement | undefined
  readonly imports: Expressions.ImportStatement[]

  constructor(
    range: Expressions.Range,
    comments: Comment[],
    requires: Expressions.RequiresStatement | undefined,
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

    this.requires = requires
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
    if (this.requires) {
      code += this.requires.toCode()
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

  getType(_mutableRuntime: MutableTypeRuntime): GetTypeResult {
    return err(new RuntimeError(this, 'Application does not have a type'))
  }

  eval<T>(runtime: ApplicationRuntime<T>): GetValueResult {
    return err(new RuntimeError(this, 'Application does not have a value'))
  }
}
