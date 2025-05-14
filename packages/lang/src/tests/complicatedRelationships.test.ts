// import {c, cases} from '@extra-lang/cases'
import * as Types from '~/types'
import * as Values from '~/values'
import {parse} from '~/formulaParser'
import {type TypeRuntime, type ValueRuntime} from '~/runtime'
import {mockTypeRuntime} from '~/tests/mockTypeRuntime'
import {mockValueRuntime} from './mockValueRuntime'

let typeRuntime: TypeRuntime
let valueRuntime: ValueRuntime
let runtimeTypes: {[K in string]: [Types.Type, any]}

beforeEach(() => {
  runtimeTypes = {}
  typeRuntime = mockTypeRuntime(runtimeTypes)
  valueRuntime = mockValueRuntime(runtimeTypes)
})

describe('let … in', () => {
  it.only('can infer the relationships of numbers', () => {
    runtimeTypes['index'] = [Types.int(), Values.int(1)]
    const code = `
      let
        prev = index - 1
        next = index + 1
      in
        if (index > 0 and index < 10) {
          then: {
            prev
            index
            next
          }
        }`
    let resolvedType: Types.Type
    let resolvedValue: Values.Value
    expect(() => {
      const currentExpression = parse(code).get()
      resolvedType = currentExpression.getType(typeRuntime).get()
      resolvedValue = currentExpression.eval(valueRuntime).get()
    }).not.toThrow()

    console.log('=========== complicatedRelationships.test.ts at line 48 ===========')
    console.log({resolvedType})
    expect(resolvedType!).toEqual(
      Types.oneOf([
        Types.tuple([
          Types.int({min: 0, max: 8}),
          Types.int({min: 1, max: 9}),
          Types.int({min: 2, max: 10}),
        ]),
        Types.nullType(),
      ]),
    )
    expect(resolvedValue!).toEqual(Values.tuple([Values.int(-1), Values.int(1), Values.int(3)]))
  })

  it('can infer array access', () => {
    runtimeTypes['items'] = [
      Types.array(Types.string()),
      Values.array([Values.int(-1), Values.int(1), Values.int(3)]),
    ]
    runtimeTypes['index'] = [Types.int(), Values.int(1)]
    const code = `
      -- items: Array(Int), from runtime
      -- index: Int, from runtime
      let
        prev = index - 1
        next = index + 1
      in
        if (items.length >= 3 and index > 0 and index < items.length - 2) {
          then: {
            items[prev]
            items[index]
            items[next]
          }
        }`
    let resolvedType: Types.Type
    let resolvedValue: Values.Value
    expect(() => {
      const currentExpression = parse(code).get()
      resolvedType = currentExpression.getType(typeRuntime).get()
      resolvedValue = currentExpression.eval(valueRuntime).get()
    }).not.toThrow()

    console.log('=========== complicatedRelationships.test.ts at line 48 ===========')
    console.log({resolvedType})
    expect(resolvedType!).toEqual(
      Types.oneOf([
        Types.tuple([Types.string(), Types.string(), Types.string()]),
        Types.nullType(),
      ]),
    )
    expect(resolvedValue!).toEqual(Values.tuple([Values.int(-1), Values.int(1), Values.int(3)]))
  })

  it('can infer multiple array access', () => {
    runtimeTypes['items'] = [
      Types.array(Types.int()),
      Values.array([Values.int(-1), Values.int(1), Values.int(3)]),
    ]
    runtimeTypes['index'] = [Types.int(), Values.int(1)]
    const code = `
      -- items: Array(Int), from runtime
      -- index: Int, from runtime
      let
        prev = index - 1
        next = index + 1
      in
        if (items.length >= 3 and index > 0 and index < items.length - 2) {
          then: {
            items[prev]
            items[index]
            items[next]
          }
        }`
    let resolvedType: Types.Type
    let resolvedValue: Values.Value
    expect(() => {
      const currentExpression = parse(code).get()
      resolvedType = currentExpression.getType(typeRuntime).get()
      resolvedValue = currentExpression.eval(valueRuntime).get()
    }).not.toThrow()

    console.log('=========== complicatedRelationships.test.ts at line 48 ===========')
    console.log({resolvedType})
    expect(resolvedType!).toEqual(
      Types.oneOf([Types.tuple([Types.int(), Types.int(), Types.int()]), Types.nullType()]),
    )
    expect(resolvedValue!).toEqual(Values.tuple([Values.int(-1), Values.int(1), Values.int(3)]))
  })
})
