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
    A: [Types.oneOf([Types.object([Types.namedProp('user', user)]), Types.IntType]), Values.booleanValue(true)],
    B: [Types.oneOf([Types.literal('a'), Types.literal('b'), Types.IntType]), Values.booleanValue(true)],
    Status: [status, Values.booleanValue(true)],
  }
  typeRuntime = mockTypeRuntime(runtimeTypes)
})

describe('exclude type function', () => {
  cases<[string, string, string]>(
    c(["Exclude(B, 'b')", "Exclude(B, 'b')", '"a" | Int']),
    c(["Exclude(B, 'a', 'b')", "Exclude(B, 'a', 'b')", 'Int']),
    c(["Exclude(B, 'a' | 'b')", "Exclude(B, 'a' | 'b')", 'Int']),
    c(['Exclude(B, Int)', 'Exclude(B, Int)', '"a" | "b"']),
    c(['Exclude(B, Int(<0))', 'Exclude(B, Int(<=-1))', '"a" | "b" | Int(>=0)']),
    c(['Exclude(String?, null)', 'Exclude(String?, null)', 'String']),
    c(['Exclude(A, {})', 'Exclude(A, {})', 'Int']),
    c(['Exclude(A, {foo: Int})', 'Exclude(A, {foo: Int})', '{user: {name: String}} | Int']),
    c([
      'Exclude(Status, .loading)',
      'Exclude(Status, .loading)',
      'Status.done | Status.error | Status.notAsked',
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
