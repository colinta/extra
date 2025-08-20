import {equals} from '@jest/expect-utils'

import {parse} from '../formulaParser'
import {c, cases} from '@extra-lang/cases'
import * as Types from '../types'
import * as Values from '../values'
import * as Relationship from '../relationship'
import {simplifyRelationships, relationshipFormula as RF} from '../relationship'
import {type TypeRuntime} from '../runtime'
import {mockTypeRuntime} from './mockTypeRuntime'

let typeRuntime: TypeRuntime
let runtimeTypes: {[K in string]: [Types.Type, any]}

beforeEach(() => {
  runtimeTypes = {}
  typeRuntime = mockTypeRuntime(runtimeTypes)
})

function ref(name: string) {
  const id = typeRuntime.refId(name)
  return RF.reference(name, id ?? '???')
}

function rel(
  name: string,
  symbol: Relationship.RelationshipMathSymbol,
  formula: Relationship.RelationshipFormula,
): Relationship.Relationship {
  const rel: Relationship.Relationship = {
    formula: ref(name),
    comparison: {operator: symbol, rhs: formula},
  }
  return rel
}

function splitFormula(formula: string) {
  const symbol = formula.match(/([<=>]+)/)![1] as Relationship.RelationshipMathSymbol
  const [lhs, rhs] = formula.split(symbol, 2).map(s => s.trim())
  return {lhs, rhs, symbol}
}

function sloppyParseFormula(formula: string) {
  return parse(formula).get().relationshipFormula(typeRuntime)!
}

function sloppyParseRelationship(formula: string) {
  const {lhs, rhs, symbol} = splitFormula(formula)
  const lhsRel = sloppyParseFormula(lhs)
  const rhsRel = sloppyParseFormula(rhs)

  if (typeof expect !== 'undefined') {
    expect(lhsRel).toBeTruthy()
    expect(rhsRel).toBeTruthy()
  }

  return {lhs: lhsRel!, rhs: rhsRel!, symbol}
}

describe('normalize', () => {
  beforeEach(() => {
    runtimeTypes['x'] = [Types.int(), Values.int(1)]
  })

  cases<[string, string]>(
    //
    c(['1', '1']),
    c(['1+1', '2']),
    c(['1+x', 'x+1']),
    c(['x+1', 'x+1']),
    c(['x+ -(1)', 'x + -1']),
    c(['1+2+x', 'x+3']),
    c(['1+x+2', 'x+3']),
    c(['x+1+2', 'x+3']),
    c(['-(-1)', '1']),
    c(['-(1) + -(2)', '-3']),
    c(['-(-(1 + x + 2))', 'x + 3']),
  ).run(([code, expected], {only, skip}) =>
    (only ? it.only : skip ? it.skip : it)(`normalize(${code}) should be ${expected}`, () => {
      const expr = parse(code).get()
      const rel = expr.relationshipFormula(typeRuntime)!
      const expectedRel = sloppyParseFormula(expected)
      expect(rel).toBeTruthy()
      expect(expectedRel).toBeTruthy()
      const normalized = Relationship.normalize(rel)
      expect(normalized).toEqual(expectedRel)
    }),
  )
})

