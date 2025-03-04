import {type GetRuntimeResult} from './formulaParser/types'
import type {Type} from './types'
import type {Value, ObjectValue} from './values'

export interface Runtime {
  getLocale(): Intl.Locale
}

/**
 * Renderer<T>, where T is the node type.
 *
 * 1. First we create the top-level container via `createContainer`
 * 2. Nodes are created via `renderText` or `renderNode`
 * 3. Nodes are added to the tree via `addNodeTo(parentNode: T, childNode: T)`
 */
export interface Renderer<T> {
  createContainer(): T
  renderText(text: string): T
  renderNode(name: string, props: ObjectValue, children: number): GetRuntimeResult<T>
  addNodeTo(parentNode: T, childNode: T): void
}

export class TypeRuntime {
  localTypes: Map<string, Type> = new Map()
  localNamespaces: Map<string, Map<string, Type>> = new Map()
  stateTypes: Map<string, Type> = new Map()
  thisTypes: Map<string, Type> = new Map()
  actionTypes: Map<string, Type> = new Map()
  pipeType: Type | undefined

  constructor(
    readonly provider: Partial<TypeRuntime> = {},
    readonly parent?: TypeRuntime,
  ) {}

  resolved(): Set<string> {
    const resolved = new Set<string>([
      ...(this.provider.resolved?.() ?? []),
      ...(this.parent?.resolved() ?? []),
    ])
    for (const key of this.localTypes.keys()) {
      resolved.add(key)
    }
    for (const key of this.stateTypes.keys()) {
      resolved.add('@' + key)
    }
    for (const key of this.thisTypes.keys()) {
      resolved.add('.' + key)
    }
    for (const key of this.actionTypes.keys()) {
      resolved.add('&' + key)
    }
    if (this.pipeType) {
      resolved.add('#')
    }

    return resolved
  }

  /**
   * References an entity from the local scope
   *
   * @example
   *     -- user is a 'local' entity
   *     <row>{user.name}</row>
   */
  getLocalType(name: string): Type | undefined {
    const type = this.localTypes.get(name) ?? this.provider.getLocalType?.(name)
    return type ?? this.parent?.getLocalType(name)
  }

  hasNamespace(namespace: string): boolean {
    return (
      this.localNamespaces.has(namespace) ||
      this.provider.hasNamespace?.(namespace) ||
      this.parent?.hasNamespace(namespace) ||
      false
    )
  }

  getNamespaceType(namespace: string, name: string): Type | undefined {
    const localNamespace = this.localNamespaces.get(namespace)?.get(name)
    const type = localNamespace ?? this.provider.getNamespaceType?.(namespace, name)
    return type ?? this.parent?.getNamespaceType(namespace, name)
  }

  /**
   * The type of values coming from state
   *
   * @example
   *     -- @user is a state entity
   *     <row>{@user.name}</row>
   */
  getStateType(name: string): Type | undefined {
    const type = this.stateTypes.get(name) ?? this.provider.getStateType?.(name)
    return type ?? this.parent?.getStateType(name)
  }

  /**
   * "this" refers to the properties of an object when calling a function
   * attached to that object.
   *
   * @example
   *     User = {
   *       firstName: String
   *       lastName: String
   *       fullName: fn() =>
   *         this.firstName ++ this.lastName
   *     }
   */
  getThisType(name: string): Type | undefined {
    const type = this.thisTypes.get(name) ?? this.provider.getThisType?.(name)
    return type ?? this.parent?.getThisType(name)
  }

  /**
   * The type of an action
   *
   * @example
   *     &createFoo(…)
   */
  getActionType(name: string): Type | undefined {
    const type = this.actionTypes.get(name) ?? this.provider.getActionType?.(name)
    return type ?? this.parent?.getActionType(name)
  }

  /**
   * The type of the `#` within a pipe operation `a |> #`
   *
   * @example
   *     foo |> #
   */
  getPipeType(): Type | undefined {
    this.pipeType ??= this.provider.getPipeType?.()
    return this.pipeType ?? this.parent?.getPipeType()
  }

  getLocale(): Intl.Locale {
    return this.provider.getLocale?.() ?? defaultLocale()
  }

  pushRuntime(nextProvider: Partial<TypeRuntime>) {
    return new TypeRuntime(nextProvider, this)
  }
}

export class MutableTypeRuntime extends TypeRuntime {
  addLocalType(name: string, type: Type) {
    this.localTypes.set(name, type)
  }

  addNamespaceTypes(namespace: string, types: Map<string, Type>) {
    const existing = this.localNamespaces.get(namespace)
    if (existing) {
      for (const [name, type] of types.entries()) {
        existing.set(name, type)
      }
    } else {
      this.localNamespaces.set(namespace, types)
    }
  }
}

export class ValueRuntime extends TypeRuntime {
  localValues: Map<string, Value> = new Map()
  stateValues: Map<string, Value> = new Map()
  thisValues: Map<string, Value> = new Map()
  actionValues: Map<string, Value> = new Map()
  viewValues: Map<string, Value> = new Map()
  pipeValue: Value | undefined

  constructor(
    readonly provider: Partial<ValueRuntime>,
    readonly parent?: ValueRuntime,
  ) {
    super(provider, parent)
  }

  resolved(): Set<string> {
    const resolved = super.resolved()
    for (const key of this.localValues.keys()) {
      resolved.add(key)
    }
    for (const key of this.stateValues.keys()) {
      resolved.add('@' + key)
    }
    for (const key of this.thisValues.keys()) {
      resolved.add('.' + key)
    }
    for (const key of this.actionValues.keys()) {
      resolved.add('&' + key)
    }
    for (const key of this.viewValues.keys()) {
      resolved.add(key)
    }
    if (this.pipeValue) {
      resolved.add('#')
    }

    return resolved
  }

  getLocalValue(name: string): Value | undefined {
    const value = this.localValues.get(name) ?? this.provider.getLocalValue?.(name)
    return value ?? this.parent?.getLocalValue(name)
  }

  getStateValue(name: string): Value | undefined {
    const value = this.stateValues.get(name) ?? this.provider.getStateValue?.(name)
    return value ?? this.parent?.getStateValue(name)
  }

  getThisValue(name: string): Value | undefined {
    const value = this.thisValues.get(name) ?? this.provider.getThisValue?.(name)
    return value ?? this.parent?.getThisValue(name)
  }

  getActionValue(name: string): Value | undefined {
    const value = this.actionValues.get(name) ?? this.provider.getActionValue?.(name)
    return value ?? this.parent?.getActionValue(name)
  }

  getPipeValue(): Value | undefined {
    this.pipeValue ??= this.provider.getPipeValue?.()
    return this.pipeValue ?? this.parent?.getPipeValue()
  }

  pushRuntime(nextProvider: Partial<ValueRuntime>) {
    return new ValueRuntime(nextProvider, this)
  }
}

export class MutableValueRuntime extends ValueRuntime {
  addLocalType(name: string, type: Type) {
    this.localTypes.set(name, type)
  }

  addLocalValue(name: string, value: Value) {
    this.localValues.set(name, value)
  }
}

export class ApplicationRuntime<T> extends ValueRuntime {
  constructor(
    readonly runtime: ValueRuntime,
    readonly renderer: Renderer<T>,
  ) {
    super({}, runtime)
  }

  getRenderer(): Renderer<T> {
    return this.renderer
  }

  pushRuntime(nextProvider: Partial<ValueRuntime>) {
    return new ApplicationRuntime(this.runtime.pushRuntime(nextProvider), this.renderer)
  }
}

function defaultLocale() {
  return new Intl.Locale('en-ca')
}
