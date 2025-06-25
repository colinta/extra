import {c, cases} from '@extra-lang/cases'
import {parseInternalTest} from '~/formulaParser'

describe('requires', () => {
  cases<[string] | [string, string]>(c(['requires A']), c(['requires A, B'])).run(
    (args, {only, skip}) =>
      (only ? it.only : skip ? it.skip : it)(`should parse '${args[0]}'`, () => {
        const [formula, expectedCode] = args
        const [expression] = parseInternalTest(formula, 'app_requires_definition').get()

        expect(expression!.toCode()).toEqual(expectedCode ?? formula)
      }),
  )
})

describe('bad requires', () => {
  cases<[string, string]>(
    c(['requires', "Expected comma-separated environment names after 'requires' expression"]),
    c(['requires ', 'Expected a reference']),
    c(['requires /', "Expected a reference, found '/'"]),
  ).run(([formula, error], {only, skip}) =>
    (only ? it.only : skip ? it.skip : it)(`should error parsing '${formula}'`, () => {
      expect(() => parseInternalTest(formula, 'app_requires_definition').get()).toThrow(error)
    }),
  )
})
