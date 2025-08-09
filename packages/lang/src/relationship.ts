import {ok} from '@extra-lang/result'
import {MutableTypeRuntime, type TypeRuntime} from './runtime'
import * as Types from './types'
import {type NarrowedInt, type NarrowedFloat, type NarrowedString} from './narrowed'
import {uid} from './uid'

/**
 * The Relationship module is responsible for checking and calculating
 * math-ish relationships during type checking. For instance:
 *     x: Int
 *     let
 *       y = x + 1
 *     in
 *       if (x > 0, then: y)
 * The relationship module is responsible for deducing `y > 1`, based on the
 * information available. Key concepts are `Formula`, `Comparison`, and
 * `Relationship`.
 *
 * `Formula` is a type that represents a supported operation. Supported formulas
 * include literals, a few operations, and references.
 *
 * Literals:
 *     null, true, false - literal values
 *     0, 1.1 - literal int, float
 *     "" - literal string
 *     [] - literal array (can contain formulas)
 *
 * Operations:
 *     `-foo` - negate
 *     `foo + bar` - addition
 *     `foo <> bar` - string concatenation
 *     `foo ++ bar` - array concatenation
 *
 * References:
 *     `foo` is a reference
 *     `foo.bar` is a property access
 *     `foo[0]` is array access
 *
 * Relationships are broken down into a few categories:
 *
 * - Math: Equality or comparison operations that require two
 *   arguments. The relationship is stored in MathRelationship, the comparison
 *   and rhs argument are stored in RelationshipMathComparison. Boths arguments
 *   can be a Formula
 *
 * - Truthy: Represents a "truthiness" check `if (foo)`. Takes only one
 *   argument, the lhs formula.
 *
 * - Type: Used to determine if a value is an instance of a certain type. Still
 *   requires two arguments, like a comparison, but the rhs is always a Type.
 */

/** Supported Math symbols */
export type RelationshipMathSymbol = '==' | '!=' | '>' | '>=' | '<' | '<='
type RelationshipMathComparison = {
  operator: RelationshipMathSymbol
  rhs: RelationshipFormula
}
/** Convenient for the mergeAssignableType functions */
type RelationshipMathCompareLiteral = {
  operator: RelationshipMathSymbol
  literal: RelationshipLiteral
}

type RelationshipTypeSymbol = 'instanceof' | '!instanceof'
type RelationshipTypeComparison = {
  operator: RelationshipTypeSymbol
  rhs: Types.Type
}

type RelationshipTruthySymbol = 'truthy' | 'falsey'
type RelationshipTruthyComparison = {operator: RelationshipTruthySymbol}

type RelationshipOneOfComparison = {
  operator: 'one-of'
  comparisons: ValidOneOfComparison[]
}
type ValidOneOfComparison = Exclude<RelationshipMostComparisons, RelationshipOneOfComparison>

type RelationshipMostComparisons =
  | RelationshipMathComparison
  | RelationshipTypeComparison
  | RelationshipTruthyComparison
  | RelationshipOneOfComparison
type RelationshipAnyComparison =
  | RelationshipMathComparison
  | RelationshipMathCompareLiteral
  | RelationshipTypeComparison
  | RelationshipTruthyComparison
  | RelationshipOneOfComparison

type RelationshipNull = {type: 'null'; value: null}
type RelationshipBoolean = {type: 'boolean'; value: boolean}
type RelationshipInt = {type: 'int'; value: number}
type RelationshipFloat = {type: 'float'; value: number}
type RelationshipNumeric = RelationshipInt | RelationshipFloat
type RelationshipString = {type: 'string'; value: string}
export type RelationshipLiteral =
  | RelationshipNull
  | RelationshipBoolean
  | RelationshipString
  | RelationshipNumeric

type RelationshipNegate = {type: 'negate'; arg: RelationshipFormula}
type RelationshipAddition = {
  type: 'addition'
  lhs: RelationshipFormula
  rhs: RelationshipFormula
}
type RelationshipStringConcat = {
  type: 'string-concat'
  lhs: RelationshipFormula
  rhs: RelationshipFormula
}
type RelationshipArrayConcat = {
  type: 'array-concat'
  lhs: RelationshipFormula
  rhs: RelationshipFormula
}

type RelationshipType = {type: 'instanceof'; value: Types.Type}
type RelationshipOperation =
  | RelationshipNegate
  | RelationshipAddition
  | RelationshipStringConcat
  | RelationshipArrayConcat

type RelationshipReference = {type: 'reference'; name: string; id: string}
type RelationshipReferenceAssign = {type: 'assign'; name: string; unstableId: string}
type RelationshipReferenceMask = {type: 'mask'; name: string; nextId: string; prevId: string}

export type RelationshipAssign =
  | RelationshipReference
  | RelationshipReferenceAssign
  | RelationshipReferenceMask
  | {type: 'array-access'; of: RelationshipFormula; index: RelationshipFormula}
  | {type: 'nullable-array-access'; of: RelationshipFormula; index: RelationshipFormula}
  | {type: 'property-access'; of: RelationshipFormula; name: string}
  | {type: 'nullable-property-access'; of: RelationshipFormula; name: string}

export type RelationshipFormula =
  | RelationshipLiteral
  | RelationshipAssign
  | RelationshipOperation
  | RelationshipType

type MathRelationship = {
  formula: RelationshipFormula
  comparison: RelationshipMathComparison
}

type TypeRelationship = {
  formula: RelationshipFormula
  comparison: RelationshipTypeComparison
}

type TruthyRelationship = {
  formula: RelationshipFormula
  comparison: RelationshipTruthyComparison
}

type OneOfRelationship = {
  formula: RelationshipFormula
  comparison: RelationshipOneOfComparison
}

export type Relationship =
  | MathRelationship
  | TypeRelationship
  | TruthyRelationship
  | OneOfRelationship

export type AssignedMathRelationship = {
  formula: RelationshipAssign
  comparison: RelationshipMathComparison
}
export type AssignedRelationship =
  | AssignedMathRelationship
  | {formula: RelationshipAssign; comparison: RelationshipTruthyComparison}

type AnyRelationship = Relationship | AssignedRelationship

export const relationshipFormula = {
  null(): RelationshipNull {
    return {type: 'null', value: null}
  },
  boolean(value: boolean): RelationshipBoolean {
    return {type: 'boolean', value}
  },
  int(value: number): RelationshipInt {
    return {type: 'int', value}
  },
  float(value: number): RelationshipFloat {
    return {type: 'float', value}
  },
  number(value: number, isInt: boolean): RelationshipInt | RelationshipFloat {
    if (isInt) {
      return relationshipFormula.int(value)
    }
    return relationshipFormula.float(value)
  },
  string(value: string): RelationshipString {
    return {type: 'string', value}
  },
  reference(name: string, id: string): RelationshipReference {
    return {type: 'reference', name, id}
  },
  assign(name: string): RelationshipReferenceAssign {
    return {type: 'assign', name, unstableId: uid(name)}
  },
  /**
   * foo[bar]
   */
  arrayAccess(of: RelationshipFormula, index: RelationshipFormula): RelationshipAssign {
    return {type: 'array-access', of, index}
  },
  /**
   * foo?.[bar]
   */
  nullableArrayAccess(of: RelationshipFormula, index: RelationshipFormula): RelationshipAssign {
    return {type: 'nullable-array-access', of, index}
  },
  /**
   * foo.bar
   */
  propertyAccess(of: RelationshipFormula, name: string): RelationshipAssign {
    return {type: 'property-access', of, name}
  },
  /**
   * foo?.bar
   */
  nullablePropertyAccess(of: RelationshipFormula, name: string): RelationshipAssign {
    return {type: 'nullable-property-access', of, name}
  },
  addition(lhs: RelationshipFormula, rhs: RelationshipFormula): RelationshipAddition {
    return {type: 'addition', lhs, rhs}
  },
  negate(arg: RelationshipFormula): RelationshipNegate {
    return {type: 'negate', arg}
  },
  subtraction(lhs: RelationshipFormula, rhs: RelationshipFormula): RelationshipAddition {
    return {type: 'addition', lhs, rhs: {type: 'negate', arg: rhs}}
  },
  stringConcat(lhs: RelationshipFormula, rhs: RelationshipFormula): RelationshipStringConcat {
    return {type: 'string-concat', lhs, rhs}
  },
  arrayConcat(lhs: RelationshipFormula, rhs: RelationshipFormula): RelationshipArrayConcat {
    return {type: 'array-concat', lhs, rhs}
  },
  type(type: Types.Type): RelationshipType {
    return {type: 'instanceof', value: type}
  },
  toString(rel: RelationshipFormula | Relationship | RelationshipAnyComparison): string {
    if (isComparison(rel)) {
      if (isOneOfComparison(rel)) {
        return rel.comparisons.map(toS).join(' | ')
      }

      switch (rel.operator) {
        case '==':
        case '!=':
        case '>':
        case '>=':
        case '<':
        case '<=':
          if ('literal' in rel) {
            return `${rel.operator} ${rel.literal}`
          }

          return `${rel.operator} ${this.toString(rel.rhs)}`
        case 'instanceof':
          return `is ${rel.rhs}`
        case '!instanceof':
          return `!is ${rel.rhs}`
        case 'truthy':
          return '!!'
        case 'falsey':
          return '!'
      }
    }

    if (isRelationship(rel)) {
      if (isOneOfRelationship(rel)) {
        return rel.comparison.comparisons.map(toS).join(' | ')
      }

      if (rel.comparison.operator === 'truthy' || rel.comparison.operator === 'falsey') {
        return `${this.toString(rel.comparison)}(${this.toString(rel.formula)})`
      }

      return `${this.toString(rel.formula)} ${this.toString(rel.comparison)}`
    }

    if (isLiteral(rel)) {
      return JSON.stringify(rel.value)
    }
    if (isNegate(rel)) {
      return `-${this.toString(rel.arg)}`
    }
    if (isAddition(rel)) {
      return `${this.toString(rel.lhs)} + ${this.toString(rel.rhs)}`
    }
    if (rel.type === 'string-concat') {
      return `${this.toString(rel.lhs)} <> ${this.toString(rel.rhs)}`
    }
    if (rel.type === 'array-concat') {
      return `${this.toString(rel.lhs)} ++ ${this.toString(rel.rhs)}`
    }
    if (rel.type === 'assign') {
      return rel.name
    }
    if (rel.type === 'reference') {
      return `${rel.name}(${rel.id})`
    }
    if (rel.type === 'mask') {
      return `${rel.name}(${rel.prevId}->${rel.nextId})`
    }
    if (rel.type === 'array-access') {
      return `${this.toString(rel.of)}[${this.toString(rel.index)}]`
    }
    if (rel.type === 'nullable-array-access') {
      return `${this.toString(rel.of)}?.[${this.toString(rel.index)}]`
    }
    if (rel.type === 'property-access') {
      return `${this.toString(rel.of)}.${rel.name}`
    }
    if (rel.type === 'nullable-property-access') {
      return `${this.toString(rel.of)}?.${rel.name}`
    }
    if (rel.type === 'instanceof') {
      return `${rel.value}`
    }

    const x: never = rel
    return x
  },
} as const

function toS(rel: RelationshipFormula | Relationship | RelationshipAnyComparison): string {
  return relationshipFormula.toString(rel)
}

export function assignRelationshipsToRuntime(
  runtime: TypeRuntime,
  relationships: Relationship[],
  asserting: boolean,
) {
  if (!relationships.length) {
    return ok(runtime)
  }

  let nextRuntime = new MutableTypeRuntime(runtime)
  for (const relationship of relationships) {
    for (const [assignFormula, nextType] of assignNextRuntime(
      runtime,
      nextRuntime,
      relationship,
      asserting,
    )) {
      replaceType(nextRuntime, assignFormula, nextType)
    }

    if (!isTypeRelationship(relationship) && !isOneOfRelationship(relationship)) {
      relationshipDeducer(nextRuntime, relationship)
    }
  }

  return ok(nextRuntime)
}

