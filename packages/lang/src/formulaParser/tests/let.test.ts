import {c, cases} from '@extra-lang/cases'
import {type TypeRuntime, type ValueRuntime} from '~/runtime'
import * as Types from '~/types'
import * as Values from '~/values'
import {parse} from '~/formulaParser'
import {type Expression} from '~/formulaParser/expressions'
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

describe('let … in …', () => {
  describe('parse', () => {
    cases<[string, string] | [string, string, string]>(
      c([
        `\
let
  a = 1
in
  a + 1
`,
        '(let (a: 1) (+ a 1))',
      ]),
      c([
        `\
let
  a =
    1
    +
    2
in
  a + 1
`,
        '(let (a: (+ 1 2)) (+ a 1))',
        `\
let
  a = 1 + 2
in
  a + 1
`,
      ]),
      c([
        `\
let
  a = 1
  b = 2
in
  a + b
`,
        '(let (a: 1) (b: 2) (+ a b))',
      ]),
      c([
        `\
let
  a = 1
  b = a
in
  a + b
`,
        '(let (a: 1) (b: a) (+ a b))',
      ]),
      c([
        `\
let
  b = a
  a = 1
in
  a + b
`,
        '(let (a: 1) (b: a) (+ a b))',
        `\
let
  a = 1
  b = a
in
  a + b
`,
      ]),
      c([
        `\
let
  a = bla
    .bla.
    bla
in
  let
    b = 2
  in
    a + b
`,
        '(let (a: (. (. bla bla) bla)) (let (b: 2) (+ a b)))',
        `\
let
  a = bla.bla.bla
in
  let
    b = 2
  in
    a + b
`,
      ]),
      c([
        `\
let
  fn a() => 1
in
  a() + 1
`,
        '(let (fn a() => 1) (+ (fn a ()) 1))',
      ]),
    ).run(([formula, expectedLisp, expectedCode], {only, skip}) => {
      ;(only ? it.only : skip ? it.skip : it)(`should parse formula '${formula}'`, () => {
        expectedCode ??= formula

        let expression: Expression = parse(formula).get()
        expect(expression.toCode()).toEqual(expectedCode)
        expect(expression.toLisp()).toEqual(expectedLisp)
      })
    })
  })

  describe('eval', () => {
    beforeEach(() => {
      runtimeTypes['input'] = [Types.literal('test'), Values.string('test')]
    })
    cases<[string, Types.Type, Values.Value]>(
      c([
        `\
let
  a = 1
in
  a + 1
`,
        Types.literal(2),
        Values.int(2),
      ]),
      c([
        `\
let
  a = '1'
  b = '2'
in
  a <> b
`,
        Types.literal('12'),
        Values.string('12'),
      ]),
      c([
        `\
let
  a = '1'
  b = a
in
  a <> b
`,
        Types.literal('11'),
        Values.string('11'),
      ]),
      c([
        `\
let
  b = a
  a = '1'
in
  a <> b
`,
        Types.literal('11'),
        Values.string('11'),
      ]),
      c([
        `\
let
  a = 1
in
  let
    b = 2
  in
    a + b
`,
        Types.literal(3),
        Values.int(3),
      ]),
      c([
        `\
let
  a = input <> '!'
in
  a
`,
        Types.literal('test!'),
        Values.string('test!'),
      ]),
    ).run(([formula, expectedType, expectedValue], {only, skip}) =>
      (only ? it.only : skip ? it.skip : it)(`should parse formula '${formula}'`, () => {
        const expression = parse(formula).get()
        const type = expression.getType(typeRuntime).get()
        const value = expression.eval(valueRuntime).get()

        expect(type).toEqual(expectedType)
        expect(value).toEqual(expectedValue)
      }),
    )
  })
})
