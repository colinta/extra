import {cases, c} from '@extra-lang/cases'
import {parse} from '../../formulaParser'
import {type Expression, RegexLiteral} from '../../expressions'

describe('regex', () => {
  cases(
    //
    c(['/test/', '/test/', '/test/']),
    c(['/test\\//', '/test\\//', '/test\\//']),
    c(['/\\b\\d/', '/\\b\\d/', '/\\b\\d/']),
    c(['/(?<test>testing)/', '/(?<test>testing)/', '/(?<test>testing)/']),
  ).run(([formula, expectedCode, expectedLisp], {only, skip}) =>
    (only ? it.only : skip ? it.skip : it)(`should parse regex ${formula}`, () => {
      let expression: Expression = parse(formula).get()

      expect(expression!.toCode()).toEqual(expectedCode)
      expect(expression!.toLisp()).toEqual(expectedLisp)
    }),
  )

  it('should capture groups', () => {
    let expression = parse('/(?<test>testing)-(?<test2>TESTING)/').get()
    const regex = expression as RegexLiteral
    expect(expression).toBeInstanceOf(RegexLiteral)
    expect(regex.groups).toEqual(
      new Map([
        ['test', 'testing'],
        ['test2', 'TESTING'],
      ]),
    )
  })

  it('should validate group names', () => {
    expect(() => parse('/(?<test>testing)-(?<test>testing)/').get()).toThrow(
      "Duplicate capture group name 'test'",
    )
  })
})
