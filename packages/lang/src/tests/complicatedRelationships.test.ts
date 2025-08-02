import * as Types from '../types'
import * as Values from '../values'
import {parse} from '../formulaParser'
import {type TypeRuntime, type ValueRuntime} from '../runtime'
import {mockTypeRuntime} from './mockTypeRuntime'
import {mockValueRuntime} from './mockValueRuntime'

let typeRuntime: TypeRuntime
let valueRuntime: ValueRuntime
let runtimeTypes: {[K in string]: [Types.Type, any]}

beforeEach(() => {
  runtimeTypes = {}
  typeRuntime = mockTypeRuntime(runtimeTypes)
  valueRuntime = mockValueRuntime(runtimeTypes)
})

describe('complicated relationships', () => {
  it('can infer the relationships of numbers when comparing', () => {
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
    const currentExpression = parse(code).get()
    const resolvedType = currentExpression.getType(typeRuntime).get()
    const resolvedValue = currentExpression.eval(valueRuntime).get()

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
    expect(resolvedValue!).toEqual(Values.tuple([Values.int(0), Values.int(1), Values.int(2)]))
  })

  it('can infer the relationships of numbers when asserting true', () => {
    runtimeTypes['index'] = [Types.int({min: 0}), Values.int(1)]
    const code = `
      let
        prev = index - 1
        next = index + 1
      in
        if (index) {
          then: {
            prev
            index
            next
          }
        }`
    const currentExpression = parse(code).get()
    const resolvedType = currentExpression.getType(typeRuntime).get()
    const resolvedValue = currentExpression.eval(valueRuntime).get()

    expect(resolvedType!).toEqual(
      Types.oneOf([
        Types.tuple([Types.int({min: 0}), Types.int({min: 1}), Types.int({min: 2})]),
        Types.nullType(),
      ]),
    )
    expect(resolvedValue!).toEqual(Values.tuple([Values.int(0), Values.int(1), Values.int(2)]))
  })

  it('can infer the relationships of indirect assignments', () => {
    runtimeTypes['i'] = [Types.int(), Values.int(1)]
    const code = `
      let
        prev = i - 1
        next = prev + 2
        index = i
      in
        if (index > 0 and 10 > index) {
          then: {
            prev
            index
            next
          }
        }`
    const currentExpression = parse(code).get()
    const resolvedType = currentExpression.getType(typeRuntime).get()

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
  })

  it('can infer the relationships of indirect comparisons', () => {
    runtimeTypes['a'] = [Types.int(), Values.nullValue()]
    runtimeTypes['b'] = [Types.int(), Values.nullValue()]
    runtimeTypes['c'] = [Types.int(), Values.nullValue()]
    const code = `
      if (a < b and b < c and c < 10) {
        then: {
          a
          b
          c
        }
      }`
    const currentExpression = parse(code).get()
    const resolvedType = currentExpression.getType(typeRuntime).get()

    expect(resolvedType!).toEqual(
      Types.oneOf([
        Types.tuple([Types.int({max: 9}), Types.int({max: 9}), Types.int({max: 9})]),
        Types.nullType(),
      ]),
    )
  })

  it('can infer the relationships of properties', () => {
    runtimeTypes['obj1'] = [Types.object([Types.namedProp('foo', Types.int())]), Values.nullValue()]
    runtimeTypes['obj2'] = [Types.object([Types.namedProp('bar', Types.int())]), Values.nullValue()]
    runtimeTypes['c'] = [Types.int(), Values.nullValue()]
    const code = `
      if (obj1.foo < obj2.bar and obj2.bar < c and c < 10) {
        then: {
          obj1.foo
          obj2.bar
          c
        }
      }`
    const currentExpression = parse(code).get()
    const resolvedType = currentExpression.getType(typeRuntime).get()

    expect(resolvedType!).toEqual(
      Types.oneOf([
        Types.tuple([Types.int({max: 9}), Types.int({max: 9}), Types.int({max: 9})]),
        Types.nullType(),
      ]),
    )
  })

  it('can infer safe array access with literals', () => {
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
        if (items.length >=3 and index >= 1 and index <= items.length - 2) {
          then: {
            items[prev]
            items[index]
            items[next]
          }
        }`
    const currentExpression = parse(code).get()
    const resolvedType = currentExpression.getType(typeRuntime).get()
    const resolvedValue = currentExpression.eval(valueRuntime).get()

    expect(resolvedType!).toEqual(
      Types.oneOf([Types.tuple([Types.int(), Types.int(), Types.int()]), Types.nullType()]),
    )
    expect(resolvedValue!).toEqual(Values.tuple([Values.int(-1), Values.int(1), Values.int(3)]))
  })

  it('can infer safe array with == array lengths comparison', () => {
    const code = `
      let
        letters: Array(String) = ['a', 'b', 'c']
        numbers: Array(Int) = [-1, 0, 1]
        index: Int = 1
      in
        if (
          index > 0
          and index < letters.length
          and letters.length == numbers.length
        ) {
          then: {
            letters[index],
            numbers[index],
          }
        }
    `
    const currentExpression = parse(code).get()
    const resolvedType = currentExpression.getType(typeRuntime).get()
    const resolvedValue = currentExpression.eval(valueRuntime).get()

    expect(resolvedType!).toEqual(
      Types.oneOf([Types.tuple([Types.string(), Types.int()]), Types.nullType()]),
    )
    expect(resolvedValue!).toEqual(Values.tuple([Values.string('b'), Values.int(0)]))
  })

  it('can infer safe array with <= array lengths comparison', () => {
    const code = `
      let
        letters: Array(String) = ['a', 'b', 'c']
        numbers: Array(Int) = [-1, 0, 1]
        index: Int = 1
      in
        if (
          index > 0
          and index < letters.length
          and letters.length <= numbers.length
        ) {
          then: {
            letters[index],
            numbers[index],
          }
        }
    `
    const currentExpression = parse(code).get()
    const resolvedType = currentExpression.getType(typeRuntime).get()
    const resolvedValue = currentExpression.eval(valueRuntime).get()

    expect(resolvedType!).toEqual(
      Types.oneOf([Types.tuple([Types.string(), Types.int()]), Types.nullType()]),
    )
    expect(resolvedValue!).toEqual(Values.tuple([Values.string('b'), Values.int(0)]))
  })
})
