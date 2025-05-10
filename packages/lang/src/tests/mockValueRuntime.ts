import * as Types from '~/types'
import * as Values from '~/values'
import {MutableValueRuntime} from '~/runtime'

class MockValueRuntime extends MutableValueRuntime {
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

  getLocalValue(name: string) {
    const key = name
    return this.runtimeTypes[key]?.[1] ?? super.getLocalValue(name)
  }

  getStateValue(name: string) {
    const key = `@${name}`
    return this.runtimeTypes[key]?.[1] ?? super.getStateValue(name)
  }

  getThisValue(name: string) {
    const key = `this.${name}`
    return this.runtimeTypes[key]?.[1] ?? super.getThisValue(name)
  }

  getActionValue(name: string) {
    const key = `&${name}`
    return this.runtimeTypes[key]?.[1] ?? super.getActionValue(name)
  }
}

export function mockValueRuntime(runtimeTypes: {[K in string]: [Types.Type, Values.Value]}) {
  const runtime = new MockValueRuntime(runtimeTypes)
  runtime.setLocale(new Intl.Locale('en-ca'))

  return runtime
}