/**
 * Adjust the runtime, assuming that `lhs <lhsComparison> rhs` is true.
 *
 * For instance:
 *
 *     lhs => x: Int
 *     lhsComparison => '=='
 *     rhs => 5: Literal-Int
 *
 *     nextRuntime => {x: literal(5)}
 */
export function assignNextRuntime(
  prevRuntime: TypeRuntime,
  nextRuntime: TypeRuntime,
  relationship: Relationship,
  asserting: boolean,
): [RelationshipAssign, Types.Type][] {
  if (isTypeRelationship(relationship)) {
    return mergeNextTypeRuntime(prevRuntime, nextRuntime, relationship)
  } else if (isTruthyRelationship(relationship)) {
    return mergeNextTruthyRuntime(prevRuntime, nextRuntime, relationship)
  } else if (isMathRelationship(relationship)) {
    let {
      formula: lhs,
      comparison: {operator, rhs},
    } = relationship
    lhs = normalize(lhs)
    rhs = normalize(rhs)

    const normalized = {formula: lhs, comparison: {operator, rhs}}
    const nextTypes: [RelationshipAssign, Types.Type][] = []
    for (const [assignable, operator, formula] of assignables(normalized)) {
      const prevType = runtimeLookup(prevRuntime, nextRuntime, assignable)
      if (!prevType) {
        continue
      }

      let nextType: Types.Type
      if (prevType instanceof Types.OneOfType) {
        const nextTypes: Types.Type[] = []
        for (const oneOfType of prevType.of) {
          const mergedType = mergeAssignableType(oneOfType, {operator: operator, rhs: formula})
          if (mergedType === Types.NeverType) {
            if (!asserting) {
              nextTypes.push(oneOfType)
            }
          } else {
            nextTypes.push(mergedType)
          }
        }

        if (nextTypes.every((type, index) => type === prevType.of[index])) {
          nextType = prevType
        } else {
          nextType = Types.oneOf(nextTypes)
        }
      } else {
        nextType = mergeAssignableType(prevType, {operator: operator, rhs: formula})
      }

      nextTypes.push([assignable, nextType])
    }

    return nextTypes
  } else if (isOneOfRelationship(relationship)) {
    const nextAssigns = relationship.comparison.comparisons.flatMap(comparison =>
      assignNextRuntime(
        prevRuntime,
        nextRuntime,
        {formula: relationship.formula, comparison} as Relationship,
        asserting,
      ),
    )
    if (nextAssigns.length === 0) {
      return []
    }

    const types = nextAssigns.map(([_assignable, nextType]) => nextType)
    return [[nextAssigns[0][0], Types.oneOf(types)]]
  } else {
    return []
  }
}

function mergeNextTypeRuntime(
  prevRuntime: TypeRuntime,
  nextRuntime: TypeRuntime,
  {formula, comparison: {operator, rhs}}: TypeRelationship,
): [RelationshipAssign, Types.Type][] {
  if (!isAssign(formula)) {
    return []
  }

  const prevType: Types.Type | undefined = runtimeLookup(prevRuntime, nextRuntime, formula, rhs)
  if (!prevType) {
    return []
  }

  let nextType: Types.Type
  if (operator === 'instanceof') {
    nextType = Types.narrowTypeIs(prevType, rhs)
  } else if (operator === '!instanceof') {
    nextType = Types.narrowTypeIsNot(prevType, rhs)
  } else {
    nextType = Types.NeverType
  }

  // if (nextType !== prevType) {
  return [[formula, nextType]]
  // }

  // return []
}

function mergeNextTruthyRuntime(
  prevRuntime: TypeRuntime,
  nextRuntime: TypeRuntime,
  {formula, comparison: {operator}}: TruthyRelationship,
): [RelationshipAssign, Types.Type][] {
  if (!isAssign(formula)) {
    return []
  }

  const prevType = runtimeLookup(prevRuntime, nextRuntime, formula)
  if (!prevType) {
    return []
  }

  return [[formula, operator === 'truthy' ? prevType.toTruthyType() : prevType.toFalseyType()]]
}

/**
 * Return new relationships that are an OR combination of the relationships.
 *
 * Some math comparisons can be merged, like `5 > 0 or 5 == 0 => 5 >= 0`.
 * Type comparisons can be merged, `x is String or x is Int => x is (String | Int)`.
 *
 * All others are retained in the form of a "one-of" relationship.
 *     x is String or x >= 5 => String | Int(>=5)
 */
export function combineOrRelationships(
  lhsStuff: Relationship[],
  rhsStuff: Relationship[],
): Relationship[] {
  // only keep formulas in lhs that are also in rhs, grouped together by
  // relationships that have the same formula. We want to process references
  // first, so that when we run assigns, we can add 'masks' for any references
  // in rhsStuff that aren't already masked by an assigns
  let lhsSet = [...lhsStuff].sort((relA, relB) => {
    if (relA.formula.type === relB.formula.type) {
      return 0
    }
    if (relA.formula.type === 'reference') {
      return -1
    }
    return 1
  })

  const combined: Relationship[] = []
  while (lhsSet.length) {
    const lhs = lhsSet.shift()!
    const commonFormulas = [lhs]
    lhsSet = lhsSet.reduce((remaining, lhs2) => {
      if (isEqualFormula(lhs.formula, lhs2.formula)) {
        commonFormulas.push(lhs2)
      } else {
        remaining.push(lhs2)
      }
      return remaining
    }, [] as Relationship[])

    const rhsFormulas = rhsStuff.filter(rhs => isEqualFormula(lhs.formula, rhs.formula))
    let alsoOnRhs = false

    if (rhsFormulas.length) {
      alsoOnRhs = true
      commonFormulas.push(...rhsFormulas)
    } else if (lhs.formula.type === 'assign') {
      // here is a very delicate check that covers this situation:
      //     let
      //       -- foo: Array(Int) | String | Int
      //       bar = foo
      //     in
      //       if (foo is [_, foo] or foo is String) {
      //       then:
      //         { foo , bar }
      //       }
      //
      // What is the type of `{foo, bar}`? Either:
      // 1. `foo is [_, foo]`, and be assigned an Int
      // 2. Or `foo is String`, and be assigned a String
      //
      // `bar` on the other hand... It can only possibly be:
      // 1. If foo matches [_, _], `bar: Array(Int, length: =2)`
      // 2. If foo matches String, `bar: String`
      //
      // For this, we use a "mask", which copies the type information from one
      // reference and stores it in the same "assignment". A "mask" and an
      // "assign" with the same name are considered "the same" in many cases.
      const lhsAssign = lhs.formula
      const rhsRef = rhsStuff.find(
        rhs => rhs.formula.type === 'reference' && rhs.formula.name === lhsAssign.name,
      )
      if (lhsAssign && rhsRef) {
        alsoOnRhs = true
        const mask = {
          type: 'mask',
          name: lhsAssign.name,
          nextId: lhsAssign.unstableId,
          prevId: (rhsRef.formula as RelationshipReference).id,
        } as const
        commonFormulas.forEach(lhs => {
          lhs.formula = mask
        })
        commonFormulas.push({
          formula: mask,
          comparison: rhsRef.comparison,
        } as Relationship)
      } else {
        // no reference was found on the rhs, which means that the assignment
        // would be *removed*, and the value would come from parent context,
        // which doesn't feel like the right thing. Either we raise an exception
        // (require every or-condition to have a match expression, which is not
        // always feasible), or do what I did here, which is default to `null`.
        alsoOnRhs = true
        commonFormulas.push({
          formula: {type: 'assign', name: lhsAssign.name, unstableId: lhsAssign.unstableId},
          comparison: {operator: 'instanceof', rhs: Types.NullType},
        })
      }
    }

    if (alsoOnRhs) {
      const combinedFormulas = _combineOrRelationships(commonFormulas)
      if (combinedFormulas) {
        combined.push(combinedFormulas)
      }
    }
  }

  // now we have all the relationships and assigns from lhs, and all the matches
  // (or masks) from rhs, but we *don't* have all the assigns (and masks) from rhs
  const rhsAssigns = rhsStuff.filter(rhs => {
    const rhsFormula = rhs.formula
    return (
      rhsFormula.type === 'assign' &&
      !lhsStuff.some(lhs => lhs.formula.type === 'assign' && lhs.formula.name === rhsFormula.name)
    )
  })
  if (rhsAssigns.length) {
    // pass in the lhsStuff relationships - they'll be ignored if they don't
    // match, and they'll be used to create 'mask' if they match the assign.
    const combinedAssigns = combineOrRelationships(
      rhsAssigns,
      lhsStuff.filter(lhs => lhs.formula.type === 'reference'),
    )
    combined.push(...combinedAssigns)
  }

  // new assignments need to be made consistent.
  // All assignments with the same name must use the same id
  const assigns = combined.filter(relationship => relationship.formula.type === 'assign')
  const newAssignIds = new Map<string, string>()
  const reassignIds = new Map<string, string>()
  for (const assign of assigns) {
    const formula = assign.formula as RelationshipReferenceAssign
    const prevAssignId = newAssignIds.get(formula.name)
    if (prevAssignId) {
      // risky business here, replacing an `id` mid-flight like this... 🤷‍♂️
      reassignIds.set(formula.unstableId, prevAssignId)
      formula.unstableId = prevAssignId
    } else {
      newAssignIds.set(formula.name, formula.unstableId)
    }
  }
  // and now update all references to the previous assign.id
  if (reassignIds.size) {
    for (const relationship of combined) {
      if (relationship.formula.type !== 'reference') {
        continue
      }

      const assignId = relationship.formula.id
      const reassignId = reassignIds.get(assignId)
      if (reassignId) {
        relationship.formula.id = reassignId
      }
    }
  }

  return combined
}

function _combineOrRelationships(relationships: Relationship[]): Relationship | undefined {
  // flatten the array when passing around a one-of comparison
  if (relationships.some(({comparison}) => isOneOfComparison(comparison))) {
    const comparisons: ValidOneOfComparison[] = []
    for (const relationship of relationships) {
      if (isOneOfRelationship(relationship)) {
        comparisons.push(...relationship.comparison.comparisons)
      } else {
        comparisons.push(relationship.comparison)
      }
    }

    return _combineOrRelationships(
      comparisons.map(
        comparison =>
          ({
            formula: relationships[0].formula,
            comparison,
          }) as Relationship,
      ),
    )
  }

  if (relationships.length <= 1) {
    return relationships.at(0)
  }

  if (relationships.length > 2) {
    // for every item in the stack, try to combine it with all the other items
    // if they can be combined, put the new item in the stack
    const stack = new Set(relationships)
    // if the items are "unmerge-able", both are removed
    // otherwise, push it onto 'combined', which is treated as a one-of
    // combination at the end.
    const combined: Relationship[] = []
    while (stack.size) {
      const current = Array.from(stack)[0]!
      stack.delete(current)
      let include = true
      for (const testRelationship of stack) {
        const combinedOne = _combineOrRelationships([current, testRelationship])
        if (combinedOne && !isOneOfRelationship(combinedOne)) {
          stack.delete(testRelationship)
          stack.add(combinedOne)
          include = false
          break
        } else if (!combinedOne) {
          stack.delete(testRelationship)
          include = false
          break
        }
      }

      if (include) {
        combined.push(current)
      }
    }

    if (combined.length <= 1) {
      return combined.at(0)
    }

    return {
      formula: combined[0].formula,
      comparison: {
        operator: 'one-of',
        comparisons: combined.map(rel => rel.comparison as ValidOneOfComparison),
      },
    }
  }

  const [lhs, rhs] = relationships as (MathRelationship | TypeRelationship | TruthyRelationship)[]

  if (isTypeRelationship(lhs) && isTypeRelationship(rhs)) {
    if (lhs.comparison.operator === 'instanceof' && rhs.comparison.operator === 'instanceof') {
      return {
        formula: lhs.formula,
        comparison: {
          operator: 'instanceof',
          rhs: Types.compatibleWithBothTypes(lhs.comparison.rhs, rhs.comparison.rhs),
        },
      }
    } else if (
      lhs.comparison.operator === '!instanceof' ||
      rhs.comparison.operator === '!instanceof'
    ) {
      // yeah I don't *think* there is anything to do here... unless
      // the types are *the same type*. Or overlap? oh yeah if they overlap,
      // like
      //     foo: Int
      //     foo is Int(<=10) or foo is Int(<=9)
      //     --> foo: Int(<=9)
      // TODO: find the overlap of the two types in combineOrRelationships
      return
    }
  } else if (isMathRelationship(lhs) && isMathRelationship(rhs)) {
    const combined = combineOrMathRelationships(lhs, rhs)
    if (combined === 'exhaustive') {
      return
    }
    if (combined !== 'one-of') {
      return combined
    }
    // else, fallthru to the default 'one-of' relationship.
  }

  return {
    formula: lhs.formula,
    comparison: {operator: 'one-of', comparisons: [lhs.comparison, rhs.comparison]},
  }
}

