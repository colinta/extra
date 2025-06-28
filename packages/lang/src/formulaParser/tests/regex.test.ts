import {cases, c} from '@extra-lang/cases'
import {type Expression} from '../expressions'
import {parse} from '../../formulaParser'

describe('regex', () => {
  cases(
    //
    c(['/test/', '/test/', '/test/']),
    c(['/test\\//', '/test\\//', '/test\\//']),
    c(['/\\b\\d/', '/\\b\\d/', '/\\b\\d/']),
  ).run(([formula, expectedCode, expectedLisp], {only, skip}) =>
    (only ? it.only : skip ? it.skip : it)(`should parse regex ${formula}`, () => {
      let expression: Expression = parse(formula).get()

      expect(expression!.toCode()).toEqual(expectedCode)
      expect(expression!.toLisp()).toEqual(expectedLisp)
    }),
  )
})
