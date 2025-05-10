import {c, cases} from '@extra-lang/cases'
import {
  assignNextRuntime,
  type RelationshipLiteral,
  type RelationshipComparision,
  relationshipFormula,
} from '~/relationship'
import * as Types from '~/types'
import {TypeRuntime} from '~/runtime'
import {mockTypeRuntime} from '~/tests/mockTypeRuntime'

let typeRuntime: TypeRuntime
let runtimeTypes: {[K in string]: [Types.Type, any]}

beforeEach(() => {
  runtimeTypes = {}
  typeRuntime = mockTypeRuntime(runtimeTypes)
})

describe('assignNextRuntime', () => {
  //|
  //|  STRING
  //|
  describe('strings', () => {
    cases<
      | [Types.Type, RelationshipComparision, RelationshipLiteral, Types.Type]
      | [Types.Type, RelationshipComparision, RelationshipLiteral]
    >(
      c([Types.string(), '==', relationshipFormula.string('a'), Types.literal('a')]),
      c([Types.string({min: 10}), '==', relationshipFormula.string('a'), Types.never()]),
      c([Types.string({min: 1}), '==', relationshipFormula.string('a'), Types.literal('a')]),
      c([Types.literal('a'), '==', relationshipFormula.string('a')]),
      c([Types.literal('a'), '==', relationshipFormula.string('b'), Types.never()]),
      c([Types.string(), '!=', relationshipFormula.string('a')]),
      c([Types.string({min: 10}), '!=', relationshipFormula.string('a')]),
      c([Types.string(), '!=', relationshipFormula.int(1)]),
      c([Types.literal('a'), '!=', relationshipFormula.string('b')]),
      c([Types.literal('a'), '!=', relationshipFormula.string('a'), Types.never()]),
      c([Types.string(), '<', relationshipFormula.string('a')]),
      c([Types.string(), '<=', relationshipFormula.string('a')]),
      c([Types.string(), '>', relationshipFormula.string('a')]),
      c([Types.string(), '>=', relationshipFormula.string('a')]),
    ).run(([lhs, lhsComparison, rhs, expected], {only, skip}) =>
      (only ? it.only : skip ? it.skip : it)(
        `after (x: ${lhs}) ${lhsComparison} ${rhs.value}, typeof x should be '${expected ?? lhs}'`,
        () => {
          const xRef = relationshipFormula.reference('x', 'x-abc123')
          runtimeTypes['x'] = [lhs, '']
          const nextRuntimeResult = assignNextRuntime(typeRuntime, xRef, lhsComparison, rhs)
          expect(nextRuntimeResult.isOk()).toBe(true)
          let nextRuntime = nextRuntimeResult.get()
          const x = nextRuntime.getLocalType('x')
          expect(x?.toCode()).toEqual((expected ?? lhs).toCode())
        },
      ),
    )
  })

  //|
  //|  FLOAT
  //|
  describe('floats', () => {
    cases<
      | [Types.Type, RelationshipComparision, RelationshipLiteral, Types.Type]
      | [Types.Type, RelationshipComparision, RelationshipLiteral]
    >(
      //|
      //|  Float
      //|
      c([Types.float(), '==', relationshipFormula.int(1), Types.literal(1, 'float')]),
      c([Types.literal(1, 'float'), '==', relationshipFormula.int(1), Types.literal(1, 'float')]),
      c([Types.literal(2, 'float'), '==', relationshipFormula.int(1), Types.never()]),
      c([Types.float(), '!=', relationshipFormula.int(1)]),
      c([Types.float(), '!=', relationshipFormula.string('1')]),
      c([Types.literal(1, 'float'), '!=', relationshipFormula.int(1), Types.never()]),
      c([Types.literal(1, 'float'), '!=', relationshipFormula.int(2), Types.literal(1, 'float')]),
      c([Types.float(), '<', relationshipFormula.int(1), Types.float({min: undefined, max: [1]})]),
      c([Types.float(), '<=', relationshipFormula.int(1), Types.float({min: undefined, max: 1})]),
      c([Types.float(), '>', relationshipFormula.int(1), Types.float({min: [1], max: undefined})]),
      c([Types.float(), '>=', relationshipFormula.int(1), Types.float({min: 1, max: undefined})]),
      c([Types.literal(1, 'float'), '<', relationshipFormula.float(2), Types.literal(1, 'float')]),
      c([Types.literal(1, 'float'), '<', relationshipFormula.float(0), Types.never()]),
      //|
      //|  Float(min: 4)
      //|
      c([
        Types.float({min: 4, max: undefined}),
        '==',
        relationshipFormula.int(6),
        Types.literal(6, 'float'),
      ]),
      c([Types.float({min: 4, max: undefined}), '!=', relationshipFormula.int(6)]),
      c([
        Types.float({min: 4, max: undefined}),
        '!=',
        relationshipFormula.int(4),
        Types.float({min: [4], max: undefined}),
      ]),
      c([
        Types.float({min: 4, max: undefined}),
        '<',
        relationshipFormula.int(6),
        Types.float({min: 4, max: [6]}),
      ]),
      c([Types.float({min: 4, max: undefined}), '<', relationshipFormula.int(3), Types.never()]),
      c([
        Types.float({min: 4, max: undefined}),
        '<=',
        relationshipFormula.int(6),
        Types.float({min: 4, max: 6}),
      ]),
      c([
        Types.float({min: 4, max: undefined}),
        '>',
        relationshipFormula.int(6),
        Types.float({min: [6], max: undefined}),
      ]),
      c([
        Types.float({min: 4, max: undefined}),
        '>=',
        relationshipFormula.int(6),
        Types.float({min: 6, max: undefined}),
      ]),
      //|
      //|  Float(max: 4)
      //|
      c([
        Types.float({min: undefined, max: 4}),
        '==',
        relationshipFormula.int(1),
        Types.literal(1, 'float'),
      ]),
      c([Types.float({min: undefined, max: 4}), '!=', relationshipFormula.int(1)]),
      c([
        Types.float({min: undefined, max: 4}),
        '<',
        relationshipFormula.int(1),
        Types.float({min: undefined, max: [1]}),
      ]),
      c([
        Types.float({min: undefined, max: 4}),
        '<=',
        relationshipFormula.int(1),
        Types.float({min: undefined, max: 1}),
      ]),
      c([
        Types.float({min: undefined, max: 4}),
        '>',
        relationshipFormula.int(1),
        Types.float({min: [1], max: 4}),
      ]),
      c([
        Types.float({min: undefined, max: 4}),
        '>=',
        relationshipFormula.int(1),
        Types.float({min: 1, max: 4}),
      ]),
      c([Types.float({min: undefined, max: 4}), '>=', relationshipFormula.int(5), Types.never()]),
      //|
      //|  Float(min: 4 & max: 10)
      //|
      c([
        Types.float({min: 4, max: 10}),
        '==',
        relationshipFormula.int(6),
        Types.literal(6, 'float'),
      ]),
      c([Types.float({min: 4, max: 10}), '==', relationshipFormula.int(3), Types.never()]),
      c([Types.float({min: 4, max: 10}), '==', relationshipFormula.int(11), Types.never()]),
      c([Types.float({min: 4, max: 10}), '!=', relationshipFormula.int(6)]),
      c([
        Types.float({min: 4, max: 10}),
        '!=',
        relationshipFormula.int(4),
        Types.float({min: [4], max: 10}),
      ]),
      c([
        Types.float({min: 4, max: 10}),
        '!=',
        relationshipFormula.int(10),
        Types.float({min: 4, max: [10]}),
      ]),
      c([
        Types.float({min: 4, max: 10}),
        '<',
        relationshipFormula.int(6),
        Types.float({min: 4, max: [6]}),
      ]),
      c([Types.float({min: 4, max: 10}), '<', relationshipFormula.int(3), Types.never()]),
      c([
        Types.float({min: 4, max: 10}),
        '<=',
        relationshipFormula.int(6),
        Types.float({min: 4, max: 6}),
      ]),
      c([
        Types.float({min: 4, max: 10}),
        '>',
        relationshipFormula.int(6),
        Types.float({min: [6], max: 10}),
      ]),
      c([Types.float({min: 4, max: 10}), '>', relationshipFormula.int(11), Types.never()]),
      c([
        Types.float({min: 4, max: 10}),
        '>=',
        relationshipFormula.int(6),
        Types.float({min: 6, max: 10}),
      ]),
    ).run(([lhs, lhsComparison, rhs, expected], {only, skip}) =>
      (only ? it.only : skip ? it.skip : it)(
        `after (x: ${lhs}) ${lhsComparison} ${rhs.value}, typeof x should be '${expected ?? lhs}'`,
        () => {
          const xRef = relationshipFormula.reference('x', 'x-abc123')
          runtimeTypes['x'] = [lhs, '']
          const nextRuntimeResult = assignNextRuntime(typeRuntime, xRef, lhsComparison, rhs)
          expect(nextRuntimeResult.isOk()).toBe(true)
          let nextRuntime = nextRuntimeResult.get()
          const x = nextRuntime.getLocalType('x')
          expect(x?.toCode()).toEqual((expected ?? lhs).toCode())
        },
      ),
    )
  })

  //|
  //|  INT
  //|
  describe('ints', () => {
    cases<
      | [Types.Type, RelationshipComparision, RelationshipLiteral, Types.Type]
      | [Types.Type, RelationshipComparision, RelationshipLiteral]
    >(
      //|
      //|  Int
      //|
      c([Types.int(), '==', relationshipFormula.int(1), Types.literal(1)]),
      c([Types.int(), '==', relationshipFormula.float(1), Types.literal(1)]),
      c([Types.int(), '==', relationshipFormula.float(1.1), Types.never()]),
      c([Types.literal(1), '==', relationshipFormula.int(1), Types.literal(1)]),
      c([Types.literal(1), '==', relationshipFormula.int(2), Types.never()]),
      c([Types.int(), '!=', relationshipFormula.int(1)]),
      c([Types.int(), '!=', relationshipFormula.string('1')]),
      c([Types.literal(1), '!=', relationshipFormula.int(1), Types.never()]),
      c([Types.literal(1), '!=', relationshipFormula.int(2), Types.literal(1)]),
      c([Types.int(), '<', relationshipFormula.int(1), Types.int({min: undefined, max: 0})]),
      c([Types.int(), '<', relationshipFormula.float(1.1), Types.int({min: undefined, max: 1})]),
      c([Types.int(), '<', relationshipFormula.float(-1.1), Types.int({min: undefined, max: -2})]),
      c([Types.int(), '<=', relationshipFormula.int(1), Types.int({min: undefined, max: 1})]),
      c([Types.int(), '<=', relationshipFormula.float(1.1), Types.int({min: undefined, max: 1})]),
      c([Types.int(), '<=', relationshipFormula.float(-1.1), Types.int({min: undefined, max: -2})]),
      c([Types.int(), '>', relationshipFormula.int(1), Types.int({min: 2, max: undefined})]),
      c([Types.int(), '>', relationshipFormula.int(-1), Types.int({min: 0, max: undefined})]),
      c([Types.int(), '>', relationshipFormula.float(1.1), Types.int({min: 2, max: undefined})]),
      c([Types.int(), '>', relationshipFormula.float(-1.1), Types.int({min: -1, max: undefined})]),
      c([Types.int(), '>=', relationshipFormula.int(1), Types.int({min: 1, max: undefined})]),
      c([Types.int(), '>=', relationshipFormula.float(1.1), Types.int({min: 2, max: undefined})]),
      c([Types.int(), '>=', relationshipFormula.float(-1.1), Types.int({min: -1, max: undefined})]),
      c([Types.literal(1), '<', relationshipFormula.int(2), Types.literal(1)]),
      c([Types.literal(1), '<', relationshipFormula.int(0), Types.never()]),
      //|
      //|  Int(min: 4)
      //|
      c([Types.int({min: 4, max: undefined}), '==', relationshipFormula.int(6), Types.literal(6)]),
      c([Types.int({min: 4, max: undefined}), '!=', relationshipFormula.int(6)]),
      c([
        Types.int({min: 4, max: undefined}),
        '!=',
        relationshipFormula.int(4),
        Types.int({min: 5, max: undefined}),
      ]),
      c([
        Types.int({min: 4, max: undefined}),
        '<',
        relationshipFormula.int(6),
        Types.int({min: 4, max: 5}),
      ]),
      c([Types.int({min: 4, max: undefined}), '<', relationshipFormula.int(3), Types.never()]),
      c([
        Types.int({min: 4, max: undefined}),
        '<=',
        relationshipFormula.int(6),
        Types.int({min: 4, max: 6}),
      ]),
      c([
        Types.int({min: 4, max: undefined}),
        '>',
        relationshipFormula.int(6),
        Types.int({min: 7, max: undefined}),
      ]),
      c([
        Types.int({min: 4, max: undefined}),
        '>=',
        relationshipFormula.int(6),
        Types.int({min: 6, max: undefined}),
      ]),
      //|
      //|  Int(max: 4)
      //|
      c([Types.int({min: undefined, max: 4}), '==', relationshipFormula.int(1), Types.literal(1)]),
      c([Types.int({min: undefined, max: 4}), '!=', relationshipFormula.int(1)]),
      c([
        Types.int({min: undefined, max: 4}),
        '<',
        relationshipFormula.int(1),
        Types.int({min: undefined, max: 0}),
      ]),
      c([
        Types.int({min: undefined, max: 4}),
        '<=',
        relationshipFormula.int(1),
        Types.int({min: undefined, max: 1}),
      ]),
      c([
        Types.int({min: undefined, max: 4}),
        '>',
        relationshipFormula.int(1),
        Types.int({min: 2, max: 4}),
      ]),
      c([
        Types.int({min: undefined, max: 4}),
        '>=',
        relationshipFormula.int(1),
        Types.int({min: 1, max: 4}),
      ]),
      c([Types.int({min: undefined, max: 4}), '>=', relationshipFormula.int(5), Types.never()]),
      //|
      //|  Int(min: 4 & max: 10)
      //|
      c([Types.int({min: 4, max: 10}), '==', relationshipFormula.int(6), Types.literal(6)]),
      c([Types.int({min: 4, max: 10}), '==', relationshipFormula.int(3), Types.never()]),
      c([Types.int({min: 4, max: 10}), '==', relationshipFormula.int(11), Types.never()]),
      c([Types.int({min: 4, max: 10}), '!=', relationshipFormula.int(6)]),
      c([
        Types.int({min: 4, max: 10}),
        '!=',
        relationshipFormula.int(4),
        Types.int({min: 5, max: 10}),
      ]),
      c([
        Types.int({min: 4, max: 10}),
        '!=',
        relationshipFormula.int(10),
        Types.int({min: 4, max: 9}),
      ]),
      c([
        Types.int({min: 4, max: 10}),
        '<',
        relationshipFormula.int(6),
        Types.int({min: 4, max: 5}),
      ]),
      c([Types.int({min: 4, max: 10}), '<', relationshipFormula.int(3), Types.never()]),
      c([
        Types.int({min: 4, max: 10}),
        '<=',
        relationshipFormula.int(6),
        Types.int({min: 4, max: 6}),
      ]),
      c([
        Types.int({min: 4, max: 10}),
        '>',
        relationshipFormula.int(6),
        Types.int({min: 7, max: 10}),
      ]),
      c([Types.int({min: 4, max: 10}), '>', relationshipFormula.int(11), Types.never()]),
      c([
        Types.int({min: 4, max: 10}),
        '>=',
        relationshipFormula.int(6),
        Types.int({min: 6, max: 10}),
      ]),
    ).run(([lhs, lhsComparison, rhs, expected], {only, skip}) =>
      (only ? it.only : skip ? it.skip : it)(
        `after (x: ${lhs}) ${lhsComparison} ${rhs.value}, typeof x should be '${expected ?? lhs}'`,
        () => {
          const xRef = relationshipFormula.reference('x', 'x-abc123')
          runtimeTypes['x'] = [lhs, '']
          const nextRuntimeResult = assignNextRuntime(typeRuntime, xRef, lhsComparison, rhs)
          expect(nextRuntimeResult.isOk()).toBe(true)
          let nextRuntime = nextRuntimeResult.get()
          const x = nextRuntime.getLocalType('x')
          expect(x?.toCode()).toEqual((expected ?? lhs).toCode())
        },
      ),
    )
  })

  //|
  //|  BOOLEAN
  //|
  describe('booleans', () => {
    cases<
      | [Types.Type, RelationshipComparision, RelationshipLiteral, Types.Type]
      | [Types.Type, RelationshipComparision, RelationshipLiteral]
    >(
      c([Types.booleanType(), '==', relationshipFormula.boolean(true), Types.literal(true)]),
      c([Types.booleanType(), '!=', relationshipFormula.boolean(true), Types.literal(false)]),
      c([Types.booleanType(), '!=', relationshipFormula.int(1)]),
      c([Types.literal(true), '==', relationshipFormula.boolean(true), Types.literal(true)]),
      c([Types.literal(true), '!=', relationshipFormula.boolean(true), Types.never()]),
      c([Types.literal(true), '==', relationshipFormula.boolean(false), Types.never()]),
      c([Types.literal(true), '==', relationshipFormula.int(1), Types.never()]),
      c([Types.literal(false), '==', relationshipFormula.boolean(true), Types.never()]),
      c([Types.literal(false), '==', relationshipFormula.boolean(false), Types.literal(false)]),
      c([Types.literal(false), '==', relationshipFormula.int(1), Types.never()]),
    ).run(([lhs, lhsComparison, rhs, expected], {only, skip}) =>
      (only ? it.only : skip ? it.skip : it)(
        `after (x: ${lhs}) ${lhsComparison} ${rhs.value}, typeof x should be '${expected ?? lhs}'`,
        () => {
          const xRef = relationshipFormula.reference('x', 'x-abc123')
          runtimeTypes['x'] = [lhs, '']
          const nextRuntimeResult = assignNextRuntime(typeRuntime, xRef, lhsComparison, rhs)
          expect(nextRuntimeResult.isOk()).toBe(true)
          let nextRuntime = nextRuntimeResult.get()
          const x = nextRuntime.getLocalType('x')
          expect(x?.toCode()).toEqual((expected ?? lhs).toCode())
        },
      ),
    )
  })

  //|
  //|  NULL
  //|
  describe('null', () => {
    cases<
      | [Types.Type, RelationshipComparision, RelationshipLiteral, Types.Type]
      | [Types.Type, RelationshipComparision, RelationshipLiteral]
    >(
      c([Types.nullType(), '==', relationshipFormula.null()]),
      c([Types.nullType(), '==', relationshipFormula.int(1), Types.never()]),
    ).run(([lhs, lhsComparison, rhs, expected], {only, skip}) =>
      (only ? it.only : skip ? it.skip : it)(
        `after (x: ${lhs}) ${lhsComparison} ${rhs.value}, typeof x should be '${expected ?? lhs}'`,
        () => {
          const xRef = relationshipFormula.reference('x', 'x-abc123')
          runtimeTypes['x'] = [lhs, '']
          const nextRuntimeResult = assignNextRuntime(typeRuntime, xRef, lhsComparison, rhs)
          expect(nextRuntimeResult.isOk()).toBe(true)
          let nextRuntime = nextRuntimeResult.get()
          const x = nextRuntime.getLocalType('x')
          expect(x?.toCode()).toEqual((expected ?? lhs).toCode())
        },
      ),
    )
  })
})