function combineOrMathRelationships(
  lhs: MathRelationship,
  rhs: MathRelationship,
): MathRelationship | 'one-of' | 'exhaustive' {
  const firstRhs = lhs.comparison.rhs
  const secondRhs = rhs.comparison.rhs
  if (relationshipsAreGt(lhs, rhs)) {
    if (isEqualFormula(firstRhs, secondRhs)) {
      return {formula: lhs.formula, comparison: {operator: '>', rhs: firstRhs}}
    } else if (isNumeric(firstRhs) && isNumeric(secondRhs)) {
      return {
        formula: lhs.formula,
        comparison: {operator: '>', rhs: minNumeric(firstRhs, secondRhs)},
      }
    }
  } else if (relationshipsAreGte(lhs, rhs)) {
    if (isEqualFormula(firstRhs, secondRhs)) {
      return {formula: lhs.formula, comparison: {operator: '>=', rhs: firstRhs}}
    }
  } else if (relationshipsAreLt(lhs, rhs)) {
    if (isEqualFormula(firstRhs, secondRhs)) {
      return {formula: lhs.formula, comparison: {operator: '<', rhs: firstRhs}}
    } else if (isNumeric(firstRhs) && isNumeric(secondRhs)) {
      return {
        formula: lhs.formula,
        comparison: {operator: '<', rhs: maxNumeric(firstRhs, secondRhs)},
      }
    }
  } else if (relationshipsAreLte(lhs, rhs)) {
    if (isEqualFormula(firstRhs, secondRhs)) {
      return {formula: lhs.formula, comparison: {operator: '<=', rhs: firstRhs}}
    }
  } else if (relationshipsAreNe(lhs, rhs)) {
    if (isEqualFormula(firstRhs, secondRhs)) {
      return {formula: lhs.formula, comparison: {operator: '!=', rhs: firstRhs}}
    }
  } else if (relationshipsAreExhaustive(lhs, rhs)) {
    return 'exhaustive'
  }

  return 'one-of'
}

/**
 * Does this need to include ArrayType-length and Int-length, etc?
 */
export function relationshipToType(
  runtime: TypeRuntime,
  relationship: RelationshipFormula,
): Types.Type | undefined {
  if (isAssign(relationship)) {
    return runtimeLookup(runtime, runtime, relationship)
  }

  if (isLiteral(relationship)) {
    if (relationship.type === 'null') {
      return Types.NullType
    }
    return Types.literal(relationship.value)
  }

  if (relationship.type === 'string-concat') {
    const {lhs, rhs} = relationship
    const lhsType = relationshipToType(runtime, lhs)
    const rhsType = relationshipToType(runtime, rhs)
    if (!lhsType?.isString() || !rhsType?.isString()) {
      return
    }
    return Types.stringConcatenationType(lhsType, rhsType)
  }

  if (relationship.type === 'array-concat') {
    const {lhs, rhs} = relationship
    const lhsType = relationshipToType(runtime, lhs)
    const rhsType = relationshipToType(runtime, rhs)
    if (!lhsType || !rhsType) {
      return
    }
    return Types.array(Types.oneOf([lhsType, rhsType]))
  }

  if (relationship.type === 'negate') {
    const type = relationshipToType(runtime, relationship.arg)
    if (!type?.isFloat()) {
      return
    }
    return Types.numericSubtractionType(
      type.isInt() ? Types.int({min: 0, max: 0}) : Types.float({min: 0, max: 0}),
      type,
    )
  }

  if (relationship.type === 'addition') {
    const {lhs, rhs} = relationship
    const lhsType = relationshipToType(runtime, lhs)
    const rhsType = relationshipToType(runtime, rhs)
    if (!lhsType?.isFloat() || !rhsType?.isFloat()) {
      return
    }
    return Types.numericAdditionType(lhsType, rhsType)
  }
}

function runtimeLookup(
  prevRuntime: TypeRuntime,
  nextRuntime: TypeRuntime,
  assignable: RelationshipAssign,
  defaultAssignType?: Types.Type,
): Types.Type | undefined {
  if (assignable.type === 'assign') {
    return defaultAssignType
  }

  if (assignable.type === 'mask') {
    return prevRuntime.getTypeById(assignable.prevId)
  }

  if (assignable.type === 'reference') {
    return nextRuntime.getTypeById(assignable.id)
  }

  if (assignable.type === 'array-access' || assignable.type === 'nullable-array-access') {
    if (!isAssign(assignable.of)) {
      return
    }

    const lhsType = runtimeLookup(prevRuntime, nextRuntime, assignable.of)
    const indexType = relationshipToType(nextRuntime, assignable.index)
    if (!lhsType || !indexType) {
      return
    }

    if (assignable.type === 'nullable-array-access') {
      return lhsType.safeArrayAccessType(indexType)
    }
    return lhsType.arrayAccessType(indexType)
  }

  if (assignable.type === 'nullable-property-access' || assignable.type === 'property-access') {
    if (!isAssign(assignable.of)) {
      return
    }

    const type = runtimeLookup(prevRuntime, nextRuntime, assignable.of)
    if (!type) {
      return
    }

    if (assignable.type === 'nullable-property-access') {
      return type.safePropAccessType(assignable.name)
    }
    return type.propAccessType(assignable.name)
  }
}

function mergeAssignableType(
  prevType: Types.Type,
  comparison: RelationshipTruthyComparison | RelationshipMathComparison,
): Types.Type {
  if (isTruthyComparison(comparison)) {
    throw `TODO: mergeAssignableType with truthy comparison ${comparison.operator} on ${prevType}`
  }

  if (!isLiteral(comparison.rhs)) {
    // the type returned here must be a concrete type - we're leaving the world
    // of math-relationships, and returning to "what is the type of x". So only
    // literal comparisons with numbers (or strings, etc) work from here on out.
    return prevType
  }

  const literalComparison = {operator: comparison.operator, literal: comparison.rhs}
  if (prevType === Types.NeverType) {
    return Types.NeverType
  }

  if (prevType.isBoolean()) {
    return mergeAssignableTypeBoolean(prevType, literalComparison)
  }

  if (prevType.isInt()) {
    return mergeAssignableTypeInt(prevType, literalComparison)
  }

  if (prevType.isFloat()) {
    return mergeAssignableTypeFloat(prevType, literalComparison)
  }

  if (prevType.isString()) {
    return mergeAssignableTypeString(prevType, literalComparison)
  }

  if (prevType.isNull()) {
    return mergeAssignableTypeNull(prevType, literalComparison)
  }

  if (prevType.isRange()) {
    return mergeAssignableTypeRange(prevType, literalComparison)
  }

  throw `TODO: do something with ${prevType} in mergeAssignableType (or ignore?)`
  return prevType
}

function assignables(
  relationship: MathRelationship,
): [RelationshipAssign, RelationshipMathSymbol, RelationshipFormula][] {
  const {
    formula: lhs,
    comparison: {operator, rhs},
  } = relationship
  if (isInvalidRefs(lhs, rhs)) {
    return []
  }

  let rhsOperator: RelationshipMathSymbol
  switch (operator) {
    case '==':
    case '!=':
      rhsOperator = operator
      break
    case '>':
      rhsOperator = '<'
      break
    case '>=':
      rhsOperator = '<='
      break
    case '<':
      rhsOperator = '>'
      break
    case '<=':
      rhsOperator = '>='
      break
  }

  return _assignables({formula: lhs, comparison: {operator, rhs}}).concat(
    _assignables({formula: rhs, comparison: {operator: rhsOperator, rhs: lhs}}),
  )
}

/**
 * prevType: type of the lhs, in this case NullType
 * comparison: == != < > etc
 * literal: always a literal, but could be string, int, etc
 */
function mergeAssignableTypeNull(
  prevType: Types.Type,
  comparison: RelationshipTruthyComparison | RelationshipMathCompareLiteral,
): Types.Type {
  if (isTruthyComparison(comparison)) {
    return comparison.operator === 'truthy' ? Types.NeverType : Types.NullType
  }

  const {operator, literal} = comparison
  if (literal.type !== 'null') {
    if (operator === '!=') {
      return prevType
    }

    return Types.NeverType
  }

  if (operator === '==') {
    return Types.NullType
  }

  return Types.NeverType
}

/**
 * prevType: type of the lhs, in this case Boolean | LiteralBoolean
 * comparison: == != < > etc
 * literal: always a literal, but could be string, int, etc
 */
function mergeAssignableTypeBoolean(
  prevType: Types.Type,
  comparison: RelationshipTruthyComparison | RelationshipMathCompareLiteral,
): Types.Type {
  if (isTruthyComparison(comparison)) {
    return Types.NeverType
  }
  const {operator, literal} = comparison
  if (!isBoolean(literal)) {
    if (operator === '!=') {
      // TODO: this is always true/redundant
      return prevType
    }

    return Types.NeverType
  }

  switch (operator) {
    case '==':
      if (prevType === Types.LiteralTrueType) {
        if (literal.value === true) {
          // TODO: this is always true/redundant
          return Types.LiteralTrueType
        }
      } else if (prevType === Types.LiteralFalseType) {
        if (literal.value === false) {
          // TODO: this is always true/redundant
          return Types.LiteralFalseType
        }
      } else {
        // if a == true -- a: Boolean => a: true
        return literal.value ? Types.LiteralTrueType : Types.LiteralFalseType
      }

      // all int, float, strings -> never true
      // or comparing a literal true/false to its opposite
      return Types.NeverType
    case '!=':
      // the only check we need to do is if the literal value equals the comparison, we
      // can return 'never'. Otherwise it's always true.
      if (prevType === Types.LiteralTrueType) {
        // TODO: the false case is always true/redundant
        return literal.value ? Types.NeverType : Types.LiteralTrueType
      } else if (prevType === Types.LiteralFalseType) {
        // TODO: the true case is always true/redundant
        return literal.value ? Types.LiteralFalseType : Types.NeverType
      } else {
        // bool != true => (bool === false)
        // bool != false => (bool === true)
        return literal.value ? Types.LiteralFalseType : Types.LiteralTrueType
      }
    case '<':
    case '<=':
    case '>':
    case '>=':
      return Types.NeverType
  }
}

function mergeAssignableTypeRange(
  prevType: Types.MetaIntRangeType | Types.MetaFloatRangeType,
  comparison: RelationshipTruthyComparison | RelationshipMathCompareLiteral,
): Types.Type {
  if (isTruthyComparison(comparison)) {
    return Types.NeverType
  }
  const {operator, literal} = comparison
  const numberType = prevType.toNumberType()
  const mergedType = mergeAssignableTypeInt(numberType, {operator, literal})
  if (mergedType instanceof Types.MetaIntType || mergedType instanceof Types.MetaFloatType) {
    // if the merged type is a MetaIntType or MetaFloatType, we can convert it back to a range
    return Types.RangeType.fromNumberType(mergedType)
  }

  return Types.NeverType
}

/**
 * prevType: type of the lhs, in this case Int | LiteralInt
 * comparison: == != < > etc
 * literal: always a literal, but could be string, int, etc
 */
