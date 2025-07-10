import {c, cases} from '@extra-lang/cases'
import {Literal} from '../expressions'
import {parse} from '../../formulaParser'
import * as Values from '../../values'

describe('valid numbers', () => {
  cases<[string, Values.Value] | [string, Values.Value, string]>(
    c(['0', Values.int(0)]),
    c(['0x10', Values.int(0x10, 8, 'hexadecimal'), '0x00000010']),
    c(['0xdeadbeef', Values.int(0xdeadbeef, 32, 'hexadecimal'), '0xdeadbeef']),
    c(['0xc_deadbeef', Values.int(55275536111, 36, 'hexadecimal'), '0x0000000c_deadbeef']),
    c(['0b10', Values.int(0b10, 2, 'binary'), '0b00000010']),
    c(['0o10', Values.int(0o10, 6, 'octal'), '0o00000010']),
    c(['1e2', Values.int(1e2), '100']),
    c(['1e+2', Values.int(1e2), '100']),
    c(['1e-2', Values.float(1e-2), '0.01']),
    c(['10_000', Values.int(10000)]),
    c(['1', Values.int(1)]),
    c(['-1', Values.int(-1)]),
    c(['0.1', Values.float(0.1)]),
    c(['.1', Values.float(0.1), '0.1']),
    c(['1.0', Values.float(1)]),
    c(['1.', Values.float(1), '1.0']),
    c(['-1.', Values.float(-1), '-1.0']),
    c(['0.0', Values.float(0)]),
    c(['1.1', Values.float(1.1)]),
    c(['-1.1', Values.float(-1.1)]),
  ).run(([formula, value, expectedCode], {only, skip}) =>
    (only ? it.only : skip ? it.skip : it)(`should parse ${formula} as ${value}`, () => {
      const expression = parse(formula).get() as Literal

      expect(expression.value).toEqual(value)
      expect(expression.toCode()).toEqual(expectedCode ?? formula)
    }),
  )
})

describe('invalid numbers', () => {
  cases<[string, string]>(
    c(['0x1x0', 'Expected a number']),
    c(['0b2', 'Expected a number']),
    c(['0b', 'Expected a number']),
    c(['1oo10', 'Expected a number']),
    c(['1ee2', 'Expected a number']),
    c(['1e--2', 'Expected a number']),
    c(['0b1.1', 'Expected binary number']),
    c(['0o1.1', 'Expected octal number']),
    c(['0x1.1', 'Expected hexadecimal number']),
  ).run(([formula, message], {only, skip}) =>
    (only ? it.only : skip ? it.skip : it)(`${formula} should be invalid`, () => {
      expect(() => parse(formula).get()).toThrow(message)
    }),
  )
})
