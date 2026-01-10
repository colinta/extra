import {
  findEventualRef,
  type AssignedRelationship,
  simplifyRelationships,
  isEqualRelationship,
} from './relationship'
import {
  type Type,
  type ClassInstanceType,
  ViewClassDefinitionType,
  ViewFormulaType,
  ViewType,
} from './types'
import {
  type Value,
  ViewClassDefinitionValue,
  ViewFormulaValue,
  NamedViewValue,
  ClassInstanceValue,
} from './values'
import {type Node} from './nodes'
import {uid} from './uid'

export type TypeRuntime = Omit<
  MutableTypeRuntime,
  | 'addId'
  | 'replaceTypeByName'
  | 'replaceTypeById'
  | 'addLocalType'
  | 'setThisType'
  | 'setPipeType'
  | 'addNamespaceTypes'
  | 'addRelationshipFormula'
>

export type ValueRuntime = Omit<
  MutableValueRuntime,
  | 'addId'
  | 'replaceTypeByName'
  | 'replaceTypeById'
  | 'addLocalType'
  | 'setThisType'
  | 'setPipeType'
  | 'addNamespaceTypes'
  | 'addRelationshipFormula'
  | 'addLocalValue'
  | 'addStateValue'
  | 'setThisValue'
  | 'setPipeValue'
>

export interface ViewRuntime {
  getViewType(name: string): ViewType | undefined
  getViewValue(name: string): NamedViewValue | undefined
  has(name: string): boolean
}

const THIS_PREFIX = '@'

export class MutableTypeRuntime {
  readonly _id = uid()
  public viewRuntime?: ViewRuntime
  thisType: ClassInstanceType | undefined

  get id(): string {
    if (this.parent) {
      return `${this.parent.id}-${this._id}`
    }
    return `runtime-${this._id}`
  }
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

  constructor(
    readonly parent?: TypeRuntime,
    thisType?: ClassInstanceType | undefined,
  ) {
    this.viewRuntime = parent?.viewRuntime
    this.thisType = thisType
  }

  resolved(): Set<string> {
    const resolved = new Set<string>([...(this.parent?.resolved() ?? [])])
    for (const id of this.types.keys()) {
      const name = this.refName(id)!
      resolved.add(name)
    }

    return resolved
  }

  additions() {
    const names = new Set(this.ids.keys())
    for (const id of this.types.keys()) {
      const name = this.refName(id)
      if (name) {
        names.add(name)
      }
    }

    return {
      names,
      types: this.types,
      relationships: this.relationships,
    }
  }

  refId(name: string): string | undefined {
    return this.ids.get(name) ?? this.parent?.refId(name)
  }

  has(name: string): boolean {
    return this.ids.has(name) || this.viewRuntime?.has(name) || (this.parent?.has(name) ?? false)
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
    return (id ? this.types.get(id) : undefined) ?? this.parent?.getLocalType(name)
  }

