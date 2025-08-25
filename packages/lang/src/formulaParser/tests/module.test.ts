import {readFileSync} from 'node:fs'
import {join} from 'node:path'
import {c, cases} from '@extra-lang/cases'
import {type TypeRuntime, type ValueRuntime} from '../../runtime'
import * as Types from '../../types'
import * as Values from '../../values'
import {type DOM, type Send} from '../../nodes'
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
  attrs: Map<string, any>
}

function element({
  tag,
  value,
  children,
  attrs,
}: {
  tag: string
  value?: Values.Value
  children?: Element[]
  attrs?: Map<string, any>
}): ElementNode {
  return {
    is: 'element',
    tag,
    children: children ?? [],
    attrs: attrs ?? new Map(),
    value: value ?? expect.anything(),
  }
}

function text(text: string): TextNode {
  return {is: 'text', text}
}

let dom: DOM<Element>
const htmlRuntime = new HtmlRuntime()

beforeEach(() => {
  runtimeTypes = {}
  typeRuntime = mockTypeRuntime(runtimeTypes)
  valueRuntime = mockValueRuntime(runtimeTypes)

  dom = {
    createElement(value: Values.NamedViewValue, attrs: Map<string, Values.Value>, send: Send) {
      const elAttrs = new Map<string, any>()
      for (const [name, attr] of attrs) {
        if (name === 'onClick') {
          elAttrs.set('onClick', function () {
            send(
              (attr as Values.FormulaValue)
                .call(new Values.FormulaArgs([]))
                .get() as Values.MessageValue,
            )
          })
        } else {
          elAttrs.set(name, attr.viewPrintable())
        }
      }
      return element({tag: value.name, value, attrs: elAttrs})
    },
    createTextNode(value: Values.Value) {
      return text(value.viewPrintable())
    },
    updateTextNode(node: Element, value: Values.Value) {
      if (node.is === 'text') {
        node.text = value.viewPrintable()
      }
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
      c(['button']),
    ).run(([filename], {only, skip}) =>
      (only ? it.only : skip ? it.skip : it)(`should parse view '${filename}'`, () => {
        const path = join(__dirname, `app/${filename}.extra`)
        const content = readFileSync(path, 'utf8')
        const moduleExpr = parseModule(content).get()
        expect(moduleExpr.toCode()).toEqual(content)
      }),
    )
  })

  describe('eval / initial render', () => {
    cases<[string, string, any]>(
      c([
        'static',
        'Static',
        element({
          tag: 'p',
          children: [text('You are here.')],
        }),
      ]),
      c([
        'static-fn',
        'Static',
        element({
          tag: 'p',
          children: [text('You are here.')],
        }),
      ]),
      c([
        'minimal',
        'Minimal',
        element({
          tag: 'p',
          children: [text('0'), text(', '), text('0')],
        }),
      ]),
      c([
        'small',
        'Small',
        element({
          tag: 'body',
          children: [text('1, 2')],
        }),
      ]),
      c([
        'button',
        'Button',
        element({
          tag: 'p',
          children: [
            text('\n  '),
            element({
              tag: 'button',
              attrs: new Map([['onClick', expect.anything()]]),
              children: [text('@count = '), text('0')],
            }),
            text('\n'),
          ],
        }),
      ]),
    ).run(([filename, name, expectedResult], {only, skip}) =>
      (only ? it.only : skip ? it.skip : it)(`should render '${filename}'`, () => {
        const path = join(__dirname, `app/${filename}.extra`)
        const content = readFileSync(path, 'utf8')
        const moduleExpr = parseModule(content).get()

        typeRuntime.viewRuntime = htmlRuntime
        valueRuntime.viewRuntime = htmlRuntime

        const moduleType = moduleExpr.getType(typeRuntime).get()
        const moduleValue = moduleExpr.eval(valueRuntime).get()
        for (const [name, type] of moduleType.definitions) {
          runtimeTypes[name] = [type, moduleValue.definitions.get(name)!]
        }

        const view = parseJsx(`<${name} />`).get()
        const node = view.render(valueRuntime).get()
        const send = () => {}
        const el: Element = dom.createElement(new Values.NamedViewValue('body'), new Map(), send)
        const result = node.renderInto(dom, el, send)
        expect(result).toEqual(expectedResult)
      }),
    )
  })

  describe('message passing', () => {
    cases<[string, string, (result: any) => void, any]>(
      //
      c([
        'button',
        'Button',
        (result: any) => {
          result.children[1].attrs.get('onClick').call()
        },
        element({
          tag: 'p',
          children: [
            text('\n  '),
            element({
              tag: 'button',
              attrs: new Map([['onClick', expect.anything()]]),
              children: [text('@count = '), text('1')],
            }),
            text('\n'),
          ],
        }),
      ]),
    ).run(([filename, name, action, expectedResult], {only, skip}) =>
      (only ? it.only : skip ? it.skip : it)(
        `should render '${filename}' and update after 'onClick'`,
        () => {
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
          const send = (message?: any) => {
            throw `unexpected 'send'`
          }
          const el: Element = dom.createElement(new Values.NamedViewValue('body'), new Map(), send)
          const result = node.renderInto(dom, el, send)
          action(result)
          expect(result).toEqual(expectedResult)
        },
      ),
    )
  })
})
