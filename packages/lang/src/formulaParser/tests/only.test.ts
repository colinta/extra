import {c, cases} from '@extra-lang/cases'
import {type Expression} from '../expressions'
import {parseInternalTest} from '../'

describe('types', () => {
  cases<[string, string] | [string, string, string]>(
    c([
      `\
type User = {
  first-name: String(length: >=1)
  last-name: String(length: >=1)
  fullname: fn(): String
}`,
      '(type User {(first-name: `String(length: >=1)`) (last-name: `String(length: >=1)`) (fullname: (fn () : (`String`)))})',
      `\
type User = {first-name: String(length: >=1), last-name: String(length: >=1), fullname: fn(): String}`,
    ]),
  ).run(([formula, expectedLisp, expectedCode], {only, skip}) =>
    (only ? it.only : skip ? it.skip : it)(`should parse type definition '${formula}'`, () => {
      expectedCode = expectedCode ?? formula
      const result = parseInternalTest(formula, 'app_type_definition')
      const [expression] = result.get()

      expect(expression?.toCode()).toEqual(expectedCode)
      expect(expression?.toLisp()).toEqual(expectedLisp)
    }),
  )
})
