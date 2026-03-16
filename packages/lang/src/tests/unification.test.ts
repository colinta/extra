import {describe, expect, test} from 'bun:test'
import * as Types from '../types'
import {unify, occursIn} from '../unification'

describe('occursIn', () => {
  test('generic occurs in itself', () => {
    const T = new Types.GenericType('T')
    expect(occursIn(T, T)).toBe(true)
  })

  test('generic does not occur in a different generic', () => {
    const T = new Types.GenericType('T')
    const U = new Types.GenericType('U')
    expect(occursIn(T, U)).toBe(false)
  })

  test('generic does not occur in a base type', () => {
    const T = new Types.GenericType('T')
    expect(occursIn(T, Types.int())).toBe(false)
  })

  test('generic occurs in ArrayType', () => {
    const T = new Types.GenericType('T')
    expect(occursIn(T, new Types.ArrayType(T))).toBe(true)
  })

  test('generic occurs in nested ArrayType', () => {
    const T = new Types.GenericType('T')
    expect(occursIn(T, new Types.ArrayType(new Types.ArrayType(T)))).toBe(true)
  })

  test('generic does not occur in ArrayType of different generic', () => {
    const T = new Types.GenericType('T')
    const U = new Types.GenericType('U')
    expect(occursIn(T, new Types.ArrayType(U))).toBe(false)
  })

  test('generic occurs in OneOfType', () => {
    const T = new Types.GenericType('T')
    const oneOf = Types.OneOfType.createOneOf([Types.int(), T])
    expect(occursIn(T, oneOf)).toBe(true)
  })

  test('generic occurs in ObjectType prop', () => {
    const T = new Types.GenericType('T')
    const obj = new Types.ObjectType([Types.namedProp('a', T)])
    expect(occursIn(T, obj)).toBe(true)
  })

  test('generic occurs in FormulaType arg', () => {
    const T = new Types.GenericType('T')
    const formula = new Types.FormulaType(
      Types.int(),
      [Types.positionalArgument({name: 'a', type: T, isRequired: true})],
      [],
    )
    expect(occursIn(T, formula)).toBe(true)
  })

  test('generic occurs in FormulaType return type', () => {
    const T = new Types.GenericType('T')
    const formula = new Types.FormulaType(T, [], [])
    expect(occursIn(T, formula)).toBe(true)
  })
})

