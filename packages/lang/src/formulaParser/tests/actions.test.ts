import {c, cases} from '@extra-lang/cases'
import {type Expression} from '../expressions'
import {parseInternalTest} from '../'

describe('action', () => {
  cases<[string, string, string] | [string, string]>(
    c(['fn &asdf() => @foo = null', '(action &asdf (fn asdf() (=> (= @foo `null`))))']),
    c([
      'fn &update() => @pt = {...@pt, x: @pt.x + 1}',
      '(action &update (fn update() (=> (= @pt {(... @pt) (x: (+ (. @pt x) 1))}))))',
    ]),
    c(['fn &asdf(a: User) => @user = a', '(action &asdf (fn asdf((a: User)) (=> (= @user a))))']),
  ).run(([formula, expectedLisp, expectedCode], {only, skip}) =>
    (only ? it.only : skip ? it.skip : it)(`should parse action definition '${formula}'`, () => {
      expectedCode = expectedCode ?? formula
      let expression: Expression
      expect(() => {
        ;[expression] = parseInternalTest(formula, 'app_action_definition').get()
      }).not.toThrow()

      expect(expression!.toCode()).toEqual(expectedCode)
      expect(expression!.toLisp()).toEqual(expectedLisp)
    }),
  )
})

describe('bad actions', () => {
  cases<[string, string]>(
    c(['asdf() => ""', "Expected 'fn &<name>(' to start the formula"]),
    c(['fn asdf() => ""', "Actions must start with the ampersand '&' symbol"]),
    c(['fn &Asdf() => ""', "Actions must start with a lowercased letter, found 'Asdf'"]),
  ).run(([formula, error], {only, skip}) =>
    (only ? it.only : skip ? it.skip : it)(
      `should error parsing Action definitions ${formula}`,
      () => {
        expect(() => parseInternalTest(formula, 'app_action_definition').get()).toThrow(error)
      },
    ),
  )
})
