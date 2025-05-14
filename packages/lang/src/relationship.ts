import {ok} from '@extra-lang/result'
import {MutableTypeRuntime, type TypeRuntime} from '~/runtime'
import * as Types from '~/types'
import {type NarrowedInt, type NarrowedFloat, type NarrowedString} from '~/narrowed'
import {type GetRuntimeResult} from '~/formulaParser/types'

export type RelationshipComparison = '==' | '!=' | '>' | '>=' | '<' | '<='

export type RelationshipNull = {type: 'null'; value: null}
export type RelationshipBoolean = {type: 'boolean'; value: boolean}
export type RelationshipNumeric = {type: 'int'; value: number} | {type: 'float'; value: number}
export type RelationshipString = {type: 'string'; value: string}
export type RelationshipLiteral =
  | RelationshipNull
  | RelationshipBoolean
  | RelationshipString
  | RelationshipNumeric

export type RelationshipOperation =
  | {type: 'addition'; lhs: RelationshipFormula; rhs: RelationshipFormula}
  | {type: 'negate'; arg: RelationshipFormula}
  | {type: 'string-concat'; lhs: RelationshipFormula; rhs: RelationshipFormula}
  | {type: 'array-concat'; lhs: RelationshipFormula; rhs: RelationshipFormula}

export type RelationshipReference = {type: 'reference'; name: string; id: string}
export type RelationshipAssign =
  | RelationshipReference
  | {type: 'array-access'; of: RelationshipFormula; index: RelationshipFormula}
  | {type: 'property-access'; of: RelationshipFormula; name: string}

export type RelationshipFormula = RelationshipLiteral | RelationshipAssign | RelationshipOperation

export type Relationship = {
  type: RelationshipComparison
  left: RelationshipFormula
  right: RelationshipFormula
}

export const relationshipFormula = {
  null(): RelationshipLiteral {
    return {type: 'null', value: null}
  },
  boolean(value: boolean): RelationshipLiteral {
    return {type: 'boolean', value}
  },
  int(value: number): RelationshipLiteral {
    return {type: 'int', value}
  },
  float(value: number): RelationshipLiteral {
    return {type: 'float', value}
  },
  string(value: string): RelationshipLiteral {
    return {type: 'string', value}
  },
  reference(name: string, id: string): RelationshipAssign {
    return {type: 'reference', name, id}
  },
  arrayAccess(of: RelationshipFormula, index: RelationshipFormula): RelationshipAssign {
    return {type: 'array-access', of, index}
  },
  propertyAccess(of: RelationshipFormula, name: string): RelationshipAssign {
    return {type: 'property-access', of, name}
  },
  addition(lhs: RelationshipFormula, rhs: RelationshipFormula): RelationshipFormula {
    return {type: 'addition', lhs, rhs}
  },
  subtraction(lhs: RelationshipFormula, rhs: RelationshipFormula): RelationshipFormula {
    return {type: 'addition', lhs, rhs: {type: 'negate', arg: rhs}}
  },
  stringConcat(lhs: RelationshipFormula, rhs: RelationshipFormula): RelationshipFormula {
    return {type: 'string-concat', lhs, rhs}
  },
  arrayConcat(lhs: RelationshipFormula, rhs: RelationshipFormula): RelationshipFormula {
    return {type: 'array-concat', lhs, rhs}
  },
} as const

/**
 * Adjust the runtime, assuming that lhs - lhsComparison - rhs is true.
 *
 * For instance:
 *
 *     lhs => x: Int
 *     lhsComparison => '=='
 *     rhs => 5: Literal
 *
 *     nextRuntime => {x: 5}
 */
export function assignNextRuntime(
  runtime: TypeRuntime,
  lhs: RelationshipFormula,
  lhsComparison: RelationshipComparison,
  rhs: RelationshipFormula,
): GetRuntimeResult<MutableTypeRuntime> {
  let nextRuntime = new MutableTypeRuntime(runtime)

  for (const [assignable, comparison, formula] of assignables(lhs, lhsComparison, rhs)) {
    const assignableType = runtimeLookup(nextRuntime, assignable)
    if (!assignableType) {
      continue
    }

    const nextType = mergeAssignableType(assignableType, comparison, formula)
    mutateRuntime(nextRuntime, assignable, nextType)
  }

  return ok(nextRuntime)
}

