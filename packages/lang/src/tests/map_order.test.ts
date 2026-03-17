import * as Types from '../types'
import {parse} from '../formulaParser'
import {mockTypeRuntime} from './mockTypeRuntime'
import * as Values from '../values'
import type {TypeRuntime} from '../runtime'

let typeRuntime: TypeRuntime
let runtimeTypes: {[K in string]: [Types.Type, any]}

function setup() {
  runtimeTypes = {}
  typeRuntime = mockTypeRuntime(runtimeTypes)
}

function addFormula(name: string, definition: string) {
  const expression = parse(definition).get()
  const type = expression.getType(typeRuntime).get()
  runtimeTypes[name] = [type, Values.nullValue()]
  return type
}

function getType(code: string): Types.Type {
  const expression = parse(code).get()
  const result = expression.getType(typeRuntime)
  if (result.isErr()) throw result.error
  return result.get()
}

describe('map argument order', () => {
  beforeEach(setup)

  test('original order: input first, callback second', () => {
    addFormula('map', 'fn<T, U>(#input: T, map: fn(#in: T): U) => map(input)')
    addFormula('identity', 'fn<T>(val: T) => val')
    const result = getType('map(1, map: identity)')
    expect(result.toCode()).toEqual('1')
  })

  test('reversed order: callback first, input second', () => {
    addFormula('map', 'fn<T, U>(map: fn(#in: T): U, #input: T) => map(input)')
    addFormula('identity', 'fn<T>(val: T) => val')
    const result = getType('map(map: identity, 1)')
    expect(result.toCode()).toEqual('1')
  })
})
