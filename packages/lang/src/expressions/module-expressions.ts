import {err, mapAll} from '@extra-lang/result'

import {difference, union} from '@/util'
import {
  type TypeRuntime,
  type ValueRuntime,
  MutableTypeRuntime,
  MutableValueRuntime,
} from '@/runtime'
import * as Types from '@/types'
import * as Nodes from '@/nodes'
import * as Values from '@/values'
import {
  type Comment,
  type GetTypeResult,
  type GetNodeResult,
  type GetValueResult,
  type GetRuntimeResult,
} from '@/formulaParser/types'
import {
  Expression,
  type Range,
  type GenericExpression,
  type NamedFormulaExpression,
  type Reference,
  RuntimeError,
  dependencySort,
  toSource,
  formatComments,
  wrapValues,
  getChildType,
} from './expressions'
import {type ViewDefinition} from './view-expressions'
import {type ClassDefinition} from './class-expressions'
import {type NamedEnumDefinition} from './enum-expressions'
import {EXPORT_KEYWORD, VERSION_START} from '@/formulaParser/grammars'

export class ImportSpecific extends Expression {
  constructor(
    range: Range,
    precedingComments: Comment[],
    readonly name: Reference,
    readonly alias: Reference | undefined,
  ) {
    super(range, precedingComments)

    if (this.alias && this.alias.name === this.name.name) {
      this.alias = undefined
    }
  }

  toLisp() {
    return this.toCode()
  }

  toCode() {
    if (this.alias) {
      return `${this.name.name} as ${this.alias.name}`
    }

    return this.name.name
  }

  getType(): GetTypeResult {
    return err(new RuntimeError(this, 'ImportSpecific does not have a type'))
  }

  eval(): GetValueResult {
    return err(new RuntimeError(this, 'ImportSpecific cannot be evaluated'))
  }
}

/**
 * Declares the default export type. The compiler can use this to ensure that
 * all requirements are met for the given export.
 */
export class ProvidesStatement extends Expression {
  constructor(
    range: Range,
    precedingComments: Comment[],
    readonly env: string,
    followingComments: Comment[],
  ) {
    super(range, precedingComments, followingComments)
  }

  dependencies(): Set<string> {
    return new Set([this.env])
  }

  toLisp() {
    return this.toCode()
  }

  toCode() {
    return `provides ${this.env}`
  }

  getType(): GetTypeResult {
    return err(new RuntimeError(this, 'ProvidesStatement does not have a type'))
  }

  eval(): GetValueResult {
    return err(new RuntimeError(this, 'ProvidesStatement cannot be evaluated'))
  }
}

export class RequiresStatement extends Expression {
  constructor(
    range: Range,
    precedingComments: Comment[],
    readonly envs: string[],
    followingComments: Comment[],
  ) {
    super(range, precedingComments, followingComments)
  }

  dependencies(): Set<string> {
    return new Set(this.envs)
  }

  toLisp() {
    return this.toCode()
  }

  toCode() {
    if (!this.envs.length) {
      return ''
    }

    return `requires ${this.envs.join(', ')}`
  }

  getType(): GetTypeResult {
    return err(new RuntimeError(this, 'RequiresStatement does not have a type'))
  }

  eval(): GetValueResult {
    return err(new RuntimeError(this, 'RequiresStatement cannot be evaluated'))
  }
}

export type ImportLocation = 'package' | 'project' | 'relative' | 'scheme'

export class ImportSource extends Expression {
  readonly name: Reference | undefined

  constructor(
    range: Range,
    precedingComments: Comment[],
    /**
     * Where we should look for the import
     */
    readonly location: ImportLocation,
    /**
     * The path parts of the import path
     */
    readonly parts: Reference[],
    /**
     * Optional scheme (only for the 'scheme' location)
     */
    readonly scheme: string | undefined,
    readonly version: string | undefined,
  ) {
    super(range, precedingComments)
    this.name = parts.at(-1)
  }

  toLisp() {
    return `(${this.toCode()})`
  }

