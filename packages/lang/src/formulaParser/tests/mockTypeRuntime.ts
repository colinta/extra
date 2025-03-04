import * as Types from '../../types'
import * as Values from '../../values'
import {TypeRuntime} from '../../runtime'

export function mockTypeRuntime(runtimeTypes: {[K in string]: [Types.Type, Values.Value]}) {
  return new TypeRuntime({
    getLocalType(name: string) {
      if (name in runtimeTypes) {
        const [type] = runtimeTypes[name]
        return type
      }
    },
    getStateType(name: string) {
      const runtimeName = `@${name}`
      if (runtimeName in runtimeTypes) {
        const [type] = runtimeTypes[runtimeName]
        return type
      }
    },
    getThisType(name: string) {
      const runtimeName = `this.${name}`
      if (runtimeName in runtimeTypes) {
        const [type] = runtimeTypes[runtimeName]
        return type
      }
    },
    getActionType(name: string) {
      const runtimeName = `&${name}`
      if (runtimeName in runtimeTypes) {
        const [type] = runtimeTypes[runtimeName]
        return type
      }
    },
    getPipeType: () => undefined,
    getLocale() {
      return new Intl.Locale('en-ca')
    },
  })
}
