import {c, cases} from '@extra-lang/cases'
import {type Expression} from '~/formulaParser/expressions'
import {parseInternalTest} from '~/formulaParser'

describe('argument parser', () => {
  describe('arguments', () => {
    cases<[string, string] | [string, string, string]>(
      c(['', '()']),
      c(['number: Int', '((number: `Int`))']),
      c(['#number: Int', '((#number: `Int`))']),
      c(['#number: Int = 0', '((#number: `Int` 0))']),
      c(['count number: Int', '((count number: `Int`))']),
      c(['count number: Int = 0', '((count number: `Int` 0))']),
      c(['number: Array(Int)', '((number: Array(`Int`)))']),
      c(['number: Dict(Int)', '((number: Dict(`Int`)))']),
      c(['number: Array(Dict(Int))', '((number: Array(Dict(`Int`))))']),
      c(['number: Array(Dict(Int(>=4)))', '((number: Array(Dict(`Int(>=4)`))))']),
      c(['number: Int | String', '((number: (`Int` | `String`)))']),
      c([
        'number: Int | String?',
        '((number: (`Int` | `String` | `null`)))',
        'number: Int | String | null',
      ]),
      c([
        'number: Int? | String?',
        '((number: (`Int` | `String` | `null`)))',
        'number: Int | String | null',
      ]),
      c(['number: (Int | String)', '((number: (`Int` | `String`)))', 'number: Int | String']),
      c(['number: Array(Int | String)', '((number: Array((`Int` | `String`))))']),
      c(['number: Array(Int?)', '((number: Array((`Int` | `null`))))', 'number: Array(Int?)']),
      c(['number: Int, name: String', '((number: `Int`) (name: `String`))']),
      c([
        'number: Int?, name: String',
        '((number: (`Int` | `null`)) (name: `String`))',
        'number: Int?, name: String',
      ]),
      c(["number: Int = 0, name: String = ''", "((number: `Int` 0) (name: `String` ''))"]),
      c(['#number: Int, #name: String', '((#number: `Int`) (#name: `String`))']),
      c([
        '#number: {foo: (Int | null)}',
        '((#number: {(foo: (`Int` | `null`))}))',
        '#number: {foo: Int?}',
      ]),
      c(['#number: {(Int | null)}', '((#number: {(`Int` | `null`)}))', '#number: {Int?}']),
      c([
        '#number: {(Int | null), String}',
        '((#number: {(`Int` | `null`) `String`}))',
        '#number: {Int?, String}',
      ]),
      c([
        '#number: {foo: (Int | null), String}',
        '((#number: {(foo: (`Int` | `null`)) `String`}))',
        '#number: {foo: Int?, String}',
      ]),
      c([
        'a: {(A | B) & C | D & E, String}',
        '((a: {(((A | B) & C) | (D & E)) `String`}))',
        'a: {(A | B) & C | D & E, String}',
      ]),
      c([
        "#number: Int, #number2: Int = 0, foo: String = '', bar: String",
        "((#number: `Int`) (#number2: `Int` 0) (foo: `String` '') (bar: `String`))",
      ]),
      c([
        'number: Int, name: String, score: score',
        '((number: `Int`) (name: `String`) (score: score))',
      ]),
      c([
        'reduce: fn(#initial: String, #callback: fn(#memo: String, #value: Int): String, values: Array(Int)): String',
        '(' + // <arg-def-list>
          '(reduce: ' + // <reduce>
          '(fn ' + // <reduce-type>
          '(' + // <args>
          '(#initial: `String`) ' + // arg0
          '(#callback: (fn ((#memo: `String`) (#value: `Int`)) : (`String`))) ' + // arg1
          '(values: Array(`Int`))' + // arg2
          ') ' + //</args>
          ': (`String`)' + // </return-type>
          ')' + // </reduce-type>
          ')' + // </reduce>
          ')', // </arg-decl-list>
      ]),
    ).run(([formula, expectedLisp, expectedCode], {only, skip}) =>
      (only ? it.only : skip ? it.skip : it)(
        `should parse argument definitions '${formula}'`,
        () => {
          expectedCode = expectedCode ?? formula
          const [expression] = parseInternalTest(`(${formula})`, 'test_formula_arguments').get()

          expect(expression!.toCode()).toEqual(expectedCode)
          expect(expression!.toLisp()).toEqual(expectedLisp)
        },
      ),
    )

    cases<[string, string]>(
      c(['#count number: Int', "Expected type expression for 'count'"]),
      c([
        '#count1: Int = 0, #count2: Int',
        "Required argument '#count2' must appear before '#count1'",
      ]),
    ).run(([formula, message], {only, skip}) =>
      (only ? it.only : skip ? it.skip : it)(
        `should not parse argument definitions ${formula}`,
        () => {
          expect(() => {
            parseInternalTest(`(${formula})`, 'test_formula_arguments').get()
          }).toThrow(message)
        },
      ),
    )
  })

  describe('whitespace/formatting', () => {
    cases<[string, string]>(
      c(['number:Int', '((number: `Int`))']),
      c(['   number: Int', '((number: `Int`))']),
      c(['number : Int, name : String', '((number: `Int`) (name: `String`))']),
      c([
        'number:Int,name:String,\n\tscore:score',
        '((number: `Int`) (name: `String`) (score: score))',
      ]),
      c(['number  :Int,asdf:Float', '((number: `Int`) (asdf: `Float`))']),
    ).run(([formula, expected], {only, skip}) =>
      (only ? it.only : skip ? it.skip : it)(`should parse arguments ${formula}`, () => {
        const [expression] = parseInternalTest(`(${formula})`, 'test_formula_arguments').get()

        expect(expression!.toLisp()).toEqual(expected)
      }),
    )
  })

  describe('invalid arguments', () => {
    cases<[string, string]>(
      c(['123', "Expected a reference, found '123)'"]),
      c(['123: Int', "Expected a reference, found '123:'"]),
      c(['#foo: Int, foo: String', "Found second argument with the same name 'foo'"]),
      c(['#foo: Int, bar foo: String', "Found second argument with the same name 'foo'"]),
      c(['foo bar: Int, foo baz: Int', "Found second argument with the same name 'foo'"]),
      c([
        'foo: fn(bar: Int = 0): Int',
        'Default values are not allowed in formula type definitions',
      ]),
    ).run(([formula, message], {only, skip}) =>
      (only ? it.only : skip ? it.skip : it)(`should not parse arguments ${formula}`, () => {
        expect(() => {
          parseInternalTest(`(${formula})`, 'test_formula_arguments').get()
        }).toThrow(message)
      }),
    )
  })
})
