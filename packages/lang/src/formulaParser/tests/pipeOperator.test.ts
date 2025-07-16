import {c, cases} from '@extra-lang/cases'
import {parse} from '../../formulaParser'
import {type Expression} from '../expressions'
import * as Types from '../../types'
import {type TypeRuntime, type ValueRuntime} from '../../runtime'
import * as Values from '../../values'
import {mockTypeRuntime} from '../../tests/mockTypeRuntime'
import {mockValueRuntime} from '../../tests/mockValueRuntime'

let runtimeTypes: {[K in string]: [Types.Type, Values.Value]}

let typeRuntime: TypeRuntime
let valueRuntime: ValueRuntime

beforeEach(() => {
  runtimeTypes = {}
  typeRuntime = mockTypeRuntime(runtimeTypes)
  valueRuntime = mockValueRuntime(runtimeTypes)
})

describe('|> / ?|>', () => {
  describe('parse', () => {
    cases<[string, string] | [string, string, string]>(
      c(['1 |> # + 1 |> # * 2', '(|> (|> 1 (+ `#` 1)) (* `#` 2))']),
      c(['1 ?|> # + 1', '(?|> 1 (+ `#` 1))']),
    ).run(([formula, expectedLisp, expectedCode], {only, skip}) =>
      (only ? it.only : skip ? it.skip : it)(`should parse '${formula}'`, () => {
        expectedCode ??= formula
        let expression: Expression = parse(formula).get()

        expect(expression!.toCode()).toEqual(expectedCode)
        expect(expression!.toLisp()).toEqual(expectedLisp)
      }),
    )
  })

  describe('getType / eval', () => {
    cases<[string, ['a', number | null], ['b', number], Types.Type, Values.Value]>(
      c([`a |> #`, ['a', null], ['b', 0], Types.optional(Types.int()), Values.nullValue()]),
      c([`a |> #`, ['a', 1], ['b', 0], Types.optional(Types.int()), Values.int(1)]),
      c([`b |> #`, ['a', null], ['b', 10], Types.int(), Values.int(10)]),
      c([`b |> # + 1`, ['a', null], ['b', 10], Types.int(), Values.int(11)]),
      c([`a ?|> # + 1`, ['a', null], ['b', 0], Types.optional(Types.int()), Values.nullValue()]),
      c([`a ?|> # + 1`, ['a', 1], ['b', 0], Types.optional(Types.int()), Values.int(2)]),
    ).run(([formula, [_a, valueA], [_b, valueB], expectedType, expectedValue], {only, skip}) =>
      (only ? it.only : skip ? it.skip : it)(
        `'${formula}' should have type '${expectedType}' and value '${expectedValue}' (a = '${valueA}', b = ${valueB})`,
        () => {
          runtimeTypes['a'] = [
            Types.optional(Types.int()),
            valueA ? Values.int(valueA) : Values.nullValue(),
          ]
          runtimeTypes['b'] = [Types.int(), Values.int(valueB)]

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
    cases<[string, Types.Type, string]>(
      c([
        `a |> # + 1`,
        Types.optional(Types.int()),
        "Expected Int or Float, found '#' of type 'null'",
      ]),
      c([`a ?|> #`, Types.int(), "Left hand side of '?|>' operator must be a nullable-type."]),
    ).run(([formula, aType, message], {only, skip}) =>
      (only ? it.only : skip ? it.skip : it)(`should not get type of ${formula}`, () => {
        runtimeTypes['a'] = [aType, Values.string('')]

        expect(() => {
          const expression = parse(formula).get()
          expression.getType(typeRuntime).get()
        }).toThrow(message)
      }),
    )
  })
})