function runtimeLookup(
  runtime: TypeRuntime,
  assignable: RelationshipAssign,
): Types.Type | undefined {
  if (assignable.type === 'reference') {
    return runtime.getLocalType(assignable.name)
  }

  if (assignable.type === 'array-access') {
    if (!isAssign(assignable.of)) {
      return undefined
    }

    const type = runtimeLookup(runtime, assignable.of)
    if (!type) {
      return undefined
    }

    throw 'todo'
  }

  if (assignable.type === 'property-access') {
    if (!isAssign(assignable.of)) {
      return undefined
    }

    const type = runtimeLookup(runtime, assignable.of)
    if (!type) {
      return undefined
    }

    return type.propAccessType(assignable.name)
  }

  return undefined
}

function mergeAssignableType(
  assignableType: Types.Type,
  comparison: RelationshipComparison,
  formula: RelationshipFormula,
): Types.Type {
  if (
    formula.type === 'addition' ||
    formula.type === 'negate' ||
    formula.type === 'string-concat' ||
    formula.type === 'array-concat'
  ) {
    throw `todo: formula is ${formula.type}`
  }

  if (!isLiteral(formula)) {
    throw 'todo: formula is a relationship, not a literal'
  }

  if (assignableType.isBoolean()) {
    return mergeAssignableTypeBoolean(assignableType, comparison, formula)
  }

  if (assignableType.isInt()) {
    return mergeAssignableTypeInt(assignableType, comparison, formula)
  }

  if (assignableType.isFloat()) {
    return mergeAssignableTypeFloat(assignableType, comparison, formula)
  }

  if (assignableType.isString()) {
    return mergeAssignableTypeString(assignableType, comparison, formula)
  }

  if (assignableType.isNull()) {
    return mergeAssignableTypeNull(assignableType, comparison, formula)
  }

  return Types.NeverType
}

function mutateRuntime(
  runtime: MutableTypeRuntime,
  assignable: RelationshipAssign,
  nextType: Types.Type,
) {
  if (assignable.type === 'reference') {
    runtime.localTypes.set(assignable.name, nextType)
  } else if (assignable.type === 'array-access') {
    if (!isAssign(assignable.of)) {
      return
    }

    const type = runtimeLookup(runtime, assignable.of)
    if (!type) {
      return
    }

    throw 'todo'
  } else if (assignable.type === 'property-access') {
    if (!isAssign(assignable.of)) {
      return
    }

    const type = runtimeLookup(runtime, assignable.of)
    if (!type) {
      return
    }

    const nextAssignableType = type.replacingProp(assignable.name, nextType)
    if (nextAssignableType.isErr()) {
      throw 'todo'
    }
    mutateRuntime(runtime, assignable.of, nextAssignableType.get())
  }
}

export function findEventualRef(lhs: RelationshipFormula): RelationshipReference | undefined {
  if (lhs.type === 'reference') {
    return lhs
  }

  if (lhs.type === 'array-access') {
    return findEventualRef(lhs.of)
  }

  if (lhs.type === 'property-access') {
    return findEventualRef(lhs.of)
  }

  return undefined
}

function isAssign(formula: RelationshipFormula): formula is RelationshipAssign {
  return (
    formula.type === 'reference' ||
    formula.type === 'array-access' ||
    formula.type === 'property-access'
  )
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
  return formula.type === 'int' || formula.type === 'float'
}

function isString(formula: RelationshipFormula): formula is RelationshipString {
  return formula.type === 'string'
}

