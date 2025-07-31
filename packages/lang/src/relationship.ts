import {ok} from '@extra-lang/result'
import {MutableTypeRuntime, type TypeRuntime} from './runtime'
import * as Types from './types'
import {type NarrowedInt, type NarrowedFloat, type NarrowedString} from './narrowed'

export type RelationshipComparisonSymbol = '==' | '!=' | '>' | '>=' | '<' | '<='
export type RelationshipMathComparison = {
  operator: RelationshipComparisonSymbol
  rhs: RelationshipFormula
}
export type RelationshipTypeSymbol = 'instanceof' | '!instanceof'
export type RelationshipTypeComparison = {
  operator: RelationshipTypeSymbol
  rhs: Types.Type
}

export type RelationshipNull = {type: 'null'; value: null}
export type RelationshipBoolean = {type: 'boolean'; value: boolean}
export type RelationshipInt = {type: 'int'; value: number}
export type RelationshipFloat = {type: 'float'; value: number}
export type RelationshipNumeric = RelationshipInt | RelationshipFloat
export type RelationshipString = {type: 'string'; value: string}
export type RelationshipLiteral =
  | RelationshipNull
  | RelationshipBoolean
  | RelationshipString
  | RelationshipNumeric

export type RelationshipNegate = {type: 'negate'; arg: RelationshipFormula}
export type RelationshipAddition = {
  type: 'addition'
  lhs: RelationshipFormula
  rhs: RelationshipFormula
}
export type RelationshipStringConcat = {
  type: 'string-concat'
  lhs: RelationshipFormula
  rhs: RelationshipFormula
}
export type RelationshipArrayConcat = {
  type: 'array-concat'
  lhs: RelationshipFormula
  rhs: RelationshipFormula
}

export type RelationshipType = {type: 'instanceof'; value: Types.Type}
export type RelationshipOperation =
  | RelationshipNegate
  | RelationshipAddition
  | RelationshipStringConcat
  | RelationshipArrayConcat

export type RelationshipReference = {type: 'reference'; name: string; id: string}
export type RelationshipReferenceAssign = {type: 'assign'; name: string}
export type RelationshipAssign =
  | RelationshipReference
  | RelationshipReferenceAssign
  | {type: 'array-access'; of: RelationshipFormula; index: RelationshipFormula}
  | {type: 'nullable-array-access'; of: RelationshipFormula; index: RelationshipFormula}
  | {type: 'property-access'; of: RelationshipFormula; name: string}
  | {type: 'nullable-property-access'; of: RelationshipFormula; name: string}

export type RelationshipFormula =
  | RelationshipLiteral
  | RelationshipAssign
  | RelationshipOperation
  | RelationshipType

export type MathRelationship = {
  formula: RelationshipFormula
  comparison: RelationshipMathComparison
}

export type TypeRelationship = {
  formula: RelationshipFormula
  comparison: RelationshipTypeComparison
}

export type Relationship = MathRelationship | TypeRelationship

