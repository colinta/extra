import {c, cases} from '@extra-lang/cases'
import {parse} from '../../formulaParser'
import {type Expression} from '../../expressions'

function expectedSet(contents: string = '', withGeneric: string = '') {
  if (withGeneric) {
    return `Set<${contents}>(${withGeneric})`
  }
  return `Set(${contents})`
}

describe('set', () => {
  describe('parse', () => {
    cases<[string, string] | [string, string, string]>(
      c(['Set()', 'Set()', expectedSet()]),
      c([' Set(  )', 'Set()', expectedSet()]),
      c(["Set('a')", "Set('a')", expectedSet("'a'")]),
      c(['Set(a)', 'Set(a)', expectedSet('a')]),
      c(['Set<Int>(a)', '(Set(`Int`) (a))', expectedSet('Int', 'a')]),
      c(["Set('a', [1, 2, 3])", "Set('a' [1 2 3])", expectedSet("'a', [1, 2, 3]")]),
      c(["Set(a, b, 'c', dee)", "Set(a b 'c' dee)", expectedSet("a, b, 'c', dee")]),
      c(['#[]', 'Set()', expectedSet()]),
      c([' #[  ]', 'Set()', expectedSet()]),
      c(["#['a']", "Set('a')", expectedSet("'a'")]),
      c(['#[a]', 'Set(a)', expectedSet('a')]),
      c(["#['a', [1, 2, 3]]", "Set('a' [1 2 3])", expectedSet("'a', [1, 2, 3]")]),
      c(["#[a, b, 'c', dee]", "Set(a b 'c' dee)", expectedSet("a, b, 'c', dee")]),
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
      c(['#[...lhs, rhs]', 'Set((... lhs) rhs)', expectedSet('...lhs, rhs')]),
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
    cases<[string, string]>(c(['#[1,]', expectedSet('1')]), c(['#[1 , ]', expectedSet('1')])).run(
      ([formula, expected], {only, skip}) =>
        (only ? it.only : skip ? it.skip : it)(`should allow trailing comma in ${formula}`, () => {
          const expression = parse(formula).get()
          expect(expression.toCode()).toEqual(expected)
        }),
    )
  })
})