  toCode() {
    let code = ''

    if (this.scheme) {
      code += this.scheme + '://'
    } else {
      if (this.location === 'relative') {
        code += './'
      } else if (this.location === 'project') {
        code += '/'
      }
    }

    code += this.parts.join('/')

    if (this.version) {
      code += VERSION_START + this.version
    }

    return code
  }

  getType(): GetTypeResult {
    return err(new RuntimeError(this, 'ImportStatement does not have a type'))
  }

  eval(): GetValueResult {
    return err(new RuntimeError(this, 'ImportStatement cannot be evaluated'))
  }
}

/**
 * Imports from another package. Imports can come from different "sources":
 * - package: installed from the packages folder (where is that? TBD...)
 *   Example:
 *         import File : { reader }
 * - project: imported from the project, relative to the root of the project
 *   folder
 *   Example:
 *         import /components/nav : { Header }
 * - relative: imported from a neighbour or a file in a subfolder. *cannot*
 *   import from a parent folder. If node taught us one thing, it's that relative
 *   imports that "reach out" pave the way to darkness and despair.
 *   Example:
 *         import ./helpers : { parse }
 * - scheme: All sorts of import methods supported here, like `github:` and
 *   that's all of them.
 *   Example:
 *         import github://colinta/extra-extra : { amazing }
 */
export class ImportStatement extends Expression {
  readonly name: Reference | undefined

  constructor(
    range: Range,
    precedingComments: Comment[],
    readonly precedingSpecifierComments: Comment[],
    /**
     * The path parts of the import path
     */
    readonly source: ImportSource,
    /**
     * If alias is set, the package exports are made available using that name.
     */
    readonly alias: Reference | undefined,
    /**
     * Specific things that were imported via `import... : { a, b }`
     */
    readonly importSpecifiers: ImportSpecific[],
  ) {
    super(range, precedingComments)

    this.name = source.name

    // no alias is needed if no specific imports are defined.
    // if specific imports are defined, an alias is required if you want to refer
    // to other package imports.
    if (
      this.alias &&
      this.name &&
      this.alias.name === this.name.name &&
      importSpecifiers.length === 0
    ) {
      this.alias = undefined
    }
  }

  toLisp() {
    return `(${this.toCode()})`
  }

  toCode() {
    let code = 'import ' + this.source.toCode()

    if (this.alias) {
      code += ' as ' + this.alias.name
    }

    if (this.importSpecifiers.length) {
      code += ' only '
      code += wrapValues('{ ', this.importSpecifiers, ' }')
      code += ''
    }

    return code
  }

  getType(): GetTypeResult {
    return err(new RuntimeError(this, 'ImportStatement does not have a type'))
  }

  eval(): GetValueResult {
    return err(new RuntimeError(this, 'ImportStatement cannot be evaluated'))
  }
}

/**
 * In the 'types' section of a module:
 *     [public] typeName[<generics>] = type
 */
export class TypeDefinition extends Expression {
  constructor(
    range: Range,
    precedingComments: Comment[],
    readonly nameRef: Reference,
    readonly type: Expression,
    readonly generics: GenericExpression[],
    readonly isExport: boolean,
  ) {
    super(range, precedingComments)
  }

  get name() {
    return this.nameRef.name
  }

  dependencies() {
    return this.type.dependencies()
  }

  provides() {
    return new Set([this.name])
  }

  childExpressions() {
    return [this.type]
  }

  toLisp() {
    let code = ''
    if (this.isExport) {
      code += EXPORT_KEYWORD + ' '
    }

    code += 'type '
    code += this.name
    if (this.generics.length) {
      code += ' <' + this.generics.map(g => g.toLisp()).join(' ') + '>'
    }

    code += ' '
    code += this.type.toLisp()
    return `(${code})`
  }

  toCode() {
    let code = ''
    code += formatComments(this.precedingComments)
    if (this.isExport) {
      code += EXPORT_KEYWORD + ' '
    }

    code += 'type '
    code += this.name
    if (this.generics.length) {
      code += wrapValues('<', this.generics, '>')
    }

    code += ' = '
    code += this.type.toCode()
    return code
  }

  getType(runtime: TypeRuntime): GetTypeResult {
    return err(new RuntimeError(this, 'TypeDefinition does not have a type'))
  }

