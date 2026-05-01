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

  const user = Types.object([Types.namedProp('name', Types.StringType)])

  runtimeTypes = {
    User: [user, Values.booleanValue(true)],
    A: [Types.oneOf([Types.object([Types.namedProp('user', user)]), Types.IntType]), Values.booleanValue(true)],
    C: [
      Types.oneOf([
        Types.literal('a'),
        Types.literal('b'),
        Types.IntType,
        Types.object([Types.namedProp('name', Types.StringType)]),
      ]),
      Values.booleanValue(true),
    ],
    B: [Types.oneOf([Types.literal('a'), Types.int({min: 1})]), Values.booleanValue(true)],
    Status: [status, Values.booleanValue(true)],
  }
  typeRuntime = mockTypeRuntime(runtimeTypes)
})

describe('include/extract type function', () => {
  cases<[string, string, string]>(
    c([
      "Include(C, 'b', Int(>=0))",
      "Include(C, 'b', Int(>=0))",
      '"b" | Int(>=0)',
    ]),
    c([
      "Include(B, 'b', Int(>=0))",
      "Include(B, 'b', Int(>=0))",
      'Int(>=1)',
    ]),
    c([
      'Include(Status, .loading, .notAsked)',
      'Include(Status, .loading, .notAsked)',
      'Status.loading | Status.notAsked',
    ]),
    c(['Include(A, {})', 'Include(A, {})', '{user: {name: String}}']),
    c(['Include(A, {foo: Int})', 'Include(A, {foo: Int})', '{user: {name: String}} | Int']),
    c([
      "Extract(C, 'b', Int(>=0))",
      "Include(C, 'b', Int(>=0))",
      '"b" | Int(>=0)',
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
