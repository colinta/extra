import {describe, expect, test} from 'bun:test'
import * as Types from '../types'
import {applySubst, TypeScheme, type Substitution} from '../types'

describe('applySubst', () => {
  test('base types are unchanged', () => {
    const subst: Substitution = new Map()
    expect(applySubst(subst, Types.int())).toEqual(Types.int())
    expect(applySubst(subst, Types.int({min: 1}))).toEqual(Types.int({min: 1}))
    expect(applySubst(subst, Types.literal(1))).toEqual(Types.literal(1))
    expect(applySubst(subst, Types.float())).toEqual(Types.float())
    expect(applySubst(subst, Types.float({max: 10}))).toEqual(Types.float({max: 10}))
    expect(applySubst(subst, Types.string())).toEqual(Types.string())
    expect(applySubst(subst, Types.string({min: 1}))).toEqual(Types.string({min: 1}))
    expect(applySubst(subst, Types.booleanType())).toEqual(Types.booleanType())
    expect(applySubst(subst, Types.nullType())).toEqual(Types.nullType())
  })

  test('generic type is substituted', () => {
    const T = new Types.GenericType('T')
    const subst: Substitution = new Map([[T, Types.int()]])
    expect(applySubst(subst, T)).toEqual(Types.int())
  })

  test('generic type not in substitution is left as-is (foreign generic)', () => {
    const T = new Types.GenericType('T')
    const U = new Types.GenericType('U')
    const subst: Substitution = new Map([[T, Types.int()]])
    expect(applySubst(subst, U)).toEqual(U)
  })

  test('ArrayType with generic element', () => {
    const T = new Types.GenericType('T')
    const subst: Substitution = new Map([[T, Types.string()]])
    const arrT = Types.array(T)
    const result = applySubst(subst, arrT)
    expect(result).toBeInstanceOf(Types.ArrayType)
    expect((result as Types.ArrayType).of).toEqual(Types.string())
  })

  test('ArrayType without generics is returned as-is', () => {
    const T = new Types.GenericType('T')
    const subst: Substitution = new Map([[T, Types.int()]])
    const arrStr = Types.array(Types.string())
    expect(applySubst(subst, arrStr)).toEqual(arrStr)
  })

  test('DictType with generic element', () => {
    const T = new Types.GenericType('T')
    const subst: Substitution = new Map([[T, Types.float()]])
    const dictT = Types.dict(T)
    const result = applySubst(subst, dictT)
    expect(result).toBeInstanceOf(Types.DictType)
    expect((result as Types.DictType).of).toEqual(Types.float())
  })

  test('SetType with generic element', () => {
    const T = new Types.GenericType('T')
    const subst: Substitution = new Map([[T, Types.int()]])
    const setT = Types.set(T)
    const result = applySubst(subst, setT)
    expect(result).toBeInstanceOf(Types.SetType)
    expect((result as Types.SetType).of).toEqual(Types.int())
  })

  test('OneOfType with generic member', () => {
    const T = new Types.GenericType('T')
    const subst: Substitution = new Map([[T, Types.string()]])
    const oneOfT = Types.oneOf([T, Types.int()])
    const result = applySubst(subst, oneOfT)
    // String | Int — order may vary depending on OneOfType.createOneOf
    expect(result).toBeInstanceOf(Types.OneOfType)
    const members = (result as Types.OneOfType).of
    expect(members).toContain(Types.string())
    expect(members).toContain(Types.int())
  })

  test('OneOfType without generics is returned as-is', () => {
    const T = new Types.GenericType('T')
    const subst: Substitution = new Map([[T, Types.int()]])
    const oneOf = Types.oneOf([Types.string(), Types.float()])
    expect(applySubst(subst, oneOf)).toEqual(oneOf)
  })

  test('ObjectType with generic property', () => {
    const T = new Types.GenericType('T')
    const subst: Substitution = new Map([[T, Types.int()]])
    const obj = Types.object([Types.namedProp('value', T)])
    const result = applySubst(subst, obj)
    expect(result).toBeInstanceOf(Types.ObjectType)
    expect((result as Types.ObjectType).namedProp('value')).toEqual(Types.int())
  })

  test('ObjectType with positional generic property', () => {
    const T = new Types.GenericType('T')
    const subst: Substitution = new Map([[T, Types.string()]])
    const obj = Types.object([Types.positionalProp(T)])
    const result = applySubst(subst, obj)
    expect(result).toBeInstanceOf(Types.ObjectType)
    expect((result as Types.ObjectType).positionalProp(0)).toEqual(Types.string())
  })

  test('ObjectType without generics is returned as-is', () => {
    const T = new Types.GenericType('T')
    const subst: Substitution = new Map([[T, Types.int()]])
    const obj = Types.object([Types.namedProp('x', Types.float())])
    expect(applySubst(subst, obj)).toEqual(obj)
  })

  test('nested generics: Array(Array(T))', () => {
    const T = new Types.GenericType('T')
    const subst: Substitution = new Map([[T, Types.int()]])
    const nested = Types.array(Types.array(T))
    const result = applySubst(subst, nested)
    expect(result).toBeInstanceOf(Types.ArrayType)
    const inner = (result as Types.ArrayType).of
    expect(inner).toBeInstanceOf(Types.ArrayType)
    expect((inner as Types.ArrayType).of).toEqual(Types.int())
  })

  test('NamedEnumInstanceType with generic args', () => {
    const T = new Types.GenericType('T')
    const member = Types.enumCase('Some', [Types.positionalProp(T)])
    const def = Types.namedEnumDefinition({
      name: 'Option',
      members: [member],
      genericTypes: [T],
    })
    const instance = def.instanceTypes[0]

    const subst: Substitution = new Map([[T, Types.string()]])
    const result = applySubst(subst, instance)
    expect(result).toBeInstanceOf(Types.NamedEnumInstanceType)
    const resultEnum = result as Types.NamedEnumInstanceType
    expect(resultEnum.member.args[0].type).toEqual(Types.string())
    // metaType should be preserved
    expect(resultEnum.metaType).toEqual(def)
  })

  test('AnonymousEnumType with generic args', () => {
    const T = new Types.GenericType('T')
    const member = Types.enumCase('Foo', [Types.positionalProp(T)])
    const anon = new Types.AnonymousEnumType(member)

    const subst: Substitution = new Map([[T, Types.int()]])
    const result = applySubst(subst, anon)
    expect(result).toBeInstanceOf(Types.AnonymousEnumType)
    const resultEnum = result as Types.AnonymousEnumType
    expect(resultEnum.member.args[0].type).toEqual(Types.int())
  })

  test('AnonymousEnumType without generics is returned as-is', () => {
    const member = Types.enumCase('Bar', [Types.positionalProp(Types.int())])
    const anon = new Types.AnonymousEnumType(member)
    const T = new Types.GenericType('T')
    const subst: Substitution = new Map([[T, Types.string()]])
    expect(applySubst(subst, anon)).toEqual(anon)
  })

  test('FormulaType with generic args and return type', () => {
    const T = new Types.GenericType('T')
    const subst: Substitution = new Map([[T, Types.int()]])
    const fn = Types.formula(
      [Types.positionalArgument({name: '# x', type: T, isRequired: true})],
      T,
      [T],
    )
    const result = applySubst(subst, fn)
    expect(result).toBeInstanceOf(Types.FormulaType)
    const resultFn = result as Types.FormulaType
    expect(resultFn.returnType).toEqual(Types.int())
    expect(resultFn.args[0].type).toEqual(Types.int())
  })

  test('FormulaType without generics is returned as-is', () => {
    const T = new Types.GenericType('T')
    const subst: Substitution = new Map([[T, Types.int()]])
    const fn = Types.formula(
      [Types.positionalArgument({name: '# x', type: Types.string(), isRequired: true})],
      Types.float(),
    )
    expect(applySubst(subst, fn)).toEqual(fn)
  })

  test('ClassInstanceType with generic properties', () => {
    const T = new Types.GenericType('T')
    const cls = Types.classType({
      name: 'Box',
      props: new Map([['value', T as Types.Type]]),
    })
    const subst: Substitution = new Map([[T, Types.string()]])
    const result = applySubst(subst, cls)
    expect(result).toBeInstanceOf(Types.ClassInstanceType)
    const resultCls = result as Types.ClassInstanceType
    expect(resultCls.myProps.get('value')).toEqual(Types.string())
    expect(resultCls.name).toEqual('Box')
  })

  test('ClassInstanceType without generics is returned as-is', () => {
    const cls = Types.classType({
      name: 'Point',
      props: new Map([['x', Types.int() as Types.Type], ['y', Types.int() as Types.Type]]),
    })
    const T = new Types.GenericType('T')
    const subst: Substitution = new Map([[T, Types.string()]])
    expect(applySubst(subst, cls)).toEqual(cls)
  })

  test('empty substitution returns same type', () => {
    const subst: Substitution = new Map()
    const arr = Types.array(Types.int())
    expect(applySubst(subst, arr)).toEqual(arr)
  })

  test('multiple generics substituted simultaneously', () => {
    const T = new Types.GenericType('T')
    const U = new Types.GenericType('U')
    const subst: Substitution = new Map<Types.GenericType, Types.Type>([
      [T, Types.int()],
      [U, Types.string()],
    ])
    const obj = Types.object([
      Types.namedProp('first', T),
      Types.namedProp('second', U),
    ])
    const result = applySubst(subst, obj) as Types.ObjectType
    expect(result.namedProp('first')).toEqual(Types.int())
    expect(result.namedProp('second')).toEqual(Types.string())
  })

  test('substitution with generic mapping to another generic', () => {
    const T = new Types.GenericType('T')
    const U = new Types.GenericType('U')
    const subst: Substitution = new Map([[T, U]])
    const arr = Types.array(T)
    const result = applySubst(subst, arr)
    expect(result).toBeInstanceOf(Types.ArrayType)
    expect((result as Types.ArrayType).of).toEqual(U)
  })

  test('deeply nested: Object with Array of Dict of T', () => {
    const T = new Types.GenericType('T')
    const subst: Substitution = new Map([[T, Types.float()]])
    const deep = Types.object([
      Types.namedProp('data', Types.array(Types.dict(T))),
    ])
    const result = applySubst(subst, deep) as Types.ObjectType
    const data = result.namedProp('data') as Types.ArrayType
    const inner = data.of as Types.DictType
    expect(inner.of).toEqual(Types.float())
  })
})

