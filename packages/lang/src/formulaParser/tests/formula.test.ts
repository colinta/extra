import {c, cases} from '@extra-lang/cases'
import * as Values from '~/values'
import {type ValueRuntime} from '~/runtime'
import {parse} from '~/formulaParser'
import {type Expression} from '~/formulaParser/expressions'
import {mockValueRuntime} from '~/tests/mockValueRuntime'

let valueRuntime: ValueRuntime

beforeEach(() => {
  valueRuntime = mockValueRuntime({})
})

describe('formulas', () => {
  describe('parse', () => {
    cases<[string, string] | [string, string, string]>(
      c(['fn(): Int => 0', '(fn () : `Int` => 0)']),
      c(['fn(): {foo: Int} => 0', '(fn () : {(foo: `Int`)} => 0)']),
      c(['fn(#a: Int): Int => 0', '(fn ((#a: `Int`)) : `Int` => 0)']),
      c(['fn(#a: Int = 0): Int => 0', '(fn ((#a: `Int` 0)) : `Int` => 0)']),
      c(['fn(#a: Int, a b: Int): Int => 0', '(fn ((#a: `Int`) (a b: `Int`)) : `Int` => 0)']),
      c([
        'fn(name: String?, age: Int?) => 0',
        '(fn ((name: (`String` | `null`)) (age: (`Int` | `null`))) => 0)',
      ]),
      c([
        'fn(#a: Int, ...#as: Array(Int)): Int => 0',
        '(fn ((#a: `Int`) (...#as: Array(`Int`))) : `Int` => 0)',
      ]),
      c([
        'fn(#a: Int, *as: Dict(Int)): Int => 0',
        '(fn ((#a: `Int`) (*as: Dict(`Int`))) : `Int` => 0)',
      ]),
      c([
        'fn(#a: Int, ...a as: Array(Int)): Int => 0',
        '(fn ((#a: `Int`) (...a as: Array(`Int`))) : `Int` => 0)',
      ]),
      c(['fn(...a: Array(Int)): Int => 0', '(fn ((...a: Array(`Int`))) : `Int` => 0)']),
      c(['fn(a: Int): Int => 0', '(fn ((a: `Int`)) : `Int` => 0)']),
      c(['fn(a: Int, #b: Int): Int => 0', '(fn ((a: `Int`) (#b: `Int`)) : `Int` => 0)']),
    ).run(([formula, expectedLisp, expectedCode], {only, skip}) =>
      (only ? it.only : skip ? it.skip : it)(`should parse formula '${formula}'`, () => {
        expectedCode ??= formula

        let expression: Expression = parse(formula).get()

        expect(expression!.toCode()).toEqual(expectedCode)
        expect(expression!.toLisp()).toEqual(expectedLisp)
      }),
    )
  })

  describe('eval', () => {
    cases<[string, Values.Value]>(
      c(['(fn(): Int => 0)()', Values.int(0)]),
      c(['(fn(#a: Int): Int => a)(1)', Values.int(1)]),
      c(['(fn(a: Int): Int => a)(a: 1)', Values.int(1)]),
      c(['(fn(#a: Int, b: Int): Int => a + b)(1, b: 2)', Values.int(3)]),
      c(['(fn(#a: Int, b: Int): Int => a + b)(b: 2, 1)', Values.int(3)]),
      c(['(fn(...#a: Array(Int)): Int => (a[0] ?? -1) + (a[1] ?? -1))()', Values.int(-2)]),
      c(['(fn(...#a: Array(Int)): Int => (a[0] ?? -1) + (a[1] ?? -1))(1)', Values.int(0)]),
      c(['(fn(...#a: Array(Int)): Int => (a[0] ?? -1) + (a[1] ?? -1))(1, 2)', Values.int(3)]),
    ).run(([formula, expectedValue], {only, skip}) =>
      (only ? it.only : skip ? it.skip : it)(`should parse formula '${formula}'`, () => {
        const expression = parse(formula).get()
        const value = expression.eval(valueRuntime).get()

        expect(value!).toEqual(expectedValue)
      }),
    )

    cases<[string, string]>(
      c(['(fn(#a: Int, b: Int): Int => a + b)(1, 2)', "No argument passed for 'b'"]),
      c(['(fn(#a: Int, b: Int): Int => a + b)(a: 1, b: 2)', 'No argument passed at position #1']),
    ).run(([formula, expectedMessage], {only, skip}) =>
      (only ? it.only : skip ? it.skip : it)(`should parse formula '${formula}'`, () => {
        expect(() => {
          const expression = parse(formula).get()
          expression.eval(valueRuntime).get()
        }).toThrow(expectedMessage)
      }),
    )
  })

  describe('invalid', () => {
    cases<[string, string]>(
      c(['fn(#a: Int, #a: Int): Int => 0', "Found second argument with the same name 'a'"]),
      c(['fn(a a1: Int, a a2: Int): Int => 0', "Found second argument with the same name 'a'"]),
      c([
        'fn(...#a: Int): Int => 0',
        "Expected 'Array' type for '...#a', found 'Int'. Remaining argument lists must use the Array type, e.g. 'Array(Int)'.",
      ]),
      c([
        'fn(...a: Int): Int => 0',
        "Expected 'Array' type for '...a', found 'Int'. Remaining argument lists must use the Array type, e.g. 'Array(Int)'.",
      ]),
      c([
        'fn(#a: Int, *as: Int): Int => 0',
        "Expected 'Dict' type for '*as', found 'Int'. Keyword arguments lists must use the Dict type, e.g. 'Dict(Int)'.",
      ]),
      c([
        'fn(...a as: Array(Int), ...a: Array(Int)): Int => 0',
        "Found second argument with the same name 'a'",
      ]),
      c([
        'fn(...#a: Array(Int), ...#b: Array(Int)): Int => 0',
        "Found second remaining arguments list '...#b' after '...#a'",
      ]),
      c([
        'fn(*a: Dict(Int), *b: Dict(Int)): Int => 0',
        "Found second keyword arguments list '*b' after '*a'",
      ]),
    ).run(([formula, message], {only, skip}) =>
      (only ? it.only : skip ? it.skip : it)(`should not parse ${formula}`, () => {
        expect(() => {
          const expr = parse(formula).get()
          expect(expr).toBeUndefined()
        }).toThrow(message)
      }),
    )
  })
})
