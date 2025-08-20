import {ViewType} from './types'
import {NamedViewValue} from './values'
import {ViewRuntime} from './runtime'

export class HtmlRuntime implements ViewRuntime {
  constructor() {}

  has(name: string) {
    return this.getViewType(name) !== undefined
  }

  getViewType(tag: string) {
    switch (tag) {
      case 'p':
        // TODO: add 'args' definitions to tags
        return new HtmlViewType('p')
    }
  }

  getViewValue(tag: string) {
    switch (tag) {
      case 'p':
        return new HtmlParagraphElement('p')
    }
  }
}

class HtmlViewType extends ViewType {
  constructor(readonly tag: string) {
    super()
  }
}

class HtmlElement extends NamedViewValue {}
class HtmlParagraphElement extends HtmlElement {}
