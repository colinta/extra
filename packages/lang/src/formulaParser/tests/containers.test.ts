import {c, cases} from '@extra-lang/cases'
import * as Types from '../../types'
import * as Values from '../../values'
import {type TypeRuntime} from '../../runtime'
import {parse} from '../../formulaParser'
import {type Expression} from '../expressions'
import {mockTypeRuntime} from '../../tests/mockTypeRuntime'

let runtimeTypes: {[K in string]: [Types.Type, Values.Value]}

let typeRuntime: TypeRuntime

beforeEach(() => {
  runtimeTypes = {
    // arrays
    genericArray: [Types.array(Types.string()), Values.nullValue()],
    maxThreeArray: [Types.array(Types.string(), {min: 0, max: 3}), Values.nullValue()],
    minThreeArray: [Types.array(Types.string(), {min: 3, max: undefined}), Values.nullValue()],
    exactlyThreeArray: [Types.array(Types.string(), {min: 3, max: 3}), Values.nullValue()],
    minTwoMaxFourArray: [Types.array(Types.string(), {min: 2, max: 4}), Values.nullValue()],
    // sets
    genericSet: [Types.set(Types.string()), Values.nullValue()],
    maxThreeSet: [Types.set(Types.string(), {min: 0, max: 3}), Values.nullValue()],
    minThreeSet: [Types.set(Types.string(), {min: 3, max: undefined}), Values.nullValue()],
    exactlyThreeSet: [Types.set(Types.string(), {min: 3, max: 3}), Values.nullValue()],
    minTwoMaxFourSet: [Types.set(Types.string(), {min: 2, max: 4}), Values.nullValue()],
    // dicts
    genericDict: [Types.dict(Types.string()), Values.nullValue()],
    threeKeysDict: [
      Types.dict(Types.string(), {min: 3, max: undefined}, new Set(['b', 'c', 'd'])),
      Values.nullValue(),
    ],
    maxThreeDict: [Types.dict(Types.string(), {min: 0, max: 3}), Values.nullValue()],
    twoKeysBCMaxThreeDict: [
      Types.dict(Types.string(), {min: 2, max: 3}, new Set(['b', 'c'])),
      Values.nullValue(),
    ],
    twoKeysCDMaxThreeDict: [
      Types.dict(Types.string(), {min: 2, max: 3}, new Set(['c', 'd'])),
      Values.nullValue(),
    ],
    minThreeDict: [Types.dict(Types.string(), {min: 3, max: undefined}), Values.nullValue()],
    twoKeysBCMinThreeDict: [
      Types.dict(Types.string(), {min: 3, max: undefined}, new Set(['b', 'c'])),
      Values.nullValue(),
    ],
    twoKeysCDMinThreeDict: [
      Types.dict(Types.string(), {min: 3, max: undefined}, new Set(['c', 'd'])),
      Values.nullValue(),
    ],
    exactlyThreeDict: [Types.dict(Types.string(), {min: 3, max: 3}), Values.nullValue()],
    exactlyThreeKeysBCDDict: [
      Types.dict(Types.string(), {min: 3, max: 3}, new Set(['b', 'c', 'd'])),
      Values.nullValue(),
    ],
    minTwoMaxFourDict: [Types.dict(Types.string(), {min: 2, max: 4}), Values.nullValue()],
    minTwoMaxFourOneKeyBDict: [
      Types.dict(Types.string(), {min: 2, max: 4}, new Set('b')),
      Values.nullValue(),
    ],
    minTwoMaxFourOneKeyDDict: [
      Types.dict(Types.string(), {min: 2, max: 4}, new Set('d')),
      Values.nullValue(),
    ],
  }
  typeRuntime = mockTypeRuntime(runtimeTypes)
})

const oneTwoThree = Types.oneOf([Types.literal(1), Types.literal(2), Types.literal(3)])
const oneTwoThreeString = Types.oneOf([
  Types.literal(1),
  Types.literal(2),
  Types.literal(3),
  Types.string(),
])

