import {ok} from '@extra-lang/result'
import {c, cases} from '@extra-lang/cases'
import {parseApplication} from '../'
import {readFileSync} from 'node:fs'
import {join} from 'node:path'
import {type Application} from '../application'
import {mockApplicationRuntime} from './mockApplicationRuntime'
import {Renderer} from '~/runtime'
import {ObjectValue} from '../../values'

describe('application', () => {
  describe('parser', () => {
    cases<[string, any]>(c.skip(['real', {}])).run(([filename, _expected], {only, skip}) =>
      (only ? it.only : skip ? it.skip : it)(`should parse application '${filename}'`, () => {
        filename = join(__dirname, `app/${filename}.extra`)
        const content = readFileSync(filename, 'utf8')
        const application = parseApplication(content).get()
        expect(application.toCode()).toEqual(content)
      }),
    )
  })

  describe('eval', () => {
    describe('minimal', () => {
      let filename = 'minimal'
      it.skip(`should eval application '${filename}'`, () => {
        const renderer: Renderer<string> = {
          createContainer() {
            return ''
          },
          renderText(text: string) {
            return text
          },
          renderNode(name: string, props: ObjectValue, children: number) {
            return ok('')
          },
          addNodeTo(parentNode: string, childNode: string) {
            return parentNode + childNode
          },
        }

        const runtime = mockApplicationRuntime({}, renderer)
        ;(runtime as any).id = 'test'

        filename = join(__dirname, `app/${filename}.extra`)
        const content = readFileSync(filename, 'utf8')
        expect(() => {
          const application = parseApplication(content).get()
          const result = application.eval(runtime)
          if (result.isErr()) {
            throw result.error
          }

          expect(result).toEqual({})
        }).not.toThrow()
      })
    })
  })
})