function mergeAssignableTypeInt(
  // prevType is LiteralIntType | MetaIntType
  prevType: Types.Type,
  comparison: RelationshipTruthyComparison | RelationshipMathCompareLiteral,
): Types.Type {
  if (isTruthyComparison(comparison)) {
    return Types.NeverType
  }
  const {operator, literal} = comparison
  if (!isNumeric(literal)) {
    if (operator === '!=') {
      // TODO: this is always true/redundant
      return prevType
    }

    return Types.NeverType
  }

  switch (operator) {
    case '==':
      if (prevType instanceof Types.LiteralIntType) {
        if (isTrueNumericComparison(prevType.value, operator, literal.value)) {
          // TODO: this is always true/redundant
          return prevType
        }
      } else if (prevType.isFloat()) {
        return prevType.narrow(literal.value, literal.value)
      } else {
        // unreachable
      }

      return Types.NeverType
    case '!=':
      if (prevType.isFloat()) {
        return prevType.exclude({min: literal.value, max: literal.value})
      } else {
        // unreachable - fallthrough to NeverType
      }

      return Types.NeverType
    case '<':
    case '<=':
    case '>':
    case '>=':
      let literalValue: number
      if (literal.type === 'int') {
        literalValue = literal.value
      } else if (operator === '<=' || operator === '>') {
        literalValue = Math.floor(literal.value)
      } else {
        // '>' | '>='
        literalValue = Math.ceil(literal.value)
      }

      if (prevType instanceof Types.LiteralIntType) {
        // TODO: the true case is always true/redundant
        return isTrueNumericComparison(prevType.value, operator, literal.value)
          ? prevType
          : Types.NeverType
      } else if (prevType instanceof Types.MetaIntType) {
        let nextNarrowed: NarrowedInt
        switch (operator) {
          case '<':
            nextNarrowed = {min: undefined, max: literalValue - 1}
            break
          case '<=':
            nextNarrowed = {min: undefined, max: literalValue}
            break
          case '>':
            nextNarrowed = {min: literalValue + 1, max: undefined}
            break
          case '>=':
            nextNarrowed = {min: literalValue, max: undefined}
            break
        }

        return prevType.narrow(nextNarrowed.min, nextNarrowed.max)
      } else {
        // unreachable - fallthrough to NeverType
      }

      return Types.NeverType
  }
}

/**
 * prevType: type of the lhs, in this case Float | LiteralFloat
 * comparison: == != < > etc
 * literal: always a literal, but could be string, int, etc
 */
function mergeAssignableTypeFloat(
  // prevType is LiteralFloatType | MetaFloatType
  prevType: Types.Type,
  comparison: RelationshipTruthyComparison | RelationshipMathCompareLiteral,
): Types.Type {
  if (isTruthyComparison(comparison)) {
    return Types.NeverType
  }
  const {operator, literal} = comparison
  if (!isNumeric(literal)) {
    if (operator === '!=') {
      // TODO: this is always true/redundant
      return prevType
    }

    return Types.NeverType
  }

  switch (operator) {
    case '==':
      if (prevType instanceof Types.LiteralFloatType) {
        if (isTrueNumericComparison(prevType.value, operator, literal.value)) {
          // TODO: this is always true/redundant
          return prevType
        }
      } else if (prevType instanceof Types.MetaFloatType) {
        // check for an int or integral-float - if the comparison is true,
        // the prevType will be that a literal of that value
        if (literal.type === 'int' || literal.type === 'float') {
          if (isOutsideOfNarrowedNumeric(prevType.narrowed, literal.value)) {
            return Types.NeverType
          }

          return Types.literal(literal.value, 'float')
        }
      } else {
        // unreachable
      }

      return Types.NeverType
    case '!=':
      if (prevType instanceof Types.LiteralFloatType) {
        // the only check we need to do is if the literal value equals the comparison, we
        // can return 'never'. Otherwise it's always true.
        if (literal.value === prevType.value) {
          return Types.NeverType
        }

        // the != comparison will always be true, and the prevType will not change
        // TODO: this is always true/redundant
        return prevType
      } else if (prevType instanceof Types.MetaFloatType) {
        // if the float range is inclusive and the values are equal, the range becomes
        // exclusive. For example
        //     x: Float(>=5)
        //     x != 5  =>  x: Float(>5)
        let nextType = prevType

        if (nextType.narrowed.min === literal.value) {
          // min can be `[number]` (exclusive) or `number` (inclusive)
          // nextType.narrowed.min === literal.value check ensures it is `number` (inclusive)
          const narrowedType = nextType.narrow([literal.value], nextType.narrowed.max)
          if (narrowedType instanceof Types.MetaFloatType) {
            nextType = narrowedType
          } else {
            // NeverType (MetaFloatType is not possible here, afaik)
            return narrowedType
          }
        }

        if (nextType.narrowed.max === literal.value) {
          // max can be `[number]` (exclusive) or `number` (inclusive)
          // nextType.narrowed.max === literal.value check ensures it is `number` (inclusive)
          const narrowedType = nextType.narrow(nextType.narrowed.min, [literal.value])
          if (narrowedType instanceof Types.MetaFloatType) {
            nextType = narrowedType
          } else {
            // NeverType (MetaFloatType is not possible here, afaik)
            return narrowedType
          }
        }

        return nextType
      } else {
        // unreachable
      }

      return Types.NeverType
    case '<':
    case '<=':
    case '>':
    case '>=':
      if (prevType instanceof Types.LiteralFloatType) {
        // TODO: the true case is always true/redundant
        return isTrueNumericComparison(prevType.value, operator, literal.value)
          ? prevType
          : Types.NeverType
      } else if (prevType instanceof Types.MetaFloatType) {
        // need to compare the min and max values of prevType.narrowed and
        // adjust the narrowed range accordingly
        let nextNarrowed: NarrowedFloat
        switch (operator) {
          case '<':
            nextNarrowed = {min: undefined, max: [literal.value]}
            break
          case '<=':
            nextNarrowed = {min: undefined, max: literal.value}
            break
          case '>':
            nextNarrowed = {min: [literal.value], max: undefined}
            break
          case '>=':
            nextNarrowed = {min: literal.value, max: undefined}
            break
        }

        return prevType.narrow(nextNarrowed.min, nextNarrowed.max)
      } else {
        // unreachable - fallthrough to NeverType
      }

      return Types.NeverType
  }
}

/**
 * prevType: type of the lhs, in this case String | LiteralString
 * comparison: == != < > etc
 * literal: always a literal, but could be string, int, etc
 */
function mergeAssignableTypeString(
  // prevType is LiteralStringType | MetaStringType
  prevType: Types.Type,
  comparison: RelationshipTruthyComparison | RelationshipMathCompareLiteral,
): Types.Type {
  if (isTruthyComparison(comparison)) {
    return Types.NeverType
  }
  const {operator, literal} = comparison
  if (!isString(literal)) {
    if (operator === '!=') {
      // TODO: this is always true/redundant
      return prevType
    }

    return Types.NeverType
  }

  switch (operator) {
    case '==':
      if (prevType instanceof Types.LiteralStringType) {
        if (literal.value === prevType.value) {
          // TODO: this is always true/redundant
          return prevType
        }
      } else if (prevType instanceof Types.MetaStringType) {
        if (isOutsideOfNarrowedString(prevType.narrowedString, literal.value)) {
          return Types.NeverType
        }

        return Types.literal(literal.value)
      }

      return Types.NeverType
    case '!=':
      if (prevType instanceof Types.LiteralStringType) {
        // the only check we need to do is if the literal value equals the comparison, we
        // can return 'never'. Otherwise it's always true.
        if (literal.value === prevType.value) {
          return Types.NeverType
        }

        // the != comparison will always be true, and the prevType will not change
        // TODO: this is always true/redundant
        return prevType
      } else if (prevType instanceof Types.MetaStringType) {
        if (isOutsideOfNarrowedString(prevType.narrowedString, literal.value)) {
          // TODO: this is always true/redundant
          return prevType
        }

        // not redundant
        return prevType
      } else {
        // unreachable - fallthrough to NeverType
      }

      return Types.NeverType
    case '<':
    case '<=':
    case '>':
    case '>=':
      // I can't think of any assumption that can be made based on these sorting
      // comparisons.
      return prevType
  }
}

function isTrueNumericComparison(lhs: number, comparison: RelationshipMathSymbol, rhs: number) {
  switch (comparison) {
    case '==':
      return lhs === rhs
    case '!=':
      return lhs !== rhs
    case '<':
      return lhs < rhs
    case '<=':
      return lhs <= rhs
    case '>':
      return lhs > rhs
    case '>=':
      return lhs >= rhs
  }
}

function isOutsideOfNarrowedNumeric(narrowed: NarrowedFloat | NarrowedInt, value: number) {
  if (narrowed.min !== undefined) {
    if (Array.isArray(narrowed.min)) {
      if (value <= narrowed.min[0]) {
        return true
      }
    } else {
      if (value < narrowed.min) {
        return true
      }
    }
  }

  if (narrowed.max !== undefined) {
    if (Array.isArray(narrowed.max)) {
      if (value >= narrowed.max[0]) {
        return true
      }
    } else {
      if (value > narrowed.max) {
        return true
      }
    }
  }

  return false
}

function isOutsideOfNarrowedString(narrowedString: NarrowedString, value: string) {
  if (narrowedString.length.min && value.length < narrowedString.length.min) {
    return true
  }

  if (narrowedString.length.max && value.length > narrowedString.length.max) {
    return true
  }

  for (const pattern in narrowedString.regex) {
    if (!narrowedString.regex[pattern].test(value)) {
      return true
    }
  }
}

export function relationshipDeducer(
  mutableRuntime: MutableTypeRuntime,
  relationship: MathRelationship | TruthyRelationship,
) {
  _relationshipDeducer(mutableRuntime, relationship, new Set())
}

function _relationshipDeducer(
  mutableRuntime: MutableTypeRuntime,
  relationship: MathRelationship | TruthyRelationship,
  visited: Set<string | AssignedRelationship>,
) {
  const newRelationships = simplifyRelationships(relationship)
  if (newRelationships.length === 0) {
    return
  }

  const nextRelationships: AssignedRelationship[] = []
  for (const newRelationship of newRelationships) {
    const newId = findEventualRef(newRelationship.formula).id
    if (!visited.has(newId)) {
      visited.add(newId)

      const allRelationships = _relationshipSearch(mutableRuntime, newRelationship.formula)
      for (const prevRelationship of allRelationships) {
        if (isEqualRelationship(newRelationship, prevRelationship)) {
          continue
        }

        if (visited.has(prevRelationship)) {
          continue
        }
        visited.add(prevRelationship)

        nextRelationships.push(
          ...handleRelationship(mutableRuntime, prevRelationship, newRelationship),
        )
      }
    }

    if (isAssign(newRelationship.formula)) {
      mutableRuntime.addRelationshipFormula(newRelationship)
    }
  }

  for (const nextRelationship of nextRelationships) {
    _relationshipDeducer(mutableRuntime, nextRelationship, visited)
  }
}

function _relationshipSearch(runtime: MutableTypeRuntime, formula: RelationshipFormula) {
  const refs = findRefs(formula)
  return refs.flatMap(ref => runtime.getRelationships(ref.id))
}

/**
 * Both arguments (prevRelationship, newRelationship) are guaranteed to be
 * normalized via simplifyRelationships, and "point to" the same thing
 * (relationship.formula is the same reference).
 *
 * So if prevRelationship is something like
 *     a < 5
 * and newRelationship is something like
 *     a > b
 * Then we can deduce that
 *     b < 5
 */
