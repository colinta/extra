import {c, cases} from '@extra-lang/cases'
import * as Types from '../types'
import * as Values from '../values'
import {parse} from '../formulaParser'
import {type TypeRuntime, type ValueRuntime} from '../runtime'
import {mockTypeRuntime} from './mockTypeRuntime'
import {mockValueRuntime} from './mockValueRuntime'

let runtimeTypes: {[K in string]: [Types.Type, Values.Value]}

let typeRuntime: TypeRuntime
let valueRuntime: ValueRuntime

beforeEach(() => {
  runtimeTypes = {}
  typeRuntime = mockTypeRuntime(runtimeTypes)
  valueRuntime = mockValueRuntime(runtimeTypes)

  const userId = Types.opaque('UserId', Types.int())
  const userName = Types.opaque('UserName', Types.string())
  runtimeTypes.UserId = [userId, new Values.TypeValue(userId)]
  runtimeTypes.UserName = [userName, new Values.TypeValue(userName)]
})

function getType(code: string) {
  return parse(code).get().getType(typeRuntime).get()
}

function getValue(code: string) {
  return parse(code).get().eval(valueRuntime).get()
}

describe('opaque type constructors', () => {
  cases<[string, Types.Type]>(
    //
    c(['UserId(5)', Types.opaque('UserId', Types.int())]),
    c([
      `let
  a = UserId(5)
in
  a.value + 1`,
      Types.int(),
    ]),
    c([
      `let
  name = UserName('Sam')
in
  name.value .. '!'`,
      Types.string({min: 1}),
    ]),
    c([
      `let
  name = UserName('Sam')
in
  name.value.length`,
      Types.int({min: 0}),
    ]),
    c([
      `let
  id = UserId(5)
in
  id.map(fn(val) => val)`,
      Types.int(),
    ]),
    c([
      `let
  id = UserId(5)
in
  id.map(fn(val) => 'ok')`,
      Types.literal('ok'),
    ]),
    c([
      `let
  id = UserId(5)
in
  id.rewrap(fn(input) => input + 1)`,
      Types.opaque('UserId', Types.int()),
    ]),
  ).run(([code, expected], {only, skip}) =>
    (only ? it.only : skip ? it.skip : it)(`types '${code}' as '${expected}'`, () => {
      expect(getType(code)).toEqual(expected)
    }),
  )

  cases<[string]>(
    //
    c(["UserId('five')"]),
    c(["UserName('Sam').length"]),
    c([
      `let
  id = UserId(5)
in
  id.rewrap(fn(input) => 'oops')`,
    ]),
    c([
      `let
  id = UserId(5)
in
  id == 5`,
    ]),
  ).run(([code], {only, skip}) =>
    (only ? it.only : skip ? it.skip : it)(`rejects '${code}'`, () => {
      const result = parse(code).get().getType(typeRuntime)
      expect(result.isErr()).toBe(true)
    }),
  )

  cases<[string, Values.Value]>(
    //
    c(['UserId(5)', Values.opaque(Values.int(5))]),
    c([
      `let
  next = fn(# input: Int): Int => input + 1
  id = UserId(5)
in
  next(id.value)`,
      Values.int(6),
    ]),
    c([
      `let
  a = UserId(5)
in
  a.value + 1`,
      Values.int(6),
    ]),
    c([
      `let
  name = UserName('Sam')
in
  name.value .. '!'`,
      Values.string('Sam!'),
    ]),
    c([
      `let
  name = UserName('Sam')
in
  name.value.length`,
      Values.int(3),
    ]),
    c([
      `let
  id = UserId(5)
in
  id.map(fn(val) => val)`,
      Values.int(5),
    ]),
    c([
      `let
  id = UserId(5)
in
  id.map(fn(val) => 'ok')`,
      Values.string('ok'),
    ]),
    c([
      `let
  id = UserId(5)
in
  id.rewrap(fn(input) => input + 1)`,
      Values.opaque(Values.int(6)),
    ]),
    c([
      `let
  id = UserId(5)
in
  id == UserId(5)`,
      Values.TrueValue,
    ]),
  ).run(([code, expected], {only, skip}) =>
    (only ? it.only : skip ? it.skip : it)(`evaluates '${code}' to '${expected}'`, () => {
      expect(getValue(code)).toEqual(expected)
    }),
  )

  cases<[string]>(
    //
    c([
      `let
  nextId = fn(# input: UserId): UserId => input
in
  nextId(5)`,
    ]),
  ).run(([code], {only, skip}) =>
    (only ? it.only : skip ? it.skip : it)(
      `rejects opaque construction shortcut in '${code}'`,
      () => {
        const result = parse(code).get().getType(typeRuntime)
        expect(result.isErr()).toBe(true)
      },
    ),
  )
})
