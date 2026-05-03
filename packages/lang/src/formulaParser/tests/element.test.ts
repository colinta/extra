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
    Users: [new Types.ArrayType(Types.StringType), Values.booleanValue(true)],
    UserDict: [new Types.DictType(Types.StringType), Values.booleanValue(true)],
    UserSet: [new Types.SetType(Types.StringType), Values.booleanValue(true)],
    OpaqueUsers: [
      Types.box('OpaqueUsers', new Types.ArrayType(Types.StringType)),
      Values.booleanValue(true),
    ],
    Containers: [
      Types.oneOf([new Types.ArrayType(Types.StringType), new Types.SetType(Types.IntType)]),
      Values.booleanValue(true),
    ],
    NotContainer: [Types.IntType, Values.booleanValue(true)],
    Mixed: [
      Types.oneOf([new Types.ArrayType(Types.StringType), Types.IntType]),
      Values.booleanValue(true),
    ],
  }
  typeRuntime = mockTypeRuntime(runtimeTypes)
})

describe('element type function', () => {
  cases<[string, string, string]>(
    c(['Element([String])', 'Element([String])', 'String']),
    c(['Element(Dict(String))', 'Element(Dict(String))', 'String']),
    c(['Element(Set(String))', 'Element(Set(String))', 'String']),
    c(['Element(Users)', 'Element(Users)', 'String']),
    c(['Element(UserDict)', 'Element(UserDict)', 'String']),
    c(['Element(UserSet)', 'Element(UserSet)', 'String']),
    c(['Element(OpaqueUsers)', 'Element(OpaqueUsers)', 'String']),
    c(['Element(Containers)', 'Element(Containers)', 'Int | String']),
  ).run(([formula, expectedCode, expectedType], {only, skip}) =>
    (only ? it.only : skip ? it.skip : it)(`should parse ${formula}`, () => {
      const expression = parseType(formula).get()
      expect(expression.toCode()).toEqual(expectedCode)
      const type = expression.getAsTypeExpression(typeRuntime).get()
      expect(type.toString()).toEqual(expectedType)
    }),
  )

  cases<[string, string]>(
    c(['Element(NotContainer)', 'Element requires an array, dict, or set type, got Int']),
    c(['Element(Mixed)', 'Element requires an array, dict, or set type, got Int']),
  ).run(([formula, expectedError], {only, skip}) =>
    (only ? it.only : skip ? it.skip : it)(`should reject ${formula}`, () => {
      const expression = parseType(formula).get()
      expect(() => expression.getAsTypeExpression(typeRuntime).get()).toThrow(expectedError)
    }),
  )
})
