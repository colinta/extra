import {c, cases} from '@extra-lang/cases'
import {
  assignRelationshipsToRuntime,
  type RelationshipLiteral,
  type RelationshipMathSymbol,
  relationshipFormula,
} from '../relationship'
import * as Types from '../types'
import * as Values from '../values'
import {parse} from '../formulaParser'
import {type MutableTypeRuntime} from '../runtime'
import {mockTypeRuntime} from './mockTypeRuntime'

let typeRuntime: MutableTypeRuntime
let runtimeTypes: {[K in string]: [Types.Type, any]}

beforeEach(() => {
  runtimeTypes = {}
  typeRuntime = mockTypeRuntime(runtimeTypes)
})

describe('let … in', () => {
  beforeEach(() => {
    runtimeTypes['intValue'] = [Types.int({min: 1, max: 10}), Values.int(1)]
    runtimeTypes['floatValue'] = [Types.float({min: 2, max: [9]}), Values.float(2)]
  })

  cases<[string, Types.Type]>(
    c(['intValue', Types.int({min: 1, max: 10})]),
    c(['intValue + 1', Types.int({min: 2, max: 11})]),
    c(['1 + intValue', Types.int({min: 2, max: 11})]),
    c(['intValue - 1', Types.int({min: 0, max: 9})]),
    c(['1 - intValue', Types.int({min: -9, max: 0})]),
    c(['-intValue', Types.int({min: -10, max: -1})]),
  ).run(([formula, expectedType], {only, skip}) =>
    (only ? it.only : skip ? it.skip : it)(
      `let intValue: Int(1...10), value = ${formula} should assign ${expectedType}`,
      () => {
        const currentExpression = parse(`let value = ${formula} in value`).get()
        const resolvedType = currentExpression.getType(typeRuntime).get()

        expect(resolvedType!).toEqual(expectedType)
      },
    ),
  )

  cases<[string, Types.Type]>(
    c(['floatValue', Types.float({min: 2, max: [9]})]),
    c(['floatValue + 1', Types.float({min: 3, max: [10]})]),
    c(['1 + floatValue', Types.float({min: 3, max: [10]})]),
    c(['floatValue - 1', Types.float({min: 1, max: [8]})]),
    c(['1 - floatValue', Types.float({min: [-8], max: -1})]),
    c(['-floatValue', Types.float({min: [-9], max: -2})]),
  ).run(([formula, expectedType], {only, skip}) =>
    (only ? it.only : skip ? it.skip : it)(
      `let floatValue: Int(2..<9), value = ${formula} should assign ${expectedType}`,
      () => {
        const currentExpression = parse(`let value = ${formula} in value`).get()
        const resolvedType = currentExpression.getType(typeRuntime).get()

        expect(resolvedType!).toEqual(expectedType)
      },
    ),
  )
})

