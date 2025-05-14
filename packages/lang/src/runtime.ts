import {type GetRuntimeResult} from '~/formulaParser/types'
import {findRefs, type RelationshipFormula} from '~/relationship'
import {type Type} from '~/types'
import {type Value, type ObjectValue} from '~/values'

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

export type TypeRuntime = Omit<
  MutableTypeRuntime,
  | 'setLocale'
  | 'addLocalType'
  | 'addStateType'
  | 'addThisType'
  | 'addActionType'
  | 'addId'
  | 'setPipeType'
  | 'addNamespaceTypes'
  | 'addRelationship'
>

export type ValueRuntime = Omit<
  MutableValueRuntime,
  | 'setLocale'
  | 'addLocalType'
  | 'addStateType'
  | 'addThisType'
  | 'addActionType'
  | 'addId'
  | 'setPipeType'
  | 'addNamespaceTypes'
  | 'addLocalValue'
  | 'addStateValue'
  | 'addThisValue'
  | 'addActionValue'
  | 'setPipeValue'
>

export class MutableTypeRuntime {
  localTypes: Map<string, Type> = new Map()
  relationships: Map<string, RelationshipFormula[]> = new Map()
  localNamespaces: Map<string, Map<string, Type>> = new Map()
  stateTypes: Map<string, Type> = new Map()
  thisTypes: Map<string, Type> = new Map()
  actionTypes: Map<string, Type> = new Map()
  ids: Map<string, string> = new Map()
  pipeType: Type | undefined
  locale: Intl.Locale | undefined

  constructor(readonly parent?: TypeRuntime) {}

  resolved(): Set<string> {
    const resolved = new Set<string>([...(this.parent?.resolved() ?? [])])
    for (const key of this.localTypes.keys()) {
      resolved.add(key)
    }
    for (const key of this.stateTypes.keys()) {
      resolved.add('@' + key)
    }
    for (const key of this.thisTypes.keys()) {
      resolved.add('this.' + key)
    }
    for (const key of this.actionTypes.keys()) {
      resolved.add('&' + key)
    }
    if (this.pipeType) {
      resolved.add('#')
    }

    return resolved
  }

  refId(name: string): string | undefined {
    return this.ids.get(name) ?? this.parent?.refId(name)
  }

  /**
   * References an entity from the local scope
   *
   * @example
   *     -- user is a 'local' entity
   *     <row>{user.name}</row>
   */
  getLocalType(name: string): Type | undefined {
    const type = this.localTypes.get(name)
    return type ?? this.parent?.getLocalType(name)
  }

  hasNamespace(namespace: string): boolean {
    return this.localNamespaces.has(namespace) || this.parent?.hasNamespace(namespace) || false
  }

  getNamespaceType(namespace: string, name: string): Type | undefined {
    const localNamespace = this.localNamespaces.get(namespace)?.get(name)
    const type = localNamespace
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
    const type = this.stateTypes.get(name)
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
    const type = this.thisTypes.get(name)
    return type ?? this.parent?.getThisType(name)
  }

  /**
   * The type of an action
   *
   * @example
   *     &createFoo(…)
   */
  getActionType(name: string): Type | undefined {
    const type = this.actionTypes.get(name)
    return type ?? this.parent?.getActionType(name)
  }

  /**
   * The type of the `#` within a pipe operation `a |> #`
   *
   * @example
   *     foo |> #
   */
  getPipeType(): Type | undefined {
    return this.pipeType ?? this.parent?.getPipeType()
  }

  getLocale(): Intl.Locale {
    return this.locale ?? defaultLocale()
  }

  addLocalType(name: string, type: Type) {
    this.localTypes.set(name, type)
    this.addId(name)
  }

  addRelationship(name: string, rel: RelationshipFormula) {
    const id = this.refId(name)
    if (!id) {
      return
    }

    const relationships = this.relationships.get(id) ?? []
    relationships.push(rel)
    this.relationships.set(id, relationships)
  }

  getRelationships(name: string) {
    return this.relationships.get(name) ?? []
  }

  getAllRelationships(name: string): RelationshipFormula[] {
    const id = this.refId(name)
    if (!id) {
      return []
    }

    const relationships = [...this.relationships]
    relationships.push(...(this.parent?.relationships ?? []))

    return Array.from(relationships).flatMap(([key, relationships]) => {
      return relationships.flatMap(relationship => {
        const refs = findRefs(relationship)
        if (refs.some(rel => rel.id === id)) {
          return [relationship]
        } else {
          return []
        }
      })
    })
  }

  addStateType(name: string, type: Type) {
    this.stateTypes.set(name, type)
    this.addId('@' + name)
  }

  addThisType(name: string, type: Type) {
    this.thisTypes.set(name, type)
    this.addId('this.' + name)
  }

  addActionType(name: string, type: Type) {
    this.actionTypes.set(name, type)
    this.addId('&' + name)
  }

  addId(name: string) {
    return this.ids.set(name, uid(name))
  }

  setPipeType(type: Type) {
    this.pipeType = type
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

  setLocale(value: Intl.Locale) {
    this.locale = value
  }
}

export class MutableValueRuntime extends MutableTypeRuntime {
  localValues: Map<string, Value> = new Map()
  stateValues: Map<string, Value> = new Map()
  thisValues: Map<string, Value> = new Map()
  actionValues: Map<string, Value> = new Map()
  viewValues: Map<string, Value> = new Map()
  pipeValue: Value | undefined

  constructor(readonly parent?: ValueRuntime) {
    super(parent)
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
    const value = this.localValues.get(name)
    return value ?? this.parent?.getLocalValue(name)
  }

  getStateValue(name: string): Value | undefined {
    const value = this.stateValues.get(name)
    return value ?? this.parent?.getStateValue(name)
  }

  getThisValue(name: string): Value | undefined {
    const value = this.thisValues.get(name)
    return value ?? this.parent?.getThisValue(name)
  }

  getActionValue(name: string): Value | undefined {
    const value = this.actionValues.get(name)
    return value ?? this.parent?.getActionValue(name)
  }

  getPipeValue(): Value | undefined {
    return this.pipeValue ?? this.parent?.getPipeValue()
  }

  addLocalValue(name: string, value: Value) {
    this.localValues.set(name, value)
  }

  addStateValue(name: string, value: Value) {
    this.stateValues.set(name, value)
  }

  addThisValue(name: string, value: Value) {
    this.thisValues.set(name, value)
  }

  addActionValue(name: string, value: Value) {
    this.actionValues.set(name, value)
  }

  setPipeValue(value: Value) {
    this.pipeValue = value
  }
}

export class ApplicationRuntime<T> extends MutableValueRuntime {
  constructor(
    readonly runtime: ValueRuntime,
    readonly renderer: Renderer<T>,
  ) {
    super(runtime)
  }

  getRenderer(): Renderer<T> {
    return this.renderer
  }
}

function defaultLocale() {
  return new Intl.Locale('en-ca')
}

function uid(name: string) {
  const uid = Math.floor(Math.random() * 1000000)
  return `${name}-${uid.toString(16)}`
}