describe('unify', () => {
  test('identical types → empty substitution', () => {
    const generics = new Set<Types.GenericType>()
    const result = unify(Types.int(), Types.int(), generics)
    expect(result.isOk()).toBe(true)
    expect(result.get().size).toBe(0)
  })

  test('generic vs concrete → binds generic', () => {
    const T = new Types.GenericType('T')
    const generics = new Set([T])
    const result = unify(T, Types.int(), generics)
    expect(result.isOk()).toBe(true)
    expect(result.get().get(T)).toBe(Types.int())
  })

  test('concrete vs generic → binds generic', () => {
    const T = new Types.GenericType('T')
    const generics = new Set([T])
    const result = unify(Types.int(), T, generics)
    expect(result.isOk()).toBe(true)
    expect(result.get().get(T)).toBe(Types.int())
  })

  test('generic vs generic (both in set) → binds first to second', () => {
    const T = new Types.GenericType('T')
    const U = new Types.GenericType('U')
    const generics = new Set([T, U])
    const result = unify(T, U, generics)
    expect(result.isOk()).toBe(true)
    // T is bound to U (or U to T — either is valid)
    const subst = result.get()
    expect(subst.size).toBe(1)
  })

  test('subtype relationship: literal assignable to meta → compatible', () => {
    const T = new Types.GenericType('T')
    const generics = new Set([T])
    // First bind T to literal 5
    const r1 = unify(T, Types.literal(5), generics)
    expect(r1.isOk()).toBe(true)
    // Then unify T (now bound to 5) with Int — 5 is assignable to Int
    const r2 = unify(T, Types.int(), generics, r1.get())
    expect(r2.isOk()).toBe(true)
  })

  test('subtype relationship: Int assignable to Float → compatible', () => {
    const T = new Types.GenericType('T')
    const generics = new Set([T])
    const r1 = unify(T, Types.int(), generics)
    expect(r1.isOk()).toBe(true)
    const r2 = unify(T, Types.float(), generics, r1.get())
    expect(r2.isOk()).toBe(true)
  })

  test('incompatible types → error', () => {
    const generics = new Set<Types.GenericType>()
    const result = unify(Types.int(), Types.string(), generics)
    expect(result.isErr()).toBe(true)
  })

  test('occurs check: T = Array(T) → error', () => {
    const T = new Types.GenericType('T')
    const generics = new Set([T])
    const result = unify(T, new Types.ArrayType(T), generics)
    expect(result.isErr()).toBe(true)
    expect(result.error).toContain('Infinite type')
  })

  test('Array(T) vs Array(Int) → binds T to Int', () => {
    const T = new Types.GenericType('T')
    const generics = new Set([T])
    const result = unify(
      new Types.ArrayType(T),
      new Types.ArrayType(Types.int()),
      generics,
    )
    expect(result.isOk()).toBe(true)
    expect(result.get().get(T)).toBe(Types.int())
  })

  test('Object {a: T} vs {a: Int} → binds T to Int', () => {
    const T = new Types.GenericType('T')
    const generics = new Set([T])
    const result = unify(
      new Types.ObjectType([Types.namedProp('a', T)]),
      new Types.ObjectType([Types.namedProp('a', Types.int())]),
      generics,
    )
    expect(result.isOk()).toBe(true)
    expect(result.get().get(T)).toBe(Types.int())
  })

  test('consistent bindings: T=Int twice → ok', () => {
    const T = new Types.GenericType('T')
    const generics = new Set([T])
    const r1 = unify(T, Types.int(), generics)
    expect(r1.isOk()).toBe(true)
    const r2 = unify(T, Types.int(), generics, r1.get())
    expect(r2.isOk()).toBe(true)
    expect(r2.get().get(T)).toBe(Types.int())
  })

  test('inconsistent bindings: T=Int then T=String → error', () => {
    const T = new Types.GenericType('T')
    const generics = new Set([T])
    const r1 = unify(T, Types.int(), generics)
    expect(r1.isOk()).toBe(true)
    const r2 = unify(T, Types.string(), generics, r1.get())
    expect(r2.isErr()).toBe(true)
  })

  test('same-family widening: two int literals unify', () => {
    const generics = new Set<Types.GenericType>()
    const result = unify(Types.literal(1), Types.literal(2), generics)
    expect(result.isOk()).toBe(true)
  })

  test('same-family widening: two string literals unify', () => {
    const generics = new Set<Types.GenericType>()
    const result = unify(Types.literal('a'), Types.literal('b'), generics)
    expect(result.isOk()).toBe(true)
  })

  test('cross-family: int literal + string literal fails', () => {
    const generics = new Set<Types.GenericType>()
    const result = unify(Types.literal(1), Types.literal('a'), generics)
    expect(result.isErr()).toBe(true)
  })

  test('same-family widening through generic: T=1 then T=2 → T = 1|2', () => {
    const T = new Types.GenericType('T')
    const generics = new Set([T])
    const r1 = unify(T, Types.literal(1), generics)
    expect(r1.isOk()).toBe(true)
    const r2 = unify(T, Types.literal(2), generics, r1.get())
    expect(r2.isOk()).toBe(true)
    const resolved = r2.get().get(T)!
    expect(resolved).toBeInstanceOf(Types.OneOfType)
    expect(resolved.toCode()).toEqual('1 | 2')
  })

  test('same-family widening: Array(1) + Array(2) → Array(1|2)', () => {
    const T = new Types.GenericType('T')
    const generics = new Set([T])
    const r1 = unify(T, new Types.ArrayType(Types.literal(1)), generics)
    expect(r1.isOk()).toBe(true)
    const r2 = unify(T, new Types.ArrayType(Types.literal(2)), generics, r1.get())
    expect(r2.isOk()).toBe(true)
    const resolved = r2.get().get(T)!
    expect(resolved).toBeInstanceOf(Types.ArrayType)
    const arr = resolved as Types.ArrayType
    expect(arr.of).toBeInstanceOf(Types.OneOfType)
  })

  test('cross-family through generic: T=Int then T=String fails', () => {
    const T = new Types.GenericType('T')
    const generics = new Set([T])
    const r1 = unify(T, Types.int(), generics)
    expect(r1.isOk()).toBe(true)
    const r2 = unify(T, Types.string(), generics, r1.get())
    expect(r2.isErr()).toBe(true)
  })

  test('foreign generic (not in set) treated as concrete', () => {
    const T = new Types.GenericType('T')
    const U = new Types.GenericType('U')
    const generics = new Set([T])
    // U is not in generics — treated as opaque
    const result = unify(T, U, generics)
    expect(result.isOk()).toBe(true)
    expect(result.get().get(T)).toBe(U)
  })
})
