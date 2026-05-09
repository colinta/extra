import {c, cases} from '@extra-lang/cases'
import * as Types from '../types'

const user = Types.object([
  Types.namedProp('name', Types.StringType),
  Types.namedProp('age', Types.IntType),
])

const createUser = Types.formula(
  [
    Types.namedArgument({
      name: 'fullName',
      alias: 'name',
      type: Types.StringType,
      isRequired: true,
    }),
    Types.positionalArgument({name: 'age', type: Types.IntType, isRequired: true}),
    Types.repeatedNamedArgument({name: 'friend', type: Types.array(Types.StringType)}),
    Types.spreadPositionalArgument({name: 'relatives', type: Types.array(Types.StringType)}),
    Types.kwargListArgument({name: 'metadata', type: Types.dict(Types.BooleanType)}),
  ],
  user,
)

const toString = Types.formula(
  [Types.positionalArgument({name: 'input', type: Types.IntType, isRequired: true})],
  Types.StringType,
)

const toInt = Types.formula([], Types.IntType)

const containers = Types.oneOf([Types.array(Types.StringType), Types.set(Types.IntType)])
const mixedContainer = Types.oneOf([Types.array(Types.StringType), Types.IntType])
const fnUnion = Types.oneOf([toString, toInt])
const mixedFormula = Types.oneOf([toString, Types.IntType])

describe('formulaReturnType', () => {
  cases<[name: string, type: Types.Type, expected: string]>(
    c(['returns a formula return type', createUser, '{name: String, age: Int}']),
    c([
      'unwraps boxed formula types',
      Types.box('BoxedCreateUser', createUser),
      '{name: String, age: Int}',
    ]),
    c(['maps over one-of formula types', fnUnion, 'Int | String']),
  ).run(([name, type, expected], {only, skip}) =>
    (only ? it.only : skip ? it.skip : it)(name, () => {
      expect(Types.formulaReturnType(type).get().toString()).toEqual(expected)
    }),
  )

  cases<[name: string, type: Types.Type, expectedError: string]>(
    c(['rejects non-formula types', Types.IntType, 'Return requires a function type, got Int']),
    c([
      'rejects one-of types with non-formula members',
      mixedFormula,
      'Return requires a function type, got Int',
    ]),
  ).run(([name, type, expectedError], {only, skip}) =>
    (only ? it.only : skip ? it.skip : it)(name, () => {
      expect(() => Types.formulaReturnType(type).get()).toThrow(expectedError)
    }),
  )
})

describe('formulaParamsType', () => {
  cases<[name: string, type: Types.Type, expected: string]>(
    c([
      'returns a formula params object type',
      createUser,
      '{name: String, Int, friend: [String], ...[String], metadata: Dict(Boolean)}',
    ]),
    c([
      'unwraps boxed formula types',
      Types.box('BoxedCreateUser', createUser),
      '{name: String, Int, friend: [String], ...[String], metadata: Dict(Boolean)}',
    ]),
    c(['maps over one-of formula types', fnUnion, '{Int}']),
  ).run(([name, type, expected], {only, skip}) =>
    (only ? it.only : skip ? it.skip : it)(name, () => {
      expect(Types.formulaParamsType(type).get().toString()).toEqual(expected)
    }),
  )

  cases<[name: string, type: Types.Type, expectedError: string]>(
    c(['rejects non-formula types', Types.IntType, 'Params requires a function type, got Int']),
    c([
      'rejects one-of types with non-formula members',
      mixedFormula,
      'Params requires a function type, got Int',
    ]),
  ).run(([name, type, expectedError], {only, skip}) =>
    (only ? it.only : skip ? it.skip : it)(name, () => {
      expect(() => Types.formulaParamsType(type).get()).toThrow(expectedError)
    }),
  )
})

describe('elementType', () => {
  cases<[name: string, type: Types.Type, expected: string]>(
    c(['returns array element types', Types.array(Types.StringType), 'String']),
    c(['returns dict element types', Types.dict(Types.IntType), 'Int']),
    c(['returns set element types', Types.set(Types.BooleanType), 'Boolean']),
    c([
      'unwraps boxed container types',
      Types.box('BoxedStrings', Types.array(Types.StringType)),
      'String',
    ]),
    c(['maps over one-of container types', containers, 'Int | String']),
  ).run(([name, type, expected], {only, skip}) =>
    (only ? it.only : skip ? it.skip : it)(name, () => {
      expect(Types.elementType(type).get().toString()).toEqual(expected)
    }),
  )

  cases<[name: string, type: Types.Type, expectedError: string]>(
    c([
      'rejects non-container types',
      Types.IntType,
      'Element requires an array, dict, or set type, got Int',
    ]),
    c([
      'rejects one-of types with non-container members',
      mixedContainer,
      'Element requires an array, dict, or set type, got Int',
    ]),
  ).run(([name, type, expectedError], {only, skip}) =>
    (only ? it.only : skip ? it.skip : it)(name, () => {
      expect(() => Types.elementType(type).get()).toThrow(expectedError)
    }),
  )
})
