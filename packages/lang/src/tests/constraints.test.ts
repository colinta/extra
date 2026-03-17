import * as Types from '../types'
import {generateConstraints, solveConstraints, type Constraint} from '../constraints'

function hint(typeVar: Types.GenericType, type: Types.Type): Constraint {
  return {kind: 'hint', typeVar, type}
}

function requirement(typeVar: Types.GenericType, type: Types.Type): Constraint {
  return {kind: 'requirement', typeVar, type}
}

describe('generateConstraints', () => {
  test('no generics → no constraints', () => {
    const generics = new Set<Types.GenericType>()
    const result = generateConstraints(Types.int(), Types.string(), generics)
    expect(result).toEqual([])
  })

  test('same type → no constraints', () => {
    const T = new Types.GenericType('T')
    const generics = new Set([T])
    const result = generateConstraints(Types.int(), Types.int(), generics)
    expect(result).toEqual([])
  })

  test('expected is generic → hint', () => {
    const T = new Types.GenericType('T')
    const generics = new Set([T])
    const result = generateConstraints(Types.int(), T, generics)
    expect(result).toEqual([hint(T, Types.int())])
  })

  test('provided is generic → requirement', () => {
    const T = new Types.GenericType('T')
    const generics = new Set([T])
    const result = generateConstraints(T, Types.int(), generics)
    expect(result).toEqual([requirement(T, Types.int())])
  })

  test('foreign generic (not in set) → no constraints', () => {
    const T = new Types.GenericType('T')
    const U = new Types.GenericType('U')
    const generics = new Set([T])
    const result = generateConstraints(Types.int(), U, generics)
    expect(result).toEqual([])
  })

  test('ArrayType: generic element type', () => {
    const T = new Types.GenericType('T')
    const generics = new Set([T])
    const provided = new Types.ArrayType(Types.int())
    const expected = new Types.ArrayType(T)
    const result = generateConstraints(provided, expected, generics)
    expect(result).toEqual([hint(T, Types.int())])
  })

  test('DictType: generic element type', () => {
    const T = new Types.GenericType('T')
    const generics = new Set([T])
    const provided = new Types.DictType(Types.string())
    const expected = new Types.DictType(T)
    const result = generateConstraints(provided, expected, generics)
    expect(result).toEqual([hint(T, Types.string())])
  })

  test('SetType: generic element type', () => {
    const T = new Types.GenericType('T')
    const generics = new Set([T])
    const provided = new Types.SetType(Types.int())
    const expected = new Types.SetType(T)
    const result = generateConstraints(provided, expected, generics)
    expect(result).toEqual([hint(T, Types.int())])
  })

  test('ObjectType: generic in named prop', () => {
    const T = new Types.GenericType('T')
    const generics = new Set([T])
    const provided = new Types.ObjectType([Types.namedProp('a', Types.int())])
    const expected = new Types.ObjectType([Types.namedProp('a', T)])
    const result = generateConstraints(provided, expected, generics)
    expect(result).toEqual([hint(T, Types.int())])
  })

  test('ObjectType: generic in positional prop', () => {
    const T = new Types.GenericType('T')
    const generics = new Set([T])
    const provided = new Types.ObjectType([Types.positionalProp(Types.int())])
    const expected = new Types.ObjectType([Types.positionalProp(T)])
    const result = generateConstraints(provided, expected, generics)
    expect(result).toEqual([hint(T, Types.int())])
  })

  test('OneOfType on expected side: only generic members generate constraints', () => {
    const T = new Types.GenericType('T')
    const generics = new Set([T])
    const provided = Types.int()
    const expected = Types.OneOfType.createOneOf([Types.string(), T])
    const result = generateConstraints(provided, expected, generics)
    expect(result).toEqual([hint(T, Types.int())])
  })

  test('OneOfType on provided side against generic: single hint with full type', () => {
    const T = new Types.GenericType('T')
    const generics = new Set([T])
    const provided = Types.OneOfType.createOneOf([Types.int(), Types.string()])
    const expected = T
    const result = generateConstraints(provided, expected, generics)
    // The whole OneOfType is the hint — we don't decompose it
    expect(result).toEqual([hint(T, provided)])
  })

  test('OneOfType on provided side against compound: each member generates constraints', () => {
    const T = new Types.GenericType('T')
    const generics = new Set([T])
    const provided = Types.OneOfType.createOneOf([
      new Types.ArrayType(Types.int()),
      new Types.ArrayType(Types.string()),
    ])
    const expected = new Types.ArrayType(T)
    const result = generateConstraints(provided, expected, generics)
    // Each member of the provided OneOfType recurses into Array matching
    expect(result).toEqual([hint(T, Types.int()), hint(T, Types.string())])
  })

  test('nested generics: Array(Array(T))', () => {
    const T = new Types.GenericType('T')
    const generics = new Set([T])
    const provided = new Types.ArrayType(new Types.ArrayType(Types.int()))
    const expected = new Types.ArrayType(new Types.ArrayType(T))
    const result = generateConstraints(provided, expected, generics)
    expect(result).toEqual([hint(T, Types.int())])
  })

  test('multiple generics: {a: T, b: U}', () => {
    const T = new Types.GenericType('T')
    const U = new Types.GenericType('U')
    const generics = new Set([T, U])
    const provided = new Types.ObjectType([
      Types.namedProp('a', Types.int()),
      Types.namedProp('b', Types.string()),
    ])
    const expected = new Types.ObjectType([Types.namedProp('a', T), Types.namedProp('b', U)])
    const result = generateConstraints(provided, expected, generics)
    expect(result).toEqual([hint(T, Types.int()), hint(U, Types.string())])
  })

  test('NamedEnumInstanceType: generic in case args', () => {
    const T = new Types.GenericType('T')
    const generics = new Set([T])
    const defType = new Types.NamedEnumDefinitionType('Result', new Map(), new Map(), [T])
    const providedMember = new Types.EnumCase('val', [Types.positionalProp(Types.int())])
    const expectedMember = new Types.EnumCase('val', [Types.positionalProp(T)])
    const provided = new Types.NamedEnumInstanceType(defType, providedMember)
    const expected = new Types.NamedEnumInstanceType(defType, expectedMember)
    const result = generateConstraints(provided, expected, generics)
    expect(result).toEqual([hint(T, Types.int())])
  })

  test('NamedEnumInstanceType: different case names → no constraints', () => {
    const T = new Types.GenericType('T')
    const generics = new Set([T])
    const defType = new Types.NamedEnumDefinitionType('Result', new Map(), new Map(), [T])
    const providedMember = new Types.EnumCase('ok', [Types.positionalProp(Types.int())])
    const expectedMember = new Types.EnumCase('err', [Types.positionalProp(T)])
    const provided = new Types.NamedEnumInstanceType(defType, providedMember)
    const expected = new Types.NamedEnumInstanceType(defType, expectedMember)
    const result = generateConstraints(provided, expected, generics)
    expect(result).toEqual([])
  })

  test('FormulaType: return type generates hint', () => {
    const T = new Types.GenericType('T')
    const generics = new Set([T])
    const provided = new Types.FormulaType(Types.int(), [], [])
    const expected = new Types.FormulaType(T, [], [])
    const result = generateConstraints(provided, expected, generics)
    expect(result).toEqual([hint(T, Types.int())])
  })

  test('FormulaType: args are contravariant (direction flips)', () => {
    const T = new Types.GenericType('T')
    const generics = new Set([T])
    // provided: fn(a: Int): String
    // expected: fn(a: T): String
    // T appears in expected's args → when we flip for contravariance,
    // expected.arg.type (T) becomes "provided" and provided.arg.type (Int) becomes "expected"
    // → this generates a hint for T (T is on the "provided" side after flip)
    // Wait, no: after flip, _generate(expectedArg.type, providedArg.type) → _generate(T, Int)
    // T is in "provided" position → requirement(T, Int)
    const provided = new Types.FormulaType(
      Types.string(),
      [Types.positionalArgument({name: 'a', type: Types.int(), isRequired: true})],
      [],
    )
    const expected = new Types.FormulaType(
      Types.string(),
      [Types.positionalArgument({name: 'a', type: T, isRequired: true})],
      [],
    )
    const result = generateConstraints(provided, expected, generics)
    // Contravariant: T in arg position generates a requirement
    expect(result).toEqual([requirement(T, Types.int())])
  })

  test('incompatible types → no constraints', () => {
    const T = new Types.GenericType('T')
    const generics = new Set([T])
    // Array vs Dict — structural mismatch, no recursion
    const result = generateConstraints(
      new Types.ArrayType(Types.int()),
      new Types.DictType(T),
      generics,
    )
    expect(result).toEqual([])
  })
})

