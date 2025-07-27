import {c, cases} from '@extra-lang/cases'
import {parseInternalTest} from '../../formulaParser'

describe('helper', () => {
  cases<[string, string] | [string, string, string]>(
    c(["fn asdf() =>\n  @test ?? 'null'", "(fn asdf() => (?? @test 'null'))"]),
    c(["public fn asdf() =>\n  @test ?? 'null'", "(fn public asdf() => (?? @test 'null'))"]),
  ).run(([formula, expectedLisp, expectedCode], {only, skip}) =>
    (only ? it.only : skip ? it.skip : it)(`should parse helper definition '${formula}'`, () => {
      expectedCode = expectedCode ?? formula
      const [expression] = parseInternalTest(formula, 'app_helper_definition').get()

      expect(expression!.toCode()).toEqual(expectedCode)
      expect(expression!.toLisp()).toEqual(expectedLisp)
    }),
  )
})

describe('bad helpers', () => {
  cases<[string, string]>(
    c(['fn Asdf() => ""', 'Formulas must start with an uppercased letter']),
  ).run(([formula, error], {only, skip}) =>
    (only ? it.only : skip ? it.skip : it)(
      `should error parsing Helper definitions ${formula}`,
      () => {
        expect(() => parseInternalTest(formula, 'app_helper_definition').get()).toThrow(error)
      },
    ),
  )
})
