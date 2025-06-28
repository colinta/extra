import * as Types from '../types'
import * as Values from '../values'
import {MutableTypeRuntime} from '../runtime'

class MockTypeRuntime extends MutableTypeRuntime {
  constructor(readonly runtimeTypes: {[K in string]: [Types.Type, Values.Value]}) {
    super()
  }

  refId(name: string): string | undefined {
    if (!super.refId(name) && this.runtimeTypes[name]) {
      this.addId(name)
    }
    return super.refId(name)
  }

  getTypeById(id: string) {
    const sup = super.getLocalType(id)
    const name = super.refName(id)
    if (!sup && name) {
      const type = this.runtimeTypes[name]?.[0]
      return type
    }
    return sup
  }

  getLocalType(name: string) {
    if (this.runtimeTypes[name] && !super.getLocalType(name)) {
      this.addLocalType(name, this.runtimeTypes[name][0])
    }

    return super.getLocalType(name)
  }
}

export function mockTypeRuntime(runtimeTypes: {[K in string]: [Types.Type, Values.Value]}) {
  const runtime = new MockTypeRuntime(runtimeTypes)
  runtime.setLocale(new Intl.Locale('en-ca'))

  return runtime
}
