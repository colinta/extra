import {c, cases} from '@extra-lang/cases'
import * as Types from '../../types'
import {type TypeRuntime} from '../../runtime'
import * as Values from '../../values'
import {parse} from '../../formulaParser'
import {type TestingTypes} from '../operators'
import {mockTypeRuntime} from '../../tests/mockTypeRuntime'

let runtimeTypes: {[K in string]: [Types.Type, Values.Value]}

let typeRuntime: TypeRuntime

beforeEach(() => {
  runtimeTypes = {}
  typeRuntime = mockTypeRuntime(runtimeTypes)
})

describe('narrowed types', () => {
  cases<[Types.Type, string, Types.Type, Types.Type]>(
    //|
    //|  Int checks
    //|
    c([Types.int(), 'foo >= 5', Types.int({min: 5}), Types.int({max: 4})]),
    c([Types.int({min: 6}), 'foo >= 5', Types.int({min: 6}), Types.never()]),
    c([Types.int(), 'foo', Types.int(), Types.literal(0)]),
    c([Types.int(), 'not foo', Types.literal(0), Types.int()]),
    c([Types.int(), 'not not foo', Types.int(), Types.literal(0)]),
    c([Types.int({min: 0}), 'foo', Types.int({min: 1}), Types.literal(0)]),
    c([Types.int({min: -1}), 'foo', Types.int({min: -1}), Types.literal(0)]),
    c([Types.int({min: 1}), 'foo', Types.int({min: 1}), Types.never()]),
    //|
    //|  Float checks
    //|
    c([Types.float(), 'foo >= 5', Types.float({min: 5}), Types.float({max: [5]})]),
    c([Types.float(), 'foo > 5', Types.float({min: [5]}), Types.float({max: 5})]),
    c([Types.float({min: 6}), 'foo > 6', Types.float({min: [6]}), Types.literal(6, 'float')]),
    c([Types.float({min: 7}), 'foo > 6', Types.float({min: 7}), Types.never()]),
    //|
    //|  OneOf checks
    //|
    c([
      Types.oneOf([Types.int({min: 0}), Types.string()]),
      'foo',
      Types.oneOf([Types.int({min: 1}), Types.string({min: 1})]),
      Types.oneOf([Types.literal(0), Types.literal('')]),
    ]),
    c([
      Types.oneOf([Types.int({min: 0}), Types.string()]),
      'not foo',
      Types.oneOf([Types.literal(0), Types.literal('')]),
      Types.oneOf([Types.int({min: 1}), Types.string({min: 1})]),
    ]),
    c([
      Types.oneOf([Types.int({min: 1}), Types.string()]),
      'foo',
      Types.oneOf([Types.int({min: 1}), Types.string({min: 1})]),
      Types.literal(''),
    ]),
    //|
    //|  String.length checks
    //|
    c([Types.string(), 'foo.length >= 10', Types.string({min: 10}), Types.string({max: 9})]),
    c([Types.string(), 'foo.length > 10', Types.string({min: 11}), Types.string({max: 10})]),
    c([Types.string(), 'foo.length == 10', Types.string({min: 10, max: 10}), Types.string()]),
    c([Types.string(), 'foo.length < 10', Types.string({max: 9}), Types.string({min: 10})]),
    c([Types.string(), 'foo.length <= 10', Types.string({max: 10}), Types.string({min: 11})]),
    //|
    //|  Array.length checks
    //|
    c([
      Types.array(Types.string()),
      'foo.length >= 10',
      Types.array(Types.string(), {min: 10}),
      Types.array(Types.string(), {max: 9}),
    ]),
    c([
      Types.array(Types.string()),
      'foo.length > 10',
      Types.array(Types.string(), {min: 11}),
      Types.array(Types.string(), {max: 10}),
    ]),
    c([
      Types.array(Types.string()),
      'foo.length == 10',
      Types.array(Types.string(), {min: 10, max: 10}),
      Types.array(Types.string()),
    ]),
    c([
      Types.array(Types.string()),
      'foo.length < 10',
      Types.array(Types.string(), {max: 9}),
      Types.array(Types.string(), {min: 10}),
    ]),
    c([
      Types.array(Types.string()),
      'foo.length <= 10',
      Types.array(Types.string(), {max: 10}),
      Types.array(Types.string(), {min: 11}),
    ]),
  ).run(([type, formula, truthyType, falseyType], {only, skip}) => {
    const name = 'foo'
    describe(`${name}: ${type}, ${formula}`, () => {
      beforeEach(() => {
        runtimeTypes[name] = [type, Values.nullValue()]
      })
      ;(only ? it.only : skip ? it.skip : it)(`truthy: ${truthyType}`, () => {
        const expression = parse(`(${formula}) and ${name}`).get()
        const andExpression = expression as TestingTypes.LogicalAndOperator
        const [lhsExpr, rhsExpr] = andExpression.args
        const lhsType = lhsExpr.getType(typeRuntime).get()
        const andType = andExpression.rhsType(typeRuntime, lhsType, lhsExpr, rhsExpr)
        expect(andType.get()).toEqual(truthyType)
      })
      ;(only ? it.only : skip ? it.skip : it)(`falsey: ${falseyType}`, () => {
        const expression = parse(`(${formula}) or ${name}`).get()
        const orExpression = expression as TestingTypes.LogicalAndOperator
        const [lhsExpr, rhsExpr] = orExpression.args
        const lhsType = lhsExpr.getType(typeRuntime).get()
        const orType = orExpression.rhsType(typeRuntime, lhsType, lhsExpr, rhsExpr)
        expect(orType.get()).toEqual(falseyType)
      })
    })
  })

  describe('narrowTypeIs / narrowTypeIsNot', () => {
    cases<[Types.Type, Types.Type, {is: Types.Type; isNot: Types.Type}]>(
      c([Types.int(), Types.int({min: 1}), {is: Types.int({min: 1}), isNot: Types.int({max: 0})}]),
      c([
        Types.int({max: 0}),
        Types.int({max: -1}),
        {is: Types.int({max: -1}), isNot: Types.int({min: 0, max: 0})},
      ]),
      c([
        Types.oneOf([Types.int(), Types.string()]),
        Types.int({min: 1}),
        {is: Types.int({min: 1}), isNot: Types.oneOf([Types.int({max: 0}), Types.string()])},
      ]),
    ).run(([lhs, rhs, {is: expectedIs, isNot: expectedIsNot}], {only, skip}) => {
      ;(only ? it.only : skip ? it.skip : it)(
        `narrowTypeIs(${lhs}, ${rhs}) = ${expectedIs}`,
        () => {
          expect(Types.narrowTypeIs(lhs, rhs)).toEqual(expectedIs)
        },
      )
      ;(only ? it.only : skip ? it.skip : it)(
        `narrowTypeIsNot(${lhs}, ${rhs}) = ${expectedIsNot}`,
        () => {
          expect(Types.narrowTypeIsNot(lhs, rhs)).toEqual(expectedIsNot)
        },
      )
    })
  })

  // TODO: These return type tests should not be in narrowedTypes.test.ts
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
