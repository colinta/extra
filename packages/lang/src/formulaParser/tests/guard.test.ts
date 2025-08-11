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

describe('guard', () => {
  describe('parse', () => {
    cases<[string, string] | [string, string, string]>(
      c([
        "guard (a-letter == 'a', else: [3]): [1]",
        "(guard ((== a-letter 'a') (else: [3])) { [1] })",
        `\
guard (
  a-letter == 'a'
else:
  [3]
):

[1]`,
      ]),
      c([
        'guard (not a or b, else: 3, 1)',
        '(guard ((or (not a) b) (else: 3) 1))',
        `guard (
  not a or b
else:
  3
):

1`,
      ]),
      c([
        '1 + guard (a) { else: 3, 1 }',
        '(+ 1 (guard (a) { (else: 3) 1 }))',
        `1 + guard (
  a
else:
  3
):

1`,
      ]),
      c([
        '1 + guard (a) { 1\nelse: 3 }',
        '(+ 1 (guard (a) { 1 (else: 3) }))',
        `1 + guard (
  a
else:
  3
):

1`,
      ]),
      c([
        "guard (a) { 1, else: '4' }",
        "(guard (a) { 1 (else: '4') })",
        `\
guard (
  a
else:
  '4'
):

1`,
      ]),
      c([
        `[
  guard (a) {
  else:
    1
    guard (b) {
    else:
      '4'
      3
    }
  }
  '4'
]`,
        "[(guard (a) { (else: 1) (guard (b) { (else: '4') 3 }) }) '4']",
        `\
[
  guard (
    a
  else:
    1
  ):

  guard (
    b
  else:
    '4'
  ):

  3
  '4'
]`,
      ]),
      c([
        `\
guard (a) {
  1
else:
  '4'
}
`,
        "(guard (a) { 1 (else: '4') })",
        `\
guard (
  a
else:
  '4'
):

1`,
      ]),
      c([
        `\
guard (a) {
else:
  '4'
  <>
  '5'
  1
  +
  2
}
`,
        "(guard (a) { (else: (<> '4' '5')) (+ 1 2) })",
        `\
guard (
  a
else:
  '4' <> '5'
):

1 + 2`,
      ]),
    ).run(([formula, expectedLisp, expectedCode], {only, skip}) =>
      (only ? it.only : skip ? it.skip : it)(`should parse guard '${formula}'`, () => {
        expectedCode ??= formula
        let expression: Expression = parse(formula).get()

        expect(expression!.toCode()).toEqual(expectedCode)
        expect(expression!.toLisp()).toEqual(expectedLisp)

        expression = parse(expectedCode).get()
        expect(expression!.toCode()).toEqual(expectedCode)
      }),
    )
  })

  describe('getType / eval', () => {
    cases<[string, ['a', string], ['b', boolean], Types.Type, Values.Value]>(
      c([
        `\
guard (
  a
  else:
    '4'
):
  1
`,
        ['a', ''],
        ['b', false],
        Types.oneOf([Types.literal(1), Types.literal('4')]),
        Values.string('4'),
      ]),
      c([
        `-- test out literals and parsing block syntax
guard (true) {
  else:
    '4'
  1
}
`,
        ['a', ''],
        ['b', true],
        Types.oneOf([Types.literal(1), Types.literal('4')]),
        Values.int(1),
      ]),
      c([
        `\
guard (
  a
else:
  b
):
  a <> '!'
`,
        ['a', ''],
        ['b', true],
        Types.oneOf([Types.string({min: 2}), Types.booleanType()]),
        Values.booleanValue(true),
      ]),
      c([
        `\
guard (
  a
else:
  b
):
  a <> '!'
`,
        ['a', ''],
        ['b', false],
        Types.oneOf([Types.string({min: 2}), Types.booleanType()]),
        Values.booleanValue(false),
      ]),
      c([
        `\
guard (
  a
else:
  b
):
  a <> a
`,
        ['a', 'hi'],
        ['b', false],
        Types.oneOf([Types.string({min: 2}), Types.booleanType()]),
        Values.string('hihi'),
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
guard (a) {
  1
else:
  1
}`,
        Types.string({min: 1}),
        "Type 'String(length: >=1)' is invalid as an if condition, because it is always true.",
      ]),
      c([
        `\
guard (a) {
  1
else:
  1
}`,
        Types.string({max: 0}),
        'Type \'""\' is invalid as an if condition, because it is always false.',
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