describe('solveConstraints', () => {
  test('no constraints → substitution without binding for T', () => {
    const T = new Types.GenericType('T')
    const result = solveConstraints([], [T])
    expect(result.isOk()).toBe(true)
    // T has no constraints — remains unbound
    const subst = result.get()
    expect(subst.has(T)).toBe(false)
  })

  test('single hint → resolves to hint type', () => {
    const T = new Types.GenericType('T')
    const constraints: Constraint[] = [hint(T, Types.int())]
    const result = solveConstraints(constraints, [T])
    expect(result.isOk()).toBe(true)
    expect(result.get().get(T)).toBe(Types.int())
  })

  test('single requirement → resolves to requirement type', () => {
    const T = new Types.GenericType('T')
    const constraints: Constraint[] = [requirement(T, Types.string())]
    const result = solveConstraints(constraints, [T])
    expect(result.isOk()).toBe(true)
    expect(result.get().get(T)).toBe(Types.string())
  })

  test('multiple same-family hints → widens to union', () => {
    const T = new Types.GenericType('T')
    const constraints: Constraint[] = [hint(T, Types.literal(1)), hint(T, Types.literal(2))]
    const result = solveConstraints(constraints, [T])
    expect(result.isOk()).toBe(true)
    const resolved = result.get().get(T)!
    expect(resolved).toBeInstanceOf(Types.OneOfType)
  })

  test('multiple cross-family hints → error', () => {
    const T = new Types.GenericType('T')
    const constraints: Constraint[] = [hint(T, Types.int()), hint(T, Types.string())]
    const result = solveConstraints(constraints, [T])
    // Int and String are different families — unification rejects this
    expect(result.isErr()).toBe(true)
  })

  test('multiple generics resolved independently', () => {
    const T = new Types.GenericType('T')
    const U = new Types.GenericType('U')
    const constraints: Constraint[] = [hint(T, Types.int()), hint(U, Types.string())]
    const result = solveConstraints(constraints, [T, U])
    expect(result.isOk()).toBe(true)
    expect(result.get().get(T)).toBe(Types.int())
    expect(result.get().get(U)).toBe(Types.string())
  })

  test('generic with explicit resolvedType validates hints', () => {
    const T = new Types.GenericType('T', Types.int())
    const constraints: Constraint[] = [hint(T, Types.literal(5))]
    const result = solveConstraints(constraints, [T])
    expect(result.isOk()).toBe(true)
    // resolvedType is Int, literal 5 is assignable to Int
    expect(result.get().get(T)).toBe(Types.int())
  })

  test('generic with explicit resolvedType rejects incompatible hint', () => {
    const T = new Types.GenericType('T', Types.int())
    const constraints: Constraint[] = [hint(T, Types.string())]
    const result = solveConstraints(constraints, [T])
    expect(result.isErr()).toBe(true)
  })

  test('chain resolution: T → U → Int', () => {
    const T = new Types.GenericType('T')
    const U = new Types.GenericType('U')
    const constraints: Constraint[] = [hint(T, U), hint(U, Types.int())]
    const result = solveConstraints(constraints, [T, U])
    expect(result.isOk()).toBe(true)
    expect(result.get().get(U)).toBe(Types.int())
    // T resolved to U, then chain-resolved to Int
    expect(result.get().get(T)).toBe(Types.int())
  })

  test('hint and requirement: subtype widens to more general type', () => {
    const T = new Types.GenericType('T')
    const constraints: Constraint[] = [hint(T, Types.literal(1)), requirement(T, Types.int())]
    const result = solveConstraints(constraints, [T])
    expect(result.isOk()).toBe(true)
    // oneOf([1, Int]) should simplify (Int subsumes literal 1)
    const resolved = result.get().get(T)!
    expect(resolved).toBe(Types.int())
  })
})
