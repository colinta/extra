import {c, cases} from '@extra-lang/cases'
import {testScan} from '../../formulaParser'
import {scanImportStatement} from '../scan/module'

describe('import parser', () => {
  describe('imports', () => {
    cases<[string] | [string, string]>(
      c(['import Foo']),
      c(['import Foo as Foo', 'import Foo']),
      c(['import Foo/Bar/Baz']),
      c(['import /Foo']),
      c(['import /Foo/Bar/Baz']),
      c(['import ./Foo']),
      c(['import ./Foo/Bar/Baz']),
      c(['import ./Foo/Bar/Baz as Baz', 'import ./Foo/Bar/Baz']),
      c(['import Foo as Foo', 'import Foo']),
      c(['import Foo as Bar']),
      c(['import Foo/Bar/Baz as Bar']),
      c(['import Foo only { bar }']),
      c(['import Foo as Foo only { bar }']),
      c(['import Foo only { bar as barr }']),
      c([
        'import Foo only { bar as barr,bax,bux as buzz }',
        'import Foo only { bar as barr, bax, bux as buzz }',
      ]),
      c([
        `\
import Foo only {
bar as barr
}`,
        'import Foo only { bar as barr }',
      ]),
      c([
        `\
import Foo only {
bar as barr
bax
bux as buzz}`,
        'import Foo only { bar as barr, bax, bux as buzz }',
      ]),
      c([
        `\
import Foo only {
bar as barr
bax
bux as buzz, a-very-long-name-as-well-as-this-one-too-and-this-one-as-well-as-this-one-too-and-this-one-as-well}`,
        `\
import Foo only {
  bar as barr
  bax
  bux as buzz
  a-very-long-name-as-well-as-this-one-too-and-this-one-as-well-as-this-one-too-and-this-one-as-well
}`,
      ]),
      c(['import sheety://user']),
      c(['import sheety://user/foo']),
      c(['import sheety://user/foo@1.2.3-pre']),
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
    c(['import Foo only {bar', "Expected ',' separating items"]),
    c(['import Foo only {bar\n', 'Unexpected end of input']),
  ).run(([formula, error], {only, skip}) =>
    (only ? it.only : skip ? it.skip : it)(`bad import definitions ${formula}`, () => {
      expect(() => testScan(formula, scanImportStatement).get()).toThrow(error)
    }),
  )
})
