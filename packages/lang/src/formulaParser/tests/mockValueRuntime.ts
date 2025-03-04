import * as Types from '../../types'
import * as Values from '../../values'
import {ValueRuntime} from '../../runtime'

export function mockValueRuntime(runtimeTypes: {[K in string]: [Types.Type, Values.Value]}) {
  return new ValueRuntime({
    getLocalType(name: string) {
      if (name in runtimeTypes) {
        const [type] = runtimeTypes[name]
        return type
      }
    },
    getLocalValue(name: string) {
      if (name in runtimeTypes) {
        const [_, value] = runtimeTypes[name]
        return value
      }
    },
    getStateType(name: string) {
      const atName = `@${name}`
      if (atName in runtimeTypes) {
        const [type] = runtimeTypes[atName]
        return type
      }
    },
    getStateValue(name: string) {
      const atName = `@${name}`
      if (atName in runtimeTypes) {
        const [_, value] = runtimeTypes[atName]
        return value
      }
    },
    getThisType(name: string) {
      const atName = `this.${name}`
      if (atName in runtimeTypes) {
        const [type] = runtimeTypes[atName]
        return type
      }
    },
    getThisValue(name: string) {
      const atName = `this.${name}`
      if (atName in runtimeTypes) {
        const [_, value] = runtimeTypes[atName]
        return value
      }
    },
    getActionType(name: string) {
      const atName = `&${name}`
      if (atName in runtimeTypes) {
        const [type] = runtimeTypes[atName]
        return type
      }
    },
    getActionValue(name: string) {
      const atName = `&${name}`
      if (atName in runtimeTypes) {
        const [_, value] = runtimeTypes[atName]
        return value
      }
    },
    getPipeType: () => undefined,
    getPipeValue: () => undefined,
    getLocale() {
      return new Intl.Locale('en-ca')
    },
  })
}
