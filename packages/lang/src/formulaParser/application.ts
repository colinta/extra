import {type Result, err, mapAll, ok} from '@extra-lang/result'
import {ApplicationRuntime, MutableTypeRuntime, type ValueRuntime} from '../runtime'

import * as Expressions from './expressions'
import * as Types from '../types'
import * as Values from '../values'
import {Expression} from './expressions'
import {
  type Comment,
  RuntimeError,
  type GetTypeResult,
  type GetValueResult,
  type GetRuntimeResult,
} from './types'
import {binaryOperatorNamed, FunctionInvocationOperator} from './operators'
import {dependencySort} from './dependencySort'

export class Application extends Expression {
  readonly requires: Expressions.RequiresStatement | undefined
  readonly imports: Expressions.ImportStatement[]
  readonly types: Map<string, Expressions.TypeDefinition>
  readonly states: Map<string, Expressions.StateDefinition>
  readonly main: Expressions.MainFormulaExpression | undefined
  readonly helpers: Map<string, Expressions.HelperDefinition>
  readonly views: Map<string, Expressions.ViewDefinition>

  constructor(
    range: Expressions.Range,
    comments: Comment[],
    requires: Expressions.RequiresStatement | undefined,
    imports: Expressions.ImportStatement[],
    types: Expressions.TypeDefinition[],
    states: Expressions.StateDefinition[],
    main: Expressions.MainFormulaExpression | undefined,
    helpers: Expressions.HelperDefinition[],
    views: Expressions.ViewDefinition[],
  ) {
    super(range, comments)

    this.requires = requires
    this.imports = imports.sort((impA, impB) => {
      const impA_num =
        impA.source.location === 'package' ? 1 : impA.source.location === 'project' ? 2 : 3
      const impB_num =
        impB.source.location === 'package' ? 1 : impB.source.location === 'project' ? 2 : 3
      return impA_num - impB_num
    })
    this.types = new Map(
      types.map((type): [string, Expressions.TypeDefinition] => [type.name, type]),
    )
    this.states = new Map(
      states.map((state): [string, Expressions.StateDefinition] => [state.name, state]),
    )
    this.main = main
    this.helpers = new Map(
      helpers.map((helper): [string, Expressions.HelperDefinition] => [
        helper.value.nameRef.name,
        helper,
      ]),
    )
    this.views = new Map(
      views.map((view): [string, Expressions.ViewDefinition] => [view.name, view]),
    )
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

    code += (
      [
        ['types', [...this.types.values()]],
        ['state', [...this.states.values()]],
        ['main', this.main ? [this.main] : []],
        ['helpers', [...this.helpers.values()]],
        ['views', [...this.views.values()]],
      ] as [ApplicationHeader, Expression[]][]
    )
      .flatMap(([header, expressions]) => {
        if (!expressions.length) {
          return []
        }
        return this.header(header) + expressions.map(expr => expr.toCode()).join('\n')
      })
      .join('\n\n')

    code += '\n\n'

    return code
  }

  header(header: ApplicationHeader) {
    const title = HEADERS[header]
    const bars_ = '─'.repeat(title.length)
    return `\
╭─${bars_}─╮
│ ${title} │
╰─${bars_}─╯
`
  }

  ordered(resolvedRuntime: Set<string>): GetRuntimeResult<{
    orderedTypes: [string, Expressions.TypeDefinition][]
    orderedHelpers: [string, Expressions.HelperDefinition][]
    orderedViews: [string, Expressions.ViewDefinition][]
  }> {
    const orderedTypes = dependencySort([...this.types], resolvedRuntime)
    if (orderedTypes.isErr()) {
      return err(orderedTypes.error)
    }
    const orderedHelpers = dependencySort([...this.helpers], resolvedRuntime)
    if (orderedHelpers.isErr()) {
      return err(orderedHelpers.error)
    }
    const orderedViews = dependencySort([...this.views], resolvedRuntime)
    if (orderedViews.isErr()) {
      return err(orderedViews.error)
    }

    return ok({
      orderedTypes: orderedTypes.get(),
      orderedHelpers: orderedHelpers.get(),
      orderedViews: orderedViews.get(),
    })
  }

  resolveTypesAndMerge(
    mutableRuntime: MutableTypeRuntime,
    expressions: [string, Expression][],
  ): GetRuntimeResult<Map<string, Types.Type>> {
    return mapAll(
      expressions.map(
        ([name, expr]): Result<[string, Types.Type], RuntimeError> =>
          expr.getType(mutableRuntime).map(type => {
            mutableRuntime.addLocalType(name, type)
            return [name, type]
          }),
      ),
    ).map(types => new Map(types))
  }

  resolveTypesOfTypes(
    mutableRuntime: MutableTypeRuntime,
    orderedTypes: [string, Expressions.TypeDefinition][],
  ) {
    return this.resolveTypesAndMerge(mutableRuntime, orderedTypes)
  }

  resolveTypesOfHelpers(
    mutableRuntime: MutableTypeRuntime,
    orderedHelpers: [string, Expressions.HelperDefinition][],
  ) {
    return this.resolveTypesAndMerge(mutableRuntime, orderedHelpers)
  }

  resolveTypesOfViews(
    mutableRuntime: MutableTypeRuntime,
    orderedViews: [string, Expressions.ViewDefinition][],
  ) {
    return this.resolveTypesAndMerge(mutableRuntime, orderedViews)
  }

