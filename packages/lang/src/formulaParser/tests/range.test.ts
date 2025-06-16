import {cases, c} from '@extra-lang/cases'
import * as Types from '~/types'
import * as Values from '~/values'
import {parse} from '~/formulaParser'
import {type Expression} from '~/formulaParser/expressions'
import {mockValueRuntime} from '~/tests/mockValueRuntime'

describe('range', () => {
  describe('parsing', () => {
    cases<[string, string]>(
      // int range
      c(['1...10', '(... 1 10)']),
      c(['10...1', '(... 10 1)']),
      c(['1...-1', '(... 1 -1)']),
      c(['1<..10', '(<.. 1 10)']),
      c(['1..<10', '(..< 1 10)']),
      c(['1<.<10', '(<.< 1 10)']),
      // float range
      c(['1.1...9.8', '(... 1.1 9.8)']),
      c(['1.1<..9.8', '(<.. 1.1 9.8)']),
      c(['1.1..<9.8', '(..< 1.1 9.8)']),
      c(['1.1<.<9.8', '(<.< 1.1 9.8)']),
      // unary int
      c(['<10', '(< 10)']),
      c(['<=10', '(<= 10)']),
      c(['>10', '(> 10)']),
      c(['>=10', '(>= 10)']),
      // unary float
      c(['<9.8', '(< 9.8)']),
      c(['<=9.8', '(<= 9.8)']),
      c(['>9.8', '(> 9.8)']),
      c(['>=9.8', '(>= 9.8)']),
    ).run(([formula, expectedLisp], {only, skip}) =>
      (only ? it.only : skip ? it.skip : it)(`should parse range ${formula}`, () => {
        let expression: Expression = parse(formula).get()

        expect(expression!.toCode()).toEqual(formula)
        expect(expression!.toLisp()).toEqual(expectedLisp)
      }),
    )
  })

  describe('eval', () => {
    const runtime = mockValueRuntime({})

    cases<[string, Types.Type, Values.Value]>(
      // int range
      c([
        '1...10',
        Types.range(Types.IntType),
        Values.range([Values.int(1), false], [Values.int(10), false]),
      ]),
      c([
        '1<..10',
        Types.range(Types.IntType),
        Values.range([Values.int(1), true], [Values.int(10), false]),
      ]),
      c([
        '1..<10',
        Types.range(Types.IntType),
        Values.range([Values.int(1), false], [Values.int(10), true]),
      ]),
      c([
        '1<.<10',
        Types.range(Types.IntType),
        Values.range([Values.int(1), true], [Values.int(10), true]),
      ]),
      // float range
      c([
        '1.1...9.8',
        Types.range(Types.FloatType),
        Values.range([Values.float(1.1), false], [Values.float(9.8), false]),
      ]),
      c([
        '1.1...9',
        Types.range(Types.FloatType),
        Values.range([Values.float(1.1), false], [Values.int(9), false]),
      ]),
      c([
        '1.1<..9.8',
        Types.range(Types.FloatType),
        Values.range([Values.float(1.1), true], [Values.float(9.8), false]),
      ]),
      c([
        '1.1..<9.8',
        Types.range(Types.FloatType),
        Values.range([Values.float(1.1), false], [Values.float(9.8), true]),
      ]),
      c([
        '1.1<.<9.8',
        Types.range(Types.FloatType),
        Values.range([Values.float(1.1), true], [Values.float(9.8), true]),
      ]),
      // unary int
      c(['<10', Types.range(Types.IntType), Values.range(undefined, [Values.int(10), true])]),
      c(['<=10', Types.range(Types.IntType), Values.range(undefined, [Values.int(10), false])]),
      c(['>10', Types.range(Types.IntType), Values.range([Values.int(10), true], undefined)]),
      c(['>=10', Types.range(Types.IntType), Values.range([Values.int(10), false], undefined)]),
      // unary float
      c(['<9.8', Types.range(Types.FloatType), Values.range(undefined, [Values.float(9.8), true])]),
      c([
        '<=9.8',
        Types.range(Types.FloatType),
        Values.range(undefined, [Values.float(9.8), false]),
      ]),
      c(['>9.8', Types.range(Types.FloatType), Values.range([Values.float(9.8), true], undefined)]),
      c([
        '>=9.8',
        Types.range(Types.FloatType),
        Values.range([Values.float(9.8), false], undefined),
      ]),
    ).run(([formula, expectedType, expectedValue], {only, skip}) =>
      (only ? it.only : skip ? it.skip : it)(`should parse range ${formula}`, () => {
        const expression = parse(formula).get()
        expect(expression!.getType(runtime).get()).toEqual(expectedType)
        expect(expression!.eval(runtime).get()).toEqual(expectedValue)
      }),
    )
  })
})