describe('comparisons', () => {
  //|
  //|  STRING
  //|
  describe('strings', () => {
    cases<
      | [Types.Type, RelationshipMathSymbol, RelationshipLiteral, Types.Type]
      | [Types.Type, RelationshipMathSymbol, RelationshipLiteral]
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
          runtimeTypes['x'] = [lhs, '']
          const xRef = relationshipFormula.reference('x', typeRuntime.refId('x')!)
          const runtime = assignRelationshipsToRuntime(
            typeRuntime,
            [
              {
                formula: xRef,
                comparison: {operator: lhsComparison, rhs},
              },
            ],
            true,
          ).get()
          const x = runtime.getLocalType('x')
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
      | [Types.Type, RelationshipMathSymbol, RelationshipLiteral, Types.Type]
      | [Types.Type, RelationshipMathSymbol, RelationshipLiteral]
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
      c([Types.literal(1, 'float'), '!=', relationshipFormula.int(2)]),
      c([Types.float(), '<', relationshipFormula.int(1), Types.float({max: [1]})]),
      c([Types.float(), '<=', relationshipFormula.int(1), Types.float({max: 1})]),
      c([Types.float(), '>', relationshipFormula.int(1), Types.float({min: [1]})]),
      c([Types.float(), '>=', relationshipFormula.int(1), Types.float({min: 1})]),
      c([Types.literal(1, 'float'), '<', relationshipFormula.float(2), Types.literal(1, 'float')]),
      c([Types.literal(1, 'float'), '<', relationshipFormula.float(0), Types.never()]),
      //|
      //|  Float(min: 4)
      //|
      c([Types.float({min: 4}), '==', relationshipFormula.int(6), Types.literal(6, 'float')]),
      c([Types.float({min: 4}), '!=', relationshipFormula.int(6)]),
      c([Types.float({min: 4}), '!=', relationshipFormula.int(4), Types.float({min: [4]})]),
      c([Types.float({min: 4}), '<', relationshipFormula.int(6), Types.float({min: 4, max: [6]})]),
      c([Types.float({min: 4}), '<', relationshipFormula.int(3), Types.never()]),
      c([Types.float({min: 4}), '<=', relationshipFormula.int(6), Types.float({min: 4, max: 6})]),
      c([Types.float({min: 4}), '>', relationshipFormula.int(6), Types.float({min: [6]})]),
      c([Types.float({min: 4}), '>=', relationshipFormula.int(6), Types.float({min: 6})]),
      //|
      //|  Float(max: 4)
      //|
      c([Types.float({max: 4}), '==', relationshipFormula.int(1), Types.literal(1, 'float')]),
      c([Types.float({max: 4}), '!=', relationshipFormula.int(1)]),
      c([Types.float({max: 4}), '<', relationshipFormula.int(1), Types.float({max: [1]})]),
      c([Types.float({max: 4}), '<=', relationshipFormula.int(1), Types.float({max: 1})]),
      c([Types.float({max: 4}), '>', relationshipFormula.int(1), Types.float({min: [1], max: 4})]),
      c([Types.float({max: 4}), '>=', relationshipFormula.int(1), Types.float({min: 1, max: 4})]),
      c([Types.float({max: 4}), '>=', relationshipFormula.int(5), Types.never()]),
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
          runtimeTypes['x'] = [lhs, '']
          const xRef = relationshipFormula.reference('x', typeRuntime.refId('x')!)
          const runtime = assignRelationshipsToRuntime(
            typeRuntime,
            [
              {
                formula: xRef,
                comparison: {operator: lhsComparison, rhs},
              },
            ],
            true,
          ).get()
          const x = runtime.getLocalType('x')
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
      | [Types.Type, RelationshipMathSymbol, RelationshipLiteral, Types.Type]
      | [Types.Type, RelationshipMathSymbol, RelationshipLiteral]
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
      c([Types.int(), '<', relationshipFormula.int(1), Types.int({max: 0})]),
      c([Types.int(), '<', relationshipFormula.float(1.1), Types.int({max: 1})]),
      c([Types.int(), '<', relationshipFormula.float(-1.1), Types.int({max: -2})]),
      c([Types.int(), '<=', relationshipFormula.int(1), Types.int({max: 1})]),
      c([Types.int(), '<=', relationshipFormula.float(1.1), Types.int({max: 1})]),
      c([Types.int(), '<=', relationshipFormula.float(-1.1), Types.int({max: -2})]),
      c([Types.int(), '>', relationshipFormula.int(1), Types.int({min: 2})]),
      c([Types.int(), '>', relationshipFormula.int(-1), Types.int({min: 0})]),
      c([Types.int(), '>', relationshipFormula.float(1.1), Types.int({min: 2})]),
      c([Types.int(), '>', relationshipFormula.float(-1.1), Types.int({min: -1})]),
      c([Types.int(), '>=', relationshipFormula.int(1), Types.int({min: 1})]),
      c([Types.int(), '>=', relationshipFormula.float(1.1), Types.int({min: 2})]),
      c([Types.int(), '>=', relationshipFormula.float(-1.1), Types.int({min: -1})]),
      c([Types.literal(1), '<', relationshipFormula.int(2), Types.literal(1)]),
      c([Types.literal(1), '<', relationshipFormula.int(0), Types.never()]),
      //|
      //|  Int(min: 4)
      //|
      c([Types.int({min: 4}), '==', relationshipFormula.int(6), Types.literal(6)]),
      c([Types.int({min: 4}), '!=', relationshipFormula.int(6)]),
      c([Types.int({min: 4}), '!=', relationshipFormula.int(4), Types.int({min: 5})]),
      c([Types.int({min: 4}), '<', relationshipFormula.int(6), Types.int({min: 4, max: 5})]),
      c([Types.int({min: 4}), '<', relationshipFormula.int(3), Types.never()]),
      c([Types.int({min: 4}), '<=', relationshipFormula.int(6), Types.int({min: 4, max: 6})]),
      c([Types.int({min: 4}), '>', relationshipFormula.int(6), Types.int({min: 7})]),
      c([Types.int({min: 4}), '>=', relationshipFormula.int(6), Types.int({min: 6})]),
      //|
      //|  Int(max: 4)
      //|
      c([Types.int({max: 4}), '==', relationshipFormula.int(1), Types.literal(1)]),
      c([Types.int({max: 4}), '!=', relationshipFormula.int(1)]),
      c([Types.int({max: 4}), '<', relationshipFormula.int(1), Types.int({max: 0})]),
      c([Types.int({max: 4}), '<=', relationshipFormula.int(1), Types.int({max: 1})]),
      c([Types.int({max: 4}), '>', relationshipFormula.int(1), Types.int({min: 2, max: 4})]),
      c([Types.int({max: 4}), '>=', relationshipFormula.int(1), Types.int({min: 1, max: 4})]),
      c([Types.int({max: 4}), '>=', relationshipFormula.int(5), Types.never()]),
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
          runtimeTypes['x'] = [lhs, '']
          const xRef = relationshipFormula.reference('x', typeRuntime.refId('x')!)
          const runtime = assignRelationshipsToRuntime(
            typeRuntime,
            [
              {
                formula: xRef,
                comparison: {operator: lhsComparison, rhs},
              },
            ],
            false,
          ).get()
          const x = runtime.getLocalType('x')
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
      | [Types.Type, RelationshipMathSymbol, RelationshipLiteral, Types.Type]
      | [Types.Type, RelationshipMathSymbol, RelationshipLiteral]
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
          runtimeTypes['x'] = [lhs, '']
          const xRef = relationshipFormula.reference('x', typeRuntime.refId('x')!)
          const runtime = assignRelationshipsToRuntime(
            typeRuntime,
            [
              {
                formula: xRef,
                comparison: {operator: lhsComparison, rhs},
              },
            ],
            false,
          ).get()
          const x = runtime.getLocalType('x')
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
      | [Types.Type, RelationshipMathSymbol, RelationshipLiteral, Types.Type]
      | [Types.Type, RelationshipMathSymbol, RelationshipLiteral]
    >(
      c([Types.nullType(), '==', relationshipFormula.null()]),
      c([Types.nullType(), '==', relationshipFormula.int(1), Types.never()]),
    ).run(([lhs, lhsComparison, rhs, expected], {only, skip}) =>
      (only ? it.only : skip ? it.skip : it)(
        `after (x: ${lhs}) ${lhsComparison} ${rhs.value}, typeof x should be '${expected ?? lhs}'`,
        () => {
          runtimeTypes['x'] = [lhs, '']
          const xRef = relationshipFormula.reference('x', typeRuntime.refId('x')!)
          const runtime = assignRelationshipsToRuntime(
            typeRuntime,
            [
              {
                formula: xRef,
                comparison: {operator: lhsComparison, rhs},
              },
            ],
            false,
          ).get()
          const x = runtime.getLocalType('x')
          expect(x?.toCode()).toEqual((expected ?? lhs).toCode())
        },
      ),
    )
  })
})
