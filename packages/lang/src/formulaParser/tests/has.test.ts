import {c, cases} from '@extra-lang/cases'
import * as Types from '~/types'
import {type TypeRuntime, type ValueRuntime} from '~/runtime'
import {parse} from '~/formulaParser'
import * as Values from '~/values'
import {mockTypeRuntime} from '~/tests/mockTypeRuntime'
import {mockValueRuntime} from '~/tests/mockValueRuntime'

let typeRuntime: TypeRuntime
let valueRuntime: ValueRuntime
let runtimeTypes: {[K in string]: [Types.Type, Values.Value]}

beforeEach(() => {
  runtimeTypes = {}
  typeRuntime = mockTypeRuntime(runtimeTypes)
  valueRuntime = mockValueRuntime(runtimeTypes)
})

describe('has operator', () => {
  beforeEach(() => {
    runtimeTypes['test1'] = [
      Types.object([Types.namedProp('foo', Types.string())]),
      Values.object(new Map([['foo', Values.string('bar')]])),
    ]
    runtimeTypes['key'] = [Types.string(), Values.string('foo')]
    runtimeTypes['key2'] = [Types.string(), Values.string('key2')]
  })

  cases<[string, Types.Type]>(
    c([`{foo: "bar"} has "foo"`, Types.literal(true)]),
    c([`{} has "foo"`, Types.literal(false)]),
    // test1: { foo: 'bar' }
    c(['test1 has "foo"', Types.literal(true)]),
    c(['test1 has :foo', Types.literal(true)]),
    c(['test1 has key', Types.booleanType()]),
    c(['test1 has key2', Types.booleanType()]),
  ).run(([formula, expected], {only, skip}) =>
    (only ? it.only : skip ? it.skip : it)(`should get type information of ${formula}`, () => {
      const expression1 = parse(formula).get()
      expect(expression1.getType(typeRuntime).get()).toEqual(expected)
    }),
  )
})

describe('eval', () => {
  cases<[Values.Value, Values.Value, string, Values.Value]>(
    // {foo: 'bazz'} has X
    c([
      Values.object(new Map([['foo', Values.string('bazz')]])),
      Values.string('foo'),
      'lhs has rhs',
      Values.TrueValue,
    ]),
    c([
      Values.object(new Map([['foo', Values.string('bazz')]])),
      Values.string('bar'),
      'lhs has rhs',
      Values.FalseValue,
    ]),
    c([
      Values.object(new Map([['foo', Values.string('bazz')]])),
      Values.string('map'),
      'lhs has rhs',
      Values.FalseValue,
    ]),

    // dict(foo: 'bazz') has X
    c([
      Values.dict(new Map([['foo', Values.string('bazz')]])),
      Values.string('foo'),
      'lhs has rhs',
      Values.TrueValue,
    ]),
    c([
      Values.dict(new Map([['foo', Values.string('bazz')]])),
      Values.string('bar'),
      'lhs has rhs',
      Values.FalseValue,
    ]),
    c([
      Values.dict(new Map([['foo', Values.string('bazz')]])),
      Values.string('map'),
      'lhs has rhs',
      Values.FalseValue,
    ]),
  ).run(([lhs, rhs, formula, expected], {only, skip}) =>
    (only ? it.only : skip ? it.skip : it)(
      `should eval ${formula} = ${expected} (lhs = ${lhs}, rhs = ${rhs})`,
      () => {
        runtimeTypes['lhs'] = [lhs.getType(), lhs]
        runtimeTypes['rhs'] = [rhs.getType(), rhs]
        const expression = parse(formula).get()
        expect(expression.eval(valueRuntime).get()).toEqual(expected)
      },
    ),
  )
})

describe('invalid', () => {
  cases<[string]>(
    c([`{} has []`]),
    // ['bazz'] has X
    c(['[] has 0']),
  ).run(([formula], {only, skip}) =>
    (only ? it.only : skip ? it.skip : it)(`should throw when eval-ing ${formula}`, () => {
      const expression = parse(formula).get()
      expect(() => expression.getType(valueRuntime).get()).toThrow()
    }),
  )
})
