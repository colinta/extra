import {c, cases} from '@extra-lang/cases'
import * as Types from '../types'
import * as Values from '../values'
import {parse, parseModule} from '../formulaParser'
import {type TypeRuntime, type ValueRuntime} from '../runtime'
import {mockTypeRuntime} from './mockTypeRuntime'
import {mockValueRuntime} from './mockValueRuntime'

let runtimeTypes: {[K in string]: [Types.Type, Values.Value]}
let typeRuntime: TypeRuntime
let valueRuntime: ValueRuntime

beforeEach(() => {
  runtimeTypes = {}
  typeRuntime = mockTypeRuntime(runtimeTypes)
  valueRuntime = mockValueRuntime(runtimeTypes)
})

function addFormula(definition: string) {
  const expression = parse(definition).get()
  const type = expression.getType(typeRuntime).get()
  const value = expression.eval(valueRuntime).get()
  runtimeTypes[(expression as any).name] = [type, value]
  return {expression, type, value}
}

function defineClass(definition: string) {
  const moduleDef = parseModule(definition).get()
  const classDef = moduleDef.expressions[0]
  const classType = classDef.getType(typeRuntime).get() as Types.ClassDefinitionType
  const classValue = classDef.eval(valueRuntime).get()
  runtimeTypes[classDef.name] = [classType, classValue]
  return {classDef, classType, classValue}
}

describe('macros', () => {
  describe('#line and #column', () => {
    cases<[string, Values.Value]>(
      c(['#line', Values.int(1)]),
      c(['#column', Values.int(1)]),
      c([
        `1 +  -- 1 +
  #line +     -- 2 +
  #column     -- 3 = 6`,
        Values.int(6),
      ]),
    ).run(([formula, expected], {only, skip}) =>
      (only ? it.only : skip ? it.skip : it)(`evaluates ${formula}`, () => {
        const expression = parse(formula).get()
        expect(expression.eval(valueRuntime).get()).toEqual(expected)
      }),
    )
  })

  describe('#fn', () => {
    it('returns the name of a named function', () => {
      addFormula(`fn debug(): String => #fn`)

      const expression = parse(`debug()`).get()
      expect(expression.eval(valueRuntime).get()).toEqual(Values.string('debug'))
    })

    it('returns the qualified name for instance methods', () => {
      defineClass(`\
class Foo {
  fn debug(): String => #fn
}
`)

      const expression = parse(`Foo().debug()`).get()
      expect(expression.eval(valueRuntime).get()).toEqual(Values.string('Foo().debug'))
    })

    it('errors in anonymous functions', () => {
      const expression = parse(`(fn(): String => #fn)()`).get()
      expect(() => expression.eval(valueRuntime).get()).toThrow(
        "'#fn' accessed outside of a named function",
      )
    })
  })
})