export type AssignedRelationship = {
  formula: RelationshipAssign
  comparison: RelationshipMathComparison
}

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
    return {type: 'assign', name}
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
  toString(rel: RelationshipFormula | Relationship): string {
    if (isRelationship(rel)) {
      switch (rel.comparison.operator) {
        case 'instanceof':
        case '!instanceof': {
          let op: string
          if (rel.comparison.operator === 'instanceof') {
            op = 'is'
          } else {
            op = '!is'
          }
          return `${this.toString(rel.formula)} ${op} ${rel.comparison.rhs}`
        }
        default: {
          let op: string = rel.comparison.operator
          return `${this.toString(rel.formula)} ${op} ${this.toString(rel.comparison.rhs)}`
        }
      }
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
    if (rel.type === 'reference' || rel.type === 'assign') {
      return rel.name
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

function toS(rel: RelationshipFormula | Relationship): string {
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
    assignNextRuntime(nextRuntime, relationship, asserting)
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
  nextRuntime: MutableTypeRuntime,
  relationship: Relationship,
  asserting: boolean,
) {
  if (isTypeRelationship(relationship)) {
    assignNextTypeRuntime(nextRuntime, relationship)
    return
  }

  if (isMathRelationship(relationship)) {
    let {
      formula: lhs,
      comparison: {operator: lhsComparison, rhs},
    } = relationship
    lhs = normalize(lhs)
    rhs = normalize(rhs)

    for (const [assignable, comparison, formula] of assignables(lhs, lhsComparison, rhs)) {
      const prevType = runtimeLookup(nextRuntime, assignable)
      if (!prevType) {
        continue
      }

      let nextType: Types.Type
      if (prevType instanceof Types.OneOfType) {
        const nextTypes: Types.Type[] = []
        for (const oneOfType of prevType.of) {
          const mergedType = mergeAssignableType(oneOfType, comparison, formula)
          if (mergedType === Types.NeverType) {
            if (!asserting) {
              console.log(`merging ${oneOfType}: ${comparison} ${toS(formula)} => ?`)
              nextTypes.push(oneOfType)
            }
          } else {
            console.log(`merging ${oneOfType}: ${comparison} ${toS(formula)} => ${mergedType}`)
            nextTypes.push(mergedType)
          }
        }

        if (nextTypes.every((type, index) => type === prevType.of[index])) {
          nextType = prevType
        } else {
          nextType = Types.oneOf(nextTypes)
        }
      } else {
        nextType = mergeAssignableType(prevType, comparison, formula)
      }

      if (nextType !== prevType) {
        replaceType(nextRuntime, assignable, nextType)
      }
    }

    relationshipDeducer(nextRuntime, lhs, lhsComparison, rhs)
  }

  return
}

function assignNextTypeRuntime(
  nextRuntime: MutableTypeRuntime,
  {formula, comparison: {rhs}}: TypeRelationship,
) {
  if (!isAssign(formula)) {
    return
  }

  // I moved the 'narrowTypeIs' calculation to the call site that creates the
  // comparison: {operator: 'instanceof'}, because the Type was already
  // calculated there. So this is no longer needed... probably.
  // TODO: remove this comment:
  //
  // const prevType = runtimeLookup(nextRuntime, formula)
  // if (!prevType) {
  //   return
  // }
  // let nextType: Types.Type
  // if (type === 'instanceof') {
  //   nextType = Types.narrowTypeIs(prevType, rhs)
  // } else if (type === '!instanceof') {
  //   nextType = Types.narrowTypeIsNot(prevType, rhs)
  // } else {
  //   nextType = Types.NeverType
  // }
  // if (nextType !== prevType) {
  //   replaceType(nextRuntime, formula, nextType)
  // }
  replaceType(nextRuntime, formula, rhs)

  return
}

/**
 * Return new relationships that are an OR combination of the two relationships.
 *
 * Two? This isn't guaranteed from the call site, but *should* be the case.
 */
export function combineOrRelationships(relationships: Relationship[]): Relationship[] {
  if (relationships.length === 0) {
    return []
  }

  if (relationships.length === 1) {
    return [relationships[0]]
  }

  if (relationships.length > 2) {
    // We have a bunch of relationships on the same thing; this happens often,
    // for instance `foo > 0 or foo < 0` will have the relationships:
    //     foo instanceof Int(>=1)
    //     foo > 0
    //     foo instanceof Int(<=1)
    //     foo < 1
    // We combine every permutation (N**2, eesh).
    if (relationships.length > 8) {
      throw 'Wow that is a lot of permutations, are we sure about this?'
    }

    const combined: Relationship[] = []
    for (let i = 0; i < relationships.length; i++) {
      for (let j = i + 1; j < relationships.length; j++) {
        combined.push(...combineOrRelationships([relationships[i], relationships[j]]))
      }
    }

    return combined
  }

  const [lhs, rhs] = relationships
  if (!isEqualFormula(lhs.formula, rhs.formula)) {
    return []
  }

  if (isTypeRelationship(lhs) && isTypeRelationship(rhs)) {
    if (lhs.comparison.operator === 'instanceof' && rhs.comparison.operator === 'instanceof') {
      return [
        {
          formula: lhs.formula,
          comparison: {
            operator: 'instanceof',
            rhs: Types.compatibleWithBothTypes(lhs.comparison.rhs, rhs.comparison.rhs),
          },
        },
      ]
    } else if (
      lhs.comparison.operator === '!instanceof' &&
      rhs.comparison.operator === '!instanceof'
    ) {
      // yeah I don't *think* there is anything to do here... unless
      // the types are *the same type*. Or overlap? oh yeah if they overlap,
      // like
      //     foo: Int
      //     foo is Int(<=10) or foo is Int(<=9)
      //     --> foo: Int(<=9)
      // TODO: find the overlap of the two types in combineOrRelationships
    }
  } else if (isMathRelationship(lhs) && isMathRelationship(rhs)) {
    const firstRhs = lhs.comparison.rhs
    const secondRhs = rhs.comparison.rhs
    if (!isEqualFormula(firstRhs, secondRhs)) {
      return []
    }

    if (relationshipsAreGt(relationships)) {
      return [{formula: lhs.formula, comparison: {operator: '>=', rhs: lhs.comparison.rhs}}]
    }

    if (relationshipsAreGte(relationships)) {
      return [{formula: lhs.formula, comparison: {operator: '>=', rhs: lhs.comparison.rhs}}]
    }

    if (relationshipsAreLt(relationships)) {
      return [{formula: lhs.formula, comparison: {operator: '<=', rhs: lhs.comparison.rhs}}]
    }

    if (relationshipsAreLte(relationships)) {
      return [{formula: lhs.formula, comparison: {operator: '<=', rhs: lhs.comparison.rhs}}]
    }

    if (relationshipsAreNe(relationships)) {
      return [{formula: lhs.formula, comparison: {operator: '!=', rhs: lhs.comparison.rhs}}]
    }
  }

  return []
}

/**
 * Does this need to include ArrayType-length and Int-length, etc?
 */
function relationshipToType(
  runtime: TypeRuntime,
  index: RelationshipFormula,
): Types.Type | undefined {
  if (isAssign(index)) {
    return runtimeLookup(runtime, index)
  }

  if (isLiteral(index)) {
    if (index.type === 'null') {
      return Types.NullType
    }
    return Types.literal(index.value)
  }

  if (index.type === 'string-concat') {
    const {lhs, rhs} = index
    const lhsType = relationshipToType(runtime, lhs)
    const rhsType = relationshipToType(runtime, rhs)
    if (!lhsType?.isString() || !rhsType?.isString()) {
      return
    }
    return Types.stringConcatenationType(lhsType, rhsType)
  }

  if (index.type === 'array-concat') {
    const {lhs, rhs} = index
    const lhsType = relationshipToType(runtime, lhs)
    const rhsType = relationshipToType(runtime, rhs)
    if (!lhsType || !rhsType) {
      return
    }
    return Types.array(Types.oneOf([lhsType, rhsType]))
  }

  if (index.type === 'negate') {
    const type = relationshipToType(runtime, index.arg)
    if (!type?.isFloat()) {
      return
    }
    return Types.numericSubtractionType(
      type.isInt() ? Types.int({min: 0, max: 0}) : Types.float({min: 0, max: 0}),
      type,
    )
  }

  if (index.type === 'addition') {
    const {lhs, rhs} = index
    const lhsType = relationshipToType(runtime, lhs)
    const rhsType = relationshipToType(runtime, rhs)
    if (!lhsType?.isFloat() || !rhsType?.isFloat()) {
      return
    }
    return Types.numericAdditionType(lhsType, rhsType)
  }
}

function runtimeLookup(
  runtime: TypeRuntime,
  assignable: RelationshipAssign,
): Types.Type | undefined {
  if (assignable.type === 'reference') {
    return runtime.getTypeById(assignable.id)
  }

  if (assignable.type === 'array-access' || assignable.type === 'nullable-array-access') {
    if (!isAssign(assignable.of)) {
      return
    }

    const lhsType = runtimeLookup(runtime, assignable.of)
    const indexType = relationshipToType(runtime, assignable.index)
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

    const type = runtimeLookup(runtime, assignable.of)
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
  comparison: RelationshipComparisonSymbol,
  formula: RelationshipFormula,
): Types.Type {
  if (!isLiteral(formula)) {
    // throw `todo: formula is ${formula.type}`
    return prevType
  }

  if (prevType === Types.NeverType) {
    return Types.NeverType
  }

  if (prevType.isBoolean()) {
    return mergeAssignableTypeBoolean(prevType, comparison, formula)
  }

  if (prevType.isInt()) {
    return mergeAssignableTypeInt(prevType, comparison, formula)
  }

  if (prevType.isFloat()) {
    return mergeAssignableTypeFloat(prevType, comparison, formula)
  }

  if (prevType.isString()) {
    console.log('=========== relationship.ts at line 564 ===========')
    console.log({prevType, comparison, formula})
    return mergeAssignableTypeString(prevType, comparison, formula)
  }

  if (prevType.isNull()) {
    return mergeAssignableTypeNull(prevType, comparison, formula)
  }

  if (prevType.isRange()) {
    return mergeAssignableTypeRange(prevType, comparison, formula)
  }

  throw `TODO - do something with ${prevType} in mergeAssignableType (or ignore?)`
  return prevType
}

function assignables(
  lhs: RelationshipFormula,
  lhsComparison: RelationshipComparisonSymbol,
  rhs: RelationshipFormula,
): [RelationshipAssign, RelationshipComparisonSymbol, RelationshipFormula][] {
  if (isInvalidRefs(lhs, rhs)) {
    return []
  }

  let rhsComparison: RelationshipComparisonSymbol
  switch (lhsComparison) {
    case '==':
    case '!=':
      rhsComparison = lhsComparison
      break
    case '>':
      rhsComparison = '<'
      break
    case '>=':
      rhsComparison = '<='
      break
    case '<':
      rhsComparison = '>'
      break
    case '<=':
      rhsComparison = '>='
      break
  }

  return _assignables(lhs, lhsComparison, rhs).concat(_assignables(rhs, rhsComparison, lhs))
}

/**
 * prevType: type of the lhs, in this case NullType
 * comparison: == != < > etc
 * literal: always a literal, but could be string, int, etc
 */
function mergeAssignableTypeNull(
  // prevType is LiteralTrueType | LiteralFalseType | BooleanType
  prevType: Types.Type,
  comparison: RelationshipComparisonSymbol,
  literal: RelationshipLiteral,
): Types.Type {
  if (literal.type !== 'null') {
    if (comparison === '!=') {
      return prevType
    }

    return Types.NeverType
  }

  if (comparison === '==') {
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
  // prevType is LiteralTrueType | LiteralFalseType | BooleanType
  prevType: Types.Type,
  comparison: RelationshipComparisonSymbol,
  literal: RelationshipLiteral,
): Types.Type {
  if (!isBoolean(literal)) {
    if (comparison === '!=') {
      // TODO: this is always true/redundant
      return prevType
    }

    return Types.NeverType
  }

  switch (comparison) {
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
  comparison: RelationshipComparisonSymbol,
  literal: RelationshipLiteral,
): Types.Type {
  const numberType = prevType.toNumberType()
  const mergedType = mergeAssignableType(numberType, comparison, literal)
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
  comparison: RelationshipComparisonSymbol,
  literal: RelationshipLiteral,
): Types.Type {
  if (!isNumeric(literal)) {
    if (comparison === '!=') {
      // TODO: this is always true/redundant
      return prevType
    }

    return Types.NeverType
  }

  switch (comparison) {
    case '==':
      if (prevType instanceof Types.LiteralIntType) {
        if (isTrueNumericComparison(prevType.value, comparison, literal.value)) {
          // TODO: this is always true/redundant
          return prevType
        }
      } else if (prevType instanceof Types.MetaIntType) {
        // check for an int or integral-float - if the comparison is true,
        // the prevType will be that a literal of that value
        if (
          literal.type === 'int' ||
          (literal.type === 'float' && Number.isInteger(literal.value))
        ) {
          if (isOutsideOfNarrowedNumeric(prevType.narrowed, literal.value)) {
            return Types.NeverType
          }

          return Types.literal(literal.value)
        }
      } else {
        // unreachable
      }

      return Types.NeverType
    case '!=':
      if (prevType instanceof Types.LiteralIntType) {
        // the only check we need to do is if the literal value equals the comparison, we
        // can return 'never'. Otherwise it's always true.
        if (literal.value === prevType.value) {
          return Types.NeverType
        }

        // the != comparison will always be true, and the prevType will not change
        // TODO: this is always true/redundant
        return prevType
      } else if (prevType instanceof Types.MetaIntType) {
        // MetaIntType - maybe we can adjust the range?
        // (this same comparison won't work w/ Floats)

        // If literal.value == narrowed.min, then in the 'true' branch of this comparison
        // the value of the int will be _higher_ than narrowed.min.
        //     x: Int(>=5)
        //     x != 5 => x >= 6
        // Similarly, if the value matches narrowed.max, then in the 'true' branch of this
        // comparison the value of the int will be _lower_ than narrowed.max.
        let nextType = prevType

        if (literal.value === nextType.narrowed.min) {
          const narrowedType = nextType.narrow(nextType.narrowed.min + 1, nextType.narrowed.max)
          if (narrowedType instanceof Types.MetaIntType) {
            nextType = narrowedType
          } else {
            // NeverType | LiteralIntType
            return narrowedType
          }
        }

        if (literal.value === nextType.narrowed.max) {
          const narrowedType = nextType.narrow(nextType.narrowed.min, nextType.narrowed.max - 1)
          if (narrowedType instanceof Types.MetaIntType) {
            nextType = narrowedType
          } else {
            // NeverType | LiteralIntType
            return narrowedType
          }
        }

        return nextType
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
      } else if (comparison === '<=' || comparison === '>') {
        literalValue = Math.floor(literal.value)
      } else {
        // '>' | '>='
        literalValue = Math.ceil(literal.value)
      }

      if (prevType instanceof Types.LiteralIntType) {
        // TODO: the true case is always true/redundant
        return isTrueNumericComparison(prevType.value, comparison, literal.value)
          ? prevType
          : Types.NeverType
      } else if (prevType instanceof Types.MetaIntType) {
        let nextNarrowed: NarrowedInt
        switch (comparison) {
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
  comparison: RelationshipComparisonSymbol,
  literal: RelationshipLiteral,
): Types.Type {
  if (!isNumeric(literal)) {
    if (comparison === '!=') {
      // TODO: this is always true/redundant
      return prevType
    }

    return Types.NeverType
  }

  switch (comparison) {
    case '==':
      if (prevType instanceof Types.LiteralFloatType) {
        if (isTrueNumericComparison(prevType.value, comparison, literal.value)) {
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
        return isTrueNumericComparison(prevType.value, comparison, literal.value)
          ? prevType
          : Types.NeverType
      } else if (prevType instanceof Types.MetaFloatType) {
        // need to compare the min and max values of prevType.narrowed and
        // adjust the narrowed range accordingly
        let nextNarrowed: NarrowedFloat
        switch (comparison) {
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
  comparison: RelationshipComparisonSymbol,
  literal: RelationshipLiteral,
): Types.Type {
  if (!isString(literal)) {
    if (comparison === '!=') {
      // TODO: this is always true/redundant
      return prevType
    }

    return Types.NeverType
  }

  switch (comparison) {
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

function isTrueNumericComparison(
  lhs: number,
  comparison: RelationshipComparisonSymbol,
  rhs: number,
) {
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
  lhs: RelationshipFormula,
  lhsComparison: RelationshipComparisonSymbol,
  rhs: RelationshipFormula,
) {
  _relationshipDeducer(mutableRuntime, lhs, lhsComparison, rhs, new Set())
}

function _relationshipDeducer(
  mutableRuntime: MutableTypeRuntime,
  lhs: RelationshipFormula,
  lhsComparison: RelationshipComparisonSymbol,
  rhs: RelationshipFormula,
  visited: Set<string | AssignedRelationship>,
) {
  const newRelationships = simplifyRelationships({
    formula: lhs,
    comparison: {
      operator: lhsComparison,
      rhs: rhs,
    },
  })
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
      mutableRuntime.addRelationshipFormula(
        newRelationship.formula,
        newRelationship.comparison.operator,
        newRelationship.comparison.rhs,
      )
    }
  }

  for (const {
    formula,
    comparison: {operator: type, rhs},
  } of nextRelationships) {
    _relationshipDeducer(mutableRuntime, formula, type, rhs, visited)
  }
}

function _relationshipSearch(runtime: MutableTypeRuntime, formula: RelationshipFormula) {
  const refs = findRefs(formula)
  return refs.flatMap(ref => runtime.getRelationships(ref.id))
}

/**
 * Early days, and this function is complicated, so I'm just building it out
 * piece-by-piece until - hopefully - some overarching pattern emerges.
 *
 * Both arguments (prevRelationship, newRelationship) are guaranteed to be
 * normalized via simplifyRelationships, and "point to" the same thing
 * (relationship.formula is the same reference).
 */
function handleRelationship(
  mutableRuntime: MutableTypeRuntime,
  prevRelationship: AssignedRelationship,
  newRelationship: AssignedRelationship,
) {
  const assertRef1 = findEventualRef(prevRelationship.formula)
  const assertRef2 = findEventualRef(newRelationship.formula)
  if (assertRef1.id !== assertRef2.id) {
    throw `handleRelationship() - unexpected: ${assertRef1.id} !== ${assertRef2.id}`
  }

  if (prevRelationship.comparison.operator === '==') {
    //|
    //|  a == b
    //|  b ? c
    //|
    const updatedRelationships = simplifyRelationships({
      formula: prevRelationship.comparison.rhs,
      comparison: {
        operator: newRelationship.comparison.operator,
        rhs: newRelationship.comparison.rhs,
      },
    })
    for (const relationship of updatedRelationships) {
      const prevType = runtimeLookup(mutableRuntime, relationship.formula)
      if (!prevType) {
        continue
      }

      const nextType = mergeAssignableType(
        prevType,
        relationship.comparison.operator,
        relationship.comparison.rhs,
      )
      if (nextType !== prevType) {
        replaceType(mutableRuntime, relationship.formula, nextType)
      }
    }

    return updatedRelationships
  } else if (newRelationship.comparison.operator === '==') {
    // type needs to be "turned around" because prevRelationship.formula
    // is on the left of prevRelationship.symbol, and prevRelationship.formula
    // equals newRelationship.formula
    let type: RelationshipComparisonSymbol = reverseComparison(prevRelationship.comparison.operator)
    return handleComparisonRelationship(mutableRuntime, prevRelationship, newRelationship, type)
  } else if (
    (prevRelationship.comparison.operator === '<' ||
      prevRelationship.comparison.operator === '<=') &&
    (newRelationship.comparison.operator === '>' || newRelationship.comparison.operator === '>=')
  ) {
    //|
    //|  b < a  ,  b <= a  =>  a > b  ,  a >= b  =>  a > c  ,  a >= c
    //|  b > c  ,  b >= c      b > c  ,  b >= c
    //|
    const type =
      prevRelationship.comparison.operator === '<=' && newRelationship.comparison.operator === '>='
        ? '>='
        : '>'
    return handleComparisonRelationship(mutableRuntime, prevRelationship, newRelationship, type)
  } else if (
    (prevRelationship.comparison.operator === '>' ||
      prevRelationship.comparison.operator === '>=') &&
    (newRelationship.comparison.operator === '<' || newRelationship.comparison.operator === '<=')
  ) {
    //|
    //|  b > a  ,  b >= a  =>  a < b  ,  a <= b  =>  a < c  ,  a <= c
    //|  b < c  ,  b <= c      b < c  ,  b <= c
    //|
    const type =
      prevRelationship.comparison.operator === '>=' && newRelationship.comparison.operator === '<='
        ? '<='
        : '<'
    return handleComparisonRelationship(mutableRuntime, prevRelationship, newRelationship, type)
  } else {
    return []
  }
}

function handleComparisonRelationship(
  mutableRuntime: MutableTypeRuntime,
  prevRelationship: AssignedRelationship,
  newRelationship: AssignedRelationship,
  type: RelationshipComparisonSymbol,
) {
  const updatedRelationships = simplifyRelationships({
    formula: prevRelationship.comparison.rhs,
    comparison: {operator: type, rhs: newRelationship.comparison.rhs},
  })
  for (const relationship of updatedRelationships) {
    const prevType = runtimeLookup(mutableRuntime, relationship.formula)
    if (!prevType) {
      continue
    }

    const nextType = mergeAssignableType(
      prevType,
      relationship.comparison.operator,
      relationship.comparison.rhs,
    )
    if (nextType !== prevType) {
      replaceType(mutableRuntime, relationship.formula, nextType)
    }

    if (isAssign(relationship.formula)) {
      mutableRuntime.addRelationshipFormula(
        relationship.formula,
        relationship.comparison.operator,
        relationship.comparison.rhs,
      )
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

    const type = runtimeLookup(mutableRuntime, assignable.of)
    if (!type) {
      return
    }

    const nextAssignableType = type.replacingProp(assignable.index.value, nextType)
    if (nextAssignableType.isErr()) {
      throw `todo - error assigning ${assignable.type} type '${assignable.index.value}' to '${nextType}': ${nextAssignableType.error}`
    }

    return replaceType(mutableRuntime, assignable.of, nextAssignableType.get())
  }

  if (assignable.type === 'property-access' || assignable.type === 'nullable-property-access') {
    if (!isAssign(assignable.of)) {
      return
    }

    const type = runtimeLookup(mutableRuntime, assignable.of)
    if (!type) {
      return
    }

    const nextAssignableType = type.replacingProp(assignable.name, nextType)
    if (nextAssignableType.isErr()) {
      throw `todo - error assigning ${assignable.type} type '${assignable.name}' to '${nextType}': ${nextAssignableType.error}`
    }

    return replaceType(mutableRuntime, assignable.of, nextAssignableType.get())
  }

  if ('id' in assignable) {
    return mutableRuntime.replaceTypeById(assignable.id, nextType)
  } else {
    return mutableRuntime.addLocalType(assignable.name, nextType)
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
export function simplifyRelationships(relationship: MathRelationship): AssignedRelationship[] {
  const lhsRelationships = _simplifyRelationships(relationship)
  const rhsRelationships = _simplifyRelationships({
    formula: relationship.comparison.rhs,
    comparison: {
      operator: reverseComparison(relationship.comparison.operator),
      rhs: relationship.formula,
    },
  })
  return lhsRelationships.concat(rhsRelationships)
}

function _simplifyRelationships(relationship: MathRelationship): AssignedRelationship[] {
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
        operator: reverseComparison(symbol),
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

function addNumerics(lhs: RelationshipNumeric, rhs: RelationshipNumeric) {
  if (isInt(lhs) && isInt(rhs)) {
    return relationshipFormula.int(lhs.value + rhs.value)
  }

  return relationshipFormula.float(lhs.value + rhs.value)
}

function relationshipsAreGt(relationships: Relationship[]) {
  return relationships.every(r => relationshipIsGt(r))
}

function relationshipsAreGte(relationships: Relationship[]) {
  if (relationships.every(relationshipIsGte)) {
    return true
  }

  return (
    relationships.some(r => relationshipIsGt(r) || relationshipIsGte(r)) &&
    relationships.some(relationshipIsEq)
  )
}

function relationshipsAreLt(relationships: Relationship[]) {
  return relationships.every(r => relationshipIsLt(r))
}

function relationshipsAreLte(relationships: Relationship[]) {
  if (relationships.every(relationshipIsLte)) {
    return true
  }

  return (
    relationships.some(r => relationshipIsLt(r) || relationshipIsLte(r)) &&
    relationships.some(relationshipIsEq)
  )
}

function relationshipsAreNe(relationships: Relationship[]) {
  return relationships.some(relationshipIsLt) && relationships.some(relationshipIsGt)
}

function relationshipIsEq(relationship: Relationship) {
  return relationship.comparison.operator === '=='
}
// function relationshipIsNe(relationship: Relationship) {
//   return relationship.comparison.operator === '!='
// }
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
export function reverseComparison(
  comparison: RelationshipComparisonSymbol,
): RelationshipComparisonSymbol {
  switch (comparison) {
    case '==':
    case '!=':
      return comparison
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

/**
 * Changes `a <op> b` to `a <!op> b` (_inverts_ the operation, keeping the order).
 */
export function invertComparison(
  comparison: RelationshipComparisonSymbol,
): RelationshipComparisonSymbol {
  switch (comparison) {
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

function isReference(formula: RelationshipFormula): formula is RelationshipReference {
  return formula.type === 'reference'
}

function isAssign(formula: RelationshipFormula): formula is RelationshipAssign {
  return (
    isReference(formula) ||
    formula.type === 'array-access' ||
    formula.type === 'property-access' ||
    formula.type === 'nullable-array-access' ||
    formula.type === 'nullable-property-access'
  )
}

function isTypeRelationship(relationship: Relationship): relationship is TypeRelationship {
  return (
    relationship.comparison.operator === 'instanceof' ||
    relationship.comparison.operator === '!instanceof'
  )
}

function isMathRelationship(relationship: Relationship): relationship is MathRelationship {
  return !isTypeRelationship(relationship)
}

function isRelationship(formula: Relationship | RelationshipFormula): formula is Relationship {
  return 'formula' in formula && 'comparison' in formula
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

export function verifyRelationship(
  formula: RelationshipFormula,
  comparison: RelationshipComparisonSymbol,
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
        throw `TODO - implement '${comparison}' in verifyRelationship`
    }
  })
}

function verifyRelationshipIsEq(
  //
  relationship: AssignedRelationship,
  target: RelationshipFormula,
) {
  if (!['=='].includes(relationship.comparison.operator)) {
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

  throw `TODO - verifyRelationshipIsEq(rhs: ${toS(target)}, formula: ${toS(relationship.formula)} ${relationship.comparison.operator} ${toS(relationship.formula)})`
}

function verifyRelationshipIsGte(
  //
  relationship: AssignedRelationship,
  target: RelationshipFormula,
) {
  if (!['==', '>', '>='].includes(relationship.comparison.operator)) {
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

  throw `TODO - verifyRelationshipIsGte(rhs: ${toS(target)}, formula: ${toS(relationship.formula)} ${relationship.comparison.operator} ${toS(relationship.formula)})`
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
  if (!['==', '>', '>='].includes(relationship.comparison.operator)) {
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

  throw `TODO - verifyRelationshipIsLt(rhs is '${target.type}', formula is '${toS(relationship.formula)}')`
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
  if (!['==', '<', '<='].includes(relationship.comparison.operator)) {
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

  throw `TODO - verify(formula is '${toS(relationship.formula)} ${relationship.comparison.operator} ${toS(relationship.comparison.rhs)}' <? rhs is '${target.type}')`
}

function verifyRelationshipIsLte(
  //
  relationship: AssignedRelationship,
  target: RelationshipFormula,
) {
  if (!['==', '<', '<='].includes(relationship.comparison.operator)) {
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

  throw `TODO - verifyRelationshipIsGte(rhs: ${toS(target)}, formula: ${toS(relationship.formula)} ${relationship.comparison.operator} ${toS(relationship.formula)})`
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

  if (isReference(lhs) && isReference(rhs)) {
    return lhs.id === rhs.id && lhs.name === rhs.name
  }

  if (lhs.type === 'assign' && rhs.type === 'assign') {
    // assign is a reference with a name
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

export function isEqualRelationship(lhs: Relationship, rhs: Relationship) {
  if (lhs.comparison.operator !== rhs.comparison.operator) {
    return false
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
 * Helper that adds information based on the type about "truthy" types.
 */
export function formulaToTrueStuff(formula: RelationshipFormula, type: Types.Type): Relationship[] {
  if (type instanceof Types.OneOfType) {
    // throw 'TODO: OneOfType in formulaToTrueStuff'
    const rels = type.of.flatMap(type => formulaToTrueStuff(formula, type))
    console.log('=========== relationship.ts at line 2256 ===========')
    console.log({rels})
    return rels
  }

  if (type.isFloat()) {
    return [{formula, comparison: {operator: '!=', rhs: relationshipFormula.int(0)}}]
  }

  if (
    type.isString() ||
    type instanceof Types.ArrayType ||
    type instanceof Types.DictType ||
    type instanceof Types.SetType
  ) {
    return [
      {
        formula: relationshipFormula.propertyAccess(formula, 'length'),
        comparison: {operator: '>', rhs: relationshipFormula.int(0)},
      },
    ]
  }

  return []
}

export function formulaToFalseStuff(
  formula: RelationshipFormula,
  type: Types.Type,
): Relationship[] {
  if (type instanceof Types.OneOfType) {
    //     -- foo: Int | String
    //     if (not foo) --> implies... no implications here
    //     -- foo: Array(Int) | Array(String)
    //     if (not foo) --> implies...
    // hmm,
    // throw `TODO: OneOfType (${formula} : ${type}) in formulaToFalseStuff`
    return type.of.flatMap(type => formulaToFalseStuff(formula, type))
  }

  if (type.isFloat()) {
    return [{formula, comparison: {operator: '==', rhs: relationshipFormula.int(0)}}]
  }

  if (
    type.isString() ||
    type instanceof Types.ArrayType ||
    type instanceof Types.DictType ||
    type instanceof Types.SetType
  ) {
    return [
      {
        formula: relationshipFormula.propertyAccess(formula, 'length'),
        comparison: {operator: '==', rhs: relationshipFormula.int(0)},
      },
    ]
  }

  return []
}

/**
 * Recusively checks RelationshipAssign types, to make sure that at the "top" of
 * the assignable there is a reference. The actual value is ignored, and the
 * original formula is returned. This is just an array (flatMap) wrapper of
 * `findEventualRef`.
 */
function _assignables(
  formula: RelationshipFormula,
  comparison: RelationshipComparisonSymbol,
  rhs: RelationshipFormula,
): [RelationshipAssign, RelationshipComparisonSymbol, RelationshipFormula][] {
  const ref = findEventualRef(formula)
  if (ref) {
    return [[formula as RelationshipAssign, comparison, rhs]]
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
      return []
  }
}