function handleRelationship(
  mutableRuntime: MutableTypeRuntime,
  prevRelationship: AssignedRelationship,
  newRelationship: AssignedRelationship,
) {
  const assertRef1 = findEventualRef(prevRelationship.formula)
  const assertRef2 = findEventualRef(newRelationship.formula)
  if (assertRef1.id !== assertRef2.id) {
    throw `TODO: handleRelationship() - unexpected: ${assertRef1.id} !== ${assertRef2.id}`
  }

  if (prevRelationship.comparison.operator === '==') {
    //|        + prevRelationship.formula
    //|        |    + prevRelationship.comparison.rhs
    //|        v    v
    //|  prev: a == b
    //|          v < <= >= > == != (or truthy/falsey)
    //|   new: a ? c  =>  b ? c
    //|        ^   ^
    //|        |   + newRelationship.comparison.rhs
    //|        + newRelationship.formula
    let updatedRelationships: AssignedRelationship[]
    if (isTruthyRelationship(newRelationship)) {
      //|  prev: a == b
      //|          v < <= >= > == != (or truthy/falsey)
      //|   new: a  =>  b
      //|   new: !a => !b
      updatedRelationships = simplifyRelationships({
        formula: prevRelationship.comparison.rhs,
        comparison: newRelationship.comparison,
      })
    } else {
      //|  prev: a == b
      //|          v < <= >= > == != (or truthy/falsey)
      //|   new: a ? c  =>  b ? c
      updatedRelationships = simplifyRelationships({
        formula: prevRelationship.comparison.rhs,
        comparison: {
          operator: newRelationship.comparison.operator,
          rhs: newRelationship.comparison.rhs,
        },
      })
    }
    for (const relationship of updatedRelationships) {
      const prevType = runtimeLookup(mutableRuntime, mutableRuntime, relationship.formula)
      if (!prevType) {
        continue
      }

      const nextType = mergeAssignableType(prevType, relationship.comparison)
      if (nextType !== prevType) {
        replaceType(mutableRuntime, relationship.formula, nextType)
      }
    }

    return updatedRelationships
  } else if (isTruthyRelationship(prevRelationship)) {
    //|        + prevRelationship.formula
    //|        |
    //|        v
    //|  prev: a
    //|        ^ truthy/falsey
    //|   new: a ? c  =>  b ? c
    //|        ^   ^
    //|        |   + newRelationship.comparison.rhs
    //|        + newRelationship.formula
    throw `TODO: handleRelationship with truthy comparison ${toS(prevRelationship)} to ${toS(newRelationship)}`
  } else if (isMathRelationship(newRelationship, '==')) {
    //|        + prevRelationship.formula
    //|        |    + prevRelationship.comparison.rhs
    //|        v    v
    //|  prev: a ? b
    //|          ^ < <= >= > == != (or truthy/falsey)
    //|   new: a == c  =>  b ? c
    //|        ^    ^
    //|        |    + newRelationship.comparison.rhs
    //|        + newRelationship.formula

    // type needs to be "turned around" because prevRelationship.formula
    // is on the left of prevRelationship.symbol, and prevRelationship.formula
    // equals newRelationship.formula
    let operator: RelationshipMathSymbol = reverseComparisonSymbol(
      prevRelationship.comparison.operator,
    )
    return handleComparisonRelationship(
      mutableRuntime,
      prevRelationship,
      newRelationship as AssignedMathRelationship,
      operator,
    )
  } else if (
    (isMathRelationship(prevRelationship, '<') || isMathRelationship(prevRelationship, '<=')) &&
    (isMathRelationship(newRelationship, '>') || isMathRelationship(newRelationship, '>='))
  ) {
    //|
    //|  b < a  ,  b <= a  =>  a > b  ,  a >= b  =>  a > c  ,  a >= c
    //|  b > c  ,  b >= c      b > c  ,  b >= c
    //|
    const type =
      isMathRelationship(prevRelationship, '<=') && isMathRelationship(newRelationship, '>=')
        ? '>='
        : '>'
    return handleComparisonRelationship(mutableRuntime, prevRelationship, newRelationship, type)
  } else if (
    (isMathRelationship(prevRelationship, '>') || isMathRelationship(prevRelationship, '>=')) &&
    (isMathRelationship(newRelationship, '<') || isMathRelationship(newRelationship, '<='))
  ) {
    //|
    //|  b > a  ,  b >= a  =>  a < b  ,  a <= b  =>  a < c  ,  a <= c
    //|  b < c  ,  b <= c      b < c  ,  b <= c
    //|
    const type =
      isMathRelationship(prevRelationship, '>=') && isMathRelationship(newRelationship, '<=')
        ? '<='
        : '<'
    return handleComparisonRelationship(mutableRuntime, prevRelationship, newRelationship, type)
  } else {
    return []
  }
}

function handleComparisonRelationship(
  mutableRuntime: MutableTypeRuntime,
  prevRelationship: AssignedMathRelationship,
  newRelationship: AssignedMathRelationship,
  type: RelationshipMathSymbol,
) {
  const updatedRelationships = simplifyRelationships({
    formula: prevRelationship.comparison.rhs,
    comparison: {operator: type, rhs: newRelationship.comparison.rhs},
  })
  for (const relationship of updatedRelationships) {
    const prevType = runtimeLookup(mutableRuntime, mutableRuntime, relationship.formula)
    if (!prevType) {
      continue
    }

    const nextType = mergeAssignableType(prevType, relationship.comparison)
    if (nextType !== prevType) {
      replaceType(mutableRuntime, relationship.formula, nextType)
    }

    if (isAssign(relationship.formula)) {
      mutableRuntime.addRelationshipFormula(relationship)
    }
  }

  return updatedRelationships
}

function replaceType(
  mutableRuntime: MutableTypeRuntime,
  assignable: RelationshipAssign,
  nextType: Types.Type,
) {
  if (assignable.type === 'array-access' || assignable.type === 'nullable-array-access') {
    if (!isAssign(assignable.of)) {
      return
    }

    if (!isLiteral(assignable.index) || !isString(assignable.index)) {
      return
    }

    const type = runtimeLookup(mutableRuntime, mutableRuntime, assignable.of)
    if (!type) {
      return
    }

    const nextAssignableType = type.replacingProp(assignable.index.value, nextType)
    if (nextAssignableType.isErr()) {
      throw `TODO: error assigning ${assignable.type} type '${assignable.index.value}' to '${nextType}': ${nextAssignableType.error}`
    }

    return replaceType(mutableRuntime, assignable.of, nextAssignableType.get())
  }

  if (assignable.type === 'property-access' || assignable.type === 'nullable-property-access') {
    if (!isAssign(assignable.of)) {
      return
    }

    const type = runtimeLookup(mutableRuntime, mutableRuntime, assignable.of)
    if (!type) {
      return
    }

    const nextAssignableType = type.replacingProp(assignable.name, nextType)
    if (nextAssignableType.isErr()) {
      throw `todo - error assigning ${assignable.type} type '${assignable.name}' to '${nextType}': ${nextAssignableType.error}`
    }

    return replaceType(mutableRuntime, assignable.of, nextAssignableType.get())
  }

  if (assignable.type === 'reference') {
    mutableRuntime.replaceTypeById(assignable.id, nextType)
  } else if (assignable.type === 'assign') {
    mutableRuntime.addLocalTypeWithId(assignable.name, assignable.unstableId, nextType)
  } else if (assignable.type === 'mask') {
    mutableRuntime.addLocalTypeWithId(assignable.name, assignable.nextId, nextType)
  }
}

/**
 * Tries to return a "normal" relationship, with RelationshipAssign on the left,
 * and formula on the rhs.
 *
 *     reference == formula
 *     reference < formula
 *     ref.prop > formula
 *     ref[0] != formula
 *     etc
 */
export function simplifyRelationships(
  relationship: MathRelationship | TruthyRelationship,
): AssignedRelationship[] {
  const lhsRelationships = _simplifyRelationships(relationship)
  if (isTruthyRelationship(relationship)) {
    return lhsRelationships
  }

  const rhsRelationships = _simplifyRelationships({
    formula: relationship.comparison.rhs,
    comparison: {
      operator: reverseComparisonSymbol(relationship.comparison.operator),
      rhs: relationship.formula,
    },
  })
  return lhsRelationships.concat(rhsRelationships)
}

function _simplifyTruthyRelationships(relationship: TruthyRelationship): AssignedRelationship[] {
  // if (x) / if (!x) -- x could be a number, string, array, etc, so
  // we want to preserve the "truthiness" and not encode this relationship as
  // x != 0 / x == 0.
  if (isAssign(relationship.formula)) {
    return [relationship as AssignedRelationship]
  }

  // lame. `if (-x)` is the same as `if (x)`
  if (isNegate(relationship.formula)) {
    return _simplifyTruthyRelationships({
      formula: relationship.formula.arg,
      comparison: relationship.comparison,
    })
  }

  // !!(x + y) => x + y != 0
  // in this case we *do* encode this as a numeric inequality, but that's
  // because the addition *implies* numeric... oh shit, Set also uses `+`
  // dang dang dang.
  // TODO: what to do about set relationships?
  if (isAddition(relationship.formula)) {
    return simplifyRelationships({
      formula: relationship.formula,
      comparison: {
        operator: relationship.comparison.operator === 'truthy' ? '!=' : '==',
        rhs: relationshipFormula.int(0),
      },
    })
  }

  // TODO: _simplifyTruthyRelationships string-concat
  // !!(x <> "") => x != ''
  // !!(x <> "test") => (always true) []
  // !(x <> "") => x == ''
  // !(x <> "test") => (always false) []
  if (isStringConcat(relationship.formula)) {
  }

  // TODO: _simplifyTruthyRelationships string-concat
  // !!(x <> []) => x != []
  // !!(x <> "test") => (always true) []
  // !(x <> []) => x == []
  // !(x <> "test") => (always false) []
  if (isArrayConcat(relationship.formula)) {
  }

  return []
}

function _simplifyRelationships(
  relationship: MathRelationship | TruthyRelationship,
): AssignedRelationship[] {
  if (isTruthyRelationship(relationship)) {
    return _simplifyTruthyRelationships(relationship)
  }

  const {
    formula: formula,
    comparison: {operator: symbol, rhs: rhsFormula},
  } = relationship
  if (isAssign(formula)) {
    return [{formula, comparison: {operator: symbol, rhs: normalize(rhsFormula)}}]
  }

  if (isNegate(formula)) {
    return _simplifyRelationships({
      formula: formula.arg,
      comparison: {
        operator: reverseComparisonSymbol(symbol),
        rhs: normalize(relationshipFormula.negate(rhsFormula)),
      },
    })
  }

  if (isAddition(formula)) {
    const tryLhs = _simplifyRelationships({
      formula: formula.lhs,
      comparison: {
        operator: symbol,
        rhs: normalizeAddition(rhsFormula, relationshipFormula.negate(formula.rhs)),
      },
    })
    const tryRhs = _simplifyRelationships({
      formula: formula.rhs,
      comparison: {
        operator: symbol,
        rhs: normalizeAddition(rhsFormula, relationshipFormula.negate(formula.lhs)),
      },
    })
    return tryLhs.concat(tryRhs)
  }

  return []
}

export function normalize(formula: RelationshipFormula): RelationshipFormula {
  if (isNegate(formula)) {
    return normalizeNegate(formula)
  }

  if (isAddition(formula)) {
    return normalizeAddition(formula.lhs, formula.rhs)
  }

  return formula
}

function normalizeNegate(formula: RelationshipNegate): RelationshipFormula {
  // undo double negation
  if (isNegate(formula.arg)) {
    return normalize(formula.arg.arg)
  }

  const arg = normalize(formula.arg)

  if (isNumeric(arg)) {
    return {type: arg.type, value: -arg.value}
  }

  // -(a + b)
  if (isAddition(arg)) {
    // => -a + -b (a or b is likely to be a number)
    return normalizeAddition(
      relationshipFormula.negate(arg.lhs),
      relationshipFormula.negate(arg.rhs),
    )
  }

  return formula
}

