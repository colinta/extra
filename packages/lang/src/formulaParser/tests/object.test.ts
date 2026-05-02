import {c, cases} from '@extra-lang/cases'
import {parse, parseType} from '../../formulaParser'
import * as Types from '../../types'
import * as Values from '../../values'
import {type TypeRuntime, type ValueRuntime} from '../../runtime'
import {mockTypeRuntime} from '../../tests/mockTypeRuntime'
import {mockValueRuntime} from '../../tests/mockValueRuntime'

let runtimeTypes: {[K in string]: [Types.Type, Values.Value]}
let typeRuntime: TypeRuntime
let valueRuntime: ValueRuntime

beforeEach(() => {
  runtimeTypes = {}
  typeRuntime = mockTypeRuntime(runtimeTypes)
  valueRuntime = mockValueRuntime(runtimeTypes)
})

describe('Object syntax', () => {
  describe('spread positional object types', () => {
    cases<[string, string | undefined, Types.Type]>(
      c([
        '{...[String]}',
        undefined,
        Types.object([Types.spreadPositionalProp(Types.array(Types.string()))]),
      ]),
      c([
        '{...[Int, >=1]}',
        '{...[Int, length: >=1]}',
        Types.object([Types.spreadPositionalProp(Types.array(Types.int(), {min: 1}))]),
      ]),
      c([
        '{String, ...[String]}',
        undefined,
        Types.object([
          Types.positionalProp(Types.string()),
          Types.spreadPositionalProp(Types.array(Types.string())),
        ]),
      ]),
      c([
        '{String, ...[String], name: String}',
        undefined,
        Types.object([
          Types.positionalProp(Types.string()),
          Types.spreadPositionalProp(Types.array(Types.string())),
          Types.namedProp('name', Types.string()),
        ]),
      ]),
    ).run(([formula, expectedCode, expectedType], {only, skip}) =>
      (only ? it.only : skip ? it.skip : it)(`parses ${formula}`, () => {
        const expression = parseType(formula).get()
        expect(expression.toCode()).toEqual(expectedCode ?? formula)
        expect(expression.getAsTypeExpression(typeRuntime).get()).toEqual(expectedType)
      }),
    )

    cases<[string, string]>(
      c(['{...Int}', 'Object spread positional type must be an Array']),
      c([
        '{...[Int], String}',
        'ObjectType positional spread property must be the last positional property',
      ]),
      c(['{...[Int], ...[String]}', 'ObjectType can only have one positional spread property']),
    ).run(([formula, error], {only, skip}) =>
      (only ? it.only : skip ? it.skip : it)(`rejects ${formula}`, () => {
        const expression = parseType(formula).get()
        expect(() => expression.getAsTypeExpression(typeRuntime).get()).toThrow(error)
      }),
    )
  })

  describe('spread positional property access', () => {
    cases<[string, Types.Type, Types.Type]>(
      c([
        'a[2]',
        Types.object([
          Types.positionalProp(Types.int()),
          Types.spreadPositionalProp(Types.array(Types.string())),
        ]),
        Types.optional(Types.string()),
      ]),
      c([
        'a.2',
        Types.object([
          Types.positionalProp(Types.int()),
          Types.spreadPositionalProp(Types.array(Types.string())),
        ]),
        Types.optional(Types.string()),
      ]),
      c([
        'a.0',
        Types.object([
          Types.positionalProp(Types.int()),
          Types.spreadPositionalProp(Types.array(Types.string())),
        ]),
        Types.int(),
      ]),
      c([
        'a.0',
        Types.object([Types.spreadPositionalProp(Types.array(Types.int(), {min: 1}))]),
        Types.int(),
      ]),
      c([
        'a.1',
        Types.object([Types.spreadPositionalProp(Types.array(Types.int(), {min: 1}))]),
        Types.optional(Types.int()),
      ]),
      c([
        'a.0',
        Types.object([Types.spreadPositionalProp(Types.array(Types.int(), {min: 2, max: 2}))]),
        Types.int(),
      ]),
      c([
        'a.1',
        Types.object([Types.spreadPositionalProp(Types.array(Types.int(), {min: 2, max: 2}))]),
        Types.int(),
      ]),
      c([
        'a.1',
        Types.object([
          Types.positionalProp(Types.string()),
          Types.spreadPositionalProp(Types.array(Types.int(), {min: 1})),
        ]),
        Types.int(),
      ]),
      c([
        'a.2',
        Types.object([
          Types.positionalProp(Types.string()),
          Types.spreadPositionalProp(Types.array(Types.int(), {min: 1})),
        ]),
        Types.optional(Types.int()),
      ]),
    ).run(([formula, objectType, expectedType], {only, skip}) =>
      (only ? it.only : skip ? it.skip : it)(
        `${formula} has type ${expectedType} for ${objectType}`,
        () => {
          runtimeTypes.a = [objectType, Values.nullValue()]
          expect(parse(formula).get().getType(typeRuntime).get()).toEqual(expectedType)
        },
      ),
    )

    cases<[string, Types.Type, string]>(
      c([
        'a.2',
        Types.object([Types.spreadPositionalProp(Types.array(Types.int(), {min: 2, max: 2}))]),
        "Property '2' does not exist",
      ]),
    ).run(([formula, objectType, error], {only, skip}) =>
      (only ? it.only : skip ? it.skip : it)(`${formula} throws error for ${objectType}`, () => {
        runtimeTypes.a = [objectType, Values.nullValue()]
        const expression = parse(formula).get()
        expect(() => expression.getType(typeRuntime).get()).toThrow(error)
      }),
    )
  })

  describe('spread positional assignment', () => {
    cases<[Types.Type, Types.Type, boolean, string]>(
      c([
        Types.object([]),
        Types.object([Types.spreadPositionalProp(Types.array(Types.int(), {min: 1}))]),
        false,
        '{} cannot be assigned to {...[Int, >=1]}',
      ]),
      c([
        Types.object([Types.positionalProp(Types.literal(0))]),
        Types.object([Types.spreadPositionalProp(Types.array(Types.int(), {min: 1}))]),
        true,
        '{0} can be assigned to {...[Int, >=1]}',
      ]),
      c([
        Types.object([
          Types.positionalProp(Types.literal(0)),
          Types.positionalProp(Types.literal(1)),
        ]),
        Types.object([Types.spreadPositionalProp(Types.array(Types.int(), {min: 1}))]),
        true,
        '{0, 1} can be assigned to {...[Int, >=1]}',
      ]),
      c([
        Types.object([Types.positionalProp(Types.literal('nope'))]),
        Types.object([Types.spreadPositionalProp(Types.array(Types.int(), {min: 1}))]),
        false,
        '{"nope"} cannot be assigned to {...[Int, >=1]}',
      ]),
      c([
        Types.object([
          Types.positionalProp(Types.literal(0)),
          Types.positionalProp(Types.literal(1)),
        ]),
        Types.object([Types.spreadPositionalProp(Types.array(Types.int(), {min: 2, max: 2}))]),
        true,
        '{0, 1} can be assigned to {...[Int, =2]}',
      ]),
      c([
        Types.object([Types.positionalProp(Types.literal(0))]),
        Types.object([Types.spreadPositionalProp(Types.array(Types.int(), {min: 2, max: 2}))]),
        false,
        '{0} cannot be assigned to {...[Int, =2]}',
      ]),
      c([
        Types.object([
          Types.positionalProp(Types.literal(0)),
          Types.positionalProp(Types.literal(1)),
          Types.positionalProp(Types.literal(2)),
        ]),
        Types.object([Types.spreadPositionalProp(Types.array(Types.int(), {min: 2, max: 2}))]),
        false,
        '{0, 1, 2} cannot be assigned to {...[Int, =2]}',
      ]),
    ).run(([provided, expected, canAssign, name], {only, skip}) =>
      (only ? it.only : skip ? it.skip : it)(name, () => {
        expect(Types.canBeAssignedTo(provided, expected)).toEqual(canAssign)
      }),
    )

    cases<[string, Types.Type]>(
      c([
        `let
  a: {...[Int, >=1]} = {0, 1}
in
  a.0`,
        Types.int(),
      ]),
      c([
        `let
  a: {...[Int, >=1]} = {0, 1}
in
  a.1`,
        Types.optional(Types.int()),
      ]),
    ).run(([formula, expectedType], {only, skip}) =>
      (only ? it.only : skip ? it.skip : it)(`${formula} has type ${expectedType}`, () => {
        expect(parse(formula).get().getType(typeRuntime).get()).toEqual(expectedType)
      }),
    )

    it('rejects object literals that do not satisfy spread positional length refinements', () => {
      const expression = parse(`let
  a: {...[Int, >=1]} = {}
in
  a`).get()
      expect(() => expression.getType(typeRuntime).get()).toThrow(
        "Cannot assign inferred type '{}' to '{...[Int, length: >=1]}'",
      )
    })
  })

  describe('object value spread from arrays', () => {
    cases<[string, Values.Value]>(
      c(['{0, ...[1, 2]}', Values.tuple([Values.int(0), Values.int(1), Values.int(2)])]),
      c(['{0, ...[1, 2]}[1]', Values.int(1)]),
    ).run(([formula, expectedValue], {only, skip}) =>
      (only ? it.only : skip ? it.skip : it)(`${formula} evals to ${expectedValue}`, () => {
        expect(parse(formula).get().eval(valueRuntime).get()).toEqual(expectedValue)
      }),
    )
  })
})
