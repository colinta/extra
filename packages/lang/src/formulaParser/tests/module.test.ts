import {readFileSync} from 'node:fs'
import {join} from 'node:path'
import {c, cases} from '@extra-lang/cases'
import {parseModule} from '../'

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
})
