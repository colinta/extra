import * as Types from '../../types'
import * as Values from '../../values'
import {ModuleRuntime} from '../../runtime'
import {mockValueRuntime} from '../../tests/mockValueRuntime'

export function mockModuleRuntime<T>(runtimeTypes: {
  [K in string]: [Types.Type, Values.Value]
}) {
  const valueRuntime = mockValueRuntime(runtimeTypes)
  return new ModuleRuntime(valueRuntime)
}
