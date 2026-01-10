import {type TypeRuntime, type ValueRuntime} from '@/runtime'
import * as Nodes from '@/nodes'
import {
  type Comment,
  type GetTypeResult,
  type GetValueResult,
  type GetNodeResult,
} from '@/formulaParser/types'
import {EXPORT_KEYWORD} from '@/formulaParser/grammars'
import {Expression, type Range, ViewFormulaExpression, getChildType} from './expressions'
import {type ViewClassDefinition} from './class-expressions'

/**
 * There is the `ViewClassDefinition` expression, which is a subclass of
 * `ClassDefinition`, and there is `ViewDefinition`, which is just a view
 * function and whether it's isExport or not.
 */
export class ViewDefinition extends Expression {
  constructor(
    range: Range,
    precedingComments: Comment[],
    readonly view: ViewFormulaExpression | ViewClassDefinition,
    readonly isExport: boolean,
  ) {
    super(range, precedingComments)
  }

  get name() {
    return this.view.nameRef.name
  }

  dependencies() {
    return this.view.dependencies()
  }

  provides() {
    return new Set([this.view.nameRef.name])
  }

  childExpressions() {
    return [this.view]
  }

  toLisp() {
    let code = ''
    if (this.isExport) {
      code += EXPORT_KEYWORD + ' '
    }

    if (this.view instanceof ViewFormulaExpression) {
      code += `${this.view.toLispPrefixed(false)}`
      return '(view ' + code + ')'
    }

    return (code += this.view.toLisp())
  }

  toCode() {
    let code = ''
    if (this.isExport) {
      code += EXPORT_KEYWORD + ' '
    }

    if (this.view instanceof ViewFormulaExpression) {
      return code + this.view.toCodePrefixed(true, true)
    }

    return (code += this.view.toCode())
  }

  getType(runtime: TypeRuntime): GetTypeResult {
    return getChildType(this, this.view, runtime)
  }

  eval(runtime: ValueRuntime): GetValueResult {
    return this.view.eval(runtime)
  }
}
