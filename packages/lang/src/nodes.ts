import * as Values from './values'

export type Send = (message: Values.MessageValue) => void

export interface DOM<T> {
  createElement(tag: Values.NamedViewValue, attrs: Map<string, Values.Value>, send: Send): T
  createTextNode(text: Values.Value): T
  updateTextNode(node: T, text: Values.Value): void
  updateProp(node: T, prop: string, value: Values.Value): void
  appendElement(container: T, child: T): T
  removeElement(container: T, child: T): T
}

export abstract class Node {
  parentNode: Node | undefined
  parentAttrNode: Node | undefined
  firstRender: any

  #dependencies: Map<Values.Value, Node[]> | undefined

  constructor(
    readonly deps: Set<Values.Value>,
    readonly children: Node[],
  ) {
    const renderInto: any = this.renderInto.bind(this)
    this.renderInto = (dom: DOM<unknown>, element: unknown, send: Send) => {
      if (this.firstRender) {
        return this.firstRender
      }
      const render = renderInto(dom, element, send)
      this.firstRender = render
      return render
    }

    Object.defineProperty(this, 'renderInto', {enumerable: false})
    Object.defineProperty(this, 'expression', {enumerable: false})
    Object.defineProperty(this, 'deps', {enumerable: false})
    Object.defineProperty(this, 'children', {enumerable: false})
    Object.defineProperty(this, 'parentNode', {enumerable: false})
    Object.defineProperty(this, 'parentAttrNode', {enumerable: false})
  }

  abstract get value(): Values.Value
  abstract renderInto<T>(dom: DOM<T>, element: T, send: Send): T
  receive<T>(_dom: DOM<T>, _message: Values.MessageValue) {}

  dependencies(): Map<Values.Value, Node[]> {
    if (!this.#dependencies) {
      this.#dependencies = this._dependencies(new Map<Values.Value, Node[]>())
    }
    return this.#dependencies
  }

  private _dependencies(deps: Map<Values.Value, Node[]>): Map<Values.Value, Node[]> {
    for (const dep of this.deps) {
      const list = deps.get(dep) ?? []
      list.push(this)
      deps.set(dep, list)
    }
    for (const child of this.children) {
      child._dependencies(deps)
    }
    return deps
  }

  updateValue<T>(dom: DOM<T>, subject: Values.Value, value: Values.Value) {
    if (this.parentAttrNode) {
      this.parentAttrNode.receive(
        dom,
        new Values.MessageValue(subject, {
          is: 'prop',
          value,
        }),
      )
    } else if (this.parentNode) {
      // this.parentNode.receive(
      //   dom,
      //   new Values.MessageValue(subject, {
      //     is: 'prop',
      //     value,
      //   }),
      // )
    }
  }
}

export class ChildrenNode extends Node {
  readonly value: Values.ArrayValue

  constructor(
    deps: Set<Values.Value>,
    readonly nodes: Node[],
  ) {
    const childNodes = nodes.map(node => new JSXChildNode(node))
    super(deps, childNodes)

    childNodes.forEach(node => (node.parentNode = this))
    this.value = Values.array(nodes.map(node => node.value))
    Object.defineProperty(this, 'value', {enumerable: false})
  }

  renderInto<T>(dom: DOM<T>, el: T, send: Send) {
    for (const node of this.nodes) {
      const child = node.renderInto(dom, el, send)
      dom.appendElement(el, child)
    }
    return el
  }
}

/**
 * Stores a static Value instance
 */
export class ValueNode extends Node {
  constructor(
    readonly value: Values.Value,
    deps: Set<Values.Value> = new Set(),
  ) {
    super(deps, [])
  }

  renderInto<T>(dom: DOM<T>, el: T, send: Send) {
    return dom.createTextNode(this.value)
  }
}

/**
 * Stores a Value instance that refers to a property of state
 */
export class StateReferenceNode extends ValueNode {
  constructor(
    deps: Set<Values.Value>,
    readonly thisValue: Values.ClassInstanceValue,
    readonly prop: string,
  ) {
    super(thisValue.propValue(prop)!, deps)
  }

  receive<T>(dom: DOM<T>, message: Values.MessageValue) {
    if (message.subject !== this.thisValue) {
      throw `Unexpected receive, subject: ${message.subject}`
    }

    if (message.payload.is === 'assign-state') {
      this.updateValue(dom, message.subject, message.payload.value)
    }
  }
}

/**
 * Filters messages that don't apply to this property access.
 */
export class PropertyAccessNode extends ValueNode {
  constructor(
    readonly lhsValue: Values.Value,
    readonly lhsNode: Node,
    readonly prop: string,
  ) {
    super(lhsValue.propValue(prop)!)
  }

  receive<T>(dom: DOM<T>, message: Values.MessageValue) {
    if (message.subject !== this.lhsValue) {
      throw `Unexpected receive, subject: ${message.subject}`
    }

    if (message.payload.is === 'assign-state') {
      if (message.payload.prop !== this.prop) {
        return
      }

      this.updateValue(dom, message.subject, this.lhsValue.propValue(this.prop)!)
    }
  }
}

export class ArrayValueNode extends ChildrenNode {}

/**
 * Wraps a node, combining it with a prop attribute name. Changes to the node
 * map to a prop update.
 */
export class JSXPropNode extends Node {
  constructor(
    readonly name: string,
    readonly node: Node,
  ) {
    super(new Set(), [node])
    node.parentAttrNode = this
  }

  get value() {
    return this.node.value
  }

  renderInto<T>(dom: DOM<T>, el: T, send: Send): T {
    throw 'N/A'
  }

