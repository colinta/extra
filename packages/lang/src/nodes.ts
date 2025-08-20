import * as Values from './values'
import {Node, type NodeExpression} from './values'

export class Children extends Node {
  readonly value: Values.ArrayValue
  constructor(
    expression: NodeExpression,
    readonly nodes: Node[],
  ) {
    super(expression)
    this.value = Values.array(this.nodes.map(node => node.value))
    Object.defineProperty(this, 'value', {enumerable: false})
  }

  renderInto<T>(dom: Values.DOM<T>, el: T) {
    for (const node of this.nodes) {
      const child = node.renderInto(dom, el)
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
    expression: NodeExpression,
    readonly value: Values.Value,
  ) {
    super(expression)
  }

  renderInto<T>(dom: Values.DOM<T>, el: T) {
    return dom.createTextNode(this.value.viewPrintable())
  }
}

export class ArrayValueNode extends Children {}

/**
 * Any named JSX-tag.
 *     <p>…</p>, <input />, <Account />, <Stack>…</Stack>
 */
export class NamedNode extends Node {
  constructor(
    expression: NodeExpression,
    readonly tag: Values.NamedViewValue,
    readonly args: Map<string, Node>,
    readonly children: Children | undefined,
  ) {
    super(expression)
  }

  get value(): Values.Value {
    return this.tag
  }

  renderInto<T>(dom: Values.DOM<T>, el: T) {
    const element = dom.createElement(this.tag.name)
    for (const [name, node] of this.args) {
      dom.applyAttribute(element, name, node.value)
    }
    if (this.children) {
      this.children.renderInto(dom, element)
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
    expression: NodeExpression,
    readonly children: Children,
  ) {
    super(expression)
  }

  get value(): Values.Value {
    return this.children.value
  }

  renderInto<T>(dom: Values.DOM<T>, el: T): T {
    return this.children.renderInto(dom, el)
  }
}

abstract class InvocableNode extends Node {
  constructor(
    expression: NodeExpression,
    readonly args: Map<string, Node>,
    readonly children: Children | undefined,
    readonly firstRender: Node,
  ) {
    super(expression)
  }

  get value(): Values.Value {
    return this.firstRender.value
  }

  renderInto<T>(dom: Values.DOM<T>, el: T): T {
    const element = this.firstRender.renderInto(dom, el)
    if (this.children) {
      this.children.renderInto(dom, element)
    }
    return element
  }
}

export class ViewFormulaNode extends InvocableNode {
  constructor(
    expression: NodeExpression,
    readonly formula: Values.ViewFormulaValue,
    args: Map<string, Node>,
    children: Children | undefined,
    firstRender: Node,
  ) {
    super(expression, args, children, firstRender)
  }
}

export class ViewInstanceNode extends InvocableNode {
  constructor(
    expression: NodeExpression,
    readonly view: Values.ViewClassInstanceValue,
    args: Map<string, Node>,
    children: Children | undefined,
    firstRender: Node,
  ) {
    super(expression, args, children, firstRender)
  }
}
