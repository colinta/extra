import * as Types from '../types'
import * as Values from '../values'
import {MutableValueRuntime} from '../runtime'

class MockValueRuntime extends MutableValueRuntime {
  constructor(readonly runtimeTypes: {[K in string]: [Types.Type, Values.Value]}) {
    super()
  }

  refId(name: string): string | undefined {
    if (!super.refId(name) && this.runtimeTypes[name]) {
      this.addId(name)
    }
    return super.refId(name)
  }

  has(name: string) {
    if (this.runtimeTypes[name]) {
      return true
    }
    return super.has(name)
  }

  getLocalType(name: string) {
    if (this.runtimeTypes[name] && !super.getLocalType(name)) {
      this.addLocalType(name, this.runtimeTypes[name][0])
    }

    return super.getLocalType(name)
  }

  getLocalValue(name: string) {
    if (this.runtimeTypes[name] && !super.getLocalValue(name)) {
      this.addLocalValue(name, this.runtimeTypes[name][1])
    }

    return super.getLocalValue(name)
  }
}

export function mockValueRuntime(runtimeTypes: {[K in string]: [Types.Type, Values.Value]}) {
  const runtime = new MockValueRuntime(runtimeTypes)
  return runtime
}