  /**
   * The type of values coming from state
   *
   * @example
   *     -- @user is a state entity
   *     <row>{@user.name}</row>
   */
  getStateType(name: string): Type | undefined {
    const thisType = this.getThisType()
    return thisType?.propAccessType(name)
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
  getThisType(): ClassInstanceType | undefined {
    // I had originally wanted to avoid accidentally setting 'this' when
    // creating a new runtime, but when I thought about it later, I couldn't
    // imagine a scenario where this would be the desired behavior. Certainly
    // things like 'let' would need to assign 'this', and the rule in Extra is
    // that scope is always 'inherited' downwards - you can just go up the
    // expression tree to find a value... so assigning 'this' from the parent
    // makes sense?
    return this.thisType ?? this.parent?.thisType
  }

  /**
   * The type of the `#pipe` within a pipe operation `a |> #pipe`
   *
   * @example
   *     foo |> #pipe
   */
  getPipeType(): Type | undefined {
    return this.getLocalType('#pipe')
  }

  getViewType(name: string): ViewType | ViewClassDefinitionType | ViewFormulaType | undefined {
    const view = this.viewRuntime?.getViewType(name)
    if (view) {
      return view
    }

    const local = this.getLocalType(name)
    if (local instanceof ViewClassDefinitionType || local instanceof ViewFormulaType) {
      return local
    }
  }

  hasNamespace(namespace: string): boolean {
    return this.namespaces.has(namespace) || this.parent?.hasNamespace(namespace) || false
  }

  getNamespaceType(namespace: string, name: string): Type | undefined {
    const localNamespace = this.namespaces.get(namespace)?.get(name)
    const type = localNamespace
    return type ?? this.parent?.getNamespaceType(namespace, name)
  }

  getRelationships(id: string): AssignedRelationship[] {
    const fromParent = this.parent?.getRelationships(id) ?? []
    const fromSelf = this.relationships.get(id) ?? []
    return fromSelf.concat(fromParent)
  }

  addLocalType(name: string, type: Type) {
    const id = this.addId(name)
    this.types.set(id, type)
    return id
  }

  addLocalTypeWithId(name: string, id: string, type: Type) {
    this.ids.set(name, id)
    this.names.set(id, name)
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

  setPipeType(type: Type) {
    this.addLocalType('#pipe', type)
  }

  addRelationshipFormula(assignedRelationship: AssignedRelationship) {
    for (const relationship of simplifyRelationships(assignedRelationship)) {
      const ref = findEventualRef(relationship.formula)
      const prevRelationships = this.relationships.get(ref.id) ?? []

      if (!prevRelationships.some(prevRel => isEqualRelationship(prevRel, relationship))) {
        prevRelationships.push(relationship)
        this.relationships.set(ref.id, prevRelationships)
      }
    }
  }

  /**
   * Called from 'combineEitherTypeRuntimes' which checks lhsRuntime and
   * rhsRuntime for duplicates. All relationships in those runtimes have already
   * been checked by 'addRelationshipFormula' (but not checked against each
   * other).
   */
  addTrustedRelationshipsFormulas(id: string, relationships: AssignedRelationship[]) {
    const prevRelationships = this.relationships.get(id) ?? []
    this.relationships.set(id, prevRelationships.concat(relationships))
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
      for (const [name, type] of types) {
        existing.set(name, type)
      }
    } else {
      this.namespaces.set(namespace, types)
    }
  }
}

export class MutableValueRuntime extends MutableTypeRuntime {
  values: Map<string, Value> = new Map()
  thisValue: ClassInstanceValue | undefined

  constructor(
    readonly parent?: ValueRuntime,
    thisValue?: ClassInstanceValue | undefined,
  ) {
    super(parent)
    this.thisValue = thisValue
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
    const thisValue = this.getThisValue()
    if (!thisValue) {
      // During object creation, it is possible to reference properties on 'this'
      // before it is actually constructed.
      return this.getLocalValue(THIS_PREFIX + name)
    }

    return thisValue.propValue(name)
  }

  getThisValue(): ClassInstanceValue | undefined {
    // do not call 'parent.getThisValue()'. We don't want to accidentally leak
    // the value of 'this'. Pass runtime.getThisValue() to the
    // `MutableValueRuntime` constructor when appropriate.
    return this.thisValue
  }

  getViewValue(
    name: string,
  ): NamedViewValue | ViewClassDefinitionValue | ViewFormulaValue<Node> | undefined {
    const view = this.viewRuntime?.getViewValue(name)
    if (view) {
      return view
    }

    const local = this.getLocalValue(name)
    if (local instanceof ViewClassDefinitionValue || local instanceof ViewFormulaValue) {
      return local
    }
  }

  getPipeValue(): Value | undefined {
    return this.getLocalValue('#pipe')
  }

  addLocalValue(name: string, value: Value) {
    const id = this.addId(name)
    this.values.set(id, value)
  }

  addStateValue(name: string, value: Value) {
    this.addLocalValue(THIS_PREFIX + name, value)
  }

  setThisValue(value: ClassInstanceValue) {
    this.thisValue = value
  }

  setPipeValue(value: Value) {
    this.addLocalValue('#pipe', value)
  }
}
