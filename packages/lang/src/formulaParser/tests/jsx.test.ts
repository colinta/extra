import {c, cases} from '@extra-lang/cases'
import {parse} from '../../formulaParser'

describe('jsx', () => {
  describe('parse', () => {
    cases<[string, string]>(
      //
      c([
        //
        '',
        ``,
      ]),
    ).run(([formula, expectedCode], {only, skip}) =>
      (only ? it.only : skip ? it.skip : it)(
        `'${formula}' should parse as '${expectedCode}'`,
        () => {
          const expression = parse(formula).get()
          expect(expression.toCode()).toEqual(expectedCode)
        },
      ),
    )
  })
})
