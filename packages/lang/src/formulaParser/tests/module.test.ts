import {c, cases} from '@extra-lang/cases'
// import * as Types from '../../types'
// import * as Values from '../../values'
import {parseModule} from '../'
import {readFileSync} from 'node:fs'
import {join} from 'node:path'

describe('module', () => {
  describe('parser', () => {
    cases<[string]>(
      //
      c.skip(['real']),
      c.skip(['component']),
      c(['minimal']),
      c(['small']),
    ).run(([filename], {only, skip}) =>
      (only ? it.only : skip ? it.skip : it)(`should parse view '${filename}'`, () => {
        filename = join(__dirname, `app/${filename}.extra`)
        const content = readFileSync(filename, 'utf8')
        const view = parseModule(content).get()
        expect(view.toCode()).toEqual(content)
      }),
    )
  })
})
