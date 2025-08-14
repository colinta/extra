import {c, cases} from '@extra-lang/cases'
import {type TypeRuntime} from '../../runtime'
import * as Types from '../../types'
import * as Values from '../../values'
import {parse} from '../../formulaParser'
import {mockTypeRuntime} from '../../tests/mockTypeRuntime'

let runtimeTypes: {[K in string]: [Types.Type, Values.Value]}

let typeRuntime: TypeRuntime

beforeEach(() => {
  runtimeTypes = {}
  typeRuntime = mockTypeRuntime(runtimeTypes)
})

describe('narrowed types', () => {
  cases<[Types.Type, string, Types.Type, Types.Type]>(
    //|
    //|  Int checks
    //|
    c([Types.int(), 'foo >= 5', Types.int({min: 5}), Types.int({max: 4})]),
    c([Types.int({min: 6}), 'foo >= 5', Types.int({min: 6}), Types.never()]),
    c([Types.int({max: 6}), 'foo <= 5', Types.int({max: 5}), Types.literal(6)]),
    c([Types.int({max: 7}), 'foo <= 5', Types.int({max: 5}), Types.int({min: 6, max: 7})]),
    c([
      Types.int({min: 0, max: 7}),
      'foo <= 5',
      Types.int({min: 0, max: 5}),
      Types.int({min: 6, max: 7}),
    ]),
    c([
      Types.int({min: 0, max: 7}),
      'foo > 1 and foo < 5',
      Types.int({min: 2, max: 4}),
      Types.oneOf([Types.int({min: 0, max: 1}), Types.int({min: 5, max: 7})]),
    ]),
    c([
      Types.int({min: 0, max: 7}),
      'foo == 4',
      Types.literal(4),
      Types.oneOf([Types.int({min: 0, max: 3}), Types.int({min: 5, max: 7})]),
    ]),
    c([
      Types.int({min: 0, max: 7}),
      'foo == 4.0',
      Types.literal(4),
      Types.oneOf([Types.int({min: 0, max: 3}), Types.int({min: 5, max: 7})]),
    ]),
    c([Types.int({min: 0, max: 7}), 'foo == 4.4', Types.never(), Types.int({min: 0, max: 7})]),
    c([
      Types.int({min: 0, max: 7}),
      'foo != 4',
      Types.oneOf([Types.int({min: 0, max: 3}), Types.int({min: 5, max: 7})]),
      Types.literal(4),
    ]),
    c([Types.int({min: 0, max: 7}), 'foo != 4.5', Types.int({min: 0, max: 7}), Types.never()]),
    c([Types.int({min: 6}), 'foo <= 5', Types.never(), Types.int({min: 6})]),
    c([Types.int(), 'foo', Types.int(), Types.literal(0)]),
    c([Types.int(), 'not foo', Types.literal(0), Types.int()]),
    c([Types.int(), 'not not foo', Types.int(), Types.literal(0)]),
    c([Types.int({min: 0}), 'foo', Types.int({min: 1}), Types.literal(0)]),
    c([Types.int({min: -1}), 'foo', Types.int({min: -1}), Types.literal(0)]),
    c([Types.int({min: 1}), 'foo', Types.int({min: 1}), Types.never()]),
    c([Types.int({min: 1, max: 7}), 'foo is >=0', Types.int({min: 1, max: 7}), Types.never()]),
    c([Types.int({min: 1, max: 7}), 'foo is >0', Types.int({min: 1, max: 7}), Types.never()]),
    c([Types.int({min: 1, max: 7}), 'foo is >0', Types.int({min: 1, max: 7}), Types.never()]),
    c([Types.int({min: 1, max: 7}), 'foo is >1', Types.int({min: 2, max: 7}), Types.literal(1)]),
    c([
      Types.int({min: 1, max: 7}),
      'foo is >2',
      Types.int({min: 3, max: 7}),
      Types.int({min: 1, max: 2}),
    ]),
    c([Types.int({min: 1, max: 7}), 'foo is <=8', Types.int({min: 1, max: 7}), Types.never()]),
    c([Types.int({min: 1, max: 7}), 'foo is <8', Types.int({min: 1, max: 7}), Types.never()]),
    c([Types.int({min: 1, max: 7}), 'foo is <=7', Types.int({min: 1, max: 7}), Types.never()]),
    c([Types.int({min: 1, max: 7}), 'foo is <7', Types.int({min: 1, max: 6}), Types.literal(7)]),
    c([
      Types.int({min: 1, max: 7}),
      'foo is <6',
      Types.int({min: 1, max: 5}),
      Types.int({min: 6, max: 7}),
    ]),
    c([
      Types.int({min: 1, max: 7}),
      'foo is 2...4',
      Types.int({min: 2, max: 4}),
      Types.oneOf([Types.literal(1), Types.int({min: 5, max: 7})]),
    ]),
    c([Types.int({min: 1, max: 7}), 'foo is 0...1', Types.literal(1), Types.int({min: 2, max: 7})]),
    c([
      Types.int({min: 1, max: 7}),
      'foo is 0...4',
      Types.int({min: 1, max: 4}),
      Types.int({min: 5, max: 7}),
    ]),
    c([
      Types.int({min: 1, max: 7}),
      'foo is 4...8',
      Types.int({min: 4, max: 7}),
      Types.int({min: 1, max: 3}),
    ]),
    c([Types.int({min: 1, max: 7}), 'foo is 7...8', Types.literal(7), Types.int({min: 1, max: 6})]),
    c([
      Types.int({min: 1, max: 7}),
      'foo is 1<.<5',
      Types.int({min: 2, max: 4}),
      Types.oneOf([Types.literal(1), Types.int({min: 5, max: 7})]),
    ]),
    //|
    //|  Float checks
    //|
    c([Types.float(), 'foo >= 5', Types.float({min: 5}), Types.float({max: [5]})]),
    c([Types.float(), 'foo > 5', Types.float({min: [5]}), Types.float({max: 5})]),
    c([Types.float({min: 6}), 'foo > 6', Types.float({min: [6]}), Types.literal(6, 'float')]),
    c([Types.float({min: 7}), 'foo > 6', Types.float({min: 7}), Types.never()]),
    c([Types.float({min: 1, max: 7}), 'foo is >=0', Types.float({min: 1, max: 7}), Types.never()]),
    c([Types.float({min: 1, max: 7}), 'foo is >0', Types.float({min: 1, max: 7}), Types.never()]),
    c([Types.float({min: 1, max: 7}), 'foo is >0', Types.float({min: 1, max: 7}), Types.never()]),
    c([
      Types.float({min: 1, max: 7}),
      'foo is >1',
      Types.float({min: [1], max: 7}),
      Types.literal(1, 'float'),
    ]),
    c([
      Types.float({min: 1, max: 7}),
      'foo is >2',
      Types.float({min: [2], max: 7}),
      Types.float({min: 1, max: 2}),
    ]),
    c([
      Types.float({min: 1, max: 7}),
      'foo is >=2',
      Types.float({min: 2, max: 7}),
      Types.float({min: 1, max: [2]}),
    ]),
    c([Types.float({min: 1, max: 7}), 'foo is <=8', Types.float({min: 1, max: 7}), Types.never()]),
    c([Types.float({min: 1, max: 7}), 'foo is <8', Types.float({min: 1, max: 7}), Types.never()]),
    c([Types.float({min: 1, max: 7}), 'foo is <=7', Types.float({min: 1, max: 7}), Types.never()]),
    c([
      Types.float({min: 1, max: 7}),
      'foo is <7',
      Types.float({min: 1, max: [7]}),
      Types.literal(7, 'float'),
    ]),
    c([
      Types.float({min: 1, max: 7}),
      'foo is <6',
      Types.float({min: 1, max: [6]}),
      Types.float({min: 6, max: 7}),
    ]),
    c([
      Types.float({min: 1, max: 7}),
      'foo is <=6',
      Types.float({min: 1, max: 6}),
      Types.float({min: [6], max: 7}),
    ]),
    c([
      Types.float({min: [1], max: 7}),
      'foo is >1',
      Types.float({min: [1], max: 7}),
      Types.never(),
    ]),
    c([
      Types.float({min: [1], max: 7}),
      'foo is >=2',
      Types.float({min: 2, max: 7}),
      Types.float({min: [1], max: [2]}),
    ]),
    c([
      Types.float({min: [1], max: 7}),
      'foo is <6',
      Types.float({min: [1], max: [6]}),
      Types.float({min: 6, max: 7}),
    ]),
    c([
      Types.float({min: [1], max: 7}),
      'foo is <=6',
      Types.float({min: [1], max: 6}),
      Types.float({min: [6], max: 7}),
    ]),
    c([
      Types.float({min: 1, max: [7]}),
      'foo is >1',
      Types.float({min: [1], max: [7]}),
      Types.literal(1, 'float'),
    ]),
    c([
      Types.float({min: 1, max: [7]}),
      'foo is >=2',
      Types.float({min: 2, max: [7]}),
      Types.float({min: 1, max: [2]}),
    ]),
    c([
      Types.float({min: 1, max: [7]}),
      'foo is <7',
      Types.float({min: 1, max: [7]}),
      Types.never(),
    ]),
    c([
      Types.float({min: 1, max: [7]}),
      'foo is <6',
      Types.float({min: 1, max: [6]}),
      Types.float({min: 6, max: [7]}),
    ]),
    c([
      Types.float({min: 1, max: [7]}),
      'foo is <=6',
      Types.float({min: 1, max: 6}),
      Types.float({min: [6], max: [7]}),
    ]),
    c([
      Types.float({min: 1, max: 7}),
      'foo is 2...4',
      Types.float({min: 2, max: 4}),
      Types.oneOf([Types.float({min: 1, max: [2]}), Types.float({min: [4], max: 7})]),
    ]),
    c([
      Types.float({min: 1, max: 7}),
      'foo is 0...1',
      Types.literal(1, 'float'),
      Types.float({min: [1], max: 7}),
    ]),
    c([
      Types.float({min: 1, max: 7}),
      'foo is 0...4',
      Types.float({min: 1, max: 4}),
      Types.float({min: [4], max: 7}),
    ]),
    c([
      Types.float({min: 1, max: 7}),
      'foo is 4...8',
      Types.float({min: 4, max: 7}),
      Types.float({min: 1, max: [4]}),
    ]),
    c([
      Types.float({min: 1, max: 7}),
      'foo is 7...8',
      Types.literal(7, 'float'),
      Types.float({min: 1, max: [7]}),
    ]),
    c([
      Types.float({min: 1, max: 7}),
      'foo is 2<.<5',
      Types.float({min: [2], max: [5]}),
      Types.oneOf([Types.float({min: 1, max: 2}), Types.float({min: 5, max: 7})]),
    ]),
    c([
      Types.float({min: [1], max: [7]}),
      'foo is 2<..4',
      Types.float({min: [2], max: 4}),
      Types.oneOf([Types.float({min: [1], max: 2}), Types.float({min: [4], max: [7]})]),
    ]),
    c([
      Types.float({min: [1], max: [7]}),
      'foo is 0...4',
      Types.float({min: [1], max: 4}),
      Types.float({min: [4], max: [7]}),
    ]),
    c([
      Types.float({min: [1], max: [7]}),
      'foo is 4...8',
      Types.float({min: 4, max: [7]}),
      Types.float({min: [1], max: [4]}),
    ]),
    c([
      Types.float({min: [1], max: [7]}),
      'foo is 0...8',
      Types.float({min: [1], max: [7]}),
      Types.never(),
    ]),

    //|
    //|  OneOf checks
    //|
    c([
      Types.oneOf([Types.int({min: 0}), Types.string()]),
      'foo',
      Types.oneOf([Types.int({min: 1}), Types.string({min: 1})]),
      Types.oneOf([Types.literal(0), Types.literal('')]),
    ]),
    c([
      Types.oneOf([Types.int({min: 0}), Types.string()]),
      'not foo',
      Types.oneOf([Types.literal(0), Types.literal('')]),
      Types.oneOf([Types.int({min: 1}), Types.string({min: 1})]),
    ]),
    c([
      Types.oneOf([Types.int({min: 1}), Types.string()]),
      'foo',
      Types.oneOf([Types.int({min: 1}), Types.string({min: 1})]),
      Types.literal(''),
    ]),
    c([Types.oneOf([Types.int(), Types.string()]), 'foo is String', Types.string(), Types.int()]),
    c([
      Types.oneOf([Types.int(), Types.string()]),
      'not (foo is String)',
      Types.int(),
      Types.string(),
    ]),
    //|
    //|  String.length checks
    //|
    c([Types.string(), 'foo.length >= 10', Types.string({min: 10}), Types.string({max: 9})]),
    c([Types.string(), 'foo.length > 10', Types.string({min: 11}), Types.string({max: 10})]),
    c([Types.string(), 'foo.length == 10', Types.string({min: 10, max: 10}), Types.string()]),
    c([Types.string(), 'foo.length < 10', Types.string({max: 9}), Types.string({min: 10})]),
    c([Types.string(), 'foo.length <= 10', Types.string({max: 10}), Types.string({min: 11})]),
    //|
    //|  Array.length checks
    //|
    c([
      Types.array(Types.string()),
      'foo.length >= 10',
      Types.array(Types.string(), {min: 10}),
      Types.array(Types.string(), {max: 9}),
    ]),
    c([
      Types.array(Types.string()),
      'foo.length > 10',
      Types.array(Types.string(), {min: 11}),
      Types.array(Types.string(), {max: 10}),
    ]),
    c([
      Types.array(Types.string()),
      'foo.length == 10',
      Types.array(Types.string(), {min: 10, max: 10}),
      Types.oneOf([Types.array(Types.string(), {max: 9}), Types.array(Types.string(), {min: 11})]),
    ]),
    c([
      Types.array(Types.string()),
      'foo.length != 10',
      Types.oneOf([Types.array(Types.string(), {max: 9}), Types.array(Types.string(), {min: 11})]),
      Types.array(Types.string(), {min: 10, max: 10}),
    ]),
    c([
      Types.array(Types.string()),
      'foo.length < 10',
      Types.array(Types.string(), {max: 9}),
      Types.array(Types.string(), {min: 10}),
    ]),
    c([
      Types.array(Types.string()),
      'foo.length <= 10',
      Types.array(Types.string(), {max: 10}),
      Types.array(Types.string(), {min: 11}),
    ]),
  ).run(([type, formula, truthyType, falseyType], {only, skip}) => {
    const name = 'foo'
    describe(`${name}: ${type}, ${formula}`, () => {
      beforeEach(() => {
        runtimeTypes[name] = [type, Values.nullValue()]
      })
      ;(only ? it.only : skip ? it.skip : it)(`truthy: ${truthyType}`, () => {
        const expression = parse(formula).get()
        const nextRuntime = expression.assumeTrue(typeRuntime).get()
        expect(nextRuntime.getLocalType(name)).toEqual(truthyType)
      })
      ;(only ? it.only : skip ? it.skip : it)(`falsey: ${falseyType}`, () => {
        const expression = parse(formula).get()
        const nextRuntime = expression.assumeFalse(typeRuntime).get()
        expect(nextRuntime.getLocalType(name)).toEqual(falseyType)
      })
    })
  })

  describe('narrowTypeIs / narrowTypeIsNot', () => {
    cases<[Types.Type, Types.Type, {is: Types.Type; isNot: Types.Type}]>(
      c([Types.int(), Types.int({min: 1}), {is: Types.int({min: 1}), isNot: Types.int({max: 0})}]),
      c([
        Types.int({max: 0}),
        Types.int({max: -1}),
        {is: Types.int({max: -1}), isNot: Types.int({min: 0, max: 0})},
      ]),
      c([
        Types.int({max: 10}),
        Types.int({min: -1}),
        {is: Types.int({min: -1, max: 10}), isNot: Types.int({max: -2})},
      ]),
      c([
        Types.int({min: -1}),
        Types.int({max: 10}),
        {is: Types.int({min: -1, max: 10}), isNot: Types.int({min: 11})},
      ]),
      c([
        Types.oneOf([Types.int(), Types.string()]),
        Types.int({min: 1}),
        {is: Types.int({min: 1}), isNot: Types.oneOf([Types.int({max: 0}), Types.string()])},
      ]),
      c([
        Types.int({min: 0, max: 5}),
        Types.int({min: -10, max: 10}),
        {is: Types.int({min: 0, max: 5}), isNot: Types.never()},
      ]),
      c([
        Types.int({min: -10, max: 10}),
        Types.int({min: 0, max: 5}),
        {
          is: Types.int({min: 0, max: 5}),
          isNot: Types.oneOf([Types.int({min: -10, max: -1}), Types.int({min: 6, max: 10})]),
        },
      ]),
      c([
        Types.float({min: -10, max: 10}),
        Types.float({min: 0, max: 5}),
        {
          is: Types.float({min: 0, max: 5}),
          isNot: Types.oneOf([Types.float({min: -10, max: [0]}), Types.float({min: [5], max: 10})]),
        },
      ]),
      c([
        Types.float({min: -10, max: 10}),
        Types.float({min: 0, max: [5]}),
        {
          is: Types.float({min: 0, max: [5]}),
          isNot: Types.oneOf([Types.float({min: -10, max: [0]}), Types.float({min: 5, max: 10})]),
        },
      ]),
      c([
        Types.float({min: -10, max: 10}),
        Types.float({min: [0], max: [5]}),
        {
          is: Types.float({min: [0], max: [5]}),
          isNot: Types.oneOf([Types.float({min: -10, max: 0}), Types.float({min: 5, max: 10})]),
        },
      ]),
      c([
        Types.float({min: -10, max: 10}),
        Types.float({min: [0], max: 5}),
        {
          is: Types.float({min: [0], max: 5}),
          isNot: Types.oneOf([Types.float({min: -10, max: 0}), Types.float({min: [5], max: 10})]),
        },
      ]),
    ).run(([lhs, rhs, {is: expectedIs, isNot: expectedIsNot}], {only, skip}) => {
      ;(only ? it.only : skip ? it.skip : it)(
        `narrowTypeIs(${lhs}, ${rhs}) = ${expectedIs}`,
        () => {
          expect(Types.narrowTypeIs(lhs, rhs)).toEqual(expectedIs)
        },
      )
      ;(only ? it.only : skip ? it.skip : it)(
        `narrowTypeIsNot(${lhs}, ${rhs}) = ${expectedIsNot}`,
        () => {
          expect(Types.narrowTypeIsNot(lhs, rhs)).toEqual(expectedIsNot)
        },
      )
    })
  })

  // TODO: These return type tests should not be in narrowedTypes.test.ts
  it('infers return type', () => {
    const expression = parse('fn(a: Int) => a + a').get()
    const type = expression.getType(typeRuntime).get()
    expect(type).toEqual(
      Types.formula(
        [Types.namedArgument({name: 'a', type: Types.int(), isRequired: true})],
        Types.int(),
      ),
    )
  })

  it('validates return type', () => {
    const expression = parse('fn(a: Int): Int => a + a').get()
    expect(expression.getType(typeRuntime).get()).toEqual(
      Types.formula(
        [Types.namedArgument({name: 'a', type: Types.int(), isRequired: true})],
        Types.int(),
      ),
    )

    expect(() => parse('fn(a: Float): Int => a + a').get().getType(typeRuntime).get()).toThrow(
      "Function body result type 'Float' is not assignable to explicit return type 'Int'",
    )
  })
})
