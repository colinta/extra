import {c, cases} from '@extra-lang/cases'
import {testScan} from '..'
import {scanRequiresStatement} from '../scan/application'

describe('requires', () => {
  cases<[string] | [string, string]>(c(['requires A']), c(['requires A, B'])).run(
    (args, {only, skip}) =>
      (only ? it.only : skip ? it.skip : it)(`should parse '${args[0]}'`, () => {
        const [formula, expectedCode] = args
        const expression = testScan(formula, scanRequiresStatement)

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
      expect(() => testScan(formula, scanRequiresStatement)).toThrow(error)
    }),
  )
})
