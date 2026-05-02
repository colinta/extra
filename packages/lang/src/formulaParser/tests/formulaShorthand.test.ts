import {c, cases} from '@extra-lang/cases'
import {parse} from '../../formulaParser'
import {mockTypeRuntime} from '../../tests/mockTypeRuntime'
import {mockValueRuntime} from '../../tests/mockValueRuntime'

describe('formula shorthand', () => {
  describe('parse', () => {
    cases<[string, string, string]>(
      c(['foo(|val| val + 1)', '(fn foo ((| (val) => (+ val 1))))', 'foo(|val| val + 1)']),
      c([
        'foo(|val, index| val + index)',
        '(fn foo ((| (val index) => (+ val index))))',
        'foo(|val, index| val + index)',
      ]),
      c(['foo(|| 1)', '(fn foo ((| () => 1)))', 'foo(|| 1)']),
      c([
        'foo(apply: |val| val + 1)',
        '(fn foo ((apply: (| (val) => (+ val 1)))))',
        'foo(apply: |val| val + 1)',
      ]),
    ).run(([formula, expectedLisp, expectedCode], {only, skip}) =>
      (only ? it.only : skip ? it.skip : it)(`should parse '${formula}'`, () => {
        const expression = parse(formula).get()

        expect(expression.toLisp()).toEqual(expectedLisp)
        expect(expression.toCode()).toEqual(expectedCode)
      }),
    )
  })

  it('can only be used in an argument list', () => {
    expect(() => parse('let f = |val| val + 1 in f(1)').get()).toThrow("Unexpected token '|val|'")
  })

  it('infers argument and return types from the receiving formula', () => {
    const expression = parse('[1, 2, 3].map(|val| val + 1)').get()
    const type = expression.getType(mockTypeRuntime({})).get()
    const value = expression.eval(mockValueRuntime({})).get()

    expect(type.toCode()).toEqual('[2 | 3 | 4, length: =3]')
    expect(value.toCode()).toEqual('[2, 3, 4]')
  })
})
