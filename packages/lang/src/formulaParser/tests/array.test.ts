import {c, cases} from '@extra-lang/cases'
import {parse} from '../../formulaParser'
import {type Expression} from '../../expressions'

describe('array', () => {
  describe('parse', () => {
    cases<[string, string] | [string, string, string]>(
      c(['[]', '[]', '[]']),
      c(['Array()', '[]', '[]']),
      c(['Array(1)', '[1]', '[1]']),
      c(['Array(1,)', '[1]', '[1]']),
      c(['Array(1 , )', '[1]', '[1]']),
      c(['Array<Int>()', '(Array(`Int`) ())', 'Array<Int>()']),
      c(['Array<Int>(1)', '(Array(`Int`) (1))', 'Array<Int>(1)']),
      c(['[ ]', '[]', '[]']),
      c([' [ ]', '[]', '[]']),
      c([' [  ]', '[]', '[]']),
      c(['[1, "2", null]', "[1 '2' `null`]", "[1, '2', null]"]),
      c([
        '[' + Array(10).fill('"wowowowowowowowow"').join(', ') + ']',
        "['wowowowowowowowow' 'wowowowowowowowow' 'wowowowowowowowow' 'wowowowowowowowow' 'wowowowowowowowow' 'wowowowowowowowow' 'wowowowowowowowow' 'wowowowowowowowow' 'wowowowowowowowow' 'wowowowowowowowow']",
        `\
[
  'wowowowowowowowow'
  'wowowowowowowowow'
  'wowowowowowowowow'
  'wowowowowowowowow'
  'wowowowowowowowow'
  'wowowowowowowowow'
  'wowowowowowowowow'
  'wowowowowowowowow'
  'wowowowowowowowow'
  'wowowowowowowowow'
]`,
      ]),
    ).run(([formula, expectedLisp, expectedCode], {only, skip}) =>
      (only ? it.only : skip ? it.skip : it)(`should parse array '${formula}'`, () => {
        expectedCode ??= formula
        let expression: Expression = parse(formula).get()

        expect(expression!.toCode()).toEqual(expectedCode)
        expect(expression!.toLisp()).toEqual(expectedLisp)
      }),
    )
  })

  describe('spread operator', () => {
    cases<[string, string] | [string, string, string]>(
      c(['[...lhs, ...rhs]', '[(... lhs) (... rhs)]']),
      c(['[...lhs, rhs]', '[(... lhs) rhs]']),
      c(['[...lhs, ...rhs]', '[(... lhs) (... rhs)]']),
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
    cases<[string, string]>(c(['[1,2,3,]', '[1, 2, 3]']), c(['[1,2,3 , ]', '[1, 2, 3]'])).run(
      ([formula, expected], {only, skip}) =>
        (only ? it.only : skip ? it.skip : it)(`should allow trailing comma in ${formula}`, () => {
          const expression = parse(formula).get()
          expect(expression.toCode()).toEqual(expected)
        }),
    )
  })

  describe('invalid', () => {
    cases<[string, string]>(c(['[1, ,]', "Unexpected token ',]'"])).run(
      ([formula, message], {only, skip}) =>
        (only ? it.only : skip ? it.skip : it)(`should not parse ${formula}`, () => {
          expect(() => {
            parse(formula).get()
          }).toThrow(message)
        }),
    )
  })
})
