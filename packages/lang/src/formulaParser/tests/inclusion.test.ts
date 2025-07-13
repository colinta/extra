import {c, cases} from '@extra-lang/cases'
import {parse} from '~/formulaParser'
import * as Types from '~/types'
import {type TypeRuntime, type ValueRuntime} from '~/runtime'
import * as Values from '~/values'
import {mockTypeRuntime} from '~/tests/mockTypeRuntime'
import {mockValueRuntime} from '~/tests/mockValueRuntime'

let runtimeTypes: {[K in string]: [Types.Type, Values.Value]}

let typeRuntime: TypeRuntime
let valueRuntime: ValueRuntime

beforeEach(() => {
  runtimeTypes = {}
  typeRuntime = mockTypeRuntime(runtimeTypes)
  valueRuntime = mockValueRuntime(runtimeTypes)
})

describe('inclusion operator', () => {
  describe('getType / eval', () => {
    cases<[string, ['a', Types.Type, Values.Value], ['b', boolean], Types.Type, Values.Value]>(
      c([
        `\
[
  1
  2
  3
  a if b
  5
]
`,
        ['a', Types.string(), Values.string('yo')],
        ['b', false],
        Types.array(
          Types.oneOf([
            Types.literal(1),
            Types.literal(2),
            Types.literal(3),
            Types.string(),
            Types.literal(5),
          ]),
          {min: 4, max: 5},
        ),
        Values.array([Values.int(1), Values.int(2), Values.int(3), Values.int(5)]),
      ]),
      c([
        `\
[
  1
  2
  3
  a if b
  5
]
`,
        ['a', Types.string(), Values.string('yo')],
        ['b', true],
        Types.array(
          Types.oneOf([
            Types.literal(1),
            Types.literal(2),
            Types.literal(3),
            Types.string(),
            Types.literal(5),
          ]),
          {min: 4, max: 5},
        ),
        Values.array([
          Values.int(1),
          Values.int(2),
          Values.int(3),
          Values.string('yo'),
          Values.int(5),
        ]),
      ]),
      c([
        `\
[
  1
  2
  3
  ...a if b
]
`,
        ['a', Types.array(Types.string(), {min: 1, max: 2}), Values.array([Values.int(0)])],
        ['b', false],
        Types.array(
          Types.oneOf([Types.literal(1), Types.literal(2), Types.literal(3), Types.string()]),
          {min: 3, max: 5},
        ),
        Values.array([Values.int(1), Values.int(2), Values.int(3)]),
      ]),
      c([
        `\
[
  1
  2
  3
  ...a if b
]
`,
        [
          'a',
          Types.array(Types.string(), {min: 1, max: 2}),
          Values.array([Values.string('hi'), Values.string('bye')]),
        ],
        ['b', true],
        Types.array(
          Types.oneOf([Types.literal(1), Types.literal(2), Types.literal(3), Types.string()]),
          {min: 3, max: 5},
        ),
        Values.array([
          Values.int(1),
          Values.int(2),
          Values.int(3),
          Values.string('hi'),
          Values.string('bye'),
        ]),
      ]),
      c([
        `\
[
  1
  2
  3
  ...a |> # if b
]
`,
        [
          'a',
          Types.array(Types.string(), {min: 1, max: 2}),
          Values.array([Values.string('hi'), Values.string('bye')]),
        ],
        ['b', true],
        Types.array(
          Types.oneOf([Types.literal(1), Types.literal(2), Types.literal(3), Types.string()]),
          {min: 3, max: 5},
        ),
        Values.array([
          Values.int(1),
          Values.int(2),
          Values.int(3),
          Values.string('hi'),
          Values.string('bye'),
        ]),
      ]),
    ).run(
      ([formula, [_a, typeA, valueA], [_b, valueB], expectedType, expectedValue], {only, skip}) =>
        (only ? it.only : skip ? it.skip : it)(
          `should '${formula}' should have type '${expectedType}' and value '${expectedValue}' (a: ${typeA} = ${valueA}, b = ${valueB})`,
          () => {
            runtimeTypes['a'] = [typeA, valueA]
            runtimeTypes['b'] = [Types.booleanType(), Values.booleanValue(valueB)]

            const expression = parse(formula).get()
            const type = expression.getType(typeRuntime).get()
            const value = expression.eval(valueRuntime).get()

            expect(type).toEqual(expectedType)
            expect(value).toEqual(expectedValue)
          },
        ),
    )
  })

  describe('invalid', () => {
    cases<[string, string]>(
      c([
        `\
[
  1
  2
  3
  a if b if b
  5
]
`,
        'Inclusion operator cannot be nested',
      ]),
    ).run(([formula, message], {only, skip}) =>
      (only ? it.only : skip ? it.skip : it)(`should not get type of ${formula}`, () => {
        runtimeTypes['a'] = [Types.int(), Values.int(0)]
        runtimeTypes['b'] = [Types.booleanType(), Values.booleanValue(true)]

        expect(() => {
          const expression = parse(formula).get()
          expression.getType(typeRuntime).get()
        }).toThrow(message)
      }),
    )
  })
})
