import {c, cases} from '@extra-lang/cases'
import * as Types from '../types'

const position = (value: number): Types.PropertySelection => ({kind: 'position', value})
const property = (value: string): Types.PropertySelection => ({kind: 'property', value})

const user = Types.object([
  Types.namedProp('name', Types.StringType),
  Types.namedProp('age', Types.IntType),
  Types.positionalProp(Types.BooleanType),
])

const tupleWithSpread = Types.object([
  Types.positionalProp(Types.IntType),
  Types.spreadPositionalProp(Types.array(Types.StringType, {min: 1})),
])

const mixedSpread = Types.object([
  Types.positionalProp(Types.IntType),
  Types.positionalProp(Types.BooleanType),
  Types.namedProp('c', Types.FloatType),
  Types.spreadPositionalProp(Types.array(Types.StringType, {min: 2, max: 10})),
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

const status = Types.namedEnumDefinition({
  name: 'Status',
  members: [
    Types.enumCase('done', [Types.namedProp('value', Types.IntType)]),
    Types.enumCase('loading'),
  ],
})

describe('selectTypeProps', () => {
  cases<[
    name: string,
    type: Types.Type,
    properties: Types.PropertySelection[],
    pick: boolean,
    expected: string,
  ]>(
    c(['picks named properties from objects', user, [property('name')], true, '{name: String}']),
    c(['omits named properties from objects', user, [property('age')], false, '{name: String, Boolean}']),
    c(['picks positional properties from objects', user, [position(0)], true, '{Boolean}']),
    c(['omits positional properties from objects', user, [position(0)], false, '{name: String, age: Int}']),
    c([
      'keeps object property order instead of selection order',
      user,
      [position(0), property('name')],
      true,
      '{name: String, Boolean}',
    ]),
    c(['picks positions from spread-positionals', tupleWithSpread, [position(0), position(1), position(2)], true, '{Int, String, String?}']),
    c([
      'omits positions from spread-positionals',
      mixedSpread,
      [position(0), position(2), position(4), position(20)],
      false,
      '{Boolean, c: Float, ...[String, length: 1...8]}',
    ]),
    c([
      'selects through opaque types',
      Types.opaque('OpaqueTuple', tupleWithSpread),
      [position(0), position(1)],
      true,
      '{Int, String}',
    ]),
    c([
      'selects each member of one-of types',
      Types.oneOf([
        Types.object([Types.namedProp('name', Types.StringType), Types.namedProp('age', Types.IntType)]),
        Types.object([Types.namedProp('name', Types.StringType), Types.namedProp('role', Types.StringType)]),
      ]),
      [property('name')],
      false,
      '{age: Int} | {role: String}',
    ]),
    c(['picks formula props', formula, [property('b')], true, 'fn{(# input: Int): String, b: String}']),
    c(['omits formula props', formula, [property('a')], false, 'fn{(# input: Int): String, b: String}']),
    c(['ignores positional selections for formula props', formula, [position(0)], true, 'fn(# input: Int): String']),
    c([
      'selects named enum definitions through their instance type',
      status,
      [property('value')],
      true,
      'Status.done | Status.loading',
    ]),
    c(['returns non-selectable types unchanged', Types.IntType, [property('name'), position(0)], true, 'Int']),
  ).run(([name, type, properties, pick, expected], {only, skip}) =>
    (only ? it.only : skip ? it.skip : it)(name, () => {
      expect(Types.selectTypeProps(type, properties, pick).toString()).toEqual(expected)
    }),
  )
})
