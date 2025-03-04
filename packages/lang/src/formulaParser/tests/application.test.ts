import {ok} from '@extra-lang/result'
import {c, cases} from '@extra-lang/cases'
import {parseApplication} from '../'
import {readFileSync} from 'node:fs'
import {join} from 'node:path'
import {type Application} from '../application'
import {mockApplicationRuntime} from './mockApplicationRuntime'
import {Renderer} from '../../runtime'
import {ObjectValue} from '../../values'

describe('application', () => {
  describe('parser', () => {
    cases<[string, any]>(c.skip(['real', {}])).run(([filename, _expected], {only, skip}) =>
      (only ? it.only : skip ? it.skip : it)(`should parse application '${filename}'`, () => {
        filename = join(__dirname, `app/${filename}.extra`)
        const content = readFileSync(filename, 'utf8')
        let application: Application
        expect(() => {
          application = parseApplication(content).get()

          expect(application.toCode()).toEqual(content)
        }).not.toThrow()
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

  describe('tokenizer', () => {
    cases<[string, any]>(
      c([
        'empty',
        {
          imports: ['', 0, 0],
          types: [],
          states: [],
          main: ['Main() => null\n', 102, 117],
          actions: [],
          views: [],
          helpers: [],
        },
      ]),
      c([
        'imports',
        {
          imports: [
            `\
import Foo
import /Foo
import /Foo/Bar/Baz: { a-a, b-b }
import Bar: {a , b , c}
import Baz: {
  a
  b
  c
}
`,
            0,
            109,
          ],
          types: [],
          states: [],
          main: [`Main() => null\n`, 212, 227],
          actions: [],
          views: [],
          helpers: [],
        },
      ]),
      c([
        'types',
        {
          actions: expect.anything(),
          helpers: expect.anything(),
          imports: ['', 0, 0],
          main: expect.anything(),
          states: expect.anything(),
          types: [
            [
              `\
User = {}`,
              30,
              39,
            ],
            ['public Foo = Int', 40, 56],
            [
              `public   Something =
  1 | 2`,
              57,
              85,
            ],
            [`Else=3|4`, 86, 94],
            [`Last = Int`, 95, 105],
          ],
          views: expect.anything(),
        },
      ]),
      c([
        'state',
        {
          actions: expect.anything(),
          helpers: expect.anything(),
          imports: ['', 0, 0],
          main: expect.anything(),
          states: [
            [
              `\
@asdf = 1`,
              63,
              72,
            ],
            [
              `\
public @jkl = {
  a: 5
  b: 1
}`,
              73,
              104,
            ],
            [`@foo='bar'`, 105, 115],
            ['@one-more = 8', 116, 129],
          ],
          types: expect.anything(),
          views: expect.anything(),
        },
      ]),
    ).run(([filename, expected], {only, skip}) =>
      (only ? it.only : skip ? it.skip : it)(`should tokenize application '${filename}'`, () => {
        filename = join(__dirname, `app/${filename}.extra`)
        // const content = readFileSync(filename, 'utf8')

        // let application: ApplicationTokens
        // expect(() => {
        //   application = tokenizer(content).get()

        //   expect(application).toEqual(expected)
        // }).not.toThrow()
      }),
    )
  })
})
