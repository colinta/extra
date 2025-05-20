import {equals} from '@jest/expect-utils'

import {parse} from '~/formulaParser'
import {c, cases} from '@extra-lang/cases'
import * as Types from '~/types'
import * as Values from '~/values'
import * as Relationship from '~/relationship'
import {simplifyRelationships, relationshipFormula as RF} from '~/relationship'
import {type TypeRuntime} from '~/runtime'
import {mockTypeRuntime} from '~/tests/mockTypeRuntime'

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
  symbol: Relationship.RelationshipComparison,
  formula: Relationship.RelationshipFormula,
): Relationship.Relationship {
  const rel: Relationship.Relationship = {
    formula: ref(name),
    type: symbol,
    right: formula,
  }
  return rel
}

describe('simpleRelationships', () => {
  beforeEach(() => {
    runtimeTypes['x'] = [Types.int(), Values.int(1)]
    runtimeTypes['y'] = [Types.int(), Values.int(1)]
    runtimeTypes['z'] = [Types.int(), Values.int(1)]
  })

  cases<[string, [string, () => Relationship.RelationshipFormula][]]>(
    c(['x < 1', [['x < 1', () => RF.int(1)]]]),
    c(['x < 1 + 1', [['x < 2', () => RF.int(2)]]]),
    c([
      'x + y < 2',
      [
        ['x < 2 - y', () => RF.addition(RF.int(2), RF.negate(ref('y')))],
        ['y < 2 - x', () => RF.addition(RF.int(2), RF.negate(ref('x')))],
      ],
    ]),
    c([
      'x <= 2 + y',
      [
        ['x <= 2 + y', () => RF.addition(RF.int(2), ref('y'))],
        ['y >= x - 2', () => RF.addition(ref('x'), RF.int(-2))],
      ],
    ]),
    c([
      'x == 2 + y',
      [
        ['x == 2 + y', () => RF.addition(RF.int(2), ref('y'))],
        ['y == x - 2', () => RF.addition(ref('x'), RF.int(-2))],
      ],
    ]),
    c([
      'x <= 2 - y',
      [
        ['x <= 2 - y', () => RF.addition(RF.int(2), RF.negate(ref('y')))],
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
    const symbol = formula.match(/([<=>]+)/)![1] as Relationship.RelationshipComparison
    const [lhs, rhs] = formula.split(symbol, 2).map(s => s.trim())

    ;(only ? it.only : skip ? it.skip : it)(
      `${formula} should simplify to [${expectedRelationships.map(([code]) => code).join(', ')}]`,
      () => {
        const lhsExpression = parse(lhs).get()
        const rhsExpression = parse(rhs).get()
        const lhsFormula = lhsExpression.relationshipFormula(typeRuntime)
        const rhsFormula = rhsExpression.relationshipFormula(typeRuntime)
        expect(lhsFormula).toBeTruthy()
        expect(rhsFormula).toBeTruthy()
        if (!lhsFormula || !rhsFormula) {
          return
        }

        const newRelationships = new Set(
          simplifyRelationships({
            formula: lhsFormula,
            type: symbol,
            right: rhsFormula,
          }),
        )

        const missingRelationships: Relationship.Relationship[] = []
        for (const [relCode, expectedFormula] of expectedRelationships) {
          const expectedSymbol = relCode.match(
            /([<=>]+)/,
          )![1] as Relationship.RelationshipComparison
          const ref = relCode.split(expectedSymbol)[0].trim()
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