function assignables(
  lhs: RelationshipFormula,
  lhsComparison: RelationshipComparison,
  rhs: RelationshipFormula,
): [RelationshipAssign, RelationshipComparison, RelationshipFormula][] {
  if (isInvalidRefs(lhs, rhs)) {
    return []
  }

  let rhsComparison: RelationshipComparison
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

function _assignables(
  formula: RelationshipFormula,
  comparison: RelationshipComparison,
  rhs: RelationshipFormula,
): [RelationshipAssign, RelationshipComparison, RelationshipFormula][] {
  if (formula.type === 'reference') {
    return [[formula, comparison, rhs]]
  }

  if (formula.type === 'array-access' || formula.type === 'property-access') {
    const assigns = _assignables(formula.of, comparison, rhs)
    return assigns.map(([_, comparison, rhs]) => [formula, comparison, rhs])
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
      return findRefs(lhs.of).concat(findRefs(lhs.index))
    case 'property-access':
      return findRefs(lhs.of)
    case 'addition':
    case 'string-concat':
    case 'array-concat':
      return findRefs(lhs.lhs).concat(findRefs(lhs.rhs))
    case 'negate':
      return findRefs(lhs.arg)
    case 'null':
    case 'boolean':
    case 'int':
    case 'float':
    case 'string':
      return []
  }
}

/**
 * assignableType: type of the lhs, in this case NullType
 * comparison: == != < > etc
 * literal: always a literal, but could be string, int, etc
 */
function mergeAssignableTypeNull(
  // assignableType is LiteralTrueType | LiteralFalseType | BooleanType
  assignableType: Types.Type,
  comparison: RelationshipComparison,
  literal: RelationshipLiteral,
): Types.Type {
  if (literal.type !== 'null') {
    if (comparison === '!=') {
      return assignableType
    }

    return Types.NeverType
  }

  if (comparison === '==') {
    return Types.NullType
  }

  return Types.NeverType
}

/**
 * assignableType: type of the lhs, in this case Boolean | LiteralBoolean
 * comparison: == != < > etc
 * literal: always a literal, but could be string, int, etc
 */
function mergeAssignableTypeBoolean(
  // assignableType is LiteralTrueType | LiteralFalseType | BooleanType
  assignableType: Types.Type,
  comparison: RelationshipComparison,
  literal: RelationshipLiteral,
): Types.Type {
  if (!isBoolean(literal)) {
    if (comparison === '!=') {
      // TODO: this is always true/redundant
      return assignableType
    }

    return Types.NeverType
  }

  switch (comparison) {
    case '==':
      if (assignableType === Types.LiteralTrueType) {
        if (literal.value === true) {
          // TODO: this is always true/redundant
          return Types.LiteralTrueType
        }
      } else if (assignableType === Types.LiteralFalseType) {
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
      if (assignableType === Types.LiteralTrueType) {
        // TODO: the false case is always true/redundant
        return literal.value ? Types.NeverType : Types.LiteralTrueType
      } else if (assignableType === Types.LiteralFalseType) {
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

/**
 * assignableType: type of the lhs, in this case Int | LiteralInt
 * comparison: == != < > etc
 * literal: always a literal, but could be string, int, etc
 */
function mergeAssignableTypeInt(
  // assignableType is LiteralIntType | MetaIntType
  assignableType: Types.Type,
  comparison: RelationshipComparison,
  literal: RelationshipLiteral,
): Types.Type {
  if (!isNumeric(literal)) {
    if (comparison === '!=') {
      // TODO: this is always true/redundant
      return assignableType
    }

    return Types.NeverType
  }

  switch (comparison) {
    case '==':
      if (assignableType instanceof Types.LiteralIntType) {
        if (isTrueNumericComparison(assignableType.value, comparison, literal.value)) {
          // TODO: this is always true/redundant
          return assignableType
        }
      } else if (assignableType instanceof Types.MetaIntType) {
        // check for an int or integral-float - if the comparison is true,
        // the assignableType will be that a literal of that value
        if (
          literal.type === 'int' ||
          (literal.type === 'float' && Number.isInteger(literal.value))
        ) {
          if (isOutsideOfNarrowedNumeric(assignableType.narrowed, literal.value)) {
            return Types.NeverType
          }

          return Types.literal(literal.value)
        }
      } else {
        // unreachable
      }

      return Types.NeverType
    case '!=':
      if (assignableType instanceof Types.LiteralIntType) {
        // the only check we need to do is if the literal value equals the comparison, we
        // can return 'never'. Otherwise it's always true.
        if (literal.value === assignableType.value) {
          return Types.NeverType
        }

        // the != comparison will always be true, and the assignableType will not change
        // TODO: this is always true/redundant
        return assignableType
      } else if (assignableType instanceof Types.MetaIntType) {
        // MetaIntType - maybe we can adjust the range?
        // (this same comparison won't work w/ Floats)

        // If literal.value == narrowed.min, then in the 'true' branch of this comparison
        // the value of the int will be _higher_ than narrowed.min.
        //     x: Int(>=5)
        //     x != 5 => x >= 6
        // Similarly, if the value matches narrowed.max, then in the 'true' branch of this
        // comparison the value of the int will be _lower_ than narrowed.max.
        let nextType = assignableType

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

      if (assignableType instanceof Types.LiteralIntType) {
        // TODO: the true case is always true/redundant
        return isTrueNumericComparison(assignableType.value, comparison, literal.value)
          ? assignableType
          : Types.NeverType
      } else if (assignableType instanceof Types.MetaIntType) {
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

        return assignableType.narrow(nextNarrowed.min, nextNarrowed.max)
      } else {
        // unreachable - fallthrough to NeverType
      }

      return Types.NeverType
  }
}

/**
 * assignableType: type of the lhs, in this case Float | LiteralFloat
 * comparison: == != < > etc
 * literal: always a literal, but could be string, int, etc
 */
function mergeAssignableTypeFloat(
  // assignableType is LiteralFloatType | MetaFloatType
  assignableType: Types.Type,
  comparison: RelationshipComparison,
  literal: RelationshipLiteral,
): Types.Type {
  if (!isNumeric(literal)) {
    if (comparison === '!=') {
      // TODO: this is always true/redundant
      return assignableType
    }

    return Types.NeverType
  }

  switch (comparison) {
    case '==':
      if (assignableType instanceof Types.LiteralFloatType) {
        if (isTrueNumericComparison(assignableType.value, comparison, literal.value)) {
          // TODO: this is always true/redundant
          return assignableType
        }
      } else if (assignableType instanceof Types.MetaFloatType) {
        // check for an int or integral-float - if the comparison is true,
        // the assignableType will be that a literal of that value
        if (literal.type === 'int' || literal.type === 'float') {
          if (isOutsideOfNarrowedNumeric(assignableType.narrowed, literal.value)) {
            return Types.NeverType
          }

          return Types.literal(literal.value, 'float')
        }
      } else {
        // unreachable
      }

      return Types.NeverType
    case '!=':
      if (assignableType instanceof Types.LiteralFloatType) {
        // the only check we need to do is if the literal value equals the comparison, we
        // can return 'never'. Otherwise it's always true.
        if (literal.value === assignableType.value) {
          return Types.NeverType
        }

        // the != comparison will always be true, and the assignableType will not change
        // TODO: this is always true/redundant
        return assignableType
      } else if (assignableType instanceof Types.MetaFloatType) {
        // if the float range is inclusive and the values are equal, the range becomes
        // exclusive. For example
        //     x: Float(>=5)
        //     x != 5  =>  x: Float(>5)
        let nextType = assignableType

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
      if (assignableType instanceof Types.LiteralFloatType) {
        // TODO: the true case is always true/redundant
        return isTrueNumericComparison(assignableType.value, comparison, literal.value)
          ? assignableType
          : Types.NeverType
      } else if (assignableType instanceof Types.MetaFloatType) {
        // need to compare the min and max values of assignableType.narrowed and
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

        return assignableType.narrow(nextNarrowed.min, nextNarrowed.max)
      } else {
        // unreachable - fallthrough to NeverType
      }

      return Types.NeverType
  }
}

/**
 * assignableType: type of the lhs, in this case String | LiteralString
 * comparison: == != < > etc
 * literal: always a literal, but could be string, int, etc
 */
function mergeAssignableTypeString(
  // assignableType is LiteralStringType | MetaStringType
  assignableType: Types.Type,
  comparison: RelationshipComparison,
  literal: RelationshipLiteral,
): Types.Type {
  if (!isString(literal)) {
    if (comparison === '!=') {
      // TODO: this is always true/redundant
      return assignableType
    }

    return Types.NeverType
  }

  switch (comparison) {
    case '==':
      if (assignableType instanceof Types.LiteralStringType) {
        if (literal.value === assignableType.value) {
          // TODO: this is always true/redundant
          return assignableType
        }
      } else if (assignableType instanceof Types.MetaStringType) {
        if (isOutsideOfNarrowedString(assignableType.narrowedString, literal.value)) {
          return Types.NeverType
        }

        return Types.literal(literal.value)
      }

      return Types.NeverType
    case '!=':
      if (assignableType instanceof Types.LiteralStringType) {
        // the only check we need to do is if the literal value equals the comparison, we
        // can return 'never'. Otherwise it's always true.
        if (literal.value === assignableType.value) {
          return Types.NeverType
        }

        // the != comparison will always be true, and the assignableType will not change
        // TODO: this is always true/redundant
        return assignableType
      } else if (assignableType instanceof Types.MetaStringType) {
        if (isOutsideOfNarrowedString(assignableType.narrowedString, literal.value)) {
          // TODO: this is always true/redundant
          return assignableType
        }

        // not redundant
        return assignableType
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
      return assignableType
  }
}

function isTrueNumericComparison(lhs: number, comparison: RelationshipComparison, rhs: number) {
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

export function relationshipReducer(
  runtime: MutableTypeRuntime,
  lhs: RelationshipFormula,
  lhsComparison: RelationshipComparison,
  rhs: RelationshipFormula,
) {
  const lhsRef = findEventualRef(lhs)
  if (!lhsRef) {
    return
  }
  const lhsRelationships = _relationshipReducer(runtime, lhs)
  const rhsRelationships = _relationshipReducer(runtime, rhs)
  const allRelationships = lhsRelationships.concat(rhsRelationships)
  console.log('=========== relationship.ts at line 850 ===========')
  console.log({lhs, rhs, allRelationships})
}

function _relationshipReducer(runtime: MutableTypeRuntime, arg: RelationshipFormula) {
  const ref = findEventualRef(arg)
  if (!ref) {
    return []
  }

  const relationships = runtime.getAllRelationships(ref.name)
  return relationships
}
