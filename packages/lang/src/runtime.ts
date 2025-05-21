import {type GetRuntimeResult} from '~/formulaParser/types'
import {
  findEventualRef,
  findRefs,
  type RelationshipFormula,
  type AssignedRelationship,
  type RelationshipComparison,
  simplifyRelationships,
} from '~/relationship'
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
  | 'replaceType'
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
  /**
   * Maps id to type
   */
  private types: Map<string, Type> = new Map()
  /**
   * Maps name to id
   */
  private ids: Map<string, string> = new Map()
  /**
   * Maps id to name
   */
  private names: Map<string, string> = new Map()
  /**
   * Maps id to relationships
   */
  private relationships: Map<string, AssignedRelationship[]> = new Map()
  // namespaces is only half-baked so far
  private namespaces: Map<string, Map<string, Type>> = new Map()
  private locale: Intl.Locale | undefined

  constructor(readonly parent?: TypeRuntime) {}

  resolved(): Set<string> {
    const resolved = new Set<string>([...(this.parent?.resolved() ?? [])])
    for (const id of this.types.keys()) {
      const name = this.refName(id)!
      resolved.add(name)
    }

    return resolved
  }

  refId(name: string): string | undefined {
    return this.ids.get(name) ?? this.parent?.refId(name)
  }

  refName(id: string): string | undefined {
    return this.names.get(id) ?? this.parent?.refName(id)
  }

  /**
   * References an entity by id, used mostly in relationship building.
   */
  getTypeById(id: string): Type | undefined {
    return this.types.get(id) ?? this.parent?.getTypeById(id)
  }

  /**
   * References an entity from the local scope
   *
   * @example
   *     -- user is a 'local' entity
   *     <row>{user.name}</row>
   */
  getLocalType(name: string): Type | undefined {
    const id = this.refId(name)
    if (id) {
      return this.types.get(id) ?? this.parent?.getLocalType(name)
    }

    return this.parent?.getLocalType(name)
  }

  /**
   * The type of values coming from state
   *
   * @example
   *     -- @user is a state entity
   *     <row>{@user.name}</row>
   */
  getStateType(name: string): Type | undefined {
    return this.getLocalType('@' + name)
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
    return this.getLocalType('.' + name)
  }

  /**
   * The type of an action
   *
   * @example
   *     &createFoo(…)
   */
  getActionType(name: string): Type | undefined {
    return this.getLocalType('&' + name)
  }

  /**
   * The type of the `#` within a pipe operation `a |> #`
   *
   * @example
   *     foo |> #
   */
  getPipeType(): Type | undefined {
    return this.getLocalType('#')
  }

  hasNamespace(namespace: string): boolean {
    return this.namespaces.has(namespace) || this.parent?.hasNamespace(namespace) || false
  }

  getNamespaceType(namespace: string, name: string): Type | undefined {
    const localNamespace = this.namespaces.get(namespace)?.get(name)
    const type = localNamespace
    return type ?? this.parent?.getNamespaceType(namespace, name)
  }

  getLocale(): Intl.Locale {
    return this.locale ?? (this.parent ? this.parent.getLocale() : defaultLocale())
  }

  getRelationships(id: string): AssignedRelationship[] {
    const fromParent = this.parent?.getRelationships(id) ?? []
    const fromSelf = this.relationships.get(id) ?? []
    return fromSelf.concat(fromParent)
  }

  /**
   * Returns all the relationships that reference 'referencingId'.
   */
  relationshipsThatReference(referencingId: string): AssignedRelationship[] {
    const fromParent = this.parent?.relationshipsThatReference(referencingId) ?? []
    if (!this.relationships.has(referencingId)) {
      return fromParent
    }

    return this.relationships.get(referencingId)!.concat(fromParent)
  }

  addLocalType(name: string, type: Type) {
    const id = this.addId(name)
    this.types.set(id, type)
  }

  replaceTypeByName(name: string, type: Type) {
    const id = this.refId(name)
    if (id) {
      this.types.set(id, type)
    }
  }

  replaceTypeById(id: string, type: Type) {
    this.types.set(id, type)
  }

  addStateType(name: string, type: Type) {
    this.addLocalType('@' + name, type)
  }

  addThisType(name: string, type: Type) {
    this.addLocalType('.' + name, type)
  }

  addActionType(name: string, type: Type) {
    this.addLocalType('&' + name, type)
  }

  setPipeType(type: Type) {
    this.addLocalType('#', type)
  }

  addRelationship(name: string, type: RelationshipComparison, rel: RelationshipFormula) {
    const id = this.refId(name)
    if (!id) {
      return
    }

    for (const relationship of simplifyRelationships({
      formula: {type: 'reference', name, id},
      type,
      right: rel,
    })) {
      const rel = findEventualRef(relationship.formula)
      const relationships = this.relationships.get(rel.id) ?? []
      relationships.push(relationship)
      this.relationships.set(rel.id, relationships)
    }
  }

  /**
   * Creates a new id, even if the 'name' is already in ids - the name shadows the
   * previous reference.
   */
  addId(name: string) {
    const id = uid(name)
    this.ids.set(name, id)
    this.names.set(id, name)
    return id
  }

  addNamespaceTypes(namespace: string, types: Map<string, Type>) {
    const existing = this.namespaces.get(namespace)
    if (existing) {
      for (const [name, type] of types.entries()) {
        existing.set(name, type)
      }
    } else {
      this.namespaces.set(namespace, types)
    }
  }

  setLocale(value: Intl.Locale) {
    this.locale = value
  }
}

export class MutableValueRuntime extends MutableTypeRuntime {
  values: Map<string, Value> = new Map()

  constructor(readonly parent?: ValueRuntime) {
    super(parent)
  }

  resolved(): Set<string> {
    const resolved = super.resolved()
    for (const id of this.values.keys()) {
      const name = this.refName(id)!
      resolved.add(name)
    }

    return resolved
  }

  getLocalValue(name: string): Value | undefined {
    const id = this.refId(name)
    if (id) {
      return this.values.get(id) ?? this.parent?.getLocalValue(name)
    }

    return this.parent?.getLocalValue(name)
  }

  getStateValue(name: string): Value | undefined {
    return this.getLocalValue('@' + name)
  }

  getThisValue(name: string): Value | undefined {
    return this.getLocalValue('.' + name)
  }

  getActionValue(name: string): Value | undefined {
    return this.getLocalValue('&' + name)
  }

  getPipeValue(): Value | undefined {
    return this.getLocalValue('#')
  }

  addLocalValue(name: string, value: Value) {
    const id = this.addId(name)
    this.values.set(id, value)
  }

  addStateValue(name: string, value: Value) {
    this.addLocalValue('@' + name, value)
  }

  addThisValue(name: string, value: Value) {
    this.addLocalValue('.' + name, value)
  }

  addActionValue(name: string, value: Value) {
    this.addLocalValue('&' + name, value)
  }

  setPipeValue(value: Value) {
    this.addLocalValue('#', value)
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