  eval(runtime: ValueRuntime) {
    return err(new RuntimeError(this, 'TypeDefinition cannot be evaluated'))
  }
}

/**
 * A NamedFormulaExpression with an `isExport` boolean.
 */
export class HelperDefinition extends Expression {
  constructor(
    range: Range,
    precedingComments: Comment[],
    readonly value: NamedFormulaExpression,
    readonly isExport: boolean,
  ) {
    super(range, precedingComments)
  }

  get name() {
    return this.value.nameRef.name
  }

  dependencies() {
    return this.value.dependencies()
  }

  provides() {
    return new Set([this.value.nameRef.name])
  }

  childExpressions() {
    return [this.value]
  }

  toLisp() {
    let code = ''
    if (this.isExport) {
      code += EXPORT_KEYWORD + ' '
    }

    code += this.value.toLispPrefixed(false)

    return `(fn ${code})`
  }

  toCode() {
    let code = ''
    if (this.isExport) {
      code += EXPORT_KEYWORD + ' '
    }

    code += 'fn '
    code += `${this.value.toCodePrefixed(false, true)}`
    return code
  }

  getType(runtime: TypeRuntime): GetTypeResult {
    return getChildType(this, this.value, runtime)
  }

  eval(runtime: ValueRuntime) {
    return this.value.eval(runtime)
  }
}

export class Module extends Expression {
  readonly imports: ImportStatement[]

  constructor(
    range: Range,
    comments: Comment[],
    readonly providesStmt: ProvidesStatement | undefined,
    readonly requiresStmt: RequiresStatement | undefined,
    imports: ImportStatement[],
    readonly expressions: (
      | TypeDefinition
      | HelperDefinition
      | ViewDefinition
      | ClassDefinition
      | NamedEnumDefinition
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

  dependencies() {
    let deps = new Set<string>()
    if (this.providesStmt) {
      deps = union(deps, this.providesStmt.dependencies())
    }
    if (this.requiresStmt) {
      deps = union(deps, this.requiresStmt.dependencies())
    }

    for (const expr of this.imports) {
      if (expr.dependencies()) {
        throw `Unexpected error: ${expr.constructor.name} should not have dependencies`
      }
      deps = difference(deps, expr.provides())
    }
    for (const expr of this.expressions) {
      if (expr.dependencies()) {
        throw `Unexpected error: ${expr.constructor.name} should not have dependencies`
      }
      deps = difference(deps, expr.dependencies())
    }

    return deps
  }

  childExpressions() {
    const children: Expression[] = []
    if (this.providesStmt) {
      children.push(this.providesStmt)
    }
    if (this.requiresStmt) {
      children.push(this.requiresStmt)
    }
    children.push(...this.imports)
    children.push(...this.expressions)
    return children
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

  getType(runtime: TypeRuntime): GetRuntimeResult<Types.ModuleType> {
    const moduleRuntime = new MutableTypeRuntime(runtime)
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
      // TODO: this.imports also provides names that should be considered resolved
      name => moduleRuntime.has(name),
    )
    if (sorted.isErr()) {
      return err(sorted.error)
    }

    return mapAll(
      sorted.get().map(([name, expr]) =>
        expr.getType(moduleRuntime).map(type => {
          moduleRuntime.addLocalType(name, type)
          return [name, type] as [string, Types.Type]
        }),
      ),
    ).map(typeTypes => {
      return new Types.ModuleType(new Map(typeTypes))
    })
  }

  eval(runtime: ValueRuntime): GetRuntimeResult<Values.ModuleValue> {
    const moduleRuntime = new MutableValueRuntime(runtime)
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
      name => moduleRuntime.has(name), // TODO: imports would help here
    )
    if (sorted.isErr()) {
      return err(sorted.error)
    }

    return mapAll(
      sorted.get().map(([name, expr]) =>
        expr.eval(moduleRuntime).map(value => {
          moduleRuntime.addLocalValue(name, value)
          return [name, value] as [string, Values.Value]
        }),
      ),
    ).map(values => {
      return new Values.ModuleValue(new Map(values))
    })
  }
}
