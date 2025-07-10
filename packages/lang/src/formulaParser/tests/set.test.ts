import {c, cases} from '@extra-lang/cases'
import {parse} from '../../formulaParser'
import {type Expression} from '../expressions'

describe('set', () => {
  describe('parse', () => {
    cases<[string, string] | [string, string, string]>(
      c(['Set()', 'Set()', 'Set()']),
      c([' Set(  )', 'Set()', 'Set()']),
      c(['Set()', 'Set()', 'Set()']),
      c([' Set(  )', 'Set()', 'Set()']),
      c(["Set('a')", "Set('a')"]),
      c(['Set(a)', 'Set(a)']),
      c(['Set(a)', 'Set(a)', 'Set(a)']),
      c(['Set<Int>(a)', '(Set(`Int`) (a))', 'Set<Int>(a)']),
      c(["Set('a', [1, 2, 3])", "Set('a' [1 2 3])"]),
      c(["Set(a, b, 'c', dee)", "Set(a b 'c' dee)", "Set(a, b, 'c', dee)"]),
    ).run(([formula, expectedLisp, expectedCode], {only, skip}) =>
      (only ? it.only : skip ? it.skip : it)(`should parse set '${formula}'`, () => {
        expectedCode ??= formula
        let expression: Expression = parse(formula).get()

        expect(expression!.toCode()).toEqual(expectedCode)
        expect(expression!.toLisp()).toEqual(expectedLisp)
      }),
    )
  })

  describe('spread operator', () => {
    cases<[string, string] | [string, string, string]>(
      c(['Set(...lhs, rhs)', 'Set((... lhs) rhs)']),
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
    cases<[string, string]>(c(['Set(1,)', 'Set(1)']), c(['Set(1 , )', 'Set(1)'])).run(
      ([formula, expected], {only, skip}) =>
        (only ? it.only : skip ? it.skip : it)(`should allow trailing comma in ${formula}`, () => {
          const expression = parse(formula).get()
          expect(expression.toCode()).toEqual(expected)
        }),
    )
  })
})
