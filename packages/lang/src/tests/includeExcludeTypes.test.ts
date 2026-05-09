import {c, cases} from '@extra-lang/cases'
import * as Types from '../types'

const user = Types.object([Types.namedProp('name', Types.StringType)])

const objectOrInt = Types.oneOf([Types.object([Types.namedProp('user', user)]), Types.IntType])

const literalOrInt = Types.oneOf([Types.literal('a'), Types.literal('b'), Types.IntType])

const mixed = Types.oneOf([
  Types.literal('a'),
  Types.literal('b'),
  Types.IntType,
  Types.object([Types.namedProp('name', Types.StringType)]),
])

const narrowedLiteralOrInt = Types.oneOf([Types.literal('a'), Types.int({min: 1})])

const status = Types.namedEnumDefinition({
  name: 'Status',
  members: [
    Types.enumCase('notAsked'),
    Types.enumCase('loading'),
    Types.enumCase('error'),
    Types.enumCase('done'),
  ],
})

describe('excludeType', () => {
  cases<[name: string, baseType: Types.Type, excludedType: Types.Type, expected: string]>(
    c([
      'excludes matching literals from one-of types',
      literalOrInt,
      Types.literal('b'),
      '"a" | Int',
    ]),
    c([
      'unwraps box base types',
      Types.box('OpaqueLiteralOrInt', literalOrInt),
      Types.literal('b'),
      '"a" | Int',
    ]),
    c([
      'unwraps box excluded types',
      literalOrInt,
      Types.box('OpaqueB', Types.literal('b')),
      '"a" | Int',
    ]),
    c(['excludes assignable types from one-of types', literalOrInt, Types.IntType, '"a" | "b"']),
    c(['narrows numeric ranges', literalOrInt, Types.int({max: -1}), '"a" | "b" | Int(>=0)']),
    c([
      'removes null from optional types',
      Types.optional(Types.StringType),
      Types.NullType,
      'String',
    ]),
    c(['excludes object-compatible branches', objectOrInt, Types.object([]), 'Int']),
    c([
      'leaves branches that cannot be assigned to the excluded object type',
      objectOrInt,
      Types.object([Types.namedProp('foo', Types.IntType)]),
      '{user: {name: String}} | Int',
    ]),
    c([
      'normalizes anonymous enum cases against named enum definitions',
      status,
      Types.enumShorthand('loading'),
      'Status.done | Status.error | Status.notAsked',
    ]),
    c([
      'returns never when the base type is assignable to the excluded type',
      Types.StringType,
      Types.StringType,
      'never',
    ]),
    c(['leaves non-matching literals unchanged', Types.literal('a'), Types.literal('b'), '"a"']),
  ).run(([name, baseType, excludedType, expected], {only, skip}) =>
    (only ? it.only : skip ? it.skip : it)(name, () => {
      expect(Types.excludeType(baseType, excludedType).toString()).toEqual(expected)
    }),
  )
})

describe('notNullType', () => {
  cases<[name: string, baseType: Types.Type, expected: string]>(
    c(['removes null from optional types', Types.optional(Types.StringType), 'String']),
    c([
      'removes null from one-of types',
      Types.oneOf([Types.StringType, Types.NullType, Types.IntType]),
      'Int | String',
    ]),
    c(['leaves non-nullable types unchanged', Types.StringType, 'String']),
  ).run(([name, baseType, expected], {only, skip}) =>
    (only ? it.only : skip ? it.skip : it)(name, () => {
      expect(Types.notNullType(baseType).toString()).toEqual(expected)
    }),
  )
})

describe('includeType', () => {
  cases<[name: string, baseType: Types.Type, includedTypes: Types.Type[], expected: string]>(
    c([
      'includes matching literals and narrowed types from one-of types',
      mixed,
      [Types.literal('b'), Types.int({min: 0})],
      '"b" | Int(>=0)',
    ]),
    c([
      'unwraps box base types',
      Types.box('OpaqueNarrowedLiteralOrInt', narrowedLiteralOrInt),
      [Types.literal('b'), Types.int({min: 0})],
      'Int(>=1)',
    ]),
    c([
      'unwraps box included types',
      narrowedLiteralOrInt,
      [Types.box('OpaqueIncludedInt', Types.int({min: 0}))],
      'Int(>=1)',
    ]),
    c([
      'normalizes anonymous enum cases against named enum definitions',
      status,
      [Types.enumShorthand('loading'), Types.enumShorthand('notAsked')],
      'Status.loading | Status.notAsked',
    ]),
    c([
      'includes object-compatible branches',
      objectOrInt,
      [Types.object([])],
      '{user: {name: String}}',
    ]),
    c([
      'keeps the base one-of when object inclusion finds no compatible branch',
      objectOrInt,
      [Types.object([Types.namedProp('foo', Types.IntType)])],
      '{user: {name: String}} | Int',
    ]),
    c(['returns never when nothing matches', Types.StringType, [Types.IntType], 'never']),
    c(['includes matching literals', Types.literal('a'), [Types.literal('a')], '"a"']),
    c([
      'returns never for non-matching literals',
      Types.literal('a'),
      [Types.literal('b')],
      'never',
    ]),
  ).run(([name, baseType, includedTypes, expected], {only, skip}) =>
    (only ? it.only : skip ? it.skip : it)(name, () => {
      expect(Types.includeType(baseType, includedTypes).toString()).toEqual(expected)
    }),
  )
})
