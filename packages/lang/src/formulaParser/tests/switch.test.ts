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
  ;(() => valueRuntime)()
})

describe('switch', () => {
  describe('parse', () => {
    cases<[string, string] | [string, string, string]>(
      c([
        `switch a-letter\ncase _\n  ''`,
        "(switch (a-letter) (case (_) : ''))",
        `\
switch a-letter
case _
  ''`,
      ]),
      c([
        `switch a-letter\ncase 'a'\n  [1]\nelse\n  [3]`,
        "(switch (a-letter) (case ('a') : [1]) (else: [3]))",
        `\
switch a-letter
case 'a'
  [1]
else
  [3]`,
      ]),
      c([
        `\
switch a-letter
case 'a' or 'b'
  [1]
else
  [3]`,
        "(switch (a-letter) (case ('a' 'b') : [1]) (else: [3]))",
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
    cases<[string, [string, Types.Type, Values.Value][], Types.Type, Values.Value]>(
      c([
        `switch a-letter\ncase _\n  ''`,
        [['a-letter', Types.string({max: 1}), Values.string(' ')]],
        Types.literal(''),
        Values.string(''),
      ]),
      c([
        `\
switch letters
case []
  ['a']
case [first]
  [first]
case [first, last]
  [first, last]
case [first, ..., last]
  [first, last]
`,
        [['letters', Types.array(Types.string()), Values.array([Values.string('c')])]],
        Types.array(Types.string(), {min: 1, max: 2}),
        Values.string('c'),
      ]),
      c([
        `\
switch letters
case []
  ['a']
case [first]
  letters
case [first, last]
  letters
case [first, ..., last]
  [first, last]
`,
        [['letters', Types.array(Types.string()), Values.array([Values.string('c')])]],
        Types.array(Types.string(), {min: 1, max: 2}),
        Values.string('c'),
      ]),
      c([
        `\
switch things.letters
case []
  ['a']
case [first]
  things.letters
case [first, last]
  things.letters
case [first, ..., last]
  [first, last]
`,
        [
          [
            'things',
            Types.object([Types.namedProp('letters', Types.array(Types.string()))]),
            Values.object(new Map([['letters', Values.array([Values.string('c')])]])),
          ],
        ],
        Types.array(Types.string(), {min: 1, max: 2}),
        Values.string('c'),
      ]),
      c([
        `\
switch [...letters1, ...letters2]
case []
  ['a']
case [first]
  [first]
case [first, last]
  [first, last]
case [first, ..., last]
  [first, last]
`,
        [
          ['letters1', Types.array(Types.string()), Values.array([Values.string('c')])],
          ['letters2', Types.array(Types.string()), Values.array([Values.string('c')])],
        ],
        Types.array(Types.string(), {min: 1, max: 2}),
        Values.string('c'),
      ]),
      c([
        `\
switch letters
case [] or [first]
  [first ?? 'a']
case [first, last] or [first, ..., last]
  [first, last]
`,
        [['letters', Types.array(Types.string()), Values.array([Values.string('c')])]],
        Types.array(Types.string(), {min: 1, max: 2}),
        Values.string('c'),
      ]),
      c([
        `\
switch letters
case [first] or []
  [first ?? 'a']
case [first, ..., last] or [first, last]
  [first, last]
`,
        [['letters', Types.array(Types.string()), Values.array([Values.string('c')])]],
        Types.array(Types.string(), {min: 1, max: 2}),
        Values.string('c'),
      ]),
    ).run(([formula, values, expectedType, expectedValue], {only, skip}) =>
      (only ? it.only : skip ? it.skip : it)(
        `'${formula}' should have type '${expectedType}' and value '${expectedValue}'`,
        () => {
          values.forEach(([name, type, value]) => {
            runtimeTypes[name] = [type, value]
          })

          const expression = parse(formula).get()
          const type = expression.getType(typeRuntime).get()
          // const value = expression.eval(valueRuntime).get()

          expect(type).toEqual(expectedType)
          // expect(value).toEqual(expectedValue)
        },
      ),
    )
  })

  describe('invalid', () => {
    cases<[string, [string, Types.Type, Values.Value][], string]>(
      c([
        `\
switch letters
case []
  ['a']
case [first]
  [first]
case [first, last]
  [first, last]
case [first, _, last]
  [first, last]
`,
        [['letters', Types.array(Types.string()), Values.nullValue()]],
        "Switch is not exhaustive, 'letters' has unhandled type 'Array(String, length: >=4)'",
      ]),
      c([
        `\
switch [...letters, ...letters]
case []
  ['a']
case [first]
  [first]
case [first, last]
  [first, last]
case [first, _, last]
  [first, last]
`,
        [['letters', Types.array(Types.string()), Values.nullValue()]],
        "Switch is not exhaustive, '[...letters, ...letters]' has unhandled type 'Array(String, length: >=4)'",
      ]),
    ).run(([formula, values, message], {only, skip}) =>
      (only ? it.only : skip ? it.skip : it)(
        `'${formula}' should have error message '${message}'`,
        () => {
          values.forEach(([name, type, value]) => {
            runtimeTypes[name] = [type, value]
          })

          expect(() => {
            const expression = parse(formula).get()
            expression.getType(typeRuntime).get()
          }).toThrow(message)
        },
      ),
    )
  })
})
