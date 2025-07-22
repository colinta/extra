import {c, cases} from '@extra-lang/cases'
import {parse} from '../'

describe('types', () => {
  cases<[string, string] | [string, string, string]>(
    c.skip([
      `\
let
  a = []
in
  a.map(fn(x) => x)
`,
      '',
      '',
    ]),
  ).run(([formula, expectedLisp, expectedCode], {only, skip}) =>
    (only ? it.only : skip ? it.skip : it)(`should parse '${formula}'`, () => {
      expectedCode = expectedCode ?? formula
      const result = parse(formula)
      const expression = result.get()

      expect(expression?.toCode()).toEqual(expectedCode)
      expect(expression?.toLisp()).toEqual(expectedLisp)
    }),
  )
})
