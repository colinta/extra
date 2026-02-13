import {c, cases} from '@extra-lang/cases'
import {parse} from '../../formulaParser'
import {type Expression} from '../../expressions'
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

describe('if', () => {
  describe('parse', () => {
    cases<[string, string] | [string, string, string]>(
      c([
        "if a-letter == 'a' then [1] else [3]",
        "(if (== a-letter 'a') (then: [1]) (else: [3]))",
        `\
if a-letter == 'a'
  [1]
else
  [3]`,
      ]),
      c([
        'if not a or b then 1 else 3',
        '(if (or (not a) b) (then: 1) (else: 3))',
        `\
if not a or b
  1
else
  3`,
      ]),
      c(['1 + if a then 1 else 3', '(+ 1 (if a (then: 1) (else: 3)))', '1 + (if a then 1 else 3)']),
      c([
        '1 + if a then 1\nelse 3',
        '(+ 1 (if a (then: 1) (else: 3)))',
        '1 + (if a then 1 else 3)',
      ]),
      c([
        "if a then 1 else if b then 3 else '4'",
        "(if a (then: 1) (else: (if b (then: 3) (else: '4'))))",
        `\
if a
  1
else if b
  3
else
  '4'`,
      ]),
      c([
        `[
  if a
    1
  else
    if b
      3
    else
      '4'
  '4'
]`,
        "[(if a (then: 1) (else: (if b (then: 3) (else: '4')))) '4']",
        `\
[
  if a
    1
  else if b
    3
  else
    '4'
  '4'
]`,
      ]),
      c([
        `\
if a
  1
else if b
  3
else
  '4'

`,
        "(if a (then: 1) (else: (if b (then: 3) (else: '4'))))",
        `\
if a
  1
else if b
  3
else
  '4'`,
      ]),
      c([
        `\
if a
  1
  +
  2
else if b
  3
  +
  4
else
  '4'
  ..
  '5'

`,
        "(if a (then: (+ 1 2)) (else: (if b (then: (+ 3 4)) (else: (.. '4' '5')))))",
        `\
if a
  1 + 2
else if b
  3 + 4
else
  '4' .. '5'`,
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
if a
  1
else if b
  3
else
  '4'
`,
        ['a', ''],
        ['b', false],
        Types.oneOf([Types.literal(1), Types.literal(3), Types.literal('4')]),
        Values.string('4'),
      ]),
      c([
        `\
if a
  1
else if b
  3
else
  '4'
`,
        ['a', ''],
        ['b', true],
        Types.oneOf([Types.literal(1), Types.literal(3), Types.literal('4')]),
        Values.int(3),
      ]),
      c([
        `-- test out literals
if true
  1
else if false
  3
else
  '4'
`,
        ['a', ''],
        ['b', true],
        Types.oneOf([Types.literal(1), Types.literal(3), Types.literal('4')]),
        Values.int(1),
      ]),
      c([
        `\
if a
  a .. '!'
else
  b
`,
        ['a', ''],
        ['b', true],
        Types.oneOf([Types.string({min: 2}), Types.booleanType()]),
        Values.booleanValue(true),
      ]),
      c([
        `\
if a
  a .. '!'
else
  b
`,
        ['a', ''],
        ['b', false],
        Types.oneOf([Types.string({min: 2}), Types.booleanType()]),
        Values.booleanValue(false),
      ]),
      c([
        `\
if a
  a .. a
else
  b
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
if a
  1
`,
        Types.string({min: 1}),
        "Type 'String(length: >=1)' is invalid as an if condition, because it is always true.",
      ]),
      c([
        `\
if a
  1
`,
        Types.string({max: 0}),
        'Type \'""\' is invalid as an if condition, because it is always false.',
      ]),
      c([
        `\
if a then 1
`,
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
