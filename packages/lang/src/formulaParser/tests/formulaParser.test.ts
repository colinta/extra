import {c, cases} from '@extra-lang/cases'
import {parse} from '../../formulaParser'
import {type Expression} from '../../expressions'

describe('function parser', () => {
  describe('formulas', () => {
    cases<[string, string] | [string, string, string]>(
      c([
        'aThing?.b_b // 2 > 4 and c.contains(_d_) or e == f-123',
        '(or (and (> (// (?. aThing b_b) 2) 4) (fn (. c contains) (_d_))) (== e f-123))',
      ]),
      c(['1d20 + 3 * 1d8 + 3', '(+ (+ (roll 1d20) (* 3 (roll 1d8))) 3)']),
      c(['d20', '(roll d20)']),
      c(['[1, 2, 3]', '[1 2 3]']),
      c(['a.b.c[1 + 1]', '([] (. (. a b) c) (+ 1 1))']),
      c([
        '-2.2**(2 * 1)**2 * 3 >= 6 * (5 + 1)',
        '(>= (* (- (** 2.2 (** (* 2 1) 2))) 3) (* 6 (+ 5 1)))',
      ]),
      c(['3 ≥ 6', '(>= 3 6)', '3 >= 6']),
      c(['not a or b', '(or (not a) b)']),
      c(['!a or b', '(or (not a) b)', 'not a or b']),
      c(['not .a or -@b and $c', '(or (not (. a)) (and (- @b) ($ c)))']),
      c(['a <=> b', '(<=> a b)']),
      c(['a |> $#pipe', '(|> a ($ `#pipe`))']),
      c(["[-1, 2, 3] |> join(', ')", "(|> [-1 2 3] (fn join (', ')))"]),
      c([
        "[-1, 2, 3] |> join(#pipe, ', ') |> foo(#pipe)",
        "(|> (|> [-1 2 3] (fn join (`#pipe` ', '))) (fn foo (`#pipe`)))",
      ]),
      c(['doeet()', '(fn doeet ())']),
      c(['doeet()[one]', '([] (fn doeet ()) one)']),
      c(['map(fn(): Int => 1)', '(fn map ((fn () : `Int` => 1)))']),
      c(['map(fn(a: Int): Float => 1)', '(fn map ((fn ((a: `Int`)) : `Float` => 1)))']),
      c(['map(fn(a: Int = 1): Int => 1)', '(fn map ((fn ((a: `Int` 1)) : `Int` => 1)))']),
      c(['null ?? true or false', '(?? `null` (or `true` `false`))']),
      c(["any(type: 'foo', kit: 1, three: 3)", "(fn any ((type: 'foo') (kit: 1) (three: 3)))"]),
      c(['foo.bar().thing', '(. (fn (. foo bar) ()) thing)']),
      c(['foo is /test/', '(is foo /test/)']),
      c(['foo is /test/ims', '(is foo /test/ims)']),
      c(['foo is /\\d+/imss', '(is foo /\\d+/ims)', 'foo is /\\d+/ims']),
      c(['lhs is Array(Int) and foo', '(and (is lhs Array(`Int`)) foo)']),
    ).run(([formula, expectedLisp, expectedCode], {only, skip}) =>
      (only ? it.only : skip ? it.skip : it)(`should parse formula '${formula}'`, () => {
        let expression: Expression = parse(formula).get()

        expect(expression!.toCode()).toEqual(expectedCode ?? formula)
        expect(expression!.toLisp()).toEqual(expectedLisp)
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

  describe('conditional inclusion', () => {
    cases<[string, string] | [string, string, string]>(
      c(['[x onlyif c]', '[(onlyif x c)]']),
      c(['[...x onlyif c]', '[(... (onlyif x c))]']),
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
      c(['{...lhs, ...rhs}', '{(... lhs) (... rhs)}']),
      c(['{...lhs, rhs}', '{(... lhs) rhs}']),
      c(['{...lhs, ...rhs}', '{(... lhs) (... rhs)}']),
      c(['{...lhs, rhs: 1}', '{(... lhs) (rhs: 1)}']),
    ).run(([formula, expectedLisp, expectedCode], {only, skip}) =>
      (only ? it.only : skip ? it.skip : it)(`should parse formula '${formula}'`, () => {
        expectedCode ??= formula

        let expression: Expression = parse(formula).get()

        expect(expression!.toCode()).toEqual(expectedCode)
        expect(expression!.toLisp()).toEqual(expectedLisp)
      }),
    )
  })

  describe('object', () => {
    cases<[string, string] | [string, string, string]>(
      c(['{}', '{}']),
      c([' { }', '{}', '{}']),
      c(['{}', '{}', '{}']),
      c([' {  }', '{}', '{}']),
      c(["{a: 'a'}", "{(a: 'a')}"]),
      c(["{a: 'a', b: [1, 2, 3]}", "{(a: 'a') (b: [1 2 3])}"]),
      c(['{foo:, bar:}', '{(foo: foo) (bar: bar)}', '{foo:, bar:}']),
      c([
        "{a: a, b:, c: 'c', dee:}",
        "{(a: a) (b: b) (c: 'c') (dee: dee)}",
        "{a:, b:, c: 'c', dee:}",
      ]),
      // "tuples"
      c(["{'a'}", "{'a'}"]),
      c(["{'a', [1, 2, 3]}", "{'a' [1 2 3]}"]),
      c(['{foo, bar}', '{foo bar}', '{foo, bar}']),
      // mixed
      c(["{a, b, c: 'c', dee}", "{a b (c: 'c') dee}"]),
      c(["{a, b, c: 'c', dee:}", "{a b (c: 'c') (dee: dee)}"]),
    ).run(([formula, expectedLisp, expectedCode], {only, skip}) =>
      (only ? it.only : skip ? it.skip : it)(`should parse object '${formula}'`, () => {
        expectedCode ??= formula
        let expression: Expression = parse(formula).get()

        expect(expression!.toCode()).toEqual(expectedCode)
        expect(expression!.toLisp()).toEqual(expectedLisp)
      }),
    )
  })

  describe('trailing commas', () => {
    cases<[string, string]>(c(['{a: 1,}', '{a: 1}']), c(['{a: 1 , }', '{a: 1}'])).run(
      ([formula, expected], {only, skip}) =>
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
    cases<[string, string]>(
      c(['#pipe |> foo()', "Unexpected token '#pipe'"]),
      c(['1 + + 1', "Unexpected token '+'"]),
    ).run(([formula, message], {only, skip}) =>
      (only ? it.only : skip ? it.skip : it)(`should not parse ${formula}`, () => {
        expect(() => {
          parse(formula).get()
        }).toThrow(message)
      }),
    )
  })
})