describe('array', () => {
  cases<[string, Types.Type]>(
    c([
      '[1, 2, 3]',
      Types.array(oneTwoThree, {
        min: 3,
        max: 3,
      }),
    ]),
    c([
      '[...genericArray]',
      Types.array(Types.string(), {
        min: 0,
        max: undefined,
      }),
    ]),
    c([
      '[...maxThreeArray]',
      Types.array(Types.string(), {
        min: 0,
        max: 3,
      }),
    ]),
    c([
      '[...minThreeArray]',
      Types.array(Types.string(), {
        min: 3,
        max: undefined,
      }),
    ]),
    c([
      '[...exactlyThreeArray]',
      Types.array(Types.string(), {
        min: 3,
        max: 3,
      }),
    ]),
    c([
      '[...minTwoMaxFourArray]',
      Types.array(Types.string(), {
        min: 2,
        max: 4,
      }),
    ]),
    c([
      '[1, 2, 3, ...genericArray]',
      Types.array(oneTwoThreeString, {
        min: 3,
        max: undefined,
      }),
    ]),
    c([
      '[1, 2, 3, ...maxThreeArray]',
      Types.array(oneTwoThreeString, {
        min: 3,
        max: 6,
      }),
    ]),
    c([
      '[1, 2, 3, ...minThreeArray]',
      Types.array(oneTwoThreeString, {
        min: 6,
        max: undefined,
      }),
    ]),
    c([
      '[1, 2, 3, ...exactlyThreeArray]',
      Types.array(oneTwoThreeString, {
        min: 6,
        max: 6,
      }),
    ]),
    c([
      '[1, 2, 3, ...minTwoMaxFourArray]',
      Types.array(oneTwoThreeString, {
        min: 5,
        max: 7,
      }),
    ]),
  ).run(([formula, expected], {only, skip}) =>
    (only ? it.only : skip ? it.skip : it)(
      `should derive type '${expected}' from '${formula}'`,
      () => {
        let expression: Expression = parse(formula).get()

        const type = expression!.getType(typeRuntime).get()
        expect(type).toEqual(expected)
      },
    ),
  )
})

describe('set', () => {
  cases<[string, Types.Type]>(
    c([
      'set(1, 2, 3)',
      Types.set(oneTwoThree, {
        min: 3,
        max: 3,
      }),
    ]),
    c([
      'set(1, 2, 2, 3)',
      Types.set(oneTwoThree, {
        min: 3,
        max: 3,
      }),
    ]),
    //////////////////////////////////////////////
    c([
      'set(...genericSet)',
      Types.set(Types.string(), {
        min: 0,
        max: undefined,
      }),
    ]),
    c([
      'set(...maxThreeSet)',
      Types.set(Types.string(), {
        min: 0,
        max: 3,
      }),
    ]),
    c([
      'set(...minThreeSet)',
      Types.set(Types.string(), {
        min: 3,
        max: undefined,
      }),
    ]),
    c([
      'set(...exactlyThreeSet)',
      Types.set(Types.string(), {
        min: 3,
        max: 3,
      }),
    ]),
    c([
      'set(...minTwoMaxFourSet)',
      Types.set(Types.string(), {
        min: 2,
        max: 4,
      }),
    ]),
    //////////////////////////////////////////////
    c([
      'set(...genericSet, ...genericSet)',
      Types.set(Types.string(), {
        min: 0,
        max: undefined,
      }),
    ]),
    c([
      'set(...maxThreeSet, ...maxThreeSet)',
      Types.set(Types.string(), {
        min: 0,
        max: 6,
      }),
    ]),
    c([
      'set(...minThreeSet, ...minThreeSet)',
      Types.set(Types.string(), {
        min: 3,
        max: undefined,
      }),
    ]),
    c([
      'set(...exactlyThreeSet, ...exactlyThreeSet)',
      Types.set(Types.string(), {
        min: 3,
        max: 6,
      }),
    ]),
    c([
      'set(...minTwoMaxFourSet, ...minTwoMaxFourSet)',
      Types.set(Types.string(), {
        min: 2,
        max: 8,
      }),
    ]),
    c([
      'set(...minTwoMaxFourSet, ...maxThreeSet)',
      Types.set(Types.string(), {
        min: 2,
        max: 7,
      }),
    ]),
    //////////////////////////////////////////////
    c([
      'set(1, 2, 3, ...genericSet)',
      Types.set(oneTwoThreeString, {
        min: 3,
        max: undefined,
      }),
    ]),
    c([
      'set(1, 2, 3, ...maxThreeSet)',
      Types.set(oneTwoThreeString, {
        min: 3,
        max: 6,
      }),
    ]),
    c([
      'set(1, 2, 3, ...minThreeSet)',
      Types.set(oneTwoThreeString, {
        min: 3,
        max: undefined,
      }),
    ]),
    c([
      'set(1, 2, 3, ...exactlyThreeSet)',
      Types.set(oneTwoThreeString, {
        min: 3,
        max: 6,
      }),
    ]),
    c([
      'set(1, 2, 3, ...minTwoMaxFourSet)',
      Types.set(oneTwoThreeString, {
        min: 3,
        max: 7,
      }),
    ]),
    c([
      'set(1, ...minTwoMaxFourSet)',
      Types.set(Types.oneOf([Types.literal(1), Types.string()]), {
        min: 2,
        max: 5,
      }),
    ]),
  ).run(([formula, expected], {only, skip}) =>
    (only ? it.only : skip ? it.skip : it)(
      `should derive type '${expected}' from '${formula}'`,
      () => {
        let expression: Expression = parse(formula).get()

        const type = expression!.getType(typeRuntime).get()
        expect(type).toEqual(expected)
      },
    ),
  )
})

