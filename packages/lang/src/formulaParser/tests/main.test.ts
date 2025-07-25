import {c, cases} from '@extra-lang/cases'
import {parseInternalTest} from '../../formulaParser'

describe('Main', () => {
  cases<[string, string] | [string, string, string]>(
    c(['Main() =>\n  null', '( Main() => `null`)']),
    c(['Main(a: A) =>\n  @a ++ a', '( Main((a: A)) => (++ @a a))']),
  ).run(args =>
    it(`should parse Main definition '${args[0]}'`, () => {
      const [formula, expected, expectedFormula] = args
      const [expression] = parseInternalTest(formula, 'app_main_definition').get()

      expect(expression!.toCode()).toEqual(expectedFormula ?? formula)
      expect(expression!.toLisp()).toEqual(expected)
    }),
  )
})

describe('bad main', () => {
  cases<[string, string]>(
    c(['fn() => ""', "Expected 'Main(' to start the formula expression"]),
    c(['Main(): Foo => ""', 'Unexpected return type in Main function']),
    c(['Main() ""', "Expected '=>' followed by the function body"]),
  ).run(([formula, error], {only, skip}) =>
    (only ? it.only : skip ? it.skip : it)(
      `should error parsing Main definitions ${formula}`,
      () => {
        expect(() => parseInternalTest(formula, 'app_main_definition').get()).toThrow(error)
      },
    ),
  )
})
