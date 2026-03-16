/**
 * Unification with subtyping and occurs check.
 *
 * Unlike pure equality-based unification (Haskell-style), this handles the
 * language's subtype relationships: Int <: Float, literal types <: meta types,
 * etc. Two types unify if one is assignable to the other, producing the
 * more general type as the result.
 *
 * The occurs check prevents infinite types like T = Array(T).
 */
import {ok, err, type Result} from '@extra-lang/result'
import {
  type Type,
  GenericType,
  ArrayType,
  DictType,
  SetType,
  ObjectType,
  OneOfType,
  FormulaType,
  NamedEnumInstanceType,
  AnonymousEnumType,
  ClassInstanceType,
  canBeAssignedTo,
} from './types'
import type {Substitution} from './types'

/**
 * Check whether a generic type variable occurs (directly or nested) in a type.
 * Used to prevent infinite types like T = Array(T).
 */
export function occursIn(typeVar: GenericType, type: Type): boolean {
  if (type instanceof GenericType) {
    return type === typeVar
  }

  if (!type.hasGeneric()) {
    return false
  }

  if (type instanceof ArrayType || type instanceof DictType || type instanceof SetType) {
    return occursIn(typeVar, type.of)
  }

  if (type instanceof OneOfType) {
    return type.of.some(member => occursIn(typeVar, member))
  }

  if (type instanceof ObjectType) {
    return type.props.some(prop => occursIn(typeVar, prop.type))
  }

  if (type instanceof FormulaType) {
    if (occursIn(typeVar, type.returnType)) return true
    return type.args.some(arg => occursIn(typeVar, arg.type))
  }

  if (type instanceof NamedEnumInstanceType || type instanceof AnonymousEnumType) {
    return type.member.args.some(arg => occursIn(typeVar, arg.type))
  }

  if (type instanceof ClassInstanceType) {
    for (const propType of type.myProps.values()) {
      if (occursIn(typeVar, propType)) return true
    }
    if (type.parent && occursIn(typeVar, type.parent)) return true
    return false
  }

  return false
}

/**
 * Unify two types, producing a substitution that makes them compatible.
 *
 * Uses subtype-aware unification:
 * - If a is assignable to b, the result is b (the more general type)
 * - If b is assignable to a, the result is a
 * - For generics in the `generics` set, extends the substitution
 * - For compound types, recurses structurally
 * - Includes occurs check to prevent infinite types
 *
 * Returns Ok(substitution) on success, Err(message) on failure.
 */
export function unify(
  a: Type,
  b: Type,
  generics: Set<GenericType>,
  subst: Substitution = new Map(),
): Result<Substitution, string> {
  // Identical types — nothing to do
  if (a === b) {
    return ok(subst)
  }

  // Generic on the left — bind it (bindVar handles existing bindings)
  if (a instanceof GenericType && generics.has(a)) {
    return bindVar(a, walkSubst(b, subst), generics, subst)
  }

  // Generic on the right — bind it
  if (b instanceof GenericType && generics.has(b)) {
    return bindVar(b, walkSubst(a, subst), generics, subst)
  }

  // Walk substitution for non-generic compound types
  a = walkSubst(a, subst)
  b = walkSubst(b, subst)

  if (a === b) {
    return ok(subst)
  }

  // Structural unification for compound types
  if (a instanceof ArrayType && b instanceof ArrayType) {
    return unify(a.of, b.of, generics, subst)
  }

  if (a instanceof DictType && b instanceof DictType) {
    return unify(a.of, b.of, generics, subst)
  }

  if (a instanceof SetType && b instanceof SetType) {
    return unify(a.of, b.of, generics, subst)
  }

  if (a instanceof ObjectType && b instanceof ObjectType) {
    return unifyObjects(a, b, generics, subst)
  }

  if (a instanceof FormulaType && b instanceof FormulaType) {
    return unifyFormulas(a, b, generics, subst)
  }

  if (
    a instanceof NamedEnumInstanceType && b instanceof NamedEnumInstanceType &&
    a.metaType === b.metaType && a.member.name === b.member.name
  ) {
    return unifyEnumArgs(a.member.args, b.member.args, generics, subst)
  }

  if (
    a instanceof AnonymousEnumType && b instanceof AnonymousEnumType &&
    a.metaType === b.metaType && a.member.name === b.member.name
  ) {
    return unifyEnumArgs(a.member.args, b.member.args, generics, subst)
  }

  // Subtype check — if one is assignable to the other, they're compatible
  // (the more general type "wins")
  if (canBeAssignedTo(a, b)) {
    return ok(subst)
  }

  if (canBeAssignedTo(b, a)) {
    return ok(subst)
  }

  // Same-family widening — types in the same family (both int, both string,
  // etc.) can combine into a union rather than failing. This handles cases
  // like fn<T>(a: T, b: T) called as f(1, 2) → T = 1 | 2.
  // This is NOT attempted for cross-family types (Int + String → error).
  if (sameFamily(a, b)) {
    return ok(subst)
  }

  return err(
    `Type '${a.toCode()}' is not compatible with '${b.toCode()}'.`,
  )
}

/**
 * Bind a type variable to a type, with occurs check.
 */
