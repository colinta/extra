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
  cases<['foo', Types.Type, string, Types.Type, Types.Type]>(
    //|
    //|  Int checks
    //|
    c(['foo', Types.int(), 'foo >= 5', Types.int({min: 5}), Types.int({max: 4})]),
    c(['foo', Types.int({min: 6}), 'foo >= 5', Types.int({min: 6}), Types.never()]),
    //|
    //|  Float checks
    //|
    c(['foo', Types.float(), 'foo >= 5', Types.float({min: 5}), Types.float({max: [5]})]),
    c(['foo', Types.float(), 'foo > 5', Types.float({min: [5]}), Types.float({max: 5})]),
    c([
      'foo',
      Types.float({min: 6}),
      'foo > 6',
      Types.float({min: [6]}),
      Types.literal(6, 'float'),
    ]),
    c(['foo', Types.float({min: 7}), 'foo > 6', Types.float({min: 7}), Types.never()]),
    //|
    //|  String.length checks
    //|
    c(['foo', Types.string(), 'foo.length >= 10', Types.string({min: 10}), Types.string({max: 9})]),
    c(['foo', Types.string(), 'foo.length > 10', Types.string({min: 11}), Types.string({max: 10})]),
    c([
      'foo',
      Types.string(),
      'foo.length == 10',
      Types.string({min: 10, max: 10}),
      Types.string(),
    ]),
    c(['foo', Types.string(), 'foo.length < 10', Types.string({max: 9}), Types.string({min: 10})]),
    c([
      'foo',
      Types.string(),
      'foo.length <= 10',
      Types.string({max: 10}),
      Types.string({min: 11}),
    ]),
    //|
    //|  Array.length checks
    //|
  ).run(([name, type, formula, truthyType, falseyType], {only, skip}) => {
    describe(`${name}: ${type}, ${formula}`, () => {
      beforeEach(() => {
        runtimeTypes[name] = [type, Values.nullValue()]
      })
      ;(only ? it.only : skip ? it.skip : it)(`truthy: ${truthyType}`, () => {
        const expression = parse(`(${formula}) and foo`).get()
        const andExpression = expression as TestingTypes.LogicalAndOperator
        const [lhsExpr, rhsExpr] = andExpression.args
        const lhsType = lhsExpr.getType(typeRuntime).get()
        const andType = andExpression.rhsType(typeRuntime, lhsType, lhsExpr, rhsExpr)
        expect(andType.get()).toEqual(truthyType)
      })
      ;(only ? it.only : skip ? it.skip : it)(`falsey: ${falseyType}`, () => {
        const expression = parse(`(${formula}) or foo`).get()
        const orExpression = expression as TestingTypes.LogicalAndOperator
        const [lhsExpr, rhsExpr] = orExpression.args
        const lhsType = lhsExpr.getType(typeRuntime).get()
        const orType = orExpression.rhsType(typeRuntime, lhsType, lhsExpr, rhsExpr)
        expect(orType.get()).toEqual(falseyType)
      })
    })
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
