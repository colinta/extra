import * as Types from '../types'

export function privateOneOf(...types: Types.Type[]) {
  return Types._privateOneOf(types)
}