function bindVar(
  typeVar: GenericType,
  type: Type,
  generics: Set<GenericType>,
  subst: Substitution,
): Result<Substitution, string> {
  // Already bound to the same thing
  if (type === typeVar) {
    return ok(subst)
  }

  // Occurs check — prevent T = Array(T) etc.
  if (occursIn(typeVar, type)) {
    return err(
      `Infinite type: '${typeVar.name}' occurs in '${type.toCode()}'.`,
    )
  }

  // If already bound, unify the existing binding with the new type
  const existing = subst.get(typeVar)
  if (existing !== undefined) {
    const result = unify(existing, type, generics, subst)
    if (result.isErr()) return result

    // Widen the binding if the new type is more general
    // (e.g. T was bound to literal(1), now unified with Int → widen to Int)
    if (canBeAssignedTo(existing, type) && !canBeAssignedTo(type, existing)) {
      subst.set(typeVar, type)
    } else if (sameFamily(existing, type)) {
      // Same-family widening: combine into a union
      // e.g. T was 1, now gets 2 → T = 1 | 2
      subst.set(typeVar, sameFamilyWiden(existing, type))
    }

    return result
  }

  // Bind the variable
  subst.set(typeVar, type)
  return ok(subst)
}

/**
 * Walk a type through the substitution: if it's a generic that's been
 * bound, return the bound type (recursively). Otherwise return as-is.
 */
function walkSubst(type: Type, subst: Substitution): Type {
  while (type instanceof GenericType && subst.has(type)) {
    type = subst.get(type)!
  }
  return type
}

/**
 * Returns the "type family" of a type for widening purposes, or undefined
 * if the type doesn't belong to a widenable family.
 *
 * Families:
 * - 'int': int literals, int ranges, meta Int
 * - 'float': float literals, float ranges, meta Float (NOT int — kept separate)
 * - 'string': string literals, meta String
 * - 'regex': regex types
 */
function typeFamily(type: Type): string | undefined {
  if (type instanceof OneOfType) {
    // A OneOf is same-family if all members are the same family
    const families = type.of.map(typeFamily)
    if (families.length > 0 && families.every(f => f === families[0])) {
      return families[0]
    }
    return undefined
  }

  // Use the `is` discriminator for precise family matching
  // (isFloat() would be too broad — it includes Int)
  switch (type.is) {
    case 'literal-int':
    case 'int':
      return 'int'
    case 'literal-float':
    case 'float':
      return 'float'
    case 'literal-string':
    case 'string':
      return 'string'
    case 'regex':
      return 'regex'
    default:
      return undefined
  }
}

/**
 * Check if two types are in the same widenable family.
 * Handles containers recursively: Array(1) and Array(2) are same-family
 * because their inner types (1 and 2) are same-family.
 */
function sameFamily(a: Type, b: Type): boolean {
  const famA = typeFamily(a)
  const famB = typeFamily(b)
  if (famA !== undefined && famA === famB) return true

  // Container types: recurse on inner type
  if (a instanceof ArrayType && b instanceof ArrayType) {
    return sameFamily(a.of, b.of)
  }
  if (a instanceof DictType && b instanceof DictType) {
    return sameFamily(a.of, b.of)
  }
  if (a instanceof SetType && b instanceof SetType) {
    return sameFamily(a.of, b.of)
  }

  return false
}

/**
 * Widen two same-family types into a combined type.
 * For scalar types: produces a OneOf union (e.g. 1 | 2).
 * For containers: recursively widens inner types (e.g. Array(1|2)).
 */
function sameFamilyWiden(a: Type, b: Type): Type {
  // Container types: widen inner types
  if (a instanceof ArrayType && b instanceof ArrayType) {
    return new ArrayType(sameFamilyWiden(a.of, b.of))
  }
  if (a instanceof DictType && b instanceof DictType) {
    return new DictType(sameFamilyWiden(a.of, b.of))
  }
  if (a instanceof SetType && b instanceof SetType) {
    return new SetType(sameFamilyWiden(a.of, b.of))
  }

  // Scalar types: combine into OneOf (createOneOf handles flattening
  // and simplification, e.g. OneOf([1|2, 3]) → 1|2|3)
  return OneOfType.createOneOf([a, b])
}

function unifyObjects(
  a: ObjectType,
  b: ObjectType,
  generics: Set<GenericType>,
  subst: Substitution,
): Result<Substitution, string> {
  // Unify matching props by name and position
  for (const bProp of b.props) {
    let aType: Type | undefined
    if (bProp.is === 'named') {
      aType = a.literalAccessType(bProp.name)
    } else {
      const idx = b.props.indexOf(bProp)
      aType = a.literalAccessType(idx)
    }
    if (aType) {
      const result = unify(aType, bProp.type, generics, subst)
      if (result.isErr()) return result
      subst = result.get()
    }
  }
  return ok(subst)
}

function unifyFormulas(
  a: FormulaType,
  b: FormulaType,
  generics: Set<GenericType>,
  subst: Substitution,
): Result<Substitution, string> {
  // Unify return types
  const retResult = unify(a.returnType, b.returnType, generics, subst)
  if (retResult.isErr()) return retResult
  subst = retResult.get()

  // Unify args by position (simplified — doesn't handle named/positional mismatch)
  const count = Math.min(a.args.length, b.args.length)
  for (let i = 0; i < count; i++) {
    const result = unify(a.args[i].type, b.args[i].type, generics, subst)
    if (result.isErr()) return result
    subst = result.get()
  }

  return ok(subst)
}

function unifyEnumArgs(
  aArgs: readonly {type: Type}[],
  bArgs: readonly {type: Type}[],
  generics: Set<GenericType>,
  subst: Substitution,
): Result<Substitution, string> {
  const count = Math.min(aArgs.length, bArgs.length)
  for (let i = 0; i < count; i++) {
    const result = unify(aArgs[i].type, bArgs[i].type, generics, subst)
    if (result.isErr()) return result
    subst = result.get()
  }
  return ok(subst)
}
