import * as Types from '../../types'
import * as Values from '../../values'
import {ApplicationRuntime, type Renderer} from '../../runtime'
import {mockValueRuntime} from './mockValueRuntime'

export function mockApplicationRuntime<T>(
  runtimeTypes: {[K in string]: [Types.Type, Values.Value]},
  renderer: Renderer<T>,
) {
  const valueRuntime = mockValueRuntime(runtimeTypes)
  return new ApplicationRuntime<T>(valueRuntime, renderer)
}