function normalizeAddition(
  lhs: RelationshipFormula,
  rhs: RelationshipFormula,
): RelationshipFormula {
  lhs = normalize(lhs)
  rhs = normalize(rhs)

  if (isNumeric(lhs) && lhs.value === 0) {
    return rhs
  }

  if (isNumeric(rhs) && rhs.value === 0) {
    return lhs
  }

  if (isNumeric(lhs) && isNumeric(rhs)) {
    return addNumerics(lhs, rhs)
  }

  // swap order and defer to below
  if (isNumeric(lhs) && isAddition(rhs)) {
    return normalizeAddition(rhs, lhs)
  }

  if (isAddition(lhs) && isNumeric(rhs)) {
    if (isNumeric(lhs.lhs)) {
      return relationshipFormula.addition(lhs.rhs, normalizeAddition(lhs.lhs, rhs))
    }

    if (isNumeric(lhs.rhs)) {
      return relationshipFormula.addition(lhs.lhs, normalizeAddition(lhs.rhs, rhs))
    }
  }

  // prefer numbers on the rhs
  if (isNumeric(lhs)) {
    return normalizeAddition(rhs, lhs)
  }

  return relationshipFormula.addition(lhs, rhs)
}

function minNumeric(lhs: RelationshipNumeric, rhs: RelationshipNumeric) {
  if (isInt(lhs) && isInt(rhs)) {
    return relationshipFormula.int(Math.min(lhs.value, rhs.value))
  }

  return relationshipFormula.float(Math.min(lhs.value, rhs.value))
}

function maxNumeric(lhs: RelationshipNumeric, rhs: RelationshipNumeric) {
  if (isInt(lhs) && isInt(rhs)) {
    return relationshipFormula.int(Math.max(lhs.value, rhs.value))
  }

  return relationshipFormula.float(Math.max(lhs.value, rhs.value))
}

function addNumerics(lhs: RelationshipNumeric, rhs: RelationshipNumeric) {
  if (isInt(lhs) && isInt(rhs)) {
    return relationshipFormula.int(lhs.value + rhs.value)
  }

  return relationshipFormula.float(lhs.value + rhs.value)
}

function relationshipsAreGt(lhs: MathRelationship, rhs: MathRelationship) {
  return [lhs, rhs].every(relationshipIsGt)
}

function relationshipsAreGte(lhs: MathRelationship, rhs: MathRelationship) {
  if ([lhs, rhs].every(relationshipIsGte)) {
    return true
  }

  return (
    [lhs, rhs].some(r => relationshipIsGt(r) || relationshipIsGte(r)) &&
    [lhs, rhs].some(relationshipIsEq)
  )
}

function relationshipsAreLt(lhs: MathRelationship, rhs: MathRelationship) {
  return [lhs, rhs].every(relationshipIsLt)
}

function relationshipsAreLte(lhs: MathRelationship, rhs: MathRelationship) {
  if ([lhs, rhs].every(relationshipIsLte)) {
    return true
  }

  return (
    [lhs, rhs].some(r => relationshipIsLt(r) || relationshipIsLte(r)) &&
    [lhs, rhs].some(relationshipIsEq)
  )
}

function relationshipsAreNe(lhs: MathRelationship, rhs: MathRelationship) {
  return [lhs, rhs].some(relationshipIsLt) && [lhs, rhs].some(relationshipIsGt)
}

/**
 * Captures things like `x != 0 or x == 0`, `x < 0 or x >= 0`
 */
function relationshipsAreExhaustive(lhs: MathRelationship, rhs: MathRelationship) {
  const relationships = [lhs, rhs]
  if (
    (relationships.some(relationshipIsEq) && relationships.some(relationshipIsNe)) ||
    (relationships.some(relationshipIsGte) && relationships.some(relationshipIsLt)) ||
    (relationships.some(relationshipIsLte) && relationships.some(relationshipIsGt)) ||
    (relationships.some(relationshipIsGte) && relationships.some(relationshipIsLte))
  ) {
    // here we have two formulas, one is == the other is !=
    //      x == a + b - 1   -- example - could be anything
    //      x != a + b - 1   -- the formulas are *equal*
    // it doesn't matter _what_ the formula is, if the formulas are equal, then
    // it's an exhaustive check.
    //
    // Same goes for the other possibile comparisons:
    //      -- >= or <
    //      x >= a + b - 1
    //      x < a + b - 1
    //      -- <= or >
    //      x <= a + b - 1
    //      x > a + b - 1
    //      -- <= or >=
    //      x <= a + b - 1
    //      x >= a + b - 1
    return isEqualFormula(lhs.comparison.rhs, rhs.comparison.rhs)
  }

  // now we check specifically for numeric comparisons, where one is > >= and
  // the other is < <=. With numerics, we can see if they overlap.
  // TODO: if we had `runtime` here, we could probably use other relationships
  // to determine if lhs.comparison.rhs <= rhs.comparison.rhs
  const max = relationships.find(
    relationship => relationshipIsLt(relationship) || relationshipIsLte(relationship),
  )?.comparison.rhs
  const min = relationships.find(
    relationship => relationshipIsGt(relationship) || relationshipIsGte(relationship),
  )?.comparison.rhs
  if (max && min && isNumeric(max) && isNumeric(min)) {
    // Special care for `<` `>` checks (lhs.value == rhs.value is not exhaustive).
    if (relationships.some(relationshipIsGt) && relationships.some(relationshipIsLt)) {
      return min.value < max.value
    }
    return min.value <= max.value
  }

  return false
}

function relationshipIsEq(relationship: Relationship) {
  return relationship.comparison.operator === '=='
}

function relationshipIsNe(relationship: Relationship) {
  return relationship.comparison.operator === '!='
}

function relationshipIsGt(relationship: Relationship) {
  return relationship.comparison.operator === '>'
}

function relationshipIsGte(relationship: Relationship) {
  return relationship.comparison.operator === '>='
}

function relationshipIsLt(relationship: Relationship) {
  return relationship.comparison.operator === '<'
}

function relationshipIsLte(relationship: Relationship) {
  return relationship.comparison.operator === '<='
}

/**
 * Changes `a <op> b` to `b <op> a` (does not _invert_ the operation, swaps the order).
 */
export function reverseRelationship(
  relationship: MathRelationship | TruthyRelationship,
): MathRelationship | TruthyRelationship {
  switch (relationship.comparison.operator) {
    case 'truthy':
    case 'falsey':
      return relationship
    case '==':
    case '!=':
    case '<':
    case '<=':
    case '>':
    case '>=':
      return {
        formula: relationship.comparison.rhs,
        comparison: {
          operator: reverseComparisonSymbol(relationship.comparison.operator),
          rhs: relationship.formula,
        },
      }
  }
}

function reverseComparisonSymbol(symbol: RelationshipMathSymbol): RelationshipMathSymbol
function reverseComparisonSymbol(symbol: RelationshipTruthySymbol): RelationshipTruthySymbol
/**
 * Changes `a <op> b` to `b <op> a` (does not _invert_ the operation, swaps the order).
 */
function reverseComparisonSymbol(
  symbol: RelationshipMathSymbol | RelationshipTruthySymbol,
): RelationshipMathSymbol | RelationshipTruthySymbol {
  switch (symbol) {
    case 'truthy':
    case 'falsey':
    case '==':
    case '!=':
      return symbol
    case '<':
      return '>'
    case '<=':
      return '>='
    case '>':
      return '<'
    case '>=':
      return '<='
  }
}

export function invertSymbol(comparison: RelationshipTypeSymbol): RelationshipTypeSymbol
export function invertSymbol(comparison: RelationshipTruthySymbol): RelationshipTruthySymbol
export function invertSymbol(comparison: RelationshipMathSymbol): RelationshipMathSymbol

/**
 * Returns the inverse operation, ie `a <op> b` to `a <!op> b`.
 *     a < 5 => a >= 5  (invertComparison('<') => '>=')
 *     a == 4 => a != 4  (invertComparison('==') => '!=')
 * @see invertRelationship
 */
export function invertSymbol(
  comparison: RelationshipMathSymbol | RelationshipTruthySymbol | RelationshipTypeSymbol,
): RelationshipMathSymbol | RelationshipTruthySymbol | RelationshipTypeSymbol {
  switch (comparison) {
    case 'instanceof':
      return '!instanceof'
    case '!instanceof':
      return 'instanceof'
    case 'truthy':
      return 'falsey'
    case 'falsey':
      return 'truthy'
    case '==':
      return '!='
    case '!=':
      return '=='
    case '<':
      return '>='
    case '<=':
      return '>'
    case '>':
      return '<='
    case '>=':
      return '<'
  }
}

function invertComparison(comparison: RelationshipMathComparison): RelationshipMathComparison
function invertComparison(
  comparison: RelationshipMathCompareLiteral,
): RelationshipMathCompareLiteral
function invertComparison(comparison: RelationshipTypeComparison): RelationshipTypeComparison
function invertComparison(comparison: RelationshipTruthyComparison): RelationshipTruthyComparison
function invertComparison(
  comparison:
    | RelationshipMathComparison
    | RelationshipTypeComparison
    | RelationshipTruthyComparison,
): RelationshipMathComparison | RelationshipTypeComparison | RelationshipTruthyComparison
function invertComparison(
  comparison:
    | RelationshipMathComparison
    | RelationshipTypeComparison
    | RelationshipTruthyComparison
    | RelationshipOneOfComparison,
):
  | RelationshipMathComparison
  | RelationshipTypeComparison
  | RelationshipTruthyComparison
  | RelationshipOneOfComparison
function invertComparison(comparison: RelationshipOneOfComparison): RelationshipOneOfComparison

function invertComparison(
  comparison: RelationshipNormalizedComparison,
): RelationshipNormalizedComparison {
  if (isOneOfComparison(comparison)) {
    return {
      operator: 'one-of',
      comparisons: comparison.comparisons.map(comp => {
        return invertComparison(comp)
      }),
    }
  }
  switch (comparison.operator) {
    case 'instanceof':
    case '!instanceof': {
      return {
        operator: invertSymbol(comparison.operator),
        rhs: comparison.rhs,
      }
    }
    case 'truthy':
    case 'falsey':
      return {operator: invertSymbol(comparison.operator)}

    case '==':
    case '!=':
    case '<':
    case '<=':
    case '>':
    case '>=': {
      const operator = invertSymbol(comparison.operator)
      if (isMathComparison(comparison)) {
        return {operator, rhs: comparison.rhs}
      } else {
        return {operator, literal: comparison.literal}
      }
    }
  }
}

/**
 * Changes `a <op> b` to `not a <op> b` (_inverts_ the relationship, keeping the order).
 */
export function invertRelationship(relationship: Relationship): Relationship {
  return {
    formula: relationship.formula,
    comparison: invertComparison(relationship.comparison),
  } as Relationship
}

export function isAssign(formula: RelationshipFormula): formula is RelationshipAssign {
  return (
    formula.type === 'reference' ||
    formula.type === 'assign' ||
    formula.type === 'mask' ||
    formula.type === 'array-access' ||
    formula.type === 'property-access' ||
    formula.type === 'nullable-array-access' ||
    formula.type === 'nullable-property-access'
  )
}

function isMathComparison(
  comparison: RelationshipAnyComparison,
  operator?: RelationshipMathSymbol,
): comparison is RelationshipMathComparison {
  if (isOneOfComparison(comparison)) {
    return false
  }
  switch (comparison.operator) {
    case 'truthy':
    case 'falsey':
      return false
    case '==':
    case '!=':
    case '<':
    case '<=':
    case '>':
    case '>=':
      if (operator) {
        return comparison.operator === operator
      }
      return true
    default:
      return false
  }
}

function isMathRelationship(
  relationship: AnyRelationship,
  operator?: RelationshipMathSymbol,
): relationship is MathRelationship {
  return isMathComparison(relationship.comparison, operator)
}

function isTruthyComparison(
  comparison: RelationshipAnyComparison,
): comparison is RelationshipTruthyComparison {
  if (isOneOfComparison(comparison)) {
    return false
  }
  return comparison.operator === 'truthy' || comparison.operator === 'falsey'
}

function isTruthyRelationship(relationship: AnyRelationship): relationship is TruthyRelationship {
  return isTruthyComparison(relationship.comparison)
}

function isTypeComparison(
  comparison: RelationshipAnyComparison,
): comparison is RelationshipTypeComparison {
  if (isOneOfComparison(comparison)) {
    return false
  }
  return comparison.operator === 'instanceof' || comparison.operator === '!instanceof'
}

