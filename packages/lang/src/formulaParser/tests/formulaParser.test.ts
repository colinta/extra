import {c, cases} from '@extra-lang/cases'
import {parse} from '~/formulaParser'
import {type Expression} from '~/formulaParser/expressions'

describe('function parser', () => {
  describe('formulas', () => {
    cases<[string, string] | [string, string, string]>(
      c([
        'aThing?.b_b // 2 > 4 and c.contains(_d_) or e == f-123',
        '(or (and (> (// (?. aThing b_b) 2) 4) (fn (. c contains) (_d_))) (== e f-123))',
      ]),
      c(['1 |> # + 1 |> # * 2', '(|> (|> 1 (+ `#` 1)) (* `#` 2))']),
      c(['1 ?|> # + 1', '(?|> 1 (+ `#` 1))']),
      c(['1d20 + 3 * 1d8 + 3', '(+ (+ (roll 1d20) (* 3 (roll 1d8))) 3)']),
      c(['d20', '(roll d20)']),
      c(['[1, 2, 3]', '[1 2 3]']),
      c(['dict(key: 1, foo: 2, bar: 3)', 'dict((key: 1) (foo: 2) (bar: 3))']),
      c(['dict("key 1": 1, 2: 2)', "dict(('key 1': 1) (2: 2))", "dict('key 1': 1, 2: 2)"]),
      c(['a.b.c[1 + 1]', '([] (. (. a b) c) (+ 1 1))']),
      c([
        '-2.2**(2 * 1)**2 * 3 >= 6 * (5 + 1)',
        '(>= (* (- (** 2.2 (** (* 2 1) 2))) 3) (* 6 (+ 5 1)))',
      ]),
      c(['3 ≥ 6', '(>= 3 6)', '3 >= 6']),
      c(['not a or b', '(or (not a) b)']),
      c(['not .a or -@b and $&c', '(or (not (. a)) (and (- @b) ($ &c)))']),
      c(['a <=> b', '(<=> a b)']),
      c(['a |> $#', '(|> a ($ `#`))']),
      c(["[-1, 2, 3] |> join(', ')", "(|> [-1 2 3] (fn join (', ')))"]),
      c([
        "[-1, 2, 3] |> join(#, ', ') |> foo(#)",
        "(|> (|> [-1 2 3] (fn join (`#` ', '))) (fn foo (`#`)))",
      ]),
      c(['doeet()', '(fn doeet ())']),
      c(['doeet()[one]', '([] (fn doeet ()) one)']),
      c(['map(fn(): Int => 1)', '(fn map ((fn () : `Int` => 1)))']),
      c(['map(fn(a: Int): Float => 1)', '(fn map ((fn ((a: `Int`)) : `Float` => 1)))']),
      c(['map(fn(a: Int = 1): Int => 1)', '(fn map ((fn ((a: `Int` 1)) : `Int` => 1)))']),
      c(['null ?? true or false', '(?? `null` (or `true` `false`))']),
      c(["any(type: 'foo', kit: 1, three: 3)", "(fn any ((type: 'foo') (kit: 1) (three: 3)))"]),
      c(['foo.bar().thing', '(. (fn (. foo bar) ()) thing)']),
      c(['foo matches /test/', '(matches foo /test/)']),
      c(['foo matches /test/gims', '(matches foo /test/gims)']),
      c(['foo matches /\\d+/ggimss', '(matches foo /\\d+/gims)', 'foo matches /\\d+/gims']),
      c(['lhs is Array(Int) and foo', '(and (is lhs Array(`Int`)) foo)']),
    ).run(([formula, expectedLisp, expectedCode], {only, skip}) =>
      (only ? it.only : skip ? it.skip : it)(`should parse formula '${formula}'`, () => {
        let expression: Expression = parse(formula).get()

        expect(expression!.toCode()).toEqual(expectedCode ?? formula)
        expect(expression!.toLisp()).toEqual(expectedLisp)
      }),
    )
  })

  describe('conditional formulas', () => {
    cases<[string, string] | [string, string, string]>(
      c(['[x if c]', '[(if c x)]']),
      c(['[...x if c]', '[(... (if c x))]']),
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
      c(['dict(...lhs, rhs: 1)', 'dict((... lhs) (rhs: 1))']),
      c(['set(...lhs, rhs)', 'set((... lhs) rhs)']),
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

  describe('dict', () => {
    cases<[string, string] | [string, string, string]>(
      c(['dict()', 'dict()']),
      c([' dict(  )', 'dict()', 'dict()']),
      c(['dict()', 'dict()', 'dict()']),
      c([' dict(  )', 'dict()', 'dict()']),
      c(["dict(a: 'a')", "dict((a: 'a'))"]),
      c(['dict(a:)', 'dict((a: a))']),
      c(["dict('a': a)", "dict(('a': a))", "dict('a': a)"]),
      c(["dict('1': a)", "dict(('1': a))", "dict('1': a)"]),
      c(['dict((1+1): a)', 'dict(((+ 1 1): a))', 'dict((1 + 1): a)']),
      c(['dict(1: a)', 'dict((1: a))', 'dict(1: a)']),
      c(["dict(a: 'a', b: [1, 2, 3])", "dict((a: 'a') (b: [1 2 3]))"]),
      c([
        "dict(a: a, b:, c: 'c', dee: dee)",
        "dict((a: a) (b: b) (c: 'c') (dee: dee))",
        "dict(a:, b:, c: 'c', dee:)",
      ]),
    ).run(([formula, expectedLisp, expectedCode], {only, skip}) =>
      (only ? it.only : skip ? it.skip : it)(`should parse dict '${formula}'`, () => {
        expectedCode ??= formula
        let expression: Expression = parse(formula).get()

        expect(expression!.toCode()).toEqual(expectedCode)
        expect(expression!.toLisp()).toEqual(expectedLisp)
      }),
    )
  })

  describe('set', () => {
    cases<[string, string] | [string, string, string]>(
      c(['set()', 'set()', 'set()']),
      c([' set(  )', 'set()', 'set()']),
      c(['set()', 'set()', 'set()']),
      c([' set(  )', 'set()', 'set()']),
      c(["set('a')", "set('a')"]),
      c(['set(a)', 'set(a)']),
      c(['set(a)', 'set(a)', 'set(a)']),
      c(["set('a', [1, 2, 3])", "set('a' [1 2 3])"]),
      c(["set(a, b, 'c', dee)", "set(a b 'c' dee)", "set(a, b, 'c', dee)"]),
    ).run(([formula, expectedLisp, expectedCode], {only, skip}) =>
      (only ? it.only : skip ? it.skip : it)(`should parse dict '${formula}'`, () => {
        expectedCode ??= formula
        let expression: Expression = parse(formula).get()

        expect(expression!.toCode()).toEqual(expectedCode)
        expect(expression!.toLisp()).toEqual(expectedLisp)
      }),
    )
  })

  describe('trailing commas', () => {
    cases<[string, string]>(
      c(['{a: 1,}', '{a: 1}']),
      c(['{a: 1 , }', '{a: 1}']),
      c(['dict(foo: 1, bar: 2,)', 'dict(foo: 1, bar: 2)']),
      c(['dict(foo: 1, bar: 2\n , \n )', 'dict(foo: 1, bar: 2)']),
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
    cases<[string, string]>(
      c(['# |> foo()', "Unexpected token '#'"]),
      c(['dict(foo: 1, :)', 'Expected a reference']),
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
