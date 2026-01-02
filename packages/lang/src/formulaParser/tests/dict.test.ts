import {c, cases} from '@extra-lang/cases'
import {parse} from '../../formulaParser'
import {type Expression} from '../../expressions'

function expectedDict(contents: string = '', withGeneric: string = '') {
  if (withGeneric) {
    return `Dict<${contents}>(${withGeneric})`
  }
  return `Dict(${contents})`
}

describe('dict', () => {
  describe('parse', () => {
    cases<[string, string] | [string, string, string]>(
      c(['Dict()', 'Dict()', expectedDict()]),
      c([' Dict(  )', 'Dict()', expectedDict()]),
      c(["Dict(a: 'a')", "Dict((a: 'a'))"]),
      c(['Dict<String>(a:)', '(Dict(`String`) ((a: a)))', expectedDict('String', 'a:')]),
      c(["Dict('a': a)", 'Dict((a: a))', expectedDict('a:')]),
      c(["Dict('1': a)", "Dict(('1': a))", expectedDict("'1': a")]),
      c(['Dict((1+1): a)', 'Dict(((+ 1 1): a))', expectedDict('(1 + 1): a')]),
      c(['Dict(1: a)', 'Dict((1: a))', expectedDict('1: a')]),
      c([
        "Dict(a: 'a', b: [1, 2, 3])",
        "Dict((a: 'a') (b: [1 2 3]))",
        expectedDict("a: 'a', b: [1, 2, 3]"),
      ]),
      c([
        "Dict(a: a, b:, c: 'c', dee: dee)",
        "Dict((a: a) (b: b) (c: 'c') (dee: dee))",
        expectedDict("a:, b:, c: 'c', dee:"),
      ]),
      c([
        'Dict(key: 1, foo: 2, bar: 3)',
        'Dict((key: 1) (foo: 2) (bar: 3))',
        expectedDict('key: 1, foo: 2, bar: 3'),
      ]),
      c(['Dict("key 1": 1, 2: 2)', "Dict(('key 1': 1) (2: 2))", expectedDict("'key 1': 1, 2: 2")]),
      //
      c(['#{}', 'Dict()', expectedDict()]),
      c([' #{  }', 'Dict()', expectedDict()]),
      c(["#{a: 'a'}", "Dict((a: 'a'))", expectedDict("a: 'a'")]),

      c(["#{'a': a}", 'Dict((a: a))', expectedDict('a:')]),
      c(["#{'1': a}", "Dict(('1': a))", expectedDict("'1': a")]),
      c(['#{(1+1): a}', 'Dict(((+ 1 1): a))', expectedDict('(1 + 1): a')]),
      c(['#{1: a}', 'Dict((1: a))', expectedDict('1: a')]),
      c([
        "#{a: 'a', b: [1, 2, 3]}",
        "Dict((a: 'a') (b: [1 2 3]))",
        expectedDict("a: 'a', b: [1, 2, 3]"),
      ]),
      c([
        "#{a: a, b:, c: 'c', dee: dee}",
        "Dict((a: a) (b: b) (c: 'c') (dee: dee))",
        expectedDict("a:, b:, c: 'c', dee:"),
      ]),
      c([
        'Dict(key: 1, foo: 2, bar: 3)',
        'Dict((key: 1) (foo: 2) (bar: 3))',
        expectedDict('key: 1, foo: 2, bar: 3'),
      ]),
      c(['Dict("key 1": 1, 2: 2)', "Dict(('key 1': 1) (2: 2))", expectedDict("'key 1': 1, 2: 2")]),
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
      c(['Dict(...lhs, rhs: 1)', 'Dict((... lhs) (rhs: 1))', expectedDict('...lhs, rhs: 1')]),
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
      c(['Dict(foo: 1, bar: 2,)', expectedDict('foo: 1, bar: 2')]),
      c(['Dict(foo: 1, bar: 2\n , \n )', expectedDict('foo: 1, bar: 2')]),
    ).run(([formula, expected], {only, skip}) =>
      (only ? it.only : skip ? it.skip : it)(`should allow trailing comma in ${formula}`, () => {
        const expression = parse(formula).get()
        expect(expression.toCode()).toEqual(expected)
      }),
    )
  })

  describe('invalid', () => {
    cases<[string, string]>(c(['Dict(foo: 1, :)', ''])).run(([formula, message], {only, skip}) =>
      (only ? it.only : skip ? it.skip : it)(`should not parse ${formula}`, () => {
        expect(() => {
          parse(formula).get()
        }).toThrow(message)
      }),
    )
  })
})