describe('simplifyRelationships', () => {
  beforeEach(() => {
    runtimeTypes['x'] = [Types.int(), Values.int(1)]
    runtimeTypes['y'] = [Types.int(), Values.int(1)]
    runtimeTypes['z'] = [Types.int(), Values.int(1)]
  })

  // () => RelationshipFormula because ref() uses typeRuntime
  cases<[string, [string, () => Relationship.RelationshipFormula][]]>(
    c(['x < 1', [['x < 1', () => RF.int(1)]]]),
    c(['x < 1 + 1', [['x < 2', () => RF.int(2)]]]),
    c([
      'x + y < 2',
      [
        ['x < 2 - y', () => RF.addition(RF.negate(ref('y')), RF.int(2))],
        ['y < 2 - x', () => RF.addition(RF.negate(ref('x')), RF.int(2))],
      ],
    ]),
    c([
      'x <= 2 + y',
      [
        ['x <= 2 + y', () => RF.addition(ref('y'), RF.int(2))],
        ['y >= x - 2', () => RF.addition(ref('x'), RF.int(-2))],
      ],
    ]),
    c([
      'x == 2 + y',
      [
        ['x == 2 + y', () => RF.addition(ref('y'), RF.int(2))],
        ['y == x - 2', () => RF.addition(ref('x'), RF.int(-2))],
      ],
    ]),
    c([
      'x <= 2 - y',
      [
        ['x <= 2 - y', () => RF.addition(RF.negate(ref('y')), RF.int(2))],
        ['y <= -x + 2', () => RF.addition(RF.negate(ref('x')), RF.int(2))],
      ],
    ]),
    c([
      'x + y + z == 0',
      [
        ['x == -z + -y', () => RF.addition(RF.negate(ref('z')), RF.negate(ref('y')))],
        ['y == -z + -x', () => RF.addition(RF.negate(ref('z')), RF.negate(ref('x')))],
        ['z == -x + -y', () => RF.addition(RF.negate(ref('x')), RF.negate(ref('y')))],
      ],
    ]),
  ).run(([formula, expectedRelationships], {only, skip}) => {
    ;(only ? it.only : skip ? it.skip : it)(
      `${formula} should simplify to [${expectedRelationships.map(([code]) => code).join(', ')}]`,
      () => {
        const {lhs, rhs, symbol} = sloppyParseRelationship(formula)
        const newRelationships = new Set(
          simplifyRelationships({
            formula: lhs,
            comparison: {operator: symbol, rhs},
          }),
        )

        const missingRelationships: Relationship.Relationship[] = []
        for (const [relCode, expectedFormula] of expectedRelationships) {
          const {symbol: expectedSymbol, lhs: ref} = splitFormula(relCode)
          const expected = expectedFormula()
          const expectedRelationship = rel(ref, expectedSymbol, expected)
          if (
            !Array.from(newRelationships).some(newRelationship => {
              if (equals(newRelationship, expectedRelationship)) {
                newRelationships.delete(newRelationship)
                return true
              }
            })
          ) {
            missingRelationships.push(expectedRelationship)
          }
        }

        if (missingRelationships.length) {
          expect(newRelationships).toContainEqual(missingRelationships[0])
        }
      },
    )
  })
})

describe('isEqualRelationship', () => {
  beforeEach(() => {
    runtimeTypes['x'] = [Types.int(), Values.int(1)]
    runtimeTypes['y'] = [Types.int(), Values.int(1)]
    runtimeTypes['z'] = [Types.int(), Values.int(1)]
  })

  cases<[string, string, boolean]>(
    c(['x < y', 'x < y', true]),
    c(['x < y + 1', 'x < y + 1', true]),
    c(['x < y + 1', 'x < y + 2', false]),
    c(['x < y + 1', 'x < y + z', false]),
    c(['x < 1', 'x < 1', true]),
    c(['x < 1', 'x <= 1', false]),
  ).run(([lhs, rhs, expectedEqual], {only, skip}) =>
    (only ? it.only : skip ? it.skip : it)(`${lhs} == ${rhs} should be ${expectedEqual}`, () => {
      const {lhs: lhsFormula, rhs: lhsRight, symbol: lhsSymbol} = sloppyParseRelationship(lhs)
      const {lhs: rhsFormula, rhs: rhsRight, symbol: rhsSymbol} = sloppyParseRelationship(rhs)

      expect(
        Relationship.isEqualRelationship(
          {
            formula: lhsFormula,
            comparison: {operator: lhsSymbol, rhs: lhsRight},
          },
          {
            formula: rhsFormula,
            comparison: {operator: rhsSymbol, rhs: rhsRight},
          },
        ),
      ).toBe(expectedEqual)
    }),
  )
})
