import {c, cases} from '@extra-lang/cases'
import {parseInternalTest} from '../../formulaParser'

describe('action', () => {
  cases<[string, string, string] | [string, string]>(
    c(['&fn asdf() =>\n  @foo = null', '(action &asdf (fn asdf() => (= @foo `null`)))']),
    c([
      '&fn update() =>\n  @pt = {...@pt, x: @pt.x + 1}',
      '(action &update (fn update() => (= @pt {(... @pt) (x: (+ (. @pt x) 1))})))',
    ]),
    c(['&fn asdf(a: User) =>\n  @user = a', '(action &asdf (fn asdf((a: User)) => (= @user a)))']),
  ).run(([formula, expectedLisp, expectedCode], {only, skip}) =>
    (only ? it.only : skip ? it.skip : it)(`should parse action definition '${formula}'`, () => {
      expectedCode = expectedCode ?? formula
      const [expression] = parseInternalTest(formula, 'app_action_definition').get()

      expect(expression!.toCode()).toEqual(expectedCode)
      expect(expression!.toLisp()).toEqual(expectedLisp)
    }),
  )
})

describe('bad actions', () => {
  cases<[string, string]>(
    c(['asdf() => ""', "Expected '&fn <name>(' to start the formula"]),
    c(['&fn Asdf() => ""', "Actions must start with a lowercased letter, found 'Asdf'"]),
  ).run(([formula, error], {only, skip}) =>
    (only ? it.only : skip ? it.skip : it)(
      `should error parsing Action definitions ${formula}`,
      () => {
        expect(() => parseInternalTest(formula, 'app_action_definition').get()).toThrow(error)
      },
    ),
  )
})
