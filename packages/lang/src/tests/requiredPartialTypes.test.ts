import {c, cases} from '@extra-lang/cases'
import * as Types from '../types'

const user = Types.object([
  Types.namedProp('name', Types.StringType),
  Types.namedProp('age', Types.IntType),
  Types.positionalProp(Types.BooleanType),
])

const optionalUser = Types.object([
  Types.namedProp('name', Types.optional(Types.StringType)),
  Types.namedProp('age', Types.optional(Types.IntType)),
  Types.positionalProp(Types.optional(Types.BooleanType)),
])

const nestedOptionalUser = Types.object([
  Types.namedProp(
    'profile',
    Types.object([Types.namedProp('nickname', Types.optional(Types.StringType))]),
  ),
  Types.namedProp(
    'settings',
    Types.optional(Types.object([Types.namedProp('darkMode', Types.BooleanType)])),
  ),
])

const tupleWithSpread = Types.object([
  Types.positionalProp(Types.IntType),
  Types.spreadPositionalProp(Types.array(Types.StringType, {min: 1, max: 3})),
])

const optionalTupleWithSpread = Types.object([
  Types.positionalProp(Types.optional(Types.IntType)),
  Types.spreadPositionalProp(Types.array(Types.optional(Types.StringType), {min: 1, max: 3})),
])

const formula = Types.formula(
  [Types.positionalArgument({name: 'input', type: Types.IntType, isRequired: true})],
  Types.StringType,
  [],
  new Map<string, Types.Type>([
    ['a', Types.IntType],
    ['b', Types.StringType],
  ]),
)

const optionalFormula = Types.formula(
  [
    Types.positionalArgument({
      name: 'input',
      type: Types.optional(Types.IntType),
      isRequired: true,
    }),
  ],
  Types.optional(Types.StringType),
  [],
  new Map<string, Types.Type>([
    ['a', Types.optional(Types.IntType)],
    ['b', Types.optional(Types.StringType)],
  ]),
)

describe('partialType', () => {
  cases<[name: string, type: Types.Type, expected: string]>(
    c(['makes object props optional', user, '{name: String?, age: Int?, Boolean?}']),
    c([
      'leaves optional object props optional',
      optionalUser,
      '{name: String?, age: Int?, Boolean?}',
    ]),
    c([
      'makes spread-positional element types optional',
      tupleWithSpread,
      '{Int?, ...[String?, length: 1...3]}',
    ]),
    c(['unwraps box types', Types.box('OpaqueUser', user), '{name: String?, age: Int?, Boolean?}']),
    c([
      'maps over one-of types',
      Types.oneOf([
        Types.object([Types.namedProp('name', Types.StringType)]),
        Types.object([Types.namedProp('age', Types.IntType)]),
      ]),
      '{age: Int?} | {name: String?}',
    ]),
    c(['makes formula props optional', formula, 'fn{(# input: Int): String, a: Int?, b: String?}']),
    c([
      'does not change formula args or return type',
      Types.formula(
        [Types.positionalArgument({name: 'input', type: Types.IntType, isRequired: true})],
        Types.StringType,
      ),
      'fn(# input: Int): String',
    ]),
    c(['returns non-partializable types unchanged', Types.StringType, 'String']),
  ).run(([name, type, expected], {only, skip}) =>
    (only ? it.only : skip ? it.skip : it)(name, () => {
      expect(Types.partialType(type).toString()).toEqual(expected)
    }),
  )
})

describe('requiredType', () => {
  cases<[name: string, type: Types.Type, expected: string]>(
    c(['makes object props required', optionalUser, '{name: String, age: Int, Boolean}']),
    c(['leaves required object props required', user, '{name: String, age: Int, Boolean}']),
    c([
      'makes spread-positional element types required',
      optionalTupleWithSpread,
      '{Int, ...[String, length: 1...3]}',
    ]),
    c([
      'unwraps box types',
      Types.box('OpaqueOptionalUser', optionalUser),
      '{name: String, age: Int, Boolean}',
    ]),
    c([
      'maps over one-of types and preserves null',
      Types.oneOf([
        Types.object([Types.namedProp('name', Types.optional(Types.StringType))]),
        Types.NullType,
        Types.object([Types.namedProp('age', Types.optional(Types.IntType))]),
      ]),
      '{age: Int} | {name: String} | null',
    ]),
    c([
      'only recurses one level into object props',
      nestedOptionalUser,
      '{profile: {nickname: String?}, settings: {darkMode: Boolean}}',
    ]),
    c([
      'makes formula props required',
      optionalFormula,
      'fn{(# input: Int?): String?, a: Int, b: String}',
    ]),
    c([
      'does not change formula args or return type',
      optionalFormula,
      'fn{(# input: Int?): String?, a: Int, b: String}',
    ]),
    c(['returns non-requirable types unchanged', Types.StringType, 'String']),
  ).run(([name, type, expected], {only, skip}) =>
    (only ? it.only : skip ? it.skip : it)(name, () => {
      expect(Types.requiredType(type).toString()).toEqual(expected)
    }),
  )
})
