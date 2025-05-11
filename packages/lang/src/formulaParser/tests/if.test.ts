import {c, cases} from '@extra-lang/cases'
import {parse} from '~/formulaParser'
import {type Expression} from '~/formulaParser/expressions'
import * as Types from '~/types'
import {TypeRuntime, ValueRuntime} from '~/runtime'
import * as Values from '~/values'
import {mockTypeRuntime} from '~/tests/mockTypeRuntime'
import {mockValueRuntime} from '~/tests/mockValueRuntime'

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
        "if(a-letter == 'a', then: [1], else: [3])",
        "(if ((== a-letter 'a') (then: [1]) (else: [3])))",
      ]),
      c(['if(not a or b, then: 1, else: 3)', '(if ((or (not a) b) (then: 1) (else: 3)))']),
      c(['1 + if(a) { then: 1, else: 3 }', '(+ 1 (if (a) { (then: 1) (else: 3) }))']),
      c([
        '1 + if(a) { then: 1\nelse: 3 }',
        '(+ 1 (if (a) { (then: 1) (else: 3) }))',
        '1 + if(a) { then: 1, else: 3 }',
      ]),
      c([
        "if(a) { then: 1, elseif(b): 3, else: '4' }",
        "(if (a) { (then: 1) (fn `elseif` (b) { 3 }) (else: '4') })",
      ]),
      c([
        `[
  if(a) {
  then:
    1
  else:
    if(b) {
      3
    else:
      '4'
    }
  }
  '4'
]`,
        "[(if (a) { (then: 1) (else: (if (b) { 3 (else: '4') })) }) '4']",
        "[if(a) { then: 1, else: if(b) { 3, else: '4' } }, '4']",
      ]),
      c([
        `\
if(a) {
then :
  1
elseif(b) :
  3
else :
  '4'
}
`,
        "(if (a) { (then: 1) (fn `elseif` (b) { 3 }) (else: '4') })",
        "if(a) { then: 1, elseif(b): 3, else: '4' }",
      ]),
      c([
        `\
if(a) {
then :
  1
  +
  2
elseif(b) :
  3
  +
  4
else :
  '4'
  <>
  '5'
}
`,
        "(if (a) { (then: (+ 1 2)) (fn `elseif` (b) { (+ 3 4) }) (else: (<> '4' '5')) })",
        "if(a) { then: 1 + 2, elseif(b): 3 + 4, else: '4' <> '5' }",
      ]),
    ).run(([formula, expectedLisp, expectedCode], {only, skip}) =>
      (only ? it.only : skip ? it.skip : it)(`should parse if '${formula}'`, () => {
        expectedCode ??= formula
        let expression: Expression
        expect(() => {
          expression = parse(formula).get()
        }).not.toThrow()

        expect(expression!.toCode()).toEqual(expectedCode)
        expect(expression!.toLisp()).toEqual(expectedLisp)
      }),
    )
  })

  describe('getType / eval', () => {
    cases<[string, ['a', string], ['b', boolean], Types.Type, Values.Value]>(
      c([
        `\
if(a) {
then:
  1
elseif(b):
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
      c([
        `\
if(a) {
then:
  1
elseif(b):
  3
else:
  '4'
}
`,
        ['a', ''],
        ['b', true],
        Types.oneOf([Types.literal(1), Types.literal(3), Types.literal('4')]),
        Values.int(3),
      ]),
      c([
        `-- test out literals
if(true) {
then:
  1
elseif(false):
  3
else:
  '4'
}
`,
        ['a', ''],
        ['b', true],
        Types.oneOf([Types.literal(1), Types.literal(3), Types.literal('4')]),
        Values.int(1),
      ]),
      c([
        `\
if(a) {
then:
  a <> '!'
else:
  b
}
`,
        ['a', ''],
        ['b', true],
        Types.oneOf([Types.string({min: 1}), Types.booleanType()]),
        Values.booleanValue(true),
      ]),
      c([
        `\
if(a) {
then:
  a <> '!'
else:
  b
}
`,
        ['a', ''],
        ['b', false],
        Types.oneOf([Types.string({min: 1}), Types.booleanType()]),
        Values.booleanValue(false),
      ]),
      c([
        `\
if(a) {
then:
  a <> a
else:
  b
}
`,
        ['a', 'hi'],
        ['b', false],
        Types.oneOf([Types.string(), Types.booleanType()]),
        Values.string('hihi'),
      ]),
      c([
        `\
elseif(a): a
`,
        ['a', 'hi'],
        ['b', false],
        Types.formula(
          [],
          Types.oneOf([
            Types.tuple([Types.LiteralTrueType, Types.string()]),
            Types.tuple([Types.LiteralFalseType, Types.NullType]),
          ]),
        ),
        expect.anything(),
      ]),
      c([
        `\
(elseif(a): a)()
`,
        ['a', 'hi'],
        ['b', false],
        Types.oneOf([
          Types.tuple([Types.LiteralTrueType, Types.string()]),
          Types.tuple([Types.LiteralFalseType, Types.NullType]),
        ]),
        Values.tuple([Values.booleanValue(true), Values.string('hi')]),
      ]),
      c([
        `\
(elseif(a): a)()
`,
        ['a', ''],
        ['b', false],
        Types.oneOf([
          Types.tuple([Types.LiteralTrueType, Types.string()]),
          Types.tuple([Types.LiteralFalseType, Types.NullType]),
        ]),
        Values.tuple([Values.booleanValue(false), Values.NullValue]),
      ]),
    ).run(([formula, [_a, valueA], [_b, valueB], expectedType, expectedValue], {only, skip}) =>
      (only ? it.only : skip ? it.skip : it)(
        `should '${formula}' should have type '${expectedType}' and value '${expectedValue}' (a = '${valueA}', b = ${valueB})`,
        () => {
          runtimeTypes['a'] = [Types.string(), Values.string(valueA)]
          runtimeTypes['b'] = [Types.booleanType(), Values.booleanValue(valueB)]

          let expression: Expression
          let type: Types.Type
          let value: Values.Value
          expect(() => {
            expression = parse(formula).get()
            type = expression.getType(typeRuntime).get()
            value = expression.eval(valueRuntime).get()
          }).not.toThrow()

          expect(type!).toEqual(expectedType)
          expect(value!).toEqual(expectedValue)
        },
      ),
    )
  })

  describe('invalid', () => {
    cases<[string, Types.Type, string]>(
      c([
        `\
if(a) {
then:
  1
`,
        Types.string({min: 1}),
        "Type 'String(length: >=1)' is invalid as an if condition, because it is always true.",
      ]),
      c([
        `\
if(a) {
then:
  1
`,
        Types.string({max: 0}),
        'Type \'""\' is invalid as an if condition, because it is always false.',
      ]),
      c([
        `\
elseif(a): 1
`,
        Types.string({max: 0}),
        'Type \'""\' is invalid as an if condition, because it is always false.',
      ]),
    ).run(([formula, aType, message], {only, skip}) =>
      (only ? it.only : skip ? it.skip : it)(`should not get type of ${formula}`, () => {
        runtimeTypes['a'] = [aType, Values.string('')]

        let expression: Expression
        expect(() => {
          expression = parse(formula).get()
          expression.getType(typeRuntime).get()
        }).toThrow(message)
      }),
    )
  })
})
