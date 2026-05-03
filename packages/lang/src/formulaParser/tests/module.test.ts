import {readFileSync} from 'node:fs'
import {join} from 'node:path'
import {c, cases} from '@extra-lang/cases'
import {parseModule} from '../'
import {mockValueRuntime} from '@/tests/mockValueRuntime'

beforeEach(() => {})

describe('module', () => {
  describe('parser', () => {
    cases<[string]>(
      c.skip(['real']),
      c(['component']),
      c(['minimal']),
      c(['small']),
      c(['increment-text']),
    ).run(([filename], {only, skip}) =>
      (only ? it.only : skip ? it.skip : it)(`should parse view '${filename}'`, () => {
        const path = join(__dirname, `code/module/${filename}.extra`)
        const content = readFileSync(path, 'utf8')
        const moduleExpr = parseModule(content).get()
        expect(moduleExpr.toCode()).toEqual(content)
      }),
    )
  })

  describe('evaluation', () => {
    cases<[string]>(
      c([
        `box User = {Int, ...[String, >=1] }
box Foo = Pick(User, 0, 1)`,
      ]),
    ).run(([content]) =>
      it('should resolve prior type definitions while evaluating module values', () => {
        const moduleExpr = parseModule(content).get()
        const moduleValue = moduleExpr.eval(mockValueRuntime({})).get()

        expect(moduleValue.definitions.get('Foo')?.toCode()).toEqual('Foo({Int, String})')
      }),
    )
  })
})
