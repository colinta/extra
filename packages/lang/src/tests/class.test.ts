import {c, cases} from '@extra-lang/cases'
import {ok} from '@extra-lang/result'
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

function desc(def: string) {
  return def.split('\n')[0]
}

function defineClass(classDefinition: string) {
  const moduleDef = parseModule(classDefinition).get()
  const classDef = moduleDef.expressions[0]
  const classType = classDef.getType(typeRuntime).get()
  const classValue = classDef.eval(valueRuntime).get()

  runtimeTypes[classDef.name] = [classType, classValue]

  return {classDef, classType, classValue}
}

function emptyClassValue(name: string) {
  return Values.classDefinition({
    name,
    constructor: classDef =>
      new Values.NamedFormulaValue(
        name,
        () => ok(Values.classInstance({class: classDef})),
        undefined,
        [],
      ),
  })
}

function getType(code: string) {
  return parse(code).get().getType(typeRuntime).get()
}

function evalValue(code: string) {
  return parse(code).get().eval(valueRuntime).get()
}

describe('class instances', () => {
  describe('getType', () => {
    it('creates an instance of an empty class injected into the runtime', () => {
      const classType = Types.classDefinition({name: 'Foo', class: Types.classType({name: 'Foo'})})
      runtimeTypes['Foo'] = [classType, emptyClassValue('Foo')]

      expect(getType('Foo()')).toEqual(Types.classType({name: 'Foo'}))
    })

    cases<[string, [string, Types.Type][]]>(
      c([
        `\
class Foo {
  @state = 0
}
`,
        [
          ['Foo()', Types.classType({name: 'Foo', props: new Map([['state', Types.int()]])})],
          ['Foo().state', Types.int()],
        ],
      ]),
      c([
        `\
class Foo {
  @prop: Int
}
`,
        [
          ['Foo(prop: 1)', Types.classType({name: 'Foo', props: new Map([['prop', Types.int()]])})],
          ['Foo(prop: 1).prop', Types.int()],
        ],
      ]),
      c([
        `\
class Foo {
  @prop: Int
  @something = 0
}
`,
        [
          [
            'Foo(prop: 1)',
            Types.classType({
              name: 'Foo',
              props: new Map([
                ['prop', Types.int()],
                ['something', Types.int()],
              ]),
            }),
          ],
          ['Foo(prop: 1).something', Types.int()],
        ],
      ]),
      c([
        `\
class Foo(optional: Int? = null) {
  @prop1 = optional ?? 0
}
`,
        [
          ['Foo()', Types.classType({name: 'Foo', props: new Map([['prop1', Types.int()]])})],
          [
            'Foo(optional: 1)',
            Types.classType({name: 'Foo', props: new Map([['prop1', Types.int()]])}),
          ],
          ['Foo().prop1', Types.int()],
          ['Foo(optional: 1).prop1', Types.int()],
        ],
      ]),
    ).run(([classDefinition, tests], {only, skip}) =>
      (only ? it.only : skip ? it.skip : it)(
        `should create instances from ${desc(classDefinition)}`,
        () => {
          defineClass(classDefinition)

          for (const [code, expectedType] of tests) {
            expect(getType(code)).toEqual(expectedType)
          }
        },
      ),
    )
  })

  describe('eval', () => {
    it('evaluates an instance of an empty class injected into the runtime', () => {
      const classType = Types.classDefinition({name: 'Foo', class: Types.classType({name: 'Foo'})})
      runtimeTypes['Foo'] = [classType, emptyClassValue('Foo')]

      const value = evalValue('Foo()')
      expect(value).toBeInstanceOf(Values.ClassInstanceValue)
      expect(value.toCode()).toEqual('Foo()')
    })

    cases<[string, [string, Values.Value][]]>(
      c([
        `\
class Foo {
  @state = 0
}
`,
        [['Foo().state', Values.int(0)]],
      ]),
      c([
        `\
class Foo {
  @prop: Int
}
`,
        [['Foo(prop: 1).prop', Values.int(1)]],
      ]),
      c([
        `\
class Foo {
  @prop: Int
  @something = 0
}
`,
        [
          ['Foo(prop: 1).prop', Values.int(1)],
          ['Foo(prop: 1).something', Values.int(0)],
        ],
      ]),
      c([
        `\
class Foo(optional: Int? = null) {
  @prop1 = optional ?? 0
}
`,
        [
          ['Foo().prop1', Values.int(0)],
          ['Foo(optional: 1).prop1', Values.int(1)],
        ],
      ]),
    ).run(([classDefinition, tests], {only, skip}) =>
      (only ? it.only : skip ? it.skip : it)(
        `should evaluate instances from ${desc(classDefinition)}`,
        () => {
          defineClass(classDefinition)

          for (const [code, expectedValue] of tests) {
            expect(evalValue(code)).toEqual(expectedValue)
          }
        },
      ),
    )
  })
})
