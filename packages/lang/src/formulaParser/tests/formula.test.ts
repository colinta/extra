import {c, cases} from '@extra-lang/cases'
import * as Values from '../../values'
import {type ValueRuntime} from '../../runtime'
import {parse, parseType} from '../../formulaParser'
import {type Expression} from '../../expressions'
import {mockValueRuntime} from '../../tests/mockValueRuntime'

let valueRuntime: ValueRuntime

beforeEach(() => {
  valueRuntime = mockValueRuntime({})
})

describe('formulas', () => {
  describe('parse', () => {
    cases<[string, string] | [string, string, string]>(
      c(['fn(): Int => 0', '(fn () : `Int` => 0)']),
      c(['fn(): {foo: Int} => 0', '(fn () : {(foo: `Int`)} => 0)']),
      c(['fn(# a: Int): Int => 0', '(fn ((# a: `Int`)) : `Int` => 0)']),
      c(['fn(# a: Int = 0): Int => 0', '(fn ((# a: `Int` 0)) : `Int` => 0)']),
      c(['fn(# a: Int, a b: Int): Int => 0', '(fn ((# a: `Int`) (a b: `Int`)) : `Int` => 0)']),
      c([
        'fn(name: String?, age: Int?) => 0',
        '(fn ((name: (`String` | `null`)) (age: (`Int` | `null`))) => 0)',
      ]),
      c([
        'fn(name: String | null, age: Int | null) => 0',
        '(fn ((name: (`String` | `null`)) (age: (`Int` | `null`))) => 0)',
        'fn(name: String?, age: Int?) => 0',
      ]),
      c([
        "fn(name: 'alice' | 'bob', age: 1 | 2 | 42) => 0",
        "(fn ((name: ('alice' | 'bob')) (age: (1 | 2 | 42))) => 0)",
      ]),
      c([
        `\
fn(
  name:
    | 'alice'
    | 'bob'
  age:
    1
    | 2 |
    42
) => 0`,
        "(fn ((name: ('alice' | 'bob')) (age: (1 | 2 | 42))) => 0)",
        "fn(name: 'alice' | 'bob', age: 1 | 2 | 42) => 0",
      ]),
      c([
        'fn(# a: Int, ...# as: [Int]): Int => 0',
        '(fn ((# a: `Int`) (...# as: Array(`Int`))) : `Int` => 0)',
      ]),
      c([
        'fn(# a: Int, **as: Dict(Int)): Int => 0',
        '(fn ((# a: `Int`) (**as: Dict(`Int`))) : `Int` => 0)',
      ]),
      c([
        'fn(# a: Int, ...a as: [Int]): Int => 0',
        '(fn ((# a: `Int`) (...a as: Array(`Int`))) : `Int` => 0)',
      ]),
      c([
        'fn(# a: Int, # b: Int, # c: Int, # d: Int, # e: Int, # f: Int, # g: Int, # h: Int, # i: Int, # j: Int, # k: Int, # l: Int, # m: Int, # n: Int, # o: Int, # p: Int): Int => 0',
        '(fn ((# a: `Int`) (# b: `Int`) (# c: `Int`) (# d: `Int`) (# e: `Int`) (# f: `Int`) (# g: `Int`) (# h: `Int`) (# i: `Int`) (# j: `Int`) (# k: `Int`) (# l: `Int`) (# m: `Int`) (# n: `Int`) (# o: `Int`) (# p: `Int`)) : `Int` => 0)',
        `\
fn(
  # a: Int
  # b: Int
  # c: Int
  # d: Int
  # e: Int
  # f: Int
  # g: Int
  # h: Int
  # i: Int
  # j: Int
  # k: Int
  # l: Int
  # m: Int
  # n: Int
  # o: Int
  # p: Int
): Int =>
  0`,
      ]),
      c(['fn(...a: [Int]): Int => 0', '(fn ((...a: Array(`Int`))) : `Int` => 0)']),
      c(['fn(a: Int): Int => 0', '(fn ((a: `Int`)) : `Int` => 0)']),
      c(['fn(a: Int, # b: Int): Int => 0', '(fn ((a: `Int`) (# b: `Int`)) : `Int` => 0)']),
      c([
        'fn(a: fn(): Int, # b: fn(): Int): fn(): Int => fn() => a() + b()',
        '(fn ((a: (fn () : `Int`)) (# b: (fn () : `Int`))) : (fn () : `Int`) => (fn () => (+ (fn a ()) (fn b ()))))',
      ]),
      c([
        'fn<T>(a: fn(): T, # b: fn(): T): T => b()',
        '(fn <T> ((a: (fn () : T)) (# b: (fn () : T))) : T => (fn b ()))',
      ]),
      c([
        'fn<T, U>(a: fn(): T, # b: fn(): U): {T, U} => {a(), b()}',
        '(fn <T U> ((a: (fn () : T)) (# b: (fn () : U))) : {T U} => {(fn a ()) (fn b ())})',
      ]),
      c(['fn(# arg: .a | .b): T => b()', '(fn ((# arg: (.a | .b))) : T => (fn b ()))']),
      c(['fn(# arg: {a: String}): T => b()', '(fn ((# arg: {(a: `String`)})) : T => (fn b ()))']),
      c([
        `fn{
  (# a: Int, # b: Int): Int => a + b
  inc: fn(# x: Int): Int => x + 1
  dec: fn(# x: Int): Int => x - 1
}`,
        '(fn{ ((# a: `Int`) (# b: `Int`)) : `Int` => (+ a b) (inc: (fn ((# x: `Int`)) : `Int` => (+ x 1))) (dec: (fn ((# x: `Int`)) : `Int` => (- x 1))) })',
        'fn{(# a: Int, # b: Int): Int => a + b, inc: fn(# x: Int): Int => x + 1, dec: fn(# x: Int): Int => x - 1}',
      ]),
    ).run(([formula, expectedLisp, expectedCode], {only, skip}) =>
      (only ? it.only : skip ? it.skip : it)(`should parse formula '${formula}'`, () => {
        expectedCode ??= formula

        let expression: Expression = parse(formula).get()

        expect(expression!.toCode()).toEqual(expectedCode)
        expect(expression!.toLisp()).toEqual(expectedLisp)
      }),
    )
  })

  describe('parse formula type', () => {
    cases<[string, string] | [string, string, string]>(
      c(['fn(): Int', '(fn () : `Int`)']),
      c(['fn(): {foo: Int}', '(fn () : {(foo: `Int`)})']),
      c(['fn(# a: Int): Int', '(fn ((# a: `Int`)) : `Int`)']),
      c(['fn(# a: Int): Int', '(fn ((# a: `Int`)) : `Int`)']),
      c(['fn(# b: Int, a: Int): Int', '(fn ((# b: `Int`) (a: `Int`)) : `Int`)']),
      c([
        'fn(name: String?, age: Int?)',
        '(fn ((name: (`String` | `null`)) (age: (`Int` | `null`))))',
      ]),
      c([
        'fn(name: String | null, age: Int | null)',
        '(fn ((name: (`String` | `null`)) (age: (`Int` | `null`))))',
        'fn(name: String?, age: Int?)',
      ]),
      c([
        "fn(name: 'alice' | 'bob', age: 1 | 2 | 42)",
        "(fn ((name: ('alice' | 'bob')) (age: (1 | 2 | 42))))",
      ]),
      c([
        `\
fn(
  name:
    | 'alice'
    | 'bob'
  age:
    1
    | 2 |
    42
)`,
        "(fn ((name: ('alice' | 'bob')) (age: (1 | 2 | 42))))",
        "fn(name: 'alice' | 'bob', age: 1 | 2 | 42)",
      ]),
      c([
        'fn(# a: Int, ...# as: [Int]): Int',
        '(fn ((# a: `Int`) (...# as: Array(`Int`))) : `Int`)',
      ]),
      c(['fn(# a: Int, **as: Dict(Int)): Int', '(fn ((# a: `Int`) (**as: Dict(`Int`))) : `Int`)']),
      c(['fn(# a: Int, ...as: [Int]): Int', '(fn ((# a: `Int`) (...as: Array(`Int`))) : `Int`)']),
      c([
        'fn(# a: Int, # b: Int, # c: Int, # d: Int, # e: Int, # f: Int, # g: Int, # h: Int, # i: Int, # j: Int, # k: Int, # l: Int, # m: Int, # n: Int, # o: Int, # p: Int): Int',
        '(fn ((# a: `Int`) (# b: `Int`) (# c: `Int`) (# d: `Int`) (# e: `Int`) (# f: `Int`) (# g: `Int`) (# h: `Int`) (# i: `Int`) (# j: `Int`) (# k: `Int`) (# l: `Int`) (# m: `Int`) (# n: `Int`) (# o: `Int`) (# p: `Int`)) : `Int`)',
        `\
fn(
  # a: Int
  # b: Int
  # c: Int
  # d: Int
  # e: Int
  # f: Int
  # g: Int
  # h: Int
  # i: Int
  # j: Int
  # k: Int
  # l: Int
  # m: Int
  # n: Int
  # o: Int
  # p: Int
): Int`,
      ]),
      c(['fn(...a: [Int]): Int', '(fn ((...a: Array(`Int`))) : `Int`)']),
      c(['fn(a: Int): Int', '(fn ((a: `Int`)) : `Int`)']),
      c(['fn(a: Int, # b: Int): Int', '(fn ((a: `Int`) (# b: `Int`)) : `Int`)']),
      c([
        'fn(a: fn(): Int, # b: fn(): Int): fn(): Int',
        '(fn ((a: (fn () : `Int`)) (# b: (fn () : `Int`))) : (fn () : `Int`))',
      ]),
      c([
        'fn<T>(a: fn(): T, # b: fn(): T): T',
        '(fn <T> ((a: (fn () : T)) (# b: (fn () : T))) : T)',
      ]),
      c([
        'fn<T, U>(a: fn(): T, # b: fn(): U): {T, U}',
        '(fn <T U> ((a: (fn () : T)) (# b: (fn () : U))) : {T U})',
      ]),
      c(['fn(# arg: .a | .b): T', '(fn ((# arg: (.a | .b))) : T)']),
      c(['fn(# arg: {a: String}): T', '(fn ((# arg: {(a: `String`)})) : T)']),
      c([
        `fn{
  (# a: Int, # b: Int): Int
  inc: fn(# x: Int): Int
  dec: fn(# x: Int): Int
}`,
        '(fn{ ((# a: `Int`) (# b: `Int`)) : `Int` (inc: (fn ((# x: `Int`)) : `Int`)) (dec: (fn ((# x: `Int`)) : `Int`)) })',
        'fn{(# a: Int, # b: Int): Int, inc: fn(# x: Int): Int, dec: fn(# x: Int): Int}',
      ]),
    ).run(([formula, expectedLisp, expectedCode], {only, skip}) =>
      (only ? it.only : skip ? it.skip : it)(`should parse formula '${formula}'`, () => {
        expectedCode ??= formula

        let expression: Expression = parseType(formula).get()

        expect(expression!.toCode()).toEqual(expectedCode)
        expect(expression!.toLisp()).toEqual(expectedLisp)
      }),
    )
  })

  describe('eval', () => {
    cases<[string, Values.Value]>(
      c(['(fn(): Int => 0)()', Values.int(0)]),
      c(['(fn(# a: Int = 0): Int => a)()', Values.int(0)]),
      c(['(fn(# a: Int): Int => a)(1)', Values.int(1)]),
      c(['(fn(# a: Int = 0): Int => a)(1)', Values.int(1)]),
      c(['(fn(a: Int): Int => a)(a: 1)', Values.int(1)]),
      c(['(fn(# a: Int, b: Int): Int => a + b)(1, b: 2)', Values.int(3)]),
      c(['(fn(# a: Int, b: Int): Int => a + b)(b: 2, 1)', Values.int(3)]),
      c(['(fn(...# a: [Int]): Int => (a[0] ?? -1) + (a[1] ?? -1))()', Values.int(-2)]),
      c(['(fn(...# a: [Int]): Int => (a[0] ?? -1) + (a[1] ?? -1))(1)', Values.int(0)]),
      c(['(fn(...# a: [Int]): Int => (a[0] ?? -1) + (a[1] ?? -1))(1, 2)', Values.int(3)]),
    ).run(([formula, expectedValue], {only, skip}) =>
      (only ? it.only : skip ? it.skip : it)(`should parse formula '${formula}'`, () => {
        const expression = parse(formula).get()
        const value = expression.eval(valueRuntime).get()

        expect(value!).toEqual(expectedValue)
      }),
    )

    cases<[string, string]>(
      c(['(fn(# a: Int, b: Int): Int => a + b)(1, 2)', "No argument named 'b'"]),
      c(['(fn(# a: Int, b: Int): Int => a + b)(a: 1, b: 2)', 'No argument passed at position #1']),
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
      c(['fn(# a: Int, # a: Int): Int => 0', "Found second argument with the same name 'a'"]),
      c(['fn(a a1: Int, a a2: Int): Int => 0', "Found second argument with the same name 'a'"]),
      c([
        'fn(a as: Array(Int), a: Array(Int)): Int => 0',
        "Found second argument with the same name 'a'",
      ]),
      c([
        'fn(...# a: Int): Int => 0',
        "Expected 'Array' type for '...# a', found 'Int'. Remaining argument lists must use the Array type, e.g. 'Array(Int)'.",
      ]),
      c([
        'fn(...a: Int): Int => 0',
        "Expected 'Array' type for '...a', found 'Int'. Remaining argument lists must use the Array type, e.g. 'Array(Int)'.",
      ]),
      c([
        'fn(# a: Int, **as: Int): Int => 0',
        "Expected 'Dict' type for '**as', found 'Int'. Keyword arguments lists must use the Dict type, e.g. 'Dict(Int)'.",
      ]),
      c([
        'fn(...# a: Array(Int), ...# b: Array(Int)): Int => 0',
        "Found second remaining arguments list '...# b' after '...# a'",
      ]),
      c([
        'fn(**a: Dict(Int), **b: Dict(Int)): Int => 0',
        "Found second keyword arguments list '**b' after '**a'",
      ]),
      c([
        'fn(# arg: enum Foo { .a }): T => b()',
        'The `enum` type is not allowed as an argument type',
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
