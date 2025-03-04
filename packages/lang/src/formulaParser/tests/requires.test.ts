import {c, cases} from '@extra-lang/cases'
import {type Expression} from '../expressions'
import {parseInternalTest} from '../'

describe('requires', () => {
  cases<[string] | [string, string]>(c(['requires A']), c(['requires A, B'])).run(args =>
    it(`should parse '${args[0]}'`, () => {
      const [formula, expectedCode] = args
      let expression: Expression
      expect(() => {
        ;[expression] = parseInternalTest(formula, 'app_requires_definition').get()
      }).not.toThrow()

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
