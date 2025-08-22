import {c, cases} from '@extra-lang/cases'
import {stringSort} from '../../stringSort'

describe('arguments', () => {
  cases<[string, string, 1 | 0 | -1]>(
    c(['a', 'b', -1]),
    c(['a', 'a', 0]),
    c(['b', 'a', 1]),
    c(['0', '1', -1]),
    c(['1', '1', 0]),
    c(['1', '0', 1]),
    c(['000', '001', -1]),
    c(['000', '01', -1]),
    c(['000', '1', -1]),
    c(['0x10', '17', -1]),
    c(['19', '2', 1]),
  ).run(([lhs, rhs, sort], {only, skip}) =>
    (only ? it.only : skip ? it.skip : it)(`should sort ${lhs}, ${rhs} into ${sort}`, () => {
      expect(stringSort(lhs, rhs)).toBe(sort)
    }),
  )
})
