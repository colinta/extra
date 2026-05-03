import {c, cases} from '@extra-lang/cases'
import * as Types from '../../types'
import * as Values from '../../values'
import {type TypeRuntime, type ValueRuntime} from '../../runtime'
import {parse} from '../../formulaParser'
import {mockTypeRuntime} from '../../tests/mockTypeRuntime'
import {mockValueRuntime} from '../../tests/mockValueRuntime'

let typeRuntime: TypeRuntime
let valueRuntime: ValueRuntime
let runtimeTypes: {[K in string]: [Types.Type, Values.Value]}

beforeEach(() => {
  runtimeTypes = {}
  typeRuntime = mockTypeRuntime(runtimeTypes)
  valueRuntime = mockValueRuntime(runtimeTypes)
})

describe('getType', () => {
  describe('string concatenation operator ..', () => {
    beforeEach(() => {
      runtimeTypes['str'] = [Types.string(), Values.string('test')]
      runtimeTypes['str4'] = [Types.string({min: 4}), Values.string('test')]
    })
    cases<[string, Types.Type]>(
      c(['"test" .. "test"', Types.literal('testtest')]),
      c(['str .. str', Types.string()]),
      c(['str .. str4', Types.string({min: 4})]),
      c(['str .. "test"', Types.string({min: 4})]),
      c(['str4 .. "test"', Types.string({min: 8})]),
    ).run(([formula, expected], {only, skip}) =>
      (only ? it.only : skip ? it.skip : it)(`${formula} => ${expected}`, () => {
        const expression = parse(formula).get()
        expect(expression.getType(typeRuntime).get()).toEqual(expected)
      }),
    )
  })

  describe('array concatenation operator ++', () => {
    beforeEach(() => {
      runtimeTypes['testString'] = [Types.string(), Values.string('testString')]
      runtimeTypes['testString2'] = [Types.string({min: 2}), Values.string('testString2')]
      runtimeTypes['testInt'] = [Types.int(), Values.int(0)]
    })
    cases<[string, Types.Type]>(
      c(['["test"] ++ ["test"]', Types.literal('test')]),
      c(['["test1"] ++ ["test2"]', Types.oneOf([Types.literal('test1'), Types.literal('test2')])]),
      c(['[testString] ++ [testString2]', Types.string()]),
      c(['[testString2] ++ [testString2]', Types.string({min: 2})]),
      c(['[testString] ++ [testInt]', Types.oneOf([Types.string(), Types.int()])]),
      c(['[testInt] ++ [testInt]', Types.int()]),
      c(['[1] ++ [1.0]', Types.oneOf([Types.literal(1), Types.literal(1, 'float')])]),
      c(['[1.1] ++ [1.1]', Types.literal(1.1)]),
    ).run(([formula, expected], {only, skip}) =>
      (only ? it.only : skip ? it.skip : it)(`${formula} => Array(${expected}, length: =2)`, () => {
        const expression = parse(formula).get()
        expect(expression.getType(typeRuntime).get()).toEqual(
          Types.array(expected, {min: 2, max: 2}),
        )
      }),
    )

    beforeEach(() => {
      runtimeTypes['ary'] = [Types.array(Types.int()), Values.int(0)]
      runtimeTypes['aryBigInt'] = [Types.array(Types.int({min: 10})), Values.int(0)]
      runtimeTypes['ary3'] = [Types.array(Types.int(), {min: 3}), Values.int(0)]
      runtimeTypes['aryMax3'] = [Types.array(Types.int(), {max: 3}), Values.int(0)]
    })
    cases<[string, Types.Type]>(
      c(['ary ++ [1]', Types.array(Types.int(), {min: 1})]),
      c(['ary ++ [1.1]', Types.array(Types.float(), {min: 1})]),
      c(['ary ++ ary', Types.array(Types.int())]),
      c(['ary ++ ary3', Types.array(Types.int(), {min: 3})]),
      c(['ary3 ++ [1]', Types.array(Types.int(), {min: 4})]),
      c(['aryMax3 ++ [1]', Types.array(Types.int(), {min: 1, max: 4})]),
      c(['ary ++ aryMax3', Types.array(Types.int())]),
      c(['ary3 ++ ary3', Types.array(Types.int(), {min: 6})]),
      c(['ary3 ++ aryMax3', Types.array(Types.int(), {min: 3})]),
      c(['aryMax3 ++ aryMax3', Types.array(Types.int(), {max: 6})]),
      c([
        'aryBigInt ++ [1]',
        Types.array(Types.oneOf([Types.int({min: 10}), Types.literal(1)]), {min: 1}),
      ]),
      c(['aryBigInt ++ [11]', Types.array(Types.int({min: 10}), {min: 1})]),
    ).run(([formula, expected], {only, skip}) =>
      (only ? it.only : skip ? it.skip : it)(`${formula} => ${expected}`, () => {
        const expression = parse(formula).get()
        expect(expression.getType(typeRuntime).get()).toEqual(expected)
      }),
    )
  })

  describe('object merge operators', () => {
    cases<[string, Types.Type, Types.Type, Types.Type]>(
      c([
        'named props are merged',
        Types.object([Types.namedProp('a', Types.string()), Types.namedProp('b', Types.string())]),
        Types.object([Types.namedProp('b', Types.string()), Types.namedProp('c', Types.string())]),
        Types.object([
          Types.namedProp('a', Types.string()),
          Types.namedProp('b', Types.string()),
          Types.namedProp('c', Types.string()),
        ]),
      ]),
      c([
        'rhs named props override lhs named props',
        Types.object([Types.namedProp('a', Types.string()), Types.namedProp('b', Types.string())]),
        Types.object([Types.namedProp('b', Types.int()), Types.namedProp('c', Types.string())]),
        Types.object([
          Types.namedProp('a', Types.string()),
          Types.namedProp('b', Types.int()),
          Types.namedProp('c', Types.string()),
        ]),
      ]),
      c([
        'rhs positional props override lhs positional props',
        Types.object([
          Types.positionalProp(Types.string()),
          Types.positionalProp(Types.int()),
          Types.positionalProp(Types.float()),
        ]),
        Types.object([Types.positionalProp(Types.string()), Types.positionalProp(Types.string())]),
        Types.object([
          Types.positionalProp(Types.string()),
          Types.positionalProp(Types.string()),
          Types.positionalProp(Types.float()),
        ]),
      ]),
      c([
        'lhs spread positional props are preserved',
        Types.object([
          Types.namedProp('a', Types.string()),
          Types.positionalProp(Types.float()),
          Types.positionalProp(Types.float()),
          Types.spreadPositionalProp(Types.array(Types.string())),
        ]),
        Types.object([
          Types.namedProp('a', Types.string()),
          Types.namedProp('b', Types.int()),
          Types.positionalProp(Types.int()),
        ]),
        Types.object([
          Types.namedProp('a', Types.string()),
          Types.positionalProp(Types.int()),
          Types.positionalProp(Types.float()),
          Types.namedProp('b', Types.int()),
          Types.spreadPositionalProp(Types.array(Types.string())),
        ]),
      ]),
      c([
        'spread positional props are merged with a union',
        Types.object([
          Types.namedProp('a', Types.string()),
          Types.spreadPositionalProp(Types.array(Types.string())),
        ]),
        Types.object([
          Types.namedProp('a', Types.string()),
          Types.namedProp('b', Types.int()),
          Types.positionalProp(Types.int()),
          Types.spreadPositionalProp(Types.array(Types.int())),
        ]),
        Types.object([
          Types.namedProp('a', Types.string()),
          Types.namedProp('b', Types.int()),
          Types.positionalProp(Types.int()),
          Types.spreadPositionalProp(Types.array(Types.oneOf([Types.int(), Types.string()]))),
        ]),
      ]),
      c([
        'lhs has at least 3, rhs has an extra prop, and at least 1; they overlap by one',
        Types.object([
          Types.namedProp('a', Types.string()),
          Types.spreadPositionalProp(Types.array(Types.string(), {max: 3})),
        ]),
        Types.object([
          Types.namedProp('a', Types.string()),
          Types.namedProp('b', Types.int()),
          Types.positionalProp(Types.int()),
          Types.spreadPositionalProp(Types.array(Types.int(), {min: 1})),
        ]),
        Types.object([
          Types.namedProp('a', Types.string()),
          Types.namedProp('b', Types.int()),
          Types.positionalProp(Types.int()),
          Types.spreadPositionalProp(
            Types.array(Types.oneOf([Types.string(), Types.int()]), {min: 1}),
          ),
        ]),
      ]),
      c([
        'rhs spread positional props take over when rhs is known to be larger',
        Types.object([
          Types.namedProp('a', Types.string()),
          Types.spreadPositionalProp(Types.array(Types.string(), {max: 10})),
        ]),
        Types.object([
          Types.namedProp('a', Types.string()),
          Types.namedProp('b', Types.int()),
          Types.positionalProp(Types.int()),
          Types.spreadPositionalProp(Types.array(Types.int(), {min: 10})),
        ]),
        Types.object([
          Types.namedProp('a', Types.string()),
          Types.namedProp('b', Types.int()),
          Types.positionalProp(Types.int()),
          Types.spreadPositionalProp(Types.array(Types.int(), {min: 10})),
        ]),
      ]),
      c([
        'rhs spread is ignored when covered by the lhs',
        Types.object([
          Types.namedProp('a', Types.int()),
          Types.positionalProp(Types.int()),
          Types.positionalProp(Types.int()),
          Types.positionalProp(Types.int()),
          Types.positionalProp(Types.int()),
          Types.positionalProp(Types.int()),
        ]),
        Types.object([
          Types.namedProp('a', Types.string()),
          Types.spreadPositionalProp(Types.array(Types.string(), {max: 4})),
        ]),
        Types.object([
          Types.namedProp('a', Types.string()),
          Types.positionalProp(Types.oneOf([Types.int(), Types.string()])),
          Types.positionalProp(Types.oneOf([Types.int(), Types.string()])),
          Types.positionalProp(Types.oneOf([Types.int(), Types.string()])),
          Types.positionalProp(Types.oneOf([Types.int(), Types.string()])),
          Types.positionalProp(Types.int()),
        ]),
      ]),
      c([
        'spread positional bounds are dropped when overlap loses information',
        Types.object([
          Types.namedProp('a', Types.string()),
          Types.spreadPositionalProp(Types.array(Types.string(), {min: 4, max: 4})),
        ]),
        Types.object([
          Types.namedProp('a', Types.string()),
          Types.namedProp('b', Types.int()),
          Types.positionalProp(Types.int()),
          Types.spreadPositionalProp(Types.array(Types.int())),
        ]),
        Types.object([
          Types.namedProp('a', Types.string()),
          Types.namedProp('b', Types.int()),
          Types.positionalProp(Types.int()),
          Types.spreadPositionalProp(
            Types.array(Types.oneOf([Types.int(), Types.string()]), {min: 3}),
          ),
        ]),
      ]),
      c([
        'spread positional bounds are merged when possible',
        Types.object([
          Types.namedProp('a', Types.string()),
          Types.spreadPositionalProp(Types.array(Types.string(), {min: 1, max: 4})),
        ]),
        Types.object([
          Types.namedProp('a', Types.string()),
          Types.namedProp('b', Types.int()),
          Types.spreadPositionalProp(Types.array(Types.int(), {max: 10})),
        ]),
        Types.object([
          Types.namedProp('a', Types.string()),
          Types.namedProp('b', Types.int()),
          Types.spreadPositionalProp(
            Types.array(Types.oneOf([Types.int(), Types.string()]), {min: 1, max: 10}),
          ),
        ]),
      ]),
      c([
        'spread positional bounds are merged when possible adjusting for positional prop difference',
        Types.object([
          Types.namedProp('a', Types.string()),
          Types.spreadPositionalProp(Types.array(Types.string(), {min: 2, max: 4})),
        ]),
        Types.object([
          Types.namedProp('a', Types.string()),
          Types.namedProp('b', Types.int()),
          Types.positionalProp(Types.int()),
          Types.spreadPositionalProp(Types.array(Types.int(), {max: 10})),
        ]),
        Types.object([
          Types.namedProp('a', Types.string()),
          Types.namedProp('b', Types.int()),
          Types.positionalProp(Types.int()),
          Types.spreadPositionalProp(
            Types.array(Types.oneOf([Types.int(), Types.string()]), {min: 1, max: 10}),
          ),
        ]),
      ]),
    ).run(([name, lhs, rhs, expected], {only, skip}) => {
      describe('using ~~', () => {
        ;(only ? it.only : skip ? it.skip : it)(name, () => {
          runtimeTypes['lhs'] = [lhs, Values.nullValue()]
          runtimeTypes['rhs'] = [rhs, Values.nullValue()]
          const expression = parse('lhs ~~ rhs').get()
          expect(expression.getType(typeRuntime).get()).toEqual(expected)
        })
      })

      describe.skip('using {...}', () => {
        ;(only ? it.only : skip ? it.skip : it)(name, () => {
          runtimeTypes['lhs'] = [lhs, Values.nullValue()]
          runtimeTypes['rhs'] = [rhs, Values.nullValue()]
          const expression = parse('{...lhs, ...rhs}').get()
          expect(expression.getType(typeRuntime).get()).toEqual(expected)
        })
      })
    })
  })

  describe('array cons operator ::', () => {
    beforeEach(() => {
      runtimeTypes['testString'] = [Types.string(), Values.string('testString')]
      runtimeTypes['testString2'] = [Types.string({min: 2}), Values.string('testString2')]
      runtimeTypes['testInt'] = [Types.int(), Values.int(0)]
    })
    cases<[string, Types.Type]>(
      c(['"test" :: ["test"]', Types.literal('test')]),
      c(['"test1" :: ["test2"]', Types.oneOf([Types.literal('test1'), Types.literal('test2')])]),
      c(['testString :: [testString2]', Types.string()]),
      c(['testString2 :: [testString2]', Types.string({min: 2})]),
      c(['testString :: [testInt]', Types.oneOf([Types.string(), Types.int()])]),
      c(['testInt :: [testInt]', Types.int()]),
      c(['1 :: [1.0]', Types.oneOf([Types.literal(1), Types.literal(1, 'float')])]),
      c(['1.1 :: [1.1]', Types.literal(1.1)]),
    ).run(([formula, expected], {only, skip}) =>
      (only ? it.only : skip ? it.skip : it)(`${formula} => Array(${expected}, length: =2)`, () => {
        const expression = parse(formula).get()
        expect(expression.getType(typeRuntime).get()).toEqual(
          Types.array(expected, {min: 2, max: 2}),
        )
      }),
    )

    beforeEach(() => {
      runtimeTypes['ary'] = [Types.array(Types.int()), Values.int(0)]
      runtimeTypes['aryBigInt'] = [Types.array(Types.int({min: 10})), Values.int(0)]
      runtimeTypes['ary3'] = [Types.array(Types.int(), {min: 3}), Values.int(0)]
      runtimeTypes['aryMax3'] = [Types.array(Types.int(), {max: 3}), Values.int(0)]
    })
    cases<[string, Types.Type]>(
      c(['ary ++ [1]', Types.array(Types.int(), {min: 1})]),
      c(['ary ++ [1.1]', Types.array(Types.float(), {min: 1})]),
      c(['ary ++ ary', Types.array(Types.int())]),
      c(['ary ++ ary3', Types.array(Types.int(), {min: 3})]),
      c(['ary3 ++ [1]', Types.array(Types.int(), {min: 4})]),
      c(['aryMax3 ++ [1]', Types.array(Types.int(), {min: 1, max: 4})]),
      c(['ary ++ aryMax3', Types.array(Types.int())]),
      c(['ary3 ++ ary3', Types.array(Types.int(), {min: 6})]),
      c(['ary3 ++ aryMax3', Types.array(Types.int(), {min: 3})]),
      c(['aryMax3 ++ aryMax3', Types.array(Types.int(), {max: 6})]),
      c([
        'aryBigInt ++ [1]',
        Types.array(Types.oneOf([Types.int({min: 10}), Types.literal(1)]), {min: 1}),
      ]),
      c(['aryBigInt ++ [11]', Types.array(Types.int({min: 10}), {min: 1})]),
    ).run(([formula, expected], {only, skip}) =>
      (only ? it.only : skip ? it.skip : it)(`${formula} => ${expected}`, () => {
        const expression = parse(formula).get()
        expect(expression.getType(typeRuntime).get()).toEqual(expected)
      }),
    )
  })
})

describe('eval', () => {
  cases<[Values.Value, Values.Value, string, Values.Value]>(
    c([
      Values.array([Values.int(1)]),
      Values.array([Values.float(2)]),
      'lhs ++ rhs',
      Values.array([Values.int(1), Values.float(2)]),
    ]),
    c([
      Values.array([Values.float(2)]),
      Values.array([Values.int(1), Values.int(2), Values.int(3)]),
      'lhs ++ rhs',
      Values.array([Values.float(2), Values.int(1), Values.int(2), Values.int(3)]),
    ]),
    c([Values.string('asdf'), Values.string('jkl'), 'lhs .. rhs', Values.string('asdfjkl')]),
  ).run(([lhs, rhs, formula, expected], {only, skip}) =>
    (only ? it.only : skip ? it.skip : it)(
      `should eval ${formula} = ${expected} (lhs = ${lhs}, rhs = ${rhs})`,
      () => {
        runtimeTypes['lhs'] = [lhs.getType(), lhs]
        runtimeTypes['rhs'] = [rhs.getType(), rhs]
        const expression = parse(formula).get()
        expect(expression.eval(valueRuntime).get()).toEqual(expected)
      },
    ),
  )
})
