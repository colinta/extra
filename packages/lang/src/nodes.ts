import * as Values from './values'

export type Send = (message: Values.MessageValue) => void

export interface DOM<T> {
  createElement(tag: Values.NamedViewValue, attrs: Map<string, Values.Value>, send: Send): T
  createTextNode(text: Values.Value): T
  updateTextNode(node: T, text: Values.Value): void
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
}

export class ChildrenNode extends Node {
  readonly value: Values.ArrayValue

  constructor(
    deps: Set<Values.Value>,
    readonly nodes: Node[],
  ) {
    super(deps, nodes)

    nodes.forEach(node => (node.parentNode = this))
    this.value = Values.array(this.nodes.map(node => node.value))
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
    deps: Set<Values.Value>,
    readonly value: Values.Value,
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
    readonly reevaluateFn: () => Values.Value,
    deps: Set<Values.Value>,
    readonly thisValue: Values.ClassInstanceValue,
    readonly prop: string,
    value: Values.Value,
  ) {
    super(deps, value)
  }

  receive<T>(dom: DOM<T>, message: Values.MessageValue) {
    if (!this.firstRender) {
      return
    }
    dom.updateTextNode(this.firstRender, this.reevaluateFn())
  }
}

export class ArrayValueNode extends ChildrenNode {}

/**
 * A named JSX-tag that is created externally (aka a "hosted" component,
 * borrowing React terminology).
 *     <p>…</p>, <input />, etc.
 */
export class NamedNode extends Node {
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
export class FragmentNode extends Node {
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

  renderInto<T>(dom: DOM<T>, parentElement: T, send: Send): T {
    const thisSend = (message: Values.MessageValue) => {
      if (message.subject === this.view) {
        this.receive(dom, message)
      } else {
        send(message)
      }
    }
    return super.renderInto(dom, parentElement, thisSend)
  }

  receive<T>(dom: DOM<T>, message: Values.MessageValue) {
    if (message.payload.is === 'assignment') {
      this.view.props.set(message.payload.prop, message.payload.value)
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