function isTypeRelationship(relationship: AnyRelationship): relationship is TypeRelationship {
  return isTypeComparison(relationship.comparison)
}

function isOneOfComparison(
  comparison: RelationshipAnyComparison,
): comparison is RelationshipOneOfComparison {
  return comparison.operator === 'one-of' && 'comparisons' in comparison
}

function isOneOfRelationship(relationship: AnyRelationship): relationship is OneOfRelationship {
  return isOneOfComparison(relationship.comparison)
}

function isRelationship(formula: Relationship | RelationshipFormula): formula is Relationship {
  return 'formula' in formula && 'comparison' in formula
}

function isComparison(
  formula: Relationship | RelationshipFormula | RelationshipAnyComparison,
): formula is RelationshipAnyComparison {
  return 'operator' in formula
}

function isLiteral(formula: RelationshipFormula): formula is RelationshipLiteral {
  return (
    formula.type === 'null' ||
    formula.type === 'boolean' ||
    formula.type === 'int' ||
    formula.type === 'float' ||
    formula.type === 'string'
  )
}

function isBoolean(formula: RelationshipFormula): formula is RelationshipBoolean {
  return formula.type === 'boolean'
}

function isNumeric(formula: RelationshipFormula): formula is RelationshipNumeric {
  return isInt(formula) || isFloat(formula)
}

function isInt(formula: RelationshipFormula): formula is RelationshipInt {
  return formula.type === 'int'
}

function isFloat(formula: RelationshipFormula): formula is RelationshipFloat {
  return formula.type === 'float'
}

function isString(formula: RelationshipFormula): formula is RelationshipString {
  return formula.type === 'string'
}

function isNegate(formula: RelationshipFormula): formula is RelationshipNegate {
  return formula.type === 'negate'
}

function isOperation(
  formula: RelationshipFormula,
): formula is RelationshipAddition | RelationshipArrayConcat | RelationshipStringConcat {
  return (
    formula.type === 'addition' ||
    formula.type === 'array-concat' ||
    formula.type === 'string-concat'
  )
}

function isAddition(formula: RelationshipFormula): formula is RelationshipAddition {
  return formula.type === 'addition'
}

function isStringConcat(formula: RelationshipFormula): formula is RelationshipAddition {
  return formula.type === 'string-concat'
}

function isArrayConcat(formula: RelationshipFormula): formula is RelationshipAddition {
  return formula.type === 'array-concat'
}

export function verifyRelationship(
  formula: RelationshipFormula,
  comparison: RelationshipMathSymbol,
  rhs: RelationshipFormula,
  getRelationships: (id: string) => AssignedRelationship[],
): boolean {
  if (isNumeric(formula) && isNumeric(rhs)) {
    switch (comparison) {
      case '==':
        return formula.value === rhs.value
      case '!=':
        return formula.value !== rhs.value
      case '>':
        return formula.value > rhs.value
      case '>=':
        return formula.value >= rhs.value
      case '<':
        return formula.value < rhs.value
      case '<=':
        return formula.value <= rhs.value
    }
  }

  const ref = findEventualRef(formula)
  const relationships = ref ? getRelationships(ref.id) : []
  return relationships.some(rel => {
    if (!isEqualFormula(formula, rel.formula)) {
      return false
    }

    switch (comparison) {
      case '==':
        return verifyRelationshipIsEq(rel, rhs)
      case '>=':
        return verifyRelationshipIsGte(rel, rhs)
      case '>':
        return verifyRelationshipIsGt(rel, rhs)
      case '<':
        return verifyRelationshipIsLt(rel, rhs)
      case '<=':
        return verifyRelationshipIsLte(rel, rhs)
      default:
        throw `TODO: implement '${comparison}' in verifyRelationship`
    }
  })
}

function verifyRelationshipIsEq(
  //
  relationship: AssignedRelationship,
  target: RelationshipFormula,
) {
  if (!['=='].includes(relationship.comparison.operator) || isTruthyRelationship(relationship)) {
    return false
  }

  if (isNumeric(target) && isNumeric(relationship.comparison.rhs)) {
    return relationship.comparison.rhs.value == target.value
  }

  // target: 'foo' or 'foo.length' or 'foo[key]'
  if (isAssign(target)) {
    if (isEqualFormula(target, relationship.comparison.rhs)) {
      // relationship: [foo] [==] [target]
      // query:        [foo] == target
      return true
    }

    if (isAddition(relationship.comparison.rhs)) {
      if (
        isNumeric(relationship.comparison.rhs.lhs) &&
        !isNumeric(relationship.comparison.rhs.rhs)
      ) {
        // swap order and defer to below (non-numeric is on lhs)
        return verifyRelationshipIsEq(
          {
            formula: relationship.formula,
            comparison: {
              operator: relationship.comparison.operator,
              rhs: relationshipFormula.addition(
                relationship.comparison.rhs.rhs,
                relationship.comparison.rhs.lhs,
              ),
            },
          },
          target,
        )
      }

      if (isAssign(relationship.comparison.rhs.lhs) && isNumeric(relationship.comparison.rhs.rhs)) {
        if (!isEqualFormula(target, relationship.comparison.rhs.lhs)) {
          return false
        }

        // relationship.comparison.rhs is an addition
        // relationship.comparison.rhs.lhs == target
        // relationship.comparison.rhs.rhs is a number

        // relationship: [foo] [==] [target] + relationship.comparison.rhs.rhs
        // query:        [foo] == target
        return false
      }
    }
  }

  throw `TODO: verifyRelationshipIsEq(rhs: ${toS(target)}, formula: ${toS(relationship.formula)} ${relationship.comparison.operator} ${toS(relationship.formula)})`
}

function verifyRelationshipIsGte(
  //
  relationship: AssignedRelationship,
  target: RelationshipFormula,
) {
  if (
    !['==', '>', '>='].includes(relationship.comparison.operator) ||
    isTruthyRelationship(relationship)
  ) {
    return false
  }

  if (isNumeric(target) && isNumeric(relationship.comparison.rhs)) {
    switch (relationship.comparison.operator) {
      case '==':
        // relationship: formula == N (eg x == 1)
        // verify: formula >= target   (eg x >= 1)
        // return: N >= target   (eg 1 == 1)
        return relationship.comparison.rhs.value >= target.value
      case '>=':
        // relationship: formula >= N (eg x >= 0)
        // verify: formula >= target   (eg x >= 0)
        // return: N >= target   (eg 0 >= 0)
        return relationship.comparison.rhs.value >= target.value
      case '>':
        // relationship: formula > N (eg x > -1)
        // verify: formula >= target   (eg x >= 0)
        if (isInt(target) && isInt(relationship.comparison.rhs)) {
          // relationship: formula > N (eg x > -1)
          // =>          : x >= N + 1 (eg x > 0)
          // return: N >= target - 1
          return relationship.comparison.rhs.value >= target.value - 1
        }

        return relationship.comparison.rhs.value >= target.value
    }
  }

  // target: 'foo' or 'foo.length' or 'foo[key]'
  if (isAssign(target)) {
    if (isEqualFormula(target, relationship.comparison.rhs)) {
      // relationship: [foo] [> == >=] [target]
      // query:        [foo] >= target
      return true
    }

    if (isAddition(relationship.comparison.rhs)) {
      if (
        isNumeric(relationship.comparison.rhs.lhs) &&
        !isNumeric(relationship.comparison.rhs.rhs)
      ) {
        // swap order and defer to below (non-numeric is on lhs)
        return verifyRelationshipIsGte(
          {
            formula: relationship.formula,
            comparison: {
              operator: relationship.comparison.operator,
              rhs: relationshipFormula.addition(
                relationship.comparison.rhs.rhs,
                relationship.comparison.rhs.lhs,
              ),
            },
          },
          target,
        )
      }

      if (isAssign(relationship.comparison.rhs.lhs) && isNumeric(relationship.comparison.rhs.rhs)) {
        if (!isEqualFormula(target, relationship.comparison.rhs.lhs)) {
          return false
        }

        // relationship.comparison.rhs is an addition
        // relationship.comparison.rhs.lhs == target
        // relationship.comparison.rhs.rhs is a number

        // relationship: [foo] [> == >=] [target] + relationship.comparison.rhs.rhs
        // query:        [foo] >= target
        return relationship.comparison.rhs.rhs.value >= 0
      }
    }
  }

  throw `TODO: verifyRelationshipIsGte(rhs: ${toS(target)}, formula: ${toS(relationship.formula)} ${relationship.comparison.operator} ${toS(relationship.formula)})`
}

/**
 * return true if `relationship.formula` is less-than target,
 * based on relationship.formula.rght
 */
function verifyRelationshipIsGt(
  //
  relationship: AssignedRelationship,
  target: RelationshipFormula,
) {
  if (
    !['==', '>', '>='].includes(relationship.comparison.operator) ||
    isTruthyRelationship(relationship)
  ) {
    return false
  }

  if (isNumeric(target) && isNumeric(relationship.comparison.rhs)) {
    switch (relationship.comparison.operator) {
      case '==':
        // relationship: formula == N (eg x == 1)
        // verify: formula > target   (eg x >= 1)
        // return: N > target   (eg 1 == 1)
        return relationship.comparison.rhs.value > target.value
      case '>=':
        // relationship: formula >= N (eg x >= 0, x >= 0.1)
        // verify: formula > target   (eg x > 0)
        // return: N > target   (eg 0 > 0)
        return relationship.comparison.rhs.value > target.value
      case '>':
        // relationship: formula > N (eg x > -1)
        // verify: formula > target   (eg x > 0)
        return relationship.comparison.rhs.value > target.value
    }
  }

  // target: 'foo' or 'foo.length' or 'foo[key]'
  if (isAssign(target)) {
    if (isEqualFormula(target, relationship.comparison.rhs)) {
      switch (relationship.comparison.operator) {
        case '==':
        case '>=':
          return false
        case '>':
          return true
      }
    }

    if (isAddition(relationship.comparison.rhs)) {
      if (
        isNumeric(relationship.comparison.rhs.lhs) &&
        !isNumeric(relationship.comparison.rhs.rhs)
      ) {
        // swap order and defer to below (non-numeric is on lhs)
        return verifyRelationshipIsLt(
          {
            formula: relationship.formula,
            comparison: {
              operator: relationship.comparison.operator,
              rhs: relationshipFormula.addition(
                relationship.comparison.rhs.rhs,
                relationship.comparison.rhs.lhs,
              ),
            },
          },
          target,
        )
      }

      if (isAssign(relationship.comparison.rhs.lhs) && isNumeric(relationship.comparison.rhs.rhs)) {
        if (!isEqualFormula(target, relationship.comparison.rhs.lhs)) {
          return false
        }

        // relationship.comparison.type: [ == >= > ]
        // relationship.comparison.rhs is an addition
        // relationship.comparison.rhs.lhs == target
        // relationship.comparison.rhs.rhs is a number
        switch (relationship.comparison.operator) {
          case '==':
          case '>=':
            // relationship: formula == target + N
            // or
            // relationship: formula >= target + N
            //
            // if relationship.comparison.rhs.rhs is > 0,
            // then the formula is less than the target
            return relationship.comparison.rhs.rhs.value > 0
          case '>':
            // relationship: formula > target + N
            // relationship: formula > length + N (eg x > length - 1)
            // verify: formula > rhs   (eg x > length)
            // return: length + N > rhs   (eg N >= 0)
            return relationship.comparison.rhs.rhs.value >= 0
        }
      }
    }
  }

  throw `TODO: verifyRelationshipIsLt(rhs is '${target.type}', formula is '${toS(relationship.formula)}')`
}

/**
 * return true if `relationship.formula` is less-than target,
 * based on relationship.formula.rght
 */
