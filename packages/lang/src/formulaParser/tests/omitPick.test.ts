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
      'Omit(Status, .loading)',
      'Omit(Status, .loading)',
      'Status.done | Status.error | Status.notAsked',
    ]),
    c([
      //
      'Pick(Status, .done)',
      'Pick(Status, .done)',
      'Status.done',
    ]),
    c([
      //
      'Pick(Status, .done, .error)',
      'Pick(Status, .done, .error)',
      'Status.done | Status.error',
    ]),
    c([
      //
      'Pick(Status, .done | .error)',
      'Pick(Status, .done, .error)',
      'Status.done | Status.error',
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
      //
      "Omit(Mixed, 'age', 0, .loading)",
      "Omit(Mixed, 'age', 0, .loading)",
      '{name: String} | Status.done | Status.error | Status.notAsked',
    ]),
    c([
      //
      "Omit(Mixed, 'age' | 0 | .loading)",
      "Omit(Mixed, 'age', 0, .loading)",
      '{name: String} | Status.done | Status.error | Status.notAsked',
    ]),
  ).run(([formula, expectedCode, expectedType], {only, skip}) =>
    (only ? it.only : skip ? it.skip : it)(`should parse ${formula}`, () => {
      const expression = parseType(formula).get()
      expect(expression.toCode()).toEqual(expectedCode)
      const type = expression.getAsTypeExpression(typeRuntime).get()
      expect(type.toString()).toEqual(expectedType)
    }),
  )
})
