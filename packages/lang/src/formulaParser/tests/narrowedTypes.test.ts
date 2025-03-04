import {c, cases} from '@extra-lang/cases'
import * as Types from '../../types'
import {TypeRuntime} from '../../runtime'
import {parse} from '../'
import * as Values from '../../values'
import {mockTypeRuntime} from './mockTypeRuntime'
import {type TestingTypes} from '../operators'

let runtimeTypes: {[K in string]: [Types.Type, Values.Value]}

let typeRuntime: TypeRuntime

beforeEach(() => {
  runtimeTypes = {}
  typeRuntime = mockTypeRuntime(runtimeTypes)
})

describe('narrowed types', () => {
  it('(foo: String | Int) is Int => truthy: Int, falsey: String', () => {
    runtimeTypes['foo'] = [Types.oneOf([Types.string(), Types.int()]), Values.string('')]
    const expression = parse('foo is Int').get()
    const {truthy, falsey} = expression.narrowedTypes(typeRuntime).get()
    expect(truthy).toEqual(Types.int())
    expect(falsey).toEqual(Types.string())
  })

  it('(foo: String?) is String => truthy: String, falsey: null', () => {
    runtimeTypes['foo'] = [Types.optional(Types.string()), Values.string('')]
    const expression = parse('foo is String').get()
    const {truthy, falsey} = expression.narrowedTypes(typeRuntime).get()
    expect(truthy).toEqual(Types.string())
    expect(falsey).toEqual(Types.nullType())
  })

  it('(foo: Array(String | Int)) is Array(Int) => truthy: NeverType, falsey: Array(String | Int)', () => {
    runtimeTypes['foo'] = [
      Types.array(Types.oneOf([Types.string(), Types.int()])),
      Values.string(''),
    ]
    const expression = parse('foo is Array(Int)').get()
    const {truthy, falsey} = expression.narrowedTypes(typeRuntime).get()
    expect(truthy).toEqual(Types.array(Types.int()))
    expect(falsey).toEqual(Types.array(Types.oneOf([Types.string(), Types.int()])))
  })

  it('(foo: Array(String) | Array(Int)) is Array(Int) => truthy: Array(Int), falsey: Array(String)', () => {
    runtimeTypes['foo'] = [
      Types.oneOf([Types.array(Types.string()), Types.array(Types.int())]),
      Values.string(''),
    ]
    const expression = parse('foo is Array(Int)').get()
    const {truthy, falsey} = expression.narrowedTypes(typeRuntime).get()
    expect(truthy).toEqual(Types.array(Types.int()))
    expect(falsey).toEqual(Types.array(Types.string()))
  })

  cases<['foo', [Types.Type, Values.Value], string, Types.Type, Types.Type]>(
    c([
      'foo',
      [Types.int(), Values.int(0)],
      'foo >= 5',
      Types.int({min: 5, max: undefined}),
      Types.int({min: undefined, max: 4}),
    ]),
    c([
      'foo',
      [Types.string(), Values.string('')],
      'foo.length >= 10',
      Types.string({min: 10}),
      Types.string({max: 9}),
    ]),
    c([
      'foo',
      [Types.string(), Values.string('')],
      'foo.length > 10',
      Types.string({min: 11}),
      Types.string({max: 10}),
    ]),
    c([
      'foo',
      [Types.string(), Values.string('')],
      'foo.length == 10',
      Types.string({min: 10, max: 10}),
      Types.string(),
    ]),
    c([
      'foo',
      [Types.string(), Values.string('')],
      'foo.length < 10',
      Types.string({max: 9}),
      Types.string({min: 10}),
    ]),
    c([
      'foo',
      [Types.string(), Values.string('')],
      'foo.length <= 10',
      Types.string({max: 10}),
      Types.string({min: 11}),
    ]),
  ).run(([name, [type, value], formula, truthyType, falseyType], {only, skip}) => {
    describe(`${name} => ${formula}`, () => {
      beforeEach(() => {
        // throws without the type guard
        runtimeTypes[name] = [type, value]
      })

      it(`truthy: ${truthyType}`, () => {
        // returns false (foo is null) or Int (foo is String)
        const expression = parse(`(${formula}) and foo`).get()
        const andExpression = expression as TestingTypes.LogicalAndOperator
        const [lhsExpr, rhsExpr] = andExpression.args
        const lhsType = lhsExpr.getType(typeRuntime).get()
        const andType = andExpression.rhsType(typeRuntime, lhsType, lhsExpr, rhsExpr)
        expect(andType.get()).toEqual(truthyType)
      })

      it(`falsey: ${falseyType}`, () => {
        // returns false (foo is null) or Int (foo is String)
        const expression = parse(`(${formula}) or foo`).get()
        const orExpression = expression as TestingTypes.LogicalAndOperator
        const [lhsExpr, rhsExpr] = orExpression.args
        const lhsType = lhsExpr.getType(typeRuntime).get()
        const orType = orExpression.rhsType(typeRuntime, lhsType, lhsExpr, rhsExpr)
        expect(orType.get()).toEqual(falseyType)
      })
    })
  })

  it('foo: String? => foo is String and foo.length => false | Int', () => {
    // throws without the type guard
    runtimeTypes['foo'] = [Types.optional(Types.string()), Values.string('')]
    expect(() => parse('foo.length').get().getType(typeRuntime).get()).toThrow()

    // returns false (foo is null) or Int (foo is String)
    const expression = parse('foo is String and foo.length').get()
    const type = expression.getType(typeRuntime).get()
    expect(type).toEqual(Types.oneOf([Types.literal(false), Types.int()]))
  })

  it('foo: {bar: String | Int} => foo.bar is String and foo.bar.length => false | Int', () => {
    runtimeTypes['foo'] = [
      Types.object([Types.namedProp('bar', Types.oneOf([Types.string(), Types.int()]))]),
      Values.string(''),
    ]
    expect(() => parse('foo.bar.length').get().getType(typeRuntime).get()).toThrow()

    const expression = parse('foo.bar is String and foo.bar.length').get()
    const type = expression.getType(typeRuntime).get()
    expect(type).toEqual(Types.oneOf([Types.literal(false), Types.int()]))
  })

  it('foo: {bar: {baz: String | Int}} => foo.bar.baz is String and foo.bar.baz.length => false | Int', () => {
    runtimeTypes['foo'] = [
      Types.object([
        Types.namedProp(
          'bar',
          Types.object([Types.namedProp('baz', Types.oneOf([Types.string(), Types.int()]))]),
        ),
      ]),
      Values.string(''),
    ]
    expect(() => parse('foo.bar.baz.length').get().getType(typeRuntime).get()).toThrow()

    const expression = parse('foo.bar.baz is String and foo.bar.baz.length').get()
    const type = expression.getType(typeRuntime).get()
    expect(type).toEqual(Types.oneOf([Types.literal(false), Types.int()]))
  })

  it('infers return type', () => {
    const expression = parse('fn(a: Int) => a + a').get()
    const type = expression.getType(typeRuntime).get()
    expect(type).toEqual(
      Types.formula(
        [Types.namedArgument({name: 'a', type: Types.int(), isRequired: true})],
        Types.int(),
      ),
    )
  })

  it('validates return type', () => {
    const expression = parse('fn(a: Int): Int => a + a').get()
    expect(expression.getType(typeRuntime).get()).toEqual(
      Types.formula(
        [Types.namedArgument({name: 'a', type: Types.int(), isRequired: true})],
        Types.int(),
      ),
    )

    expect(() => parse('fn(a: Float): Int => a + a').get().getType(typeRuntime).get()).toThrow(
      "Function body result type 'Float' is not assignable to explicit return type 'Int'",
    )
  })
})
