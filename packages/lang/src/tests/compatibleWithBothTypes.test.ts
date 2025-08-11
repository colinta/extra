import {c, cases} from '@extra-lang/cases'
import * as Types from '../types'
import {privateOneOf} from './privateOneOf'

describe('compatibleWithBothTypes', () => {
  const human = Types.namedClass('human', new Map([['foo', Types.string()]]))
  const animal = Types.klass(new Map([['legs', Types.int()]]))
  const dog = Types.namedClass('dog', new Map([['name', Types.string()]]), animal)
  const student = Types.namedClass('student', new Map([['grade', Types.int()]]), human)

  cases<[Types.Type, Types.Type, Types.Type]>(
    // never
    c([Types.literal(1), Types.never(), Types.never()]),
    c([Types.never(), Types.never(), Types.never()]),
    // literals
    c([Types.literal(1), Types.literal(1), Types.literal(1)]),
    c([Types.literal(1), Types.literal(2), privateOneOf(Types.literal(1), Types.literal(2))]),
    c([Types.literal(1), Types.int(), Types.int()]),
    c([Types.literal(true), Types.booleanType(), Types.booleanType()]),
    c([Types.literal(false), Types.booleanType(), Types.booleanType()]),
    c([Types.literal(0), Types.int({min: 2}), privateOneOf(Types.literal(0), Types.int({min: 2}))]),
    c([Types.literal(1), Types.int({min: 2}), Types.int({min: 1})]),
    c([Types.int(), Types.nullType(), Types.optional(Types.int())]),
    c([
      privateOneOf(Types.literal(0), Types.nullType()),
      Types.int({min: 0}),
      Types.optional(Types.int({min: 0})),
    ]),
    c([
      privateOneOf(Types.literal(0), Types.nullType()),
      Types.int({min: 2}),
      privateOneOf(Types.literal(0), Types.nullType(), Types.int({min: 2})),
    ]),
    c([
      privateOneOf(Types.literal(0), Types.literal(1), Types.literal(2)),
      Types.int({min: 2}),
      privateOneOf(Types.literal(0), Types.int({min: 1})),
    ]),
    c([Types.literal(3), Types.int({min: 2}), Types.int({min: 2})]),
    c([Types.literal(1.1), Types.int(), Types.float()]),
    c([Types.literal('test'), Types.literal('test'), Types.literal('test')]),
    c([Types.literal('test'), Types.string(), Types.string()]),
    // numbers
    c([Types.float(), Types.int(), Types.float()]),
    c([Types.int({min: 1}), Types.int(), Types.int()]),
    c([Types.int({min: 1}), Types.int({min: 2}), Types.int({min: 1})]),
    c([Types.int({min: 1, max: 9}), Types.int({min: 2, max: 10}), Types.int({min: 1, max: 10})]),
    c([Types.int({min: 1, max: 9}), Types.int({min: 2}), Types.int({min: 1})]),
    c([
      Types.int({max: 0}),
      Types.int({min: 2}),
      privateOneOf(Types.int({max: 0}), Types.int({min: 2})),
    ]),
    c([Types.int({min: 2}), Types.int({max: 1}), Types.int()]),
    c([Types.int({max: 0}), Types.int({min: 1}), Types.int()]),
    c([Types.int({min: 1}), Types.int({max: 0}), Types.int()]),
    c([
      Types.float({max: 0}),
      Types.float({min: 1}),
      Types.oneOf([Types.float({max: 0}), Types.float({min: 1})]),
    ]),
    c([
      Types.int({max: 0}),
      Types.int({min: 2}),
      Types.oneOf([Types.int({max: 0}), Types.int({min: 2})]),
    ]),
    c([
      Types.float({min: [1], max: 9}),
      Types.float({min: 2, max: 10}),
      Types.float({min: [1], max: 10}),
    ]),
    // strings
    c([Types.string(), Types.string(), Types.string()]),
    c([Types.string(), Types.string({regex: [/test/]}), Types.string()]),
    c([Types.string({min: 1}), Types.string(), Types.string()]),
    c([Types.string({min: 1}), Types.string({min: 1}), Types.string({min: 1})]),
    c([
      Types.string({min: 1, max: 9}),
      Types.string({min: 2, max: 10}),
      Types.string({min: 1, max: 10}),
    ]),
    // arrays
    c([Types.array(Types.string()), Types.array(Types.string()), Types.array(Types.string())]),
    c([
      Types.array(Types.string()),
      Types.array(Types.int()),
      privateOneOf(Types.array(Types.string()), Types.array(Types.int())),
    ]),
    c([Types.array(Types.float()), Types.array(Types.int()), Types.array(Types.float())]),
    c([
      Types.array(Types.string(), {min: 1, max: 9}),
      Types.array(Types.string(), {min: 2, max: 10}),
      Types.array(Types.string(), {min: 1, max: 10}),
    ]),
    // dict
    c([
      Types.dict(Types.string()),
      Types.dict(Types.int()),
      privateOneOf(Types.dict(Types.string()), Types.dict(Types.int())),
    ]),
    c([Types.dict(Types.float()), Types.dict(Types.int()), Types.dict(Types.float())]),
    c([
      Types.dict(Types.string(), {min: 1, max: 9}),
      Types.dict(Types.string(), {min: 2, max: 10}),
      Types.dict(Types.string(), {min: 1, max: 10}),
    ]),
    c([
      Types.dict(Types.string(), {min: 1}),
      Types.dict(Types.string(), {min: 2, max: 10}),
      Types.dict(Types.string(), {min: 1}),
    ]),
    c([
      Types.dict(Types.string(), {min: 2}, new Set(['a', 'b'])),
      Types.dict(Types.string(), {min: 2}, new Set(['a', 'c'])),
      Types.dict(Types.string(), {min: 2}, new Set(['a'])),
    ]),
    // dict/array
    c([
      Types.dict(Types.string()),
      Types.array(Types.string()),
      Types.oneOf([Types.dict(Types.string()), Types.array(Types.string())]),
    ]),
    // set
    c([
      Types.set(Types.string(), {min: 1, max: 1}),
      Types.set(Types.string(), {min: 2, max: 10}),
      Types.set(Types.string(), {min: 1, max: 10}),
    ]),
    c([
      Types.set(Types.string(), {min: 1}),
      Types.set(Types.string(), {min: 2}),
      Types.set(Types.string(), {min: 1}),
    ]),
    c([
      Types.set(Types.string(), {min: 1}),
      Types.set(Types.string(), {min: 2, max: 10}),
      Types.set(Types.string(), {min: 1}),
    ]),
    c([
      Types.set(Types.string({min: 11}), {min: 11}),
      Types.set(Types.string({min: 22}), {min: 22}),
      Types.set(Types.string({min: 11}), {min: 11}),
    ]),
    // TODO: object/tuple
    c([
      Types.object([Types.namedProp('foo', Types.string())]),
      Types.object([Types.namedProp('foo', Types.string())]),
      Types.object([Types.namedProp('foo', Types.string())]),
    ]),
    c([
      Types.object([Types.positionalProp(Types.string()), Types.positionalProp(Types.int())]),
      Types.object([Types.positionalProp(Types.string()), Types.positionalProp(Types.int())]),
      Types.object([Types.positionalProp(Types.string()), Types.positionalProp(Types.int())]),
    ]),
    c([
      Types.object([Types.namedProp('foo', Types.string({min: 1}))]),
      Types.object([Types.namedProp('foo', Types.string())]),
      Types.object([Types.namedProp('foo', Types.string())]),
    ]),
    c([
      Types.object([Types.namedProp('foo', Types.string())]),
      Types.object([Types.namedProp('foo', Types.string({min: 1}))]),
      Types.object([Types.namedProp('foo', Types.string())]),
    ]),
    c([
      Types.object([Types.namedProp('foo', Types.string())]),
      Types.object([Types.namedProp('bar', Types.string())]),
      Types.oneOf([
        Types.object([Types.namedProp('foo', Types.string())]),
        Types.object([Types.namedProp('bar', Types.string())]),
      ]),
    ]),
    c([
      Types.object([Types.namedProp('foo', Types.string())]),
      Types.object([Types.namedProp('bar', Types.string())]),
      Types.oneOf([
        Types.object([Types.namedProp('foo', Types.string())]),
        Types.object([Types.namedProp('bar', Types.string())]),
      ]),
    ]),
    // classes
    c([human, human, human]),
    c([human, animal, privateOneOf(human, animal)]),
    c([student, human, human]),
    c([dog, human, privateOneOf(dog, human)]),
  ).run(([lhs, rhs, expected], {only, skip}) =>
    (only ? it.only : skip ? it.skip : it)(
      `compatibleWithBothTypes(${lhs.toCode()}, ${rhs.toCode()}) should be ${expected.toCode()}`,
      () => {
        const type = Types.compatibleWithBothTypes(lhs, rhs)
        expect(type).toEqual(expected)
      },
    ),
  )
})
