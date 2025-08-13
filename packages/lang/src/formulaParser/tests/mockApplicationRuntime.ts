import * as Types from '../../types'
import * as Values from '../../values'
import {ApplicationRuntime} from '../../runtime'
import {mockValueRuntime} from '../../tests/mockValueRuntime'

export function mockApplicationRuntime<T>(runtimeTypes: {
  [K in string]: [Types.Type, Values.Value]
}) {
  const valueRuntime = mockValueRuntime(runtimeTypes)
  return new ApplicationRuntime(valueRuntime)
}
