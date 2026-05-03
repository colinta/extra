import {c, cases} from '@extra-lang/cases'
import * as Types from '../../types'
import * as Values from '../../values'
import {parseType} from '../../formulaParser'
import {type TypeRuntime} from '../../runtime'
import {mockTypeRuntime} from '../../tests/mockTypeRuntime'

let runtimeTypes: {[K in string]: [Types.Type, Values.Value]}
let typeRuntime: TypeRuntime

beforeEach(() => {
  const user = Types.object([
    Types.namedProp('name', Types.StringType),
    Types.namedProp('age', Types.IntType),
  ])

  const createUser = Types.namedFormula(
    'CreateUser',
    [
      Types.namedArgument({name: 'name', type: Types.StringType, isRequired: true}),
      Types.positionalArgument({name: 'age', type: Types.IntType, isRequired: true}),
      Types.repeatedNamedArgument({name: 'friend', type: new Types.ArrayType(Types.StringType)}),
      Types.spreadPositionalArgument({
        name: 'relatives',
        type: new Types.ArrayType(Types.StringType),
      }),
    ],
    user,
  )

  runtimeTypes = {
    User: [user, Values.booleanValue(true)],
    CreateUser: [createUser, Values.booleanValue(true)],
    OpaqueCreateUser: [Types.box('OpaqueCreateUser', createUser), Values.booleanValue(true)],
    ToString: [
      Types.namedFormula(
        'ToString',
        [Types.positionalArgument({name: 'input', type: Types.IntType, isRequired: true})],
        Types.StringType,
      ),
      Values.booleanValue(true),
    ],
    ToInt: [Types.namedFormula('ToInt', [], Types.IntType), Values.booleanValue(true)],
    foo: [Types.namedFormula('foo', [], Types.StringType), Values.booleanValue(true)],
    NotCallable: [Types.IntType, Values.booleanValue(true)],
    Mixed: [Types.oneOf([createUser, Types.IntType]), Values.booleanValue(true)],
    FnUnion: [
      Types.oneOf([
        Types.namedFormula('ToString', [], Types.StringType),
        Types.namedFormula('ToInt', [], Types.IntType),
      ]),
      Values.booleanValue(true),
    ],
  }
  typeRuntime = mockTypeRuntime(runtimeTypes)
})

describe('return/params type functions', () => {
  cases<[string, string, string]>(
    c(['Return(CreateUser)', 'Return(CreateUser)', '{name: String, age: Int}']),
    c(['Return(OpaqueCreateUser)', 'Return(OpaqueCreateUser)', '{name: String, age: Int}']),
    c(['ReturnType(CreateUser)', 'Return(CreateUser)', '{name: String, age: Int}']),
    c(['Return(foo)', 'Return(foo)', 'String']),
    c([
      'Params(CreateUser)',
      'Params(CreateUser)',
      '{name: String, Int, friend: [String], ...[String]}',
    ]),
    c([
      'Params(OpaqueCreateUser)',
      'Params(OpaqueCreateUser)',
      '{name: String, Int, friend: [String], ...[String]}',
    ]),
    c(['Return(FnUnion)', 'Return(FnUnion)', 'Int | String']),
    c(['Params(FnUnion)', 'Params(FnUnion)', '{}']),
  ).run(([formula, expectedCode, expectedType], {only, skip}) =>
    (only ? it.only : skip ? it.skip : it)(`should parse ${formula}`, () => {
      const expression = parseType(formula).get()
      expect(expression.toCode()).toEqual(expectedCode)
      const type = expression.getAsTypeExpression(typeRuntime).get()
      expect(type.toString()).toEqual(expectedType)
    }),
  )

  cases<[string, string]>(
    c(['Return(NotCallable)', 'Return requires a function type, got Int']),
    c(['Params(NotCallable)', 'Params requires a function type, got Int']),
    c(['Return(Mixed)', 'Return requires a function type, got Int']),
    c(['Params(Mixed)', 'Params requires a function type, got Int']),
  ).run(([formula, expectedError], {only, skip}) =>
    (only ? it.only : skip ? it.skip : it)(`should reject ${formula}`, () => {
      const expression = parseType(formula).get()
      expect(() => expression.getAsTypeExpression(typeRuntime).get()).toThrow(expectedError)
    }),
  )
})