  resolveAndMergeTypes(
    mutableRuntime: MutableTypeRuntime,
    ordered: {
      orderedTypes: [string, Expressions.TypeDefinition][]
      orderedHelpers: [string, Expressions.HelperDefinition][]
      orderedViews: [string, Expressions.ViewDefinition][]
    },
  ): GetRuntimeResult<undefined> {
    const types = this.resolveTypesOfTypes(mutableRuntime, ordered.orderedTypes)
    if (types.isErr()) {
      return err(types.error)
    }

    const helpers = this.resolveTypesOfHelpers(mutableRuntime, ordered.orderedHelpers)
    if (helpers.isErr()) {
      return err(helpers.error)
    }

    const views = this.resolveTypesOfViews(mutableRuntime, ordered.orderedViews)
    if (views.isErr()) {
      return err(views.error)
    }

    return ok(undefined)
  }

  resolveValuesAndMerge(
    mutableRuntime: ValueRuntime,
    expressions: [string, Expression][],
  ): GetRuntimeResult<Map<string, Values.Value>> {
    return mapAll(
      expressions.map(
        ([name, expr]): Result<[string, Values.Value], RuntimeError> =>
          expr.eval(mutableRuntime).map(type => {
            mutableRuntime.values.set(name, type)
            return [name, type]
          }),
      ),
    ).map(types => new Map(types))
  }

  /**
   * Resolves the values for the 'Types' section.
   */
  resolveValuesOfTypes(
    mutableRuntime: ValueRuntime,
    orderedTypes: [string, Expressions.TypeDefinition][],
  ): GetRuntimeResult<Map<string, Values.Value>> {
    return this.resolveValuesAndMerge(mutableRuntime, orderedTypes)
  }

  /**
   * Resolves the values for the 'Helpers' section.
   */
  resolveValuesOfHelpers(
    mutableRuntime: ValueRuntime,
    orderedHelpers: [string, Expressions.HelperDefinition][],
  ): GetRuntimeResult<Map<string, Values.Value>> {
    return this.resolveValuesAndMerge(mutableRuntime, orderedHelpers)
  }

  resolveValuesOfViews<T>(
    mutableRuntime: ApplicationRuntime<T>,
    orderedViews: [string, Expressions.ViewDefinition][],
  ) {
    return this.resolveValuesAndMerge(mutableRuntime, orderedViews)
  }

  resolveAndMergeValues<T>(
    runtime: ApplicationRuntime<T>,
    ordered: {
      orderedTypes: [string, Expressions.TypeDefinition][]
      orderedHelpers: [string, Expressions.HelperDefinition][]
      orderedViews: [string, Expressions.ViewDefinition][]
    },
  ): GetRuntimeResult<undefined> {
    const types = this.resolveValuesOfTypes(runtime, ordered.orderedTypes)
    if (types.isErr()) {
      return err(types.error)
    }

    const helpers = this.resolveValuesOfHelpers(runtime, ordered.orderedHelpers)
    if (helpers.isErr()) {
      return err(helpers.error)
    }

    const views = this.resolveValuesOfViews(runtime, ordered.orderedViews)
    if (views.isErr()) {
      return err(views.error)
    }

    return ok(undefined)
  }

  getType(_mutableRuntime: MutableTypeRuntime): GetTypeResult {
    return err(new RuntimeError(this, 'Application does not have a type'))
  }

  orderedTypes(resolvedRuntime: Set<string>) {
    return dependencySort([...this.types], resolvedRuntime)
  }
  orderedHelpers(resolvedRuntime: Set<string>) {
    return dependencySort([...this.helpers], resolvedRuntime)
  }
  orderedViews(resolvedRuntime: Set<string>) {
    return dependencySort([...this.views], resolvedRuntime)
  }

  resolveEvalRuntime<T>(runtime: ApplicationRuntime<T>) {
    const ordered = this.ordered(runtime.resolved())
    if (ordered.isErr()) {
      return err(ordered.error)
    }

    const mutableRuntime = new ApplicationRuntime(runtime, runtime.renderer)
    const typesResult = this.resolveAndMergeTypes(mutableRuntime, ordered.get())
    if (typesResult.isErr()) {
      return err(typesResult.error)
    }

    const valuesResult = this.resolveAndMergeValues(mutableRuntime, ordered.get())
    if (valuesResult.isErr()) {
      return err(valuesResult.error)
    }

    return ok(mutableRuntime)
  }

  eval<T>(runtime: ApplicationRuntime<T>): GetValueResult {
    const nextRuntimeResult = this.resolveEvalRuntime(runtime)
    if (nextRuntimeResult.isErr()) {
      return err(nextRuntimeResult.error)
    }

    const nextRuntime = nextRuntimeResult.get()

    // TODO: receive args from parent caller
    if (this.main) {
      const op = new FunctionInvocationOperator(this.main.range, [], [], binaryOperatorNamed('.'), [
        this.main,
        new Expressions.ArgumentsList(this.main.range, [], [], [], []),
      ])
      return op.eval(nextRuntime).map(result => {
        return result
      })
    } else {
      return ok(Values.NullValue)
    }
  }
}

type ApplicationHeader = 'imports' | 'types' | 'state' | 'main' | 'helpers' | 'views'

const headers: [ApplicationHeader, string][] = [
  ['imports', 'Imports'],
  ['types', 'Types'],
  ['state', '@State'],
  ['main', '<Main />'],
  ['helpers', 'Helpers()'],
  ['views', '<Views>'],
]

const HEADERS = Object.fromEntries(headers) as Record<ApplicationHeader, string>
