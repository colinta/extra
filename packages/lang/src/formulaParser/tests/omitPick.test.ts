import {c, cases} from '@extra-lang/cases'
import * as Types from '../../types'
import * as Values from '../../values'
import {parseType} from '../../formulaParser'
import {type TypeRuntime} from '../../runtime'
import {mockTypeRuntime} from '../../tests/mockTypeRuntime'

let runtimeTypes: {[K in string]: [Types.Type, Values.Value]}
let typeRuntime: TypeRuntime

beforeEach(() => {
  const status = Types.namedEnumDefinition({
    name: 'Status',
    members: [
      Types.enumCase('notAsked'),
      Types.enumCase('loading'),
      Types.enumCase('error'),
      Types.enumCase('done'),
    ],
  })

  runtimeTypes = {
    User: [
      Types.object([
        Types.namedProp('name', Types.StringType),
        Types.namedProp('age', Types.IntType),
        Types.positionalProp(Types.BooleanType),
      ]),
      Values.booleanValue(true),
    ],
    Foo: [
      Types.namedFormula(
        'Foo',
        [Types.positionalArgument({name: 'input', type: Types.IntType, isRequired: true})],
        Types.StringType,
        [],
        new Map<string, Types.Type>([
          ['a', Types.IntType],
          ['b', Types.StringType],
        ]),
      ),
      Values.booleanValue(true),
    ],
    Status: [status, Values.booleanValue(true)],
    Thing: [
      Types.object([
        Types.namedProp('name', Types.StringType),
        Types.namedProp('age', Types.IntType),
      ]),
      Values.booleanValue(true),
    ],
    Other: [
      Types.object([
        Types.namedProp('name', Types.StringType),
        Types.namedProp('role', Types.StringType),
      ]),
      Values.booleanValue(true),
    ],
    Mixed: [
      Types.oneOf([
        Types.object([
          Types.namedProp('name', Types.StringType),
          Types.namedProp('age', Types.IntType),
          Types.positionalProp(Types.BooleanType),
        ]),
        status.fromTypeConstructor(),
      ]),
      Values.booleanValue(true),
    ],
    A: [
      Types.object([
        Types.positionalProp(Types.IntType),
        Types.spreadPositionalProp(Types.array(Types.StringType, {min: 1})),
      ]),
      Values.booleanValue(true),
    ],
    B: [
      Types.object([
        Types.positionalProp(Types.IntType),
        Types.positionalProp(Types.BooleanType),
        Types.namedProp('c', Types.FloatType),
        Types.spreadPositionalProp(Types.array(Types.StringType, {min: 2, max: 10})),
      ]),
      Values.booleanValue(true),
    ],
  }
  typeRuntime = mockTypeRuntime(runtimeTypes)
})

describe('omit/pick type functions', () => {
  cases<[string, string, string]>(
    c([
      //
      "Omit(User, 'age')",
      "Omit(User, 'age')",
      '{name: String, Boolean}',
    ]),
    c([
      //
      "Omit(User, 'name', 'age')",
      "Omit(User, 'name', 'age')",
      '{Boolean}',
    ]),
    c([
      //
      'Omit(User, 0)',
      'Omit(User, 0)',
      '{name: String, age: Int}',
    ]),
    c([
      //
      'Pick(User, 0)',
      'Pick(User, 0)',
      '{Boolean}',
    ]),
    c([
      //
      "Pick(User, 'name')",
      "Pick(User, 'name')",
      '{name: String}',
    ]),
    c([
      //
      "Omit(Foo, 'a')",
      "Omit(Foo, 'a')",
      'fn{(# input: Int): String, b: String}',
    ]),
    c([
      //
      "Pick(Foo, 'b')",
      "Pick(Foo, 'b')",
      'fn{(# input: Int): String, b: String}',
    ]),
    c([
      "Omit(Thing | Other, 'name')",
      "Omit(Thing | Other, 'name')",
      '{age: Int} | {role: String}',
    ]),
    c([
      'Pick(A, 0, 1, 2)',
      'Pick(A, 0, 1, 2)',
      '{Int, String, String?}',
    ]),
    c([
      'Omit(B, 0, 2, 4, 20)',
      'Omit(B, 0, 2, 4, 20)',
      '{Boolean, c: Float, ...[String, length: 1...8]}',
    ]),
    c([
      'Omit(B, 4, 2, 4, 20, 0)',
      'Omit(B, 0, 2, 4, 20)',
      '{Boolean, c: Float, ...[String, length: 1...8]}',
    ]),
    c([
      "Omit(User, 'age', 'age', 0, 0)",
      "Omit(User, 'age', 0)",
      '{name: String}',
    ]),
  ).run(([formula, expectedCode, expectedType], {only, skip}) =>
    (only ? it.only : skip ? it.skip : it)(`should parse ${formula}`, () => {
      const expression = parseType(formula).get()
      expect(expression.toCode()).toEqual(expectedCode)
      const type = expression.getAsTypeExpression(typeRuntime).get()
      expect(type.toString()).toEqual(expectedType)
    }),
  )

  it('rejects enum selectors in Omit', () => {
    expect(() => parseType('Omit(Status, .loading)').get()).toThrow(
      'Omit does not support enum case selectors. Use Exclude(Type, .loading) instead.',
    )
  })

  it('rejects enum selectors in Pick', () => {
    expect(() => parseType('Pick(Status, .done)').get()).toThrow(
      'Pick does not support enum case selectors. Use Include(Type, .done) instead.',
    )
  })
})
