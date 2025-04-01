import {c, cases} from '@extra-lang/cases'
import * as Types from '../../types'
import {TypeRuntime, ValueRuntime} from '../../runtime'
import {parse} from '../'
import * as Values from '../../values'
import {mockTypeRuntime} from './mockTypeRuntime'
import {mockValueRuntime} from './mockValueRuntime'

let typeRuntime: TypeRuntime
let valueRuntime: ValueRuntime
let runtimeTypes: {[K in string]: [Types.Type, Values.Value]}

beforeEach(() => {
  runtimeTypes = {}
  typeRuntime = mockTypeRuntime(runtimeTypes)
  valueRuntime = mockValueRuntime(runtimeTypes)
})

describe('getType', () => {
  describe('string concatenation operator', () => {
    beforeEach(() => {
      runtimeTypes['str'] = [Types.string(), Values.string('test')]
    })
    cases<[string, Types.Type]>(
      c(['"test" <> "test"', Types.literal('testtest')]),
      c(['str <> str', Types.string()]),
    ).run(([formula, expected], {only, skip}) =>
      (only ? it.only : skip ? it.skip : it)(`${formula} => ${expected}`, () => {
        const expression = parse(formula).get()
        expect(expression.getType(typeRuntime).get()).toEqual(expected)
      }),
    )
  })

  describe('array concatenation operator', () => {
    beforeEach(() => {
      runtimeTypes['testString1'] = [Types.string(), Values.string('testString1')]
      runtimeTypes['testString2'] = [Types.string(), Values.string('testString2')]
      runtimeTypes['testInt'] = [Types.int(), Values.int(0)]
    })
    cases<[string, Types.Type]>(
      c(['["test"] ++ ["test"]', Types.literal('test')]),
      c(['["test1"] ++ ["test2"]', Types.oneOf([Types.literal('test1'), Types.literal('test2')])]),
      c(['[testString1] ++ [testString2]', Types.string()]),
      c(['[testString1] ++ [testInt]', Types.oneOf([Types.string(), Types.int()])]),
      c(['[testInt] ++ [testInt]', Types.int()]),
      c(['[1] ++ [1.0]', Types.oneOf([Types.literal(1), Types.literal(1, 'float')])]),
      c(['[1.1] ++ [1.1]', Types.literal(1.1)]),
    ).run(([formula, expected], {only, skip}) =>
      (only ? it.only : skip ? it.skip : it)(`${formula} => ${expected}`, () => {
        const expression = parse(formula).get()
        expect(expression.getType(typeRuntime).get()).toEqual(
          Types.array(expected, {min: 2, max: 2}),
        )
      }),
    )
  })
})

describe('eval', () => {
  cases<[Values.Value, Values.Value, string, Values.Value]>(
    c([
      Values.array([Values.int(1)]),
      Values.array([Values.float(2)]),
      'lhs ++ rhs',
      Values.array([Values.int(1), Values.float(2)]),
    ]),
    c([
      Values.array([Values.float(2)]),
      Values.array([Values.int(1), Values.int(2), Values.int(3)]),
      'lhs ++ rhs',
      Values.array([Values.float(2), Values.int(1), Values.int(2), Values.int(3)]),
    ]),
    c([Values.string('asdf'), Values.string('jkl'), 'lhs <> rhs', Values.string('asdfjkl')]),
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
