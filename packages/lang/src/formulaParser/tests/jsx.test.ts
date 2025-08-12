import {c, cases} from '@extra-lang/cases'
import {parse, testScan} from '../../formulaParser'
import {scanJsx} from '../scan/jsx'

describe('jsx', () => {
  describe('parse', () => {
    cases<[string, string]>(
      //
      c([
        //
        '<div />',
        `<div />`,
      ]),
    ).run(([formula, expectedCode], {only, skip}) =>
      (only ? it.only : skip ? it.skip : it)(
        `'${formula}' should parse as '${expectedCode}'`,
        () => {
          const expression = testScan(formula, scanJsx)
          expect(expression.toCode()).toEqual(expectedCode)
        },
      ),
    )
  })
})
