import {c, cases} from '@extra-lang/cases'
import {testScan} from '../../formulaParser'
import {scanImportStatement} from '../scan/module'

describe('import parser', () => {
  describe('imports', () => {
    cases<[string] | [string, string]>(
      c(['import from Foo']),
      c(['import as Foo from Foo', 'import from Foo']),
      c(['import from Foo/Bar/Baz']),
      c(['import from /Foo']),
      c(['import from /Foo/Bar/Baz']),
      c(['import from ./Foo']),
      c(['import from ./Foo/Bar/Baz']),
      c(['import as Baz from ./Foo/Bar/Baz', 'import from ./Foo/Bar/Baz']),
      c(['import as Foo from Foo', 'import from Foo']),
      c(['import as Bar from Foo']),
      c(['import as Bar from Foo/Bar/Baz']),
      c(['import { bar } from Foo']),
      c(['import { bar as barr } from Foo']),
      c([
        'import { bar as barr,bax,bux as buzz } from Foo',
        'import { bar as barr, bax, bux as buzz } from Foo',
      ]),
      c([
        `\
import {
bar as barr
} from Foo`,
        'import { bar as barr } from Foo',
      ]),
      c([
        `\
import {
bar as barr
bax
bux as buzz} from Foo`,
        'import { bar as barr, bax, bux as buzz } from Foo',
      ]),
      c([
        `\
import {
bar as barr
bax
bux as buzz, a-very-long-name-as-well-as-this-one-too-and-this-one-as-well-as-this-one-too-and-this-one-as-well
} from Foo`,
        `\
import {
  bar as barr
  bax
  bux as buzz
  a-very-long-name-as-well-as-this-one-too-and-this-one-as-well-as-this-one-too-and-this-one-as-well
} from Foo`,
      ]),
      c(['import from sheety://user']),
      c(['import from sheety://user/foo']),
      c(['import from sheety://user/foo@1.2.3-pre']),
    ).run(([formula, expectedCode], {only, skip}) =>
      (only ? it.only : skip ? it.skip : it)(`should parse import definitions ${formula}`, () => {
        const expression = testScan(formula, scanImportStatement).get()

        expect(expression!.toCode()).toEqual(expectedCode ?? formula)
        expect(expression!.toLisp()).toEqual(`(${expectedCode ?? formula})`)
      }),
    )
  })
})

describe('bad imports', () => {
  cases<[string, string]>(
    c(['import {bar from Foo', "Expected ',' separating items"]),
    c(['import {bar\n', 'Unexpected end of input']),
  ).run(([formula, error], {only, skip}) =>
    (only ? it.only : skip ? it.skip : it)(`bad import definitions ${formula}`, () => {
      expect(() => testScan(formula, scanImportStatement).get()).toThrow(error)
    }),
  )
})
