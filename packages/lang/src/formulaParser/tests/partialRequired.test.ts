import {c, cases} from '@extra-lang/cases'
import * as Types from '../../types'
import * as Values from '../../values'
import {parseType} from '../../formulaParser'
import {type TypeRuntime} from '../../runtime'
import {mockTypeRuntime} from '../../tests/mockTypeRuntime'

let runtimeTypes: {[K in string]: [Types.Type, Values.Value]}
let typeRuntime: TypeRuntime

beforeEach(() => {
  runtimeTypes = {
    User: [
      Types.object([
        Types.namedProp('name', Types.StringType),
        Types.namedProp('age', Types.IntType),
        Types.positionalProp(Types.BooleanType),
      ]),
      Values.booleanValue(true),
    ],
    OptionalUser: [
      Types.object([
        Types.namedProp('name', Types.optional(Types.StringType)),
        Types.namedProp('age', Types.optional(Types.IntType)),
        Types.positionalProp(Types.optional(Types.BooleanType)),
      ]),
      Values.booleanValue(true),
    ],
    OpaqueUser: [
      Types.box(
        'OpaqueUser',
        Types.object([
          Types.namedProp('name', Types.StringType),
          Types.namedProp('age', Types.IntType),
          Types.positionalProp(Types.BooleanType),
        ]),
      ),
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
    OptionalFoo: [
      Types.namedFormula(
        'OptionalFoo',
        [Types.positionalArgument({name: 'input', type: Types.IntType, isRequired: true})],
        Types.StringType,
        [],
        new Map<string, Types.Type>([
          ['a', Types.optional(Types.IntType)],
          ['b', Types.optional(Types.StringType)],
        ]),
      ),
      Values.booleanValue(true),
    ],
  }
  typeRuntime = mockTypeRuntime(runtimeTypes)
})

describe('partial/required type functions', () => {
  cases<[string, string, string]>(
    c(['Partial(User)', 'Partial(User)', '{name: String?, age: Int?, Boolean?}']),
    c(['Partial(String)', 'Partial(String)', 'String']),
    c(['Partial(OpaqueUser)', 'Partial(OpaqueUser)', '{name: String?, age: Int?, Boolean?}']),
    c(['Required(OptionalUser)', 'Required(OptionalUser)', '{name: String, age: Int, Boolean}']),
    c(['Required(String?)', 'Required(String?)', 'String?']),
    c(['Partial(Foo)', 'Partial(Foo)', 'fn{(# input: Int): String, a: Int?, b: String?}']),
    c([
      'Required(OptionalFoo)',
      'Required(OptionalFoo)',
      'fn{(# input: Int): String, a: Int, b: String}',
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
