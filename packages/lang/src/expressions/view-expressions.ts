import {type Result} from '@extra-lang/result'

import {type Scope} from '@/scope'
import {type TypeRuntime, type ValueRuntime} from '@/runtime'
import {type Comment, type GetTypeResult, type GetValueResult} from '@/formulaParser/types'
import {EXPORT_KEYWORD} from '@/formulaParser/grammars'
import * as Types from '@/types'
import * as Values from '@/values'
import {
  type Range,
  type FormulaArgumentDefinition,
  type Reference,
  Expression,
  getChildType,
  InstanceFormulaExpression,
  RuntimeError,
  argumentValues,
} from './expressions'

/**
 * A view formula on a view class, or a view formula on a pure-function view.
 */
export class ViewFormulaExpression extends InstanceFormulaExpression {
  prefix = 'view'

  constructor(
    range: Range,
    precedingComments: Comment[],
    precedingNameComments: Comment[],
    precedingReturnTypeComments: Comment[],
    precedingArgsComments: Comment[],
    followingArgsComments: Comment[],
    nameRef: Reference,
    argDefinitions: FormulaArgumentDefinition[],
    returnType: Expression,
    body: Expression,
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
      [],
      // isOverride
      false,
    )
  }

  getFormulaTypeWith(
    returnType: Types.Type,
    args: Types.Argument[],
    genericTypes: Types.GenericType[],
  ) {
    const namedArgs = args.filter(arg => arg.is === 'named-argument')
    return new Types.ViewFormulaType(this.nameRef.name, returnType, namedArgs, genericTypes)
  }

  getFormulaValueWith(
    runtime: ValueRuntime,
    fn: (
      args: Values.FormulaArgs,
      boundThis: Values.ClassInstanceValue | undefined,
    ) => Result<Values.Value, RuntimeError>,
  ) {
    const argDefinitions = this.argDefinitions
    const render = (
      args: Values.FormulaArgs,
      boundThis: Values.ClassInstanceValue | undefined,
    ): Result<any, RuntimeError> =>
      argumentValues(runtime, argDefinitions, args, boundThis).map(nextRuntime => {
        // this.body.render(nextRuntime)
        throw new RuntimeError(this, 'TODO: getFormulaValueWith')
      })

    return new Values.ViewFormulaValue(this.nameRef.name, fn, undefined, render)
  }

  toCode() {
    return this.toCodePrefixed(true, true)
  }
}

export class RenderFormulaExpression extends ViewFormulaExpression {
  toCodePrefixed(_prefixed: boolean, forceNewline: boolean) {
    let code = super.toCodePrefixed(false, forceNewline)
    return code
  }
}

/**
 * There is the `ViewClassDefinition` expression, which is a subclass of
 * `ClassDefinition`, and there is `ViewFormulaDefinition`, which is just a view
 * function and whether it's isExport or not.
 */
export class ViewFormulaDefinition extends Expression {
  constructor(
    range: Range,
    precedingComments: Comment[],
    readonly view: ViewFormulaExpression,
    readonly isExport: boolean,
  ) {
    super(range, precedingComments)
  }

  get name() {
    return this.view.nameRef.name
  }

  dependencies(parentScopes: Scope[]) {
    const filteredScopes = parentScopes.filter(scope => scope.name !== this.name)
    return this.view.dependencies(filteredScopes)
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

    code += `${this.view.toLispPrefixed(false)}`
    return '(view ' + code + ')'
  }

  toCode() {
    let code = ''
    if (this.isExport) {
      code += EXPORT_KEYWORD + ' '
    }

    return code + this.view.toCodePrefixed(true, true)
  }

  getType(runtime: TypeRuntime): GetTypeResult {
    return getChildType(this, this.view, runtime)
  }

  eval(runtime: ValueRuntime): GetValueResult {
    return this.view.eval(runtime)
  }
}