function verifyRelationshipIsLt(
  //
  relationship: AssignedRelationship,
  target: RelationshipFormula,
) {
  if (
    !['==', '<', '<='].includes(relationship.comparison.operator) ||
    isTruthyRelationship(relationship)
  ) {
    return false
  }

  if (isNumeric(target) && isNumeric(relationship.comparison.rhs)) {
    switch (relationship.comparison.operator) {
      case '==':
        // relationship: formula == N (eg x == 1)
        // verify: formula < target   (eg x <= 1)
        // return: N < target   (eg 1 == 1)
        return relationship.comparison.rhs.value < target.value
      case '<=':
        // relationship: formula <= N (eg x <= 0, x <= 0.1)
        // verify: formula < target   (eg x < 0)
        // return: N < target   (eg 0 < 0)
        return relationship.comparison.rhs.value < target.value
      case '<':
        // relationship: formula < N (eg x < -1)
        // verify: formula < target   (eg x < 0)
        return relationship.comparison.rhs.value < target.value
    }
  }

  // target: 'foo' or 'foo.length' or 'foo[key]'
  if (isAssign(target)) {
    if (isEqualFormula(target, relationship.comparison.rhs)) {
      switch (relationship.comparison.operator) {
        case '==':
        case '<=':
          return false
        case '<':
          return true
      }
    }

    if (isAddition(relationship.comparison.rhs)) {
      if (
        isNumeric(relationship.comparison.rhs.lhs) &&
        !isNumeric(relationship.comparison.rhs.rhs)
      ) {
        // swap order and defer to below (non-numeric is on lhs)
        return verifyRelationshipIsLt(
          {
            formula: relationship.formula,
            comparison: {
              operator: relationship.comparison.operator,
              rhs: relationshipFormula.addition(
                relationship.comparison.rhs.rhs,
                relationship.comparison.rhs.lhs,
              ),
            },
          },
          target,
        )
      }

      if (isAssign(relationship.comparison.rhs.lhs) && isNumeric(relationship.comparison.rhs.rhs)) {
        if (!isEqualFormula(target, relationship.comparison.rhs.lhs)) {
          return false
        }

        // relationship.comparison.type: [ == <= < ]
        // relationship.comparison.rhs is an addition
        // relationship.comparison.rhs.lhs == target
        // relationship.comparison.rhs.rhs is a number
        switch (relationship.comparison.operator) {
          case '==':
          case '<=':
            // relationship: formula == target + N
            // or
            // relationship: formula <= target + N
            //
            // if relationship.comparison.rhs.rhs is < 0,
            // then the formula is less than the target
            return relationship.comparison.rhs.rhs.value < 0
          case '<':
            // relationship: formula < target + N
            // relationship: formula < length + N (eg x < length - 1)
            // verify: formula < rhs   (eg x < length)
            // return: length + N < rhs   (eg N <= 0)
            return relationship.comparison.rhs.rhs.value <= 0
        }
      }
    }

    return false
  }

  throw `TODO: verify(formula is '${toS(relationship.formula)} ${relationship.comparison.operator} ${toS(relationship.comparison.rhs)}' <? rhs is '${target.type}')`
}

function verifyRelationshipIsLte(
  //
  relationship: AssignedRelationship,
  target: RelationshipFormula,
) {
  if (
    !['==', '<', '<='].includes(relationship.comparison.operator) ||
    isTruthyRelationship(relationship)
  ) {
    return false
  }

  if (isNumeric(target) && isNumeric(relationship.comparison.rhs)) {
    switch (relationship.comparison.operator) {
      case '==':
        // relationship: formula == N (eg x == 1)
        // verify: formula <= target   (eg x <= 1)
        // return: N <= target   (eg 1 == 1)
        return relationship.comparison.rhs.value <= target.value
      case '<=':
        // relationship: formula <= N (eg x <= 0)
        // verify: formula <= target   (eg x <= 0)
        // return: N <= target   (eg 0 <= 0)
        return relationship.comparison.rhs.value <= target.value
      case '<':
        // relationship: formula < N (eg x < -1)
        // verify: formula <= target   (eg x <= 0)
        if (isInt(target) && isInt(relationship.comparison.rhs)) {
          // relationship: formula < N (eg x < -1)
          // =<          : x <= N + 1 (eg x < 0)
          // return: N <= target - 1
          return relationship.comparison.rhs.value <= target.value - 1
        }

        return relationship.comparison.rhs.value <= target.value
    }
  }

  // target: 'foo' or 'foo.length' or 'foo[key]'
  if (isAssign(target)) {
    if (isEqualFormula(target, relationship.comparison.rhs)) {
      // relationship: [foo] [< == <=] [target]
      // query:        [foo] <= target
      return true
    }

    if (isAddition(relationship.comparison.rhs)) {
      if (
        isNumeric(relationship.comparison.rhs.lhs) &&
        !isNumeric(relationship.comparison.rhs.rhs)
      ) {
        // swap order and defer to below (non-numeric is on lhs)
        return verifyRelationshipIsGte(
          {
            formula: relationship.formula,
            comparison: {
              operator: relationship.comparison.operator,
              rhs: relationshipFormula.addition(
                relationship.comparison.rhs.rhs,
                relationship.comparison.rhs.lhs,
              ),
            },
          },
          target,
        )
      }

      if (isAssign(relationship.comparison.rhs.lhs) && isNumeric(relationship.comparison.rhs.rhs)) {
        if (!isEqualFormula(target, relationship.comparison.rhs.lhs)) {
          return false
        }

        // relationship.comparison.rhs is an addition
        // relationship.comparison.rhs.lhs == target
        // relationship.comparison.rhs.rhs is a number

        // relationship: [foo] [< == <=] [target] + relationship.comparison.rhs.rhs
        // query:        [foo] <= target
        return relationship.comparison.rhs.rhs.value <= 0
      }
    }
  }

  throw `TODO: verifyRelationshipIsGte(rhs: ${toS(target)}, formula: ${toS(relationship.formula)} ${relationship.comparison.operator} ${toS(relationship.formula)})`
}

export function isEqualFormula(lhs: RelationshipFormula, rhs: RelationshipFormula): boolean {
  if (lhs.type !== rhs.type) {
    return false
  }

  if (isLiteral(lhs) && isLiteral(rhs)) {
    return lhs.value === rhs.value
  }

  if (isNegate(lhs) && isNegate(rhs)) {
    return isEqualFormula(lhs.arg, rhs.arg)
  }

  if (isOperation(lhs) && isOperation(rhs)) {
    return isEqualFormula(lhs.lhs, rhs.lhs) && isEqualFormula(lhs.rhs, rhs.rhs)
  }

  if (lhs.type === 'reference' && rhs.type === 'reference') {
    return lhs.id === rhs.id && lhs.name === rhs.name
  }

  if (lhs.type === 'mask' && rhs.type === 'mask') {
    return lhs.prevId === rhs.prevId && lhs.nextId === rhs.nextId && lhs.name === rhs.name
  }

  if (lhs.type === 'assign' && rhs.type === 'assign') {
    // assign does store an id, but that is not part of the equality check
    // (all assigns with the same name are "occupying" the same place in the
    // runtime)
    return lhs.name === rhs.name
  }

  if (lhs.type === 'array-access' && rhs.type === 'array-access') {
    return isEqualFormula(lhs.of, rhs.of) && isEqualFormula(lhs.index, rhs.index)
  }

  if (lhs.type === 'nullable-array-access' && rhs.type === 'nullable-array-access') {
    return isEqualFormula(lhs.of, rhs.of) && isEqualFormula(lhs.index, rhs.index)
  }

  if (lhs.type === 'property-access' && rhs.type === 'property-access') {
    return isEqualFormula(lhs.of, rhs.of) && lhs.name === rhs.name
  }

  if (lhs.type === 'nullable-property-access' && rhs.type === 'nullable-property-access') {
    return isEqualFormula(lhs.of, rhs.of) && lhs.name === rhs.name
  }

  return false
}

export function isEqualRelationship(
  lhs: Relationship | AssignedRelationship,
  rhs: Relationship | AssignedRelationship,
): boolean {
  if (isOneOfRelationship(lhs) || isOneOfRelationship(rhs)) {
    if (!(isOneOfRelationship(lhs) && isOneOfRelationship(rhs))) {
      return false
    }

    if (lhs.comparison.comparisons.length !== rhs.comparison.comparisons.length) {
      return false
    }

    return lhs.comparison.comparisons.every((lhsCompare, i) =>
      isEqualRelationship(
        {formula: lhs.formula, comparison: lhsCompare} as Relationship,
        {formula: rhs.formula, comparison: rhs.comparison.comparisons[i]} as Relationship,
      ),
    )
  }

  if (lhs.comparison.operator !== rhs.comparison.operator) {
    return false
  }

  if (isTruthyComparison(lhs.comparison) || isTruthyComparison(rhs.comparison)) {
    // comparison.operator is either 'truthy' or 'falsey', with no rhs argument,
    // and we already checked for lhs-operator == rhs-operator
    return true
  }

  if (lhs.comparison.rhs instanceof Types.Type || rhs.comparison.rhs instanceof Types.Type) {
    if (lhs.comparison.rhs instanceof Types.Type && rhs.comparison.rhs instanceof Types.Type) {
      return (
        Types.canBeAssignedTo(lhs.comparison.rhs, rhs.comparison.rhs) &&
        Types.canBeAssignedTo(rhs.comparison.rhs, lhs.comparison.rhs)
      )
    }

    return false
  }

  return (
    isEqualFormula(lhs.formula, rhs.formula) &&
    isEqualFormula(lhs.comparison.rhs, rhs.comparison.rhs)
  )
}

/**
 * Looks specifically for {type: 'reference'}. It will look inside array-access and
 * property-access (ie foo[0] / foo.prop) and return the value that is being
 * accessed (foo). All other values return undefined.
 */
export function findEventualRef(lhs: RelationshipAssign): RelationshipReference
export function findEventualRef(lhs: RelationshipFormula): RelationshipReference | undefined
export function findEventualRef(lhs: RelationshipFormula): RelationshipReference | undefined {
  if (lhs.type === 'reference') {
    return lhs
  }

  if (
    lhs.type === 'array-access' ||
    lhs.type === 'property-access' ||
    lhs.type === 'nullable-array-access' ||
    lhs.type === 'nullable-property-access'
  ) {
    return findEventualRef(lhs.of)
  }

  return
}

/**
 * Recusively checks RelationshipAssign types, to make sure that at the "top" of
 * the assignable there is a reference. The actual value is ignored, and the
 * original formula is returned. This is just an array (flatMap) wrapper of
 * `findEventualRef`.
 */
function _assignables(
  relationship: MathRelationship,
): [RelationshipAssign, RelationshipMathSymbol, RelationshipFormula][] {
  const {
    formula,
    comparison: {operator, rhs},
  } = relationship
  const ref = findEventualRef(formula)
  if (ref) {
    return [[formula as RelationshipAssign, operator, rhs]]
  }

  return []
}

function isInvalidRefs(lhs: RelationshipFormula, rhs: RelationshipFormula) {
  if (isLiteral(lhs) && isLiteral(rhs)) {
    return true
  }

  const foundRefs = new Set<string>()
  const lhsRefs = findRefs(lhs)
  const rhsRefs = findRefs(rhs)
  for (const {id} of lhsRefs.concat(rhsRefs)) {
    if (foundRefs.has(id)) {
      return true
    }
    foundRefs.add(id)
  }

  return false
}

export function findRefs(lhs: RelationshipFormula): RelationshipReference[] {
  switch (lhs.type) {
    case 'reference':
      return [lhs]
    case 'array-access':
    case 'nullable-array-access':
      return findRefs(lhs.of).concat(findRefs(lhs.index))
    case 'property-access':
    case 'nullable-property-access':
      return findRefs(lhs.of)
    case 'addition':
    case 'string-concat':
    case 'array-concat':
      return findRefs(lhs.lhs).concat(findRefs(lhs.rhs))
    case 'negate':
      return findRefs(lhs.arg)
    case 'instanceof':
    case 'null':
    case 'boolean':
    case 'int':
    case 'float':
    case 'string':
    case 'assign':
    case 'mask':
      return []
  }
}
