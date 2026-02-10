import {c, cases} from '@extra-lang/cases'
import * as Types from '../../types'
import {type TypeRuntime} from '../../runtime'
import * as Values from '../../values'
import {parseType} from '../../formulaParser'
import {mockTypeRuntime} from '../../tests/mockTypeRuntime'

let runtimeTypes: {[K in string]: [Types.Type, Values.Value]}

let typeRuntime: TypeRuntime

beforeEach(() => {
  runtimeTypes = {}
  typeRuntime = mockTypeRuntime(runtimeTypes)
})

describe('type refinements', () => {
  describe('arrays and dicts', () => {
    cases<[string] | [string, string]>(
      c(['Array(Int, length: =3)']),
      c(['Array(Int, length: 3...3)', 'Array(Int, length: =3)']),
      c(['Array(Int, length: >=3)']),
      c(['Array(Int, length: ≥3)', 'Array(Int, length: >=3)']),
      c(['Array(Int, length: >2)', 'Array(Int, length: >=3)']),
      c(['Array(Int, length: <=3)']),
      c(['Array(Int, length: ≤3)', 'Array(Int, length: <=3)']),
      c(['Array(Int, length: <4)', 'Array(Int, length: <=3)']),
      c(['Array(Int, length: 1...3)']),
      c(['Array(Int, length: 1..<3)', 'Array(Int, length: 1...2)']),
      c(['Array(Int, length: 1<..3)', 'Array(Int, length: 2...3)']),
      c(['Array(Int, length: 1<.<3)', 'Array(Int, length: =2)']),
      c(['Array(Int, length: 1...5)']),
      c(['Array(Int, length: 1<..5)', 'Array(Int, length: 2...5)']),
      c(['Array(Int, length: 1..<5)', 'Array(Int, length: 1...4)']),
      c(['Array(Int, length: 1<.<5)', 'Array(Int, length: 2...4)']),
      c(['Dict(Int, keys: [:key1])']),
      c(['Dict(Int,keys:[:key1],length:>=1)', 'Dict(Int, keys: [:key1])']),
      c(['Dict ( Int , keys: [:key1]  ,  length : >= 0 )', 'Dict(Int, keys: [:key1])']),
      c(['Dict(Int, keys: [:key1, :key2])']),
      c([
        'Dict(Int, keys: [:key1, :key2], length: >=3)',
        'Dict(Int, keys: [:key1, :key2], length: >=3)',
      ]),
      c(['Dict(Int, length: =3)']),
      c(['Dict(Int, length: >=3)', 'Dict(Int, length: >=3)']),
      c(['Dict(Int, length: <=3)', 'Dict(Int, length: <=3)']),
      c(['Dict(Int, keys: [:key1], length: =3)', 'Dict(Int, keys: [:key1], length: =3)']),
      c([
        'Dict(Int, keys: [:key1,:key2],length: >=3)',
        'Dict(Int, keys: [:key1, :key2], length: >=3)',
      ]),
    ).run(([formula, expected], {only, skip}) =>
      (only ? it.only : skip ? it.skip : it)(`should parse ${formula}`, () => {
        const expression = parseType(formula).get()

        expect(expression!.toCode()).toEqual(expected ?? formula)
        const type = expression!.getAsTypeExpression(typeRuntime).get()
        expect(type.toString()).toEqual(expected ?? formula)
      }),
    )
  })

  describe('strings', () => {
    cases<[string] | [string, string]>(
      c(['String(length: =3)']),
      c(['String(length: 3...3)', 'String(length: =3)']),
      c(['String(length: >=3)']),
      c(['String(length: ≥3)', 'String(length: >=3)']),
      c(['String(length: >2)', 'String(length: >=3)']),
      c(['String(length: <=3)']),
      c(['String(length: ≤3)', 'String(length: <=3)']),
      c(['String(length: <4)', 'String(length: <=3)']),
      c(['String(length: 1...3)']),
      c(['String(length: 1<..3)', 'String(length: 2...3)']),
      c(['String(length: 1..<3)', 'String(length: 1...2)']),
      c(['String(length: 1<.<3)', 'String(length: =2)']),
      c(['String(length: 1...5)']),
      c(['String(length: 1<..5)', 'String(length: 2...5)']),
      c(['String(length: 1..<5)', 'String(length: 1...4)']),
      c(['String(length: 1<.<5)', 'String(length: 2...4)']),
      c(['String(matches: /test/)']),
      c(['String(matches: [/test/, /test2/])']),
      c(['String(matches: [/test/])', 'String(matches: /test/)']),
      c(['String ( matches :  [  /test/  ] ) ', 'String(matches: /test/)']),
      c(['String(matches: /\\w+\\d+/)']),
      c(['String(matches: [/\\w+\\d+/, /[a-z]/])']),
      c(['String(length: =3, matches: [/test1/, /test2/])']),
      c(['String(matches: /test1/, length: =3)', 'String(length: =3, matches: /test1/)']),
    ).run(([formula, expected], {only, skip}) =>
      (only ? it.only : skip ? it.skip : it)(`should parse ${formula}`, () => {
        const expression = parseType(formula).get()

        expect(expression!.toCode()).toEqual(expected ?? formula)
        const type = expression!.getAsTypeExpression(typeRuntime).get()
        expect(type.toString()).toEqual(expected ?? formula)
      }),
    )
  })

  describe('numbers', () => {
    cases<[string] | [string, string]>(
      c(['Int(=3)', '3']),
      c(['Int(=-3)', '-3']),
      c(['Int(3...3)', '3']),
      c(['Int(>=3)']),
      c(['Int(>=-3)']),
      c(['Int(≥3)', 'Int(>=3)']),
      c(['Int(>2)', 'Int(>=3)']),
      c(['Int(<=3)']),
      c(['Int(<=-3)']),
      c(['Int(≤3)', 'Int(<=3)']),
      c(['Int(<4)', 'Int(<=3)']),
      c(['Int(1...3)']),
      c(['Int(-3...-1)']),
      c(['Int(-1...-3)', 'Int(-3...-1)']),
      c(['Int(1<..3)', 'Int(2...3)']),
      c(['Int(1..<3)', 'Int(1...2)']),
      c(['Int(1<.<5)', 'Int(2...4)']),
      c(['Int(1<.<3)', '2']),
      //
      c(['Float(=3)', '3.0']),
      c(['Float(3...3)', '3.0']),
      c(['Float(>=3)']),
      c(['Float(≥3)', 'Float(>=3)']),
      c(['Float(>2)']),
      c(['Float(<=3)']),
      c(['Float(≤3)', 'Float(<=3)']),
      c(['Float(<4)']),
      c(['Float(1...3)']),
      c(['Float(1<..3)']),
      c(['Float(1..<3)']),
      c(['Float(1<.<5)']),
      c(['Float(1<.<3)']),
      c(['Float(-5 <.< -1)', 'Float(-5<.<-1)']),
    ).run(([formula, expected], {only, skip}) =>
      (only ? it.only : skip ? it.skip : it)(`should parse ${formula}`, () => {
        const expression = parseType(formula).get()

        expect(expression!.toCode()).toEqual(expected ?? formula)
        const type = expression!.getAsTypeExpression(typeRuntime).get()
        expect(type.toString()).toEqual(expected ?? formula)
      }),
    )
  })
})
