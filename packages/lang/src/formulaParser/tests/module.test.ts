import {readFileSync} from 'node:fs'
import {join} from 'node:path'
import {c, cases} from '@extra-lang/cases'
import {type TypeRuntime, type ValueRuntime} from '../../runtime'
import * as Types from '../../types'
import * as Values from '../../values'
import {type DOM} from '../../values'
import {parseModule, parseJsx} from '../'
import {mockTypeRuntime} from '../../tests/mockTypeRuntime'
import {mockValueRuntime} from '../../tests/mockValueRuntime'
import {HtmlRuntime} from 'src/html_runtime'

let runtimeTypes: {[K in string]: [Types.Type, Values.Value]}

let typeRuntime: TypeRuntime
let valueRuntime: ValueRuntime

type Element = ElementNode | TextNode
interface TextNode {
  is: 'text'
  text: string
}
interface ElementNode {
  is: 'element'
  tag: string
  value: Values.Value
  children: Element[]
  attrs: Map<string, Values.Value>
}

let dom: DOM<Element>

beforeEach(() => {
  runtimeTypes = {}
  typeRuntime = mockTypeRuntime(runtimeTypes)
  valueRuntime = mockValueRuntime(runtimeTypes)

  dom = {
    createElement(value: Values.NamedViewValue, attrs: Map<string, Values.Value>) {
      return {is: 'element', tag: value.name, value, attrs, children: []}
    },
    createTextNode(value: Values.Value) {
      return {is: 'text', text: value.viewPrintable()}
    },
    appendElement(container: Element, child: Element) {
      if (container.is === 'element') {
        container.children.push(child)
      }
      return container
    },
    removeElement(container: Element, child: Element) {
      if (container.is === 'element') {
        container.children = container.children.filter(el => el !== child)
      }
      return container
    },
  }
})

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
        const path = join(__dirname, `app/${filename}.extra`)
        const content = readFileSync(path, 'utf8')
        const moduleExpr = parseModule(content).get()
        expect(moduleExpr.toCode()).toEqual(content)
      }),
    )
  })

  describe('eval / firstRender', () => {
    cases<[string, string, any]>(
      c([
        'static',
        'Static',
        {
          is: 'element',
          value: expect.anything(),
          tag: 'p',
          attrs: new Map([]),
          children: [{is: 'text', text: 'You are here.'}],
        },
      ]),
      c([
        'static-fn',
        'Static',
        {
          is: 'element',
          value: expect.anything(),
          tag: 'p',
          attrs: new Map([]),
          children: [{is: 'text', text: 'You are here.'}],
        },
      ]),
      c([
        'minimal',
        'Minimal',
        {
          is: 'element',
          value: expect.anything(),
          tag: 'p',
          attrs: new Map(),
          children: [
            {
              is: 'text',
              text: '0',
            },
            {
              is: 'text',
              text: ', ',
            },
            {
              is: 'text',
              text: '0',
            },
          ],
        },
      ]),
      c([
        'small',
        'Small',
        {
          is: 'element',
          value: expect.anything(),
          tag: 'body',
          attrs: new Map(),
          children: [
            {
              is: 'text',
              text: '1, 2',
            },
          ],
          is: 'element',
          tag: 'body',
        },
      ]),
    ).run(([filename, name, expectedResult], {only, skip}) =>
      (only ? it.only : skip ? it.skip : it)(`should render '${filename}'`, () => {
        const path = join(__dirname, `app/${filename}.extra`)
        const content = readFileSync(path, 'utf8')
        const moduleExpr = parseModule(content).get()

        const htmlRuntime = new HtmlRuntime()
        typeRuntime.viewRuntime = htmlRuntime
        valueRuntime.viewRuntime = htmlRuntime

        const moduleType = moduleExpr.getType(typeRuntime).get()
        const moduleValue = moduleExpr.eval(valueRuntime).get()
        for (const [name, type] of moduleType.definitions) {
          runtimeTypes[name] = [type, moduleValue.definitions.get(name)!]
        }

        const view = parseJsx(`<${name} />`).get()
        // const type = view.getType(typeRuntime).get()
        const node = view.render(valueRuntime).get()
        const el: Element = dom.createElement(new Values.NamedViewValue('body'), new Map())
        const result = node.renderInto(dom, el)
        expect(result).toEqual(expectedResult)
      }),
    )
  })
})
