import {c, cases} from '@extra-lang/cases'
import {type TypeRuntime} from '../../runtime'
import * as Types from '../../types'
import * as Values from '../../values'
import {parse} from '../../formulaParser'
import {type Expression} from '../../expressions'
import {mockTypeRuntime} from '../../tests/mockTypeRuntime'

let runtimeTypes: {[K in string]: [Types.Type, Values.Value]}

let typeRuntime: TypeRuntime

beforeEach(() => {
  runtimeTypes = {}
  typeRuntime = mockTypeRuntime(runtimeTypes)
})

/**
 * Used in the match eval tests
 */
function truthyFalsey(name: string, expression: Expression, runtime: TypeRuntime) {
  const truthy = expression.assumeTrue(runtime).get()
  const falsey = expression.assumeFalse(runtime).get()
  return {truthy: truthy.getLocalType(name), falsey: falsey.getLocalType(name)}
}

describe('combineOrRelationships', () => {
  describe('getType', () => {
    cases<
      [
        Types.Type,
        string,
        {
          truthy: Types.Type
          falsey: Types.Type
        },
      ]
    >(
      c([
        Types.oneOf([Types.string(), Types.int(), Types.booleanType()]),
        'foo is String or foo is Int',
        {
          truthy: Types.oneOf([Types.string(), Types.int()]),
          falsey: Types.booleanType(),
        },
      ]),
      c([
        Types.string(),
        'foo is /(?<foo>\\w+)/ or foo is /(?<foo>\\d+)/',
        {
          truthy: Types.oneOf([Types.string({regex: [/\w+/]}), Types.string({regex: [/\d+/]})]),
          falsey: Types.string(),
        },
      ]),
      c([
        Types.oneOf([Types.string(), Types.int(), Types.booleanType(), Types.nullType()]),
        'foo is String or foo is Int or foo is Boolean',
        {
          truthy: Types.oneOf([Types.string(), Types.int(), Types.booleanType()]),
          falsey: Types.nullType(),
        },
      ]),
    ).run(([fooType, formula, expectedTypes], {only, skip}) => {
      ;(only ? it.only : skip ? it.skip : it)(
        `(foo: ${fooType}) '${formula}' => truthy: ${expectedTypes.truthy}, falsey: ${expectedTypes.falsey}`,
        () => {
          runtimeTypes['foo'] = [fooType, Values.nullValue()]
          const expression = parse(formula).get()
          const {truthy, falsey} = truthyFalsey('foo', expression, typeRuntime)
          expect(truthy).toEqual(expectedTypes.truthy)
          expect(falsey).toEqual(expectedTypes.falsey)
        },
      )
    })
  })
})