  receive<T>(dom: DOM<T>, message: Values.MessageValue) {
    if (message.payload.is !== 'prop' || !this.parentAttrNode) {
      return
    }

    this.parentAttrNode.receive(
      dom,
      new Values.MessageValue(message.subject, {
        is: 'jsx-prop',
        prop: this.name,
        value: message.payload.value,
      }),
    )
  }
}

/**
 * Wraps a node, turning it into a child node text update.
 */
export class JSXChildNode extends Node {
  constructor(readonly node: Node) {
    super(new Set(), [node])
    node.parentNode = this
  }

  get value() {
    return this.node.value
  }

  renderInto<T>(dom: DOM<T>, el: T, send: Send): T {
    throw 'N/A'
  }

  receive<T>(dom: DOM<T>, message: Values.MessageValue) {}

  updateValue<T>(dom: DOM<T>, subject: Values.Value, value: Values.Value) {
    if (this.firstRender) {
      dom.updateTextNode(this.firstRender, value)
    }
  }
}

/**
 * A named JSX-tag that is created externally (aka a "hosted" component,
 * borrowing React terminology).
 *     <p>…</p>, <input />, etc.
 */
export class JSXNamedNode extends Node {
  constructor(
    deps: Set<Values.Value>,
    readonly tag: Values.NamedViewValue,
    readonly attrs: Map<string, Node>,
    readonly childNode: ChildrenNode | undefined,
  ) {
    const attrNodes = Array.from(attrs).map(([, node]) => node)
    super(deps, [...(childNode ? [childNode] : []), ...attrNodes])

    attrNodes.forEach(node => (node.parentAttrNode = this))
    if (childNode) {
      childNode.parentNode = this
    }
  }

  receive<T>(dom: DOM<T>, message: Values.MessageValue) {
    if (!this.firstRender) {
      return
    }
    if (message.payload.is === 'jsx-prop') {
      dom.updateProp(this.firstRender, message.payload.prop, message.payload.value)
    }
  }

  get value(): Values.Value {
    return this.tag
  }

  renderInto<T>(dom: DOM<T>, el: T, send: Send) {
    const attrs = new Map(Array.from(this.attrs).map(([name, node]) => [name, node.value] as const))
    const element = dom.createElement(this.tag, attrs, send)
    if (this.childNode) {
      this.childNode.renderInto(dom, element, send)
    }
    return element
  }
}

/**
 * A JSX-tag with no name, e.g.
 *     <>…</>
 * These are flattened into their parent, and provide an "attachment point" for
 * other dynamic nodes.
 *     <main>
 *       <header … />
 *       {items.map(…)}{- the items.map node attaches to an implicit FragmentNode -}
 *       <footer … />
 *     </main>
 */
export class JSXFragmentNode extends Node {
  constructor(
    deps: Set<Values.Value>,
    readonly childNode: ChildrenNode,
  ) {
    super(deps, [childNode])

    childNode.parentNode = this
  }

  get value(): Values.Value {
    return this.childNode.value
  }

  renderInto<T>(dom: DOM<T>, el: T, send: Send): T {
    return this.childNode.renderInto(dom, el, send)
  }
}

abstract class InvocableNode extends Node {
  constructor(
    deps: Set<Values.Value>,
    readonly args: Map<string, Node>,
    readonly childNode: ChildrenNode | undefined,
    readonly firstNode: Node,
  ) {
    super(deps, [...(childNode ? [childNode] : []), firstNode])

    if (childNode) {
      childNode.parentNode = this
    }
  }

  get value(): Values.Value {
    return this.firstNode.value
  }

  renderInto<T>(dom: DOM<T>, el: T, send: Send): T {
    const element = this.firstNode.renderInto(dom, el, send)
    if (this.childNode) {
      this.childNode.renderInto(dom, element, send)
    }
    return element
  }
}

export class ViewFormulaNode extends InvocableNode {
  constructor(
    deps: Set<Values.Value>,
    readonly formula: Values.ViewFormulaValue<Node>,
    args: Map<string, Node>,
    childNode: ChildrenNode | undefined,
    firstNode: Node,
  ) {
    super(deps, args, childNode, firstNode)

    if (childNode) {
      childNode.parentNode = this
    }
  }
}

export class ViewInstanceNode extends InvocableNode {
  constructor(
    deps: Set<Values.Value>,
    readonly view: Values.ViewClassInstanceValue<Node>,
    args: Map<string, Node>,
    childNode: ChildrenNode | undefined,
    firstNode: Node,
  ) {
    super(deps, args, childNode, firstNode)

    if (childNode) {
      childNode.parentNode = this
    }
  }

  renderInto<T>(dom: DOM<T>, parentElement: T, sendToParent: Send): T {
    const thisSend = (message: Values.MessageValue) => {
      if (message.subject === this.view) {
        this.receive(dom, message)
      } else {
        sendToParent(message)
      }
    }
    return super.renderInto(dom, parentElement, thisSend)
  }

  receive<T>(dom: DOM<T>, message: Values.MessageValue) {
    if (message.subject !== this.view) {
      throw `Unexpected receive, subject: ${message.subject}`
    }

    if (message.payload.is === 'assign-state') {
      this.view.props.set(message.payload.prop, message.payload.value)
    } else {
      throw `TODO: ViewInstanceNode.receive('${message.payload.is}')`
    }

    const dependents = this.dependencies().get(message.subject)
    if (!dependents) {
      return
    }

    for (const node of dependents) {
      if (node === this) {
        continue
      }

      node.receive(dom, message)
    }
  }
}