describe('dict', () => {
  cases<[string, Types.Type]>(
    c([
      'dict(a: 1, b: 2, c: 3)',
      Types.dict(
        oneTwoThree,
        {
          min: 3,
          max: 3,
        },
        new Set(['a', 'b', 'c']),
      ),
    ]),
    c([
      'dict(a: 1, b: 2, c: 3, ...genericDict)',
      Types.dict(
        oneTwoThreeString,
        {
          min: 3,
          max: undefined,
        },
        new Set(['a', 'b', 'c']),
      ),
    ]),
    c([
      'dict(a: 1, b: 2, c: 3, ...threeKeysDict)',
      Types.dict(
        oneTwoThreeString,
        {
          min: 4,
          max: undefined,
        },
        new Set(['a', 'b', 'c', 'd']),
      ),
    ]),
    c([
      'dict(a: 1, b: 2, c: 3, ...maxThreeDict)',
      Types.dict(
        oneTwoThreeString,
        {
          min: 3,
          max: 6,
        },
        new Set(['a', 'b', 'c']),
      ),
    ]),
    c([
      'dict(a: 1, b: 2, c: 3, ...twoKeysBCMaxThreeDict)',
      Types.dict(
        oneTwoThreeString,
        {
          min: 3,
          max: 6,
        },
        new Set(['a', 'b', 'c']),
      ),
    ]),
    c([
      'dict(a: 1, b: 2, c: 3, ...twoKeysCDMaxThreeDict)',
      Types.dict(
        oneTwoThreeString,
        {
          min: 4,
          max: 6,
        },
        new Set(['a', 'b', 'c', 'd']),
      ),
    ]),
    c([
      'dict(a: 1, b: 2, c: 3, ...minThreeDict)',
      Types.dict(
        oneTwoThreeString,
        {
          min: 3,
          max: undefined,
        },
        new Set(['a', 'b', 'c']),
      ),
    ]),
    c([
      'dict(a: 1, b: 2, c: 3, ...twoKeysBCMinThreeDict)',
      Types.dict(
        oneTwoThreeString,
        {
          min: 3,
          max: undefined,
        },
        new Set(['a', 'b', 'c']),
      ),
    ]),
    c([
      'dict(a: 1, b: 2, c: 3, ...twoKeysCDMinThreeDict)',
      Types.dict(
        oneTwoThreeString,
        {
          min: 4,
          max: undefined,
        },
        new Set(['a', 'b', 'c', 'd']),
      ),
    ]),
    c([
      'dict(a: 1, b: 2, c: 3, ...exactlyThreeDict)',
      Types.dict(
        oneTwoThreeString,
        {
          min: 3,
          max: 6,
        },
        new Set(['a', 'b', 'c']),
      ),
    ]),
    c([
      'dict(a: 1, b: 2, c: 3, ...exactlyThreeKeysBCDDict)',
      Types.dict(
        oneTwoThreeString,
        {
          min: 4,
          max: 6,
        },
        new Set(['a', 'b', 'c', 'd']),
      ),
    ]),
    c([
      'dict(a: 1, b: 2, c: 3, ...minTwoMaxFourDict)',
      Types.dict(
        oneTwoThreeString,
        {
          min: 3,
          max: 7,
        },
        new Set(['a', 'b', 'c']),
      ),
    ]),
    c([
      'dict(a: 1, b: 2, c: 3, ...minTwoMaxFourOneKeyBDict)',
      Types.dict(
        oneTwoThreeString,
        {
          min: 3,
          max: 7,
        },
        new Set(['a', 'b', 'c']),
      ),
    ]),
    c([
      'dict(a: 1, b: 2, c: 3, ...minTwoMaxFourOneKeyDDict)',
      Types.dict(
        oneTwoThreeString,
        {
          min: 4,
          max: 7,
        },
        new Set(['a', 'b', 'c', 'd']),
      ),
    ]),
  ).run(([formula, expected], {only, skip}) =>
    (only ? it.only : skip ? it.skip : it)(
      `should derive type '${expected}' from '${formula}'`,
      () => {
        let expression: Expression = parse(formula).get()

        const type = expression!.getType(typeRuntime).get()
        expect(type).toEqual(expected)
      },
    ),
  )
})
