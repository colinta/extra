import {c, cases} from '@extra-lang/cases'
import {type Expression} from '~/formulaParser/expressions'
import {parseInternalTest} from '~/formulaParser'

describe('state', () => {
  cases<[string, string] | [string, string, string]>(
    c(['@asdf = 1', '(state @asdf 1)']),
    c(['@asdf-jkl =\n1', '(state @asdf-jkl 1)', '@asdf-jkl = 1']),
    c([
      `public @jkl = {
  a: 5
  b: 1
}`,
      '(state public @jkl {(a: 5) (b: 1)})',
      'public @jkl = {a: 5, b: 1}',
    ]),
  ).run((args, {only, skip}) =>
    (only ? it.only : skip ? it.skip : it)(`should parse state definition '${args[0]}'`, () => {
      const [formula, expected, expectedFormula] = args
      const [expression] = parseInternalTest(formula, 'app_state_definition').get()

      expect(expression!.toCode()).toEqual(expectedFormula ?? formula)
      expect(expression!.toLisp()).toEqual(expected)
    }),
  )
})

describe('bad states', () => {
  cases<[string, string]>(
    c(['asdf = ""', "States must start with the at '@' symbol"]),
    c(['@Asdf = ""', "States must start with a lowercased letter, found 'Asdf'"]),
  ).run(([formula, error], {only, skip}) =>
    (only ? it.only : skip ? it.skip : it)(
      `should error parsing State definitions ${formula}`,
      () => {
        expect(() => parseInternalTest(formula, 'app_state_definition').get()).toThrow(error)
      },
    ),
  )
})
