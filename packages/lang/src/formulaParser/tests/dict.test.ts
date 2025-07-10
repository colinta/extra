import {c, cases} from '@extra-lang/cases'
import {parse} from '../../formulaParser'
import {type Expression} from '../expressions'

describe('dict', () => {
  describe('parse', () => {
    cases<[string, string] | [string, string, string]>(
      c(['Dict()', 'Dict()']),
      c([' Dict(  )', 'Dict()', 'Dict()']),
      c(['Dict()', 'Dict()', 'Dict()']),
      c([' Dict(  )', 'Dict()', 'Dict()']),
      c(["Dict(a: 'a')", "Dict((a: 'a'))"]),
      c(['Dict<String>(a:)', '(Dict(`String`) ((a: a)))', 'Dict<String>(a:)']),
      c(["Dict('a': a)", "Dict(('a': a))", "Dict('a': a)"]),
      c(["Dict('1': a)", "Dict(('1': a))", "Dict('1': a)"]),
      c(['Dict((1+1): a)', 'Dict(((+ 1 1): a))', 'Dict((1 + 1): a)']),
      c(['Dict(1: a)', 'Dict((1: a))', 'Dict(1: a)']),
      c(["Dict(a: 'a', b: [1, 2, 3])", "Dict((a: 'a') (b: [1 2 3]))"]),
      c([
        "Dict(a: a, b:, c: 'c', dee: dee)",
        "Dict((a: a) (b: b) (c: 'c') (dee: dee))",
        "Dict(a:, b:, c: 'c', dee:)",
      ]),
      c(['Dict(key: 1, foo: 2, bar: 3)', 'Dict((key: 1) (foo: 2) (bar: 3))']),
      c(['Dict("key 1": 1, 2: 2)', "Dict(('key 1': 1) (2: 2))", "Dict('key 1': 1, 2: 2)"]),
    ).run(([formula, expectedLisp, expectedCode], {only, skip}) =>
      (only ? it.only : skip ? it.skip : it)(`should parse formula '${formula}'`, () => {
        let expression: Expression = parse(formula).get()

        expect(expression!.toCode()).toEqual(expectedCode ?? formula)
        expect(expression!.toLisp()).toEqual(expectedLisp)
      }),
    )
  })

  describe('spread operator', () => {
    cases<[string, string] | [string, string, string]>(
      c(['Dict(...lhs, rhs: 1)', 'Dict((... lhs) (rhs: 1))']),
    ).run(([formula, expectedLisp, expectedCode], {only, skip}) =>
      (only ? it.only : skip ? it.skip : it)(`should parse formula '${formula}'`, () => {
        expectedCode ??= formula

        let expression: Expression = parse(formula).get()

        expect(expression!.toCode()).toEqual(expectedCode)
        expect(expression!.toLisp()).toEqual(expectedLisp)
      }),
    )
  })

  describe('trailing commas', () => {
    cases<[string, string]>(
      c(['Dict(foo: 1, bar: 2,)', 'Dict(foo: 1, bar: 2)']),
      c(['Dict(foo: 1, bar: 2\n , \n )', 'Dict(foo: 1, bar: 2)']),
    ).run(([formula, expected], {only, skip}) =>
      (only ? it.only : skip ? it.skip : it)(`should allow trailing comma in ${formula}`, () => {
        const expression = parse(formula).get()
        expect(expression.toCode()).toEqual(expected)
      }),
    )
  })

  describe('emoji refs', () => {
    cases<[string, string]>(
      c(['a_🙂', 'a_🙂']),
      c(['a-🙂', 'a-🙂']),
      c(['a -🙂', 'a - 🙂']),
      c(['😁+😁', '😁 + 😁']),
    ).run(([formula, expected], {only, skip}) =>
      (only ? it.only : skip ? it.skip : it)(`should allow trailing comma in ${formula}`, () => {
        const expression = parse(formula).get()
        expect(expression.toCode()).toEqual(expected)
      }),
    )
  })

  describe('invalid', () => {
    cases<[string, string]>(c(['Dict(foo: 1, :)', 'Expected a reference'])).run(
      ([formula, message], {only, skip}) =>
        (only ? it.only : skip ? it.skip : it)(`should not parse ${formula}`, () => {
          expect(() => {
            parse(formula).get()
          }).toThrow(message)
        }),
    )
  })
})
