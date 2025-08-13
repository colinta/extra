import {c, cases} from '@extra-lang/cases'
import {testScan} from '../../formulaParser'
import {scanJsx} from '../scan/jsx'

// JSX is mostly tested via view.test.ts
describe('jsx', () => {
  describe('parse', () => {
    cases<[string, string]>(
      c(['<div />', `<div />`]),
      c(['<div foo />', `<div foo />`]),
      c(['<div foo="bar" />', `<div foo='bar' />`]),
      c(['<div><p>text</p></div>', `<div><p>text</p></div>`]),
    ).run(([formula, expectedCode], {only, skip}) =>
      (only ? it.only : skip ? it.skip : it)(
        `'${formula}' should parse as '${expectedCode}'`,
        () => {
          const expression = testScan(formula, scanJsx).get()
          expect(expression.toCode()).toEqual(expectedCode)
        },
      ),
    )
  })
})
