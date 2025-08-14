import {c, cases} from '@extra-lang/cases'
// import * as Types from '../../types'
import * as Values from '../../values'
import {parseModule} from '../'
import {readFileSync} from 'node:fs'
import {join} from 'node:path'
import {mockModuleRuntime} from './mockModuleRuntime'
import {type ModuleRuntime} from 'src/runtime'

describe('view', () => {
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

  describe('eval', () => {
    describe('minimal', () => {
      let filename = 'minimal'
      it(`should eval view '${filename}'`, () => {
        const runtime = mockModuleRuntime({})

        filename = join(__dirname, `app/${filename}.extra`)
        const content = readFileSync(filename, 'utf8')
        const view = parseModule(content).get()
        const result = view.eval(runtime)
        if (result.isErr()) {
          throw result.error
        }
        const render = renderOnce(runtime, result.value as Values.ClassDefinitionValue, [])
        expect(result).toEqual(render)
      })
    })
  })
})

/**
 * Mock function to take a MetaClassValue (hopefully a view) and render it using
 * the module runtime.
 */
function renderOnce(runtime: ModuleRuntime, value: Values.ClassDefinitionValue, props: any[]) {}
