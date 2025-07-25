import {c, cases} from '@extra-lang/cases'
import {parse} from '../../formulaParser'
import {type Expression} from '../expressions'
import * as Types from '../../types'
import {type TypeRuntime, type ValueRuntime} from '../../runtime'
import * as Values from '../../values'
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

describe('switch', () => {
  describe('parse', () => {
    cases<[string, string] | [string, string, string]>(
      c([
        `switch (a-letter) { case 'a': [1], else: [3] }`,
        "(switch (a-letter) { (case 'a' : [1]) (else: [3]) })",
        `\
switch (a-letter) {
case 'a':
  [1]
else:
  [3]
}`,
      ]),
    ).run(([formula, expectedLisp, expectedCode], {only, skip}) =>
      (only ? it.only : skip ? it.skip : it)(`should parse '${formula}'`, () => {
        expectedCode ??= formula
        let expression: Expression = parse(formula).get()

        expect(expression!.toCode()).toEqual(expectedCode)
        expect(expression!.toLisp()).toEqual(expectedLisp)
      }),
    )
  })

  describe('getType / eval', () => {
    cases<[string, ['a', string], ['b', boolean], Types.Type, Values.Value]>(
      c([
        `\
if (a) {
then:
  1
elseif (b):
  3
else:
  '4'
}
`,
        ['a', ''],
        ['b', false],
        Types.oneOf([Types.literal(1), Types.literal(3), Types.literal('4')]),
        Values.string('4'),
      ]),
    ).run(([formula, [_a, valueA], [_b, valueB], expectedType, expectedValue], {only, skip}) =>
      (only ? it.only : skip ? it.skip : it)(
        `'${formula}' should have type '${expectedType}' and value '${expectedValue}' (a = '${valueA}', b = ${valueB})`,
        () => {
          runtimeTypes['a'] = [Types.string(), Values.string(valueA)]
          runtimeTypes['b'] = [Types.booleanType(), Values.booleanValue(valueB)]

          const expression = parse(formula).get()
          const type = expression.getType(typeRuntime).get()
          const value = expression.eval(valueRuntime).get()

          expect(type).toEqual(expectedType)
          expect(value).toEqual(expectedValue)
        },
      ),
    )
  })

  describe('invalid', () => {
    cases<[string, Types.Type, string]>(
      c([
        `\
if (a) {
then:
  1
}`,
        Types.string({min: 1}),
        "Type 'String(length: >=1)' is invalid as an if condition, because it is always true.",
      ]),
    ).run(([formula, aType, message], {only, skip}) =>
      (only ? it.only : skip ? it.skip : it)(`should not get type of ${formula}`, () => {
        runtimeTypes['a'] = [aType, Values.string('')]

        expect(() => {
          const expression = parse(formula).get()
          expression.getType(typeRuntime).get()
        }).toThrow(message)
      }),
    )
  })
})