describe('TypeScheme', () => {
  test('instantiate with no type params returns body as-is', () => {
    const scheme = new TypeScheme([], Types.int())
    const {type, freshVars} = scheme.instantiate()
    expect(type).toEqual(Types.int())
    expect(freshVars.size).toEqual(0)
  })

  test('instantiate creates fresh generics', () => {
    const T = new Types.GenericType('T')
    const body = new Types.ArrayType(T)
    const scheme = new TypeScheme([T], body)

    const {type, freshVars} = scheme.instantiate()
    expect(freshVars.size).toEqual(1)

    const freshT = freshVars.get(T)!
    expect(freshT).toBeDefined()
    expect(freshT).toEqual(T) // same values
    expect(freshT).not.toBe(T) // different identity
    expect(freshT.name).toEqual('T') // same name

    // The body should use the fresh generic
    expect(type).toBeInstanceOf(Types.ArrayType)
    expect((type as Types.ArrayType).of).toEqual(freshT)
  })

  test('multiple instantiations produce independent fresh vars', () => {
    const T = new Types.GenericType('T')
    const scheme = new TypeScheme([T], T)

    const inst1 = scheme.instantiate()
    const inst2 = scheme.instantiate()

    const freshT1 = inst1.freshVars.get(T)!
    const freshT2 = inst2.freshVars.get(T)!

    expect(freshT1).toEqual(freshT2) // independent
    expect(freshT1).toEqual(T) // both different from original
    expect(freshT1).not.toBe(freshT2) // independent
    expect(freshT1).not.toBe(T) // both different from original
  })

  test('instantiate substitutes through compound types', () => {
    const T = new Types.GenericType('T')
    const U = new Types.GenericType('U')
    const body = new Types.FormulaType(
      U,
      [Types.positionalArgument({name: 'a', type: T, isRequired: true})],
      [T, U],
    )
    const scheme = new TypeScheme([T, U], body)

    const {type, freshVars} = scheme.instantiate()
    expect(freshVars.size).toEqual(2)

    const formula = type as Types.FormulaType
    expect(formula.returnType).toEqual(freshVars.get(U)!)
    expect(formula.args[0].type).toEqual(freshVars.get(T)!)
  })

  test('instantiate preserves resolvedType on fresh generics', () => {
    const T = new Types.GenericType('T', Types.int())
    const scheme = new TypeScheme([T], T)

    const {freshVars} = scheme.instantiate()
    const freshT = freshVars.get(T)!
    expect(freshT.resolvedType).toEqual(Types.int())
  })
})
