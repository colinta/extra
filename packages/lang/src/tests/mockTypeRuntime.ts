import * as Types from '~/types'
import * as Values from '~/values'
import {MutableTypeRuntime} from '~/runtime'

class MockTypeRuntime extends MutableTypeRuntime {
  constructor(readonly runtimeTypes: {[K in string]: [Types.Type, Values.Value]}) {
    super()
  }

  refId(name: string): string | undefined {
    if (!this.ids.has(name) && this.runtimeTypes[name]) {
      this.addId(name)
    }
    return super.refId(name)
  }

  getLocalType(name: string) {
    const key = name
    return this.runtimeTypes[key]?.[0] ?? super.getLocalType(name)
  }

  getStateType(name: string) {
    const key = `@${name}`
    return this.runtimeTypes[key]?.[0] ?? super.getStateType(name)
  }

  getThisType(name: string) {
    const key = `this.${name}`
    return this.runtimeTypes[key]?.[0] ?? super.getThisType(name)
  }

  getActionType(name: string) {
    const key = `&${name}`
    return this.runtimeTypes[key]?.[0] ?? super.getActionType(name)
  }
}

export function mockTypeRuntime(runtimeTypes: {[K in string]: [Types.Type, Values.Value]}) {
  const runtime = new MockTypeRuntime(runtimeTypes)
  runtime.setLocale(new Intl.Locale('en-ca'))

  return runtime
}
