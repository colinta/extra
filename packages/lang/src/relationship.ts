import {ok} from '@extra-lang/result'
import {MutableTypeRuntime, type TypeRuntime} from './runtime'
import * as Types from './types'
import {type NarrowedInt, type NarrowedFloat, type NarrowedString} from './narrowed'
import {type GetRuntimeResult} from './formulaParser/types'

export type RelationshipComparison = '==' | '!=' | '>' | '>=' | '<' | '<='

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

export type RelationshipOperation =
  | RelationshipNegate
  | RelationshipAddition
  | RelationshipStringConcat
  | RelationshipArrayConcat

export type RelationshipReference = {type: 'reference'; name: string; id: string}
export type RelationshipAssign =
  | RelationshipReference
  | {type: 'array-access'; of: RelationshipFormula; index: RelationshipFormula}
  | {type: 'property-access'; of: RelationshipFormula; name: string}

export type RelationshipFormula = RelationshipLiteral | RelationshipAssign | RelationshipOperation

export type Relationship = {
  formula: RelationshipFormula
  type: RelationshipComparison
  right: RelationshipFormula
}
export type AssignedRelationship = {
  formula: RelationshipAssign
  type: RelationshipComparison
  right: RelationshipFormula
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
  string(value: string): RelationshipString {
    return {type: 'string', value}
  },
  reference(name: string, id: string): RelationshipReference {
    return {type: 'reference', name, id}
  },
  arrayAccess(of: RelationshipFormula, index: RelationshipFormula): RelationshipAssign {
    return {type: 'array-access', of, index}
  },
  propertyAccess(of: RelationshipFormula, name: string): RelationshipAssign {
    return {type: 'property-access', of, name}
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
  toString(rel: RelationshipFormula): string {
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
    if (rel.type === 'reference') {
      return rel.name
    }
    if (rel.type === 'array-access') {
      return `${this.toString(rel.of)}[${this.toString(rel.index)}]`
    }
    if (rel.type === 'property-access') {
      return `${this.toString(rel.of)}.${rel.name}`
    }

    const x: never = rel
    return x
  },
} as const

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
  runtime: TypeRuntime,
  lhs: RelationshipFormula,
  lhsComparison: RelationshipComparison,
  rhs: RelationshipFormula,
): GetRuntimeResult<MutableTypeRuntime> {
  lhs = normalize(lhs)
  rhs = normalize(rhs)

  let nextRuntime = new MutableTypeRuntime(runtime)

  for (const [assignable, comparison, formula] of assignables(lhs, lhsComparison, rhs)) {
    const prevType = runtimeLookup(nextRuntime, assignable)
    if (!prevType) {
      continue
    }

    const nextType = mergeAssignableType(prevType, comparison, formula)
    if (nextType !== prevType) {
      mutateRuntime(nextRuntime, assignable, nextType)
    }
  }

  relationshipDeducer(nextRuntime, lhs, lhsComparison, rhs)

  return ok(nextRuntime)
}

function runtimeLookup(
  runtime: TypeRuntime,
  assignable: RelationshipAssign,
): Types.Type | undefined {
  if (assignable.type === 'reference') {
    return runtime.getTypeById(assignable.id)
  }

  if (assignable.type === 'array-access') {
    if (!isAssign(assignable.of)) {
      return undefined
    }

    const type = runtimeLookup(runtime, assignable.of)
    if (!type) {
      return undefined
    }

    throw 'todo - runtimeLookup on array-access'
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
  if (!isLiteral(formula)) {
    // throw `todo: formula is ${formula.type}`
    return assignableType
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
    runtime.replaceTypeByName(assignable.name, nextType)
  } else if (assignable.type === 'array-access') {
    if (!isAssign(assignable.of)) {
      return
    }

    const type = runtimeLookup(runtime, assignable.of)
    if (!type) {
      return
    }

    throw 'todo - assign array access type'
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
      throw `todo - error assigning property-access type '${assignable.name}' to '${nextType}': ${nextAssignableType.error}`
    }

    mutateRuntime(runtime, assignable.of, nextAssignableType.get())
  }
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

  if (lhs.type === 'array-access') {
    return findEventualRef(lhs.of)
  }

  if (lhs.type === 'property-access') {
    return findEventualRef(lhs.of)
  }

  return
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

export function relationshipDeducer(
  mutableRuntime: MutableTypeRuntime,
  lhs: RelationshipFormula,
  lhsComparison: RelationshipComparison,
  rhs: RelationshipFormula,
) {
  _relationshipDeducer(mutableRuntime, lhs, lhsComparison, rhs, new Set())
}

function _relationshipDeducer(
  mutableRuntime: MutableTypeRuntime,
  lhs: RelationshipFormula,
  lhsComparison: RelationshipComparison,
  rhs: RelationshipFormula,
  visited: Set<string | AssignedRelationship>,
) {
  const newRelationships = simplifyRelationships({
    formula: lhs,
    type: lhsComparison,
    right: rhs,
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
        newRelationship.type,
        newRelationship.right,
      )
    }
  }

  for (const {formula, type, right} of nextRelationships) {
    _relationshipDeducer(mutableRuntime, formula, type, right, visited)
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

  if (prevRelationship.type === '==') {
    //|
    //|  a == b
    //|  b ? c
    //|
    const updatedRelationships = simplifyRelationships({
      formula: prevRelationship.right,
      type: newRelationship.type,
      right: newRelationship.right,
    })
    for (const relationship of updatedRelationships) {
      const prevType = runtimeLookup(mutableRuntime, relationship.formula)
      if (!prevType) {
        continue
      }

      const nextType = mergeAssignableType(prevType, relationship.type, relationship.right)
      if (nextType !== prevType) {
        replaceType(mutableRuntime, relationship.formula, nextType)
      }
    }

    return updatedRelationships
  } else if (
    (prevRelationship.type === '<' || prevRelationship.type === '<=') &&
    (newRelationship.type === '>' || newRelationship.type === '>=')
  ) {
    //|
    //|  b < a  ,  b <= a  =>  a > b  ,  a >= b  =>  a > c  ,  a >= c
    //|  b > c  ,  b >= c      b > c  ,  b >= c
    //|
    const type = prevRelationship.type === '<=' && newRelationship.type === '>=' ? '>=' : '>'
    return handleComparisonRelationship(mutableRuntime, prevRelationship, newRelationship, type)
  } else if (
    (prevRelationship.type === '>' || prevRelationship.type === '>=') &&
    (newRelationship.type === '<' || newRelationship.type === '<=')
  ) {
    //|
    //|  b > a  ,  b >= a  =>  a < b  ,  a <= b  =>  a < c  ,  a <= c
    //|  b < c  ,  b <= c      b < c  ,  b <= c
    //|
    const type = prevRelationship.type === '>=' && newRelationship.type === '<=' ? '<=' : '<'
    return handleComparisonRelationship(mutableRuntime, prevRelationship, newRelationship, type)
  } else {
    return []
  }
}

function handleComparisonRelationship(
  mutableRuntime: MutableTypeRuntime,
  prevRelationship: AssignedRelationship,
  newRelationship: AssignedRelationship,
  type: RelationshipComparison,
) {
  const updatedRelationships = simplifyRelationships({
    formula: prevRelationship.right,
    type,
    right: newRelationship.right,
  })
  for (const relationship of updatedRelationships) {
    const prevType = runtimeLookup(mutableRuntime, relationship.formula)
    if (!prevType) {
      continue
    }

    const nextType = mergeAssignableType(prevType, relationship.type, relationship.right)
    if (nextType !== prevType) {
      replaceType(mutableRuntime, relationship.formula, nextType)
    }

    if (isAssign(relationship.formula)) {
      mutableRuntime.addRelationshipFormula(
        relationship.formula,
        relationship.type,
        relationship.right,
      )
    }
  }

  return updatedRelationships
}

function replaceType(
  mutableRuntime: MutableTypeRuntime,
  prevRef: RelationshipAssign,
  nextType: Types.Type,
) {
  if (prevRef.type === 'array-access') {
    if (!isAssign(prevRef.of)) {
      return
    }

    if (!isLiteral(prevRef.index) || !isString(prevRef.index)) {
      return
    }

    const type = runtimeLookup(mutableRuntime, prevRef.of)
    if (!type) {
      return
    }

    const nextAssignableType = type.replacingProp(prevRef.index.value, nextType)
    if (nextAssignableType.isErr()) {
      throw `todo - error assigning property-access type '${prevRef.index.value}' to '${nextType}': ${nextAssignableType.error}`
    }

    return replaceType(mutableRuntime, prevRef.of, nextAssignableType.get())
  }

  if (prevRef.type === 'property-access') {
    if (!isAssign(prevRef.of)) {
      return
    }

    const type = runtimeLookup(mutableRuntime, prevRef.of)
    if (!type) {
      return
    }

    const nextAssignableType = type.replacingProp(prevRef.name, nextType)
    if (nextAssignableType.isErr()) {
      throw `todo - error assigning property-access type '${prevRef.name}' to '${nextType}': ${nextAssignableType.error}`
    }

    return replaceType(mutableRuntime, prevRef.of, nextAssignableType.get())
  }

  return mutableRuntime.replaceTypeById(prevRef.id, nextType)
}

/**
 * Tries to return a "normal" relationship, with RelationshipAssign on the left,
 * and formula on the right.
 *
 *     reference == formula
 *     reference < formula
 *     ref.prop > formula
 *     ref[0] != formula
 *     etc
 */
export function simplifyRelationships(relationship: Relationship): AssignedRelationship[] {
  const lhsRelationships = _simplifyRelationships(relationship)
  const rhsRelationships = _simplifyRelationships({
    formula: relationship.right,
    type: reverseComparison(relationship.type),
    right: relationship.formula,
  })
  return lhsRelationships.concat(rhsRelationships)
}

function _simplifyRelationships(relationship: Relationship): AssignedRelationship[] {
  const {formula: formula, type: symbol, right: rhsFormula} = relationship
  if (isAssign(formula)) {
    return [{formula, type: symbol, right: normalize(rhsFormula)}]
  }

  if (isNegate(formula)) {
    return _simplifyRelationships({
      formula: formula.arg,
      type: reverseComparison(symbol),
      right: normalize(relationshipFormula.negate(rhsFormula)),
    })
  }

  if (isAddition(formula)) {
    const tryLhs = _simplifyRelationships({
      formula: formula.lhs,
      type: symbol,
      right: normalizeAddition(rhsFormula, relationshipFormula.negate(formula.rhs)),
    })
    const tryRhs = _simplifyRelationships({
      formula: formula.rhs,
      type: symbol,
      right: normalizeAddition(rhsFormula, relationshipFormula.negate(formula.lhs)),
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

  // prefer numbers on the right
  if (isNumeric(lhs)) {
    return normalizeAddition(rhs, lhs)
  }

  return relationshipFormula.addition(lhs, rhs)
}

function reverseComparison(comparison: RelationshipComparison): RelationshipComparison {
  switch (comparison) {
    case '==':
      return '=='
    case '!=':
      return '!='
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

function isReference(formula: RelationshipFormula): formula is RelationshipReference {
  return formula.type === 'reference'
}

function isAssign(formula: RelationshipFormula): formula is RelationshipAssign {
  return (
    isReference(formula) || formula.type === 'array-access' || formula.type === 'property-access'
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

function addNumerics(lhs: RelationshipNumeric, rhs: RelationshipNumeric) {
  if (isInt(lhs) && isInt(rhs)) {
    return relationshipFormula.int(lhs.value + rhs.value)
  }

  return relationshipFormula.float(lhs.value + rhs.value)
}

function isAddition(formula: RelationshipFormula): formula is RelationshipAddition {
  return formula.type === 'addition'
}

export function verifyRelationship(
  formula: RelationshipFormula,
  comparison: RelationshipComparison,
  right: RelationshipFormula,
  getRelationships: (id: string) => AssignedRelationship[],
): boolean {
  if (isNumeric(formula) && isNumeric(right)) {
    switch (comparison) {
      case '==':
        return formula.value === right.value
      case '!=':
        return formula.value !== right.value
      case '>':
        return formula.value > right.value
      case '>=':
        return formula.value >= right.value
      case '<':
        return formula.value < right.value
      case '<=':
        return formula.value <= right.value
    }
  }

  const ref = findEventualRef(formula)
  const relationships = ref ? getRelationships(ref.id) : []
  return relationships.some(rel => {
    if (!isEqualFormula(formula, rel.formula)) {
      return false
    }

    switch (comparison) {
      case '>=':
        return verifyRelationshipIsGte(right, rel)
      case '<':
        return verifyRelationshipIsLt(right, rel)
      default:
        throw `TODO - implement '${comparison}' in verifyRelationship`
    }
  })
}

function verifyRelationshipIsGte(
  //
  target: RelationshipFormula,
  relationship: AssignedRelationship,
) {
  if (!['==', '>', '>='].includes(relationship.type)) {
    return false
  }

  if (isNumeric(target) && isNumeric(relationship.right)) {
    switch (relationship.type) {
      case '==':
        // relationship: formula == N (eg x == 1)
        // verify: formula >= target   (eg x >= 1)
        // return: N >= target   (eg 1 == 1)
        return relationship.right.value >= target.value
      case '>=':
        // relationship: formula >= N (eg x >= 0)
        // verify: formula >= target   (eg x >= 0)
        // return: N >= target   (eg 0 >= 0)
        return relationship.right.value >= target.value
      case '>':
        // relationship: formula > N (eg x > -1)
        // verify: formula >= target   (eg x >= 0)
        if (isInt(target) && isInt(relationship.right)) {
          // relationship: formula > N (eg x > -1)
          // =>          : x >= N + 1 (eg x > 0)
          // return: N >= target - 1
          return relationship.right.value >= target.value - 1
        }

        return relationship.right.value >= target.value
    }
  }

  throw `TODO - verifyRelationshipIsGte(right: ${relationshipFormula.toString(target)}, formula: ${relationshipFormula.toString(relationship.formula)} ${relationship.type} ${relationshipFormula.toString(relationship.formula)})`
}

function verifyRelationshipIsLt(
  //
  target: RelationshipFormula,
  relationship: AssignedRelationship,
) {
  if (!['==', '<', '<='].includes(relationship.type)) {
    return false
  }

  if (isNumeric(target) && isNumeric(relationship.right)) {
    switch (relationship.type) {
      case '==':
        // relationship: formula == N (eg x == 1)
        // verify: formula < target   (eg x <= 1)
        // return: N < target   (eg 1 == 1)
        return relationship.right.value < target.value
      case '<=':
        // relationship: formula <= N (eg x <= 0, x <= 0.1)
        // verify: formula < target   (eg x < 0)
        // return: N < target   (eg 0 < 0)
        return relationship.right.value < target.value
      case '<':
        // relationship: formula < N (eg x < -1)
        // verify: formula < target   (eg x < 0)
        return relationship.right.value < target.value
    }
  }

  // target is something like 'foo' or 'foo.length' or 'foo[key]'
  if (isAssign(target)) {
    if (isEqualFormula(target, relationship.right)) {
      switch (relationship.type) {
        case '==':
        case '<=':
          return false
        case '<':
          return true
      }
    }

    if (isAddition(relationship.right)) {
      if (isNumeric(relationship.right.lhs) && !isNumeric(relationship.right.rhs)) {
        // swap order and defer to below
        return verifyRelationshipIsLt(target, {
          formula: relationship.formula,
          type: relationship.type,
          right: relationshipFormula.addition(relationship.right.rhs, relationship.right.lhs),
        })
      }

      if (isAssign(relationship.right.lhs) && isNumeric(relationship.right.rhs)) {
        if (!isEqualFormula(target, relationship.right.lhs)) {
          return false
        }

        // relationship.type: [ == <= < ]
        // relationship.right is an addition
        // relationship.right.lhs == target
        // relationship.right.rhs is a number
        switch (relationship.type) {
          case '==':
          case '<=':
            // relationship: formula == target + N
            // or
            // relationship: formula <= target + N
            //
            // if relationship.right.rhs is < 0,
            // then the formula is less than the target
            return relationship.right.rhs.value < 0
          case '<':
            // relationship: formula < target + N
            // relationship: formula < length + N (eg x < length - 1)
            // verify: formula < right   (eg x < length)
            // return: length + N < right   (eg N <= 0)
            return relationship.right.rhs.value <= 0
        }
        return
      }
    }
  }

  console.log('=========== relationship.ts at line 1323 ===========')
  console.log({comparison: '<', right: target, relationship})
  throw `TODO - verifyRelationshipIsLt(right is '${target.type}', formula is '${relationshipFormula.toString(relationship.formula)}')`
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

  if (lhs.type === 'array-access' && rhs.type === 'array-access') {
    return isEqualFormula(lhs.of, rhs.of) && isEqualFormula(lhs.index, rhs.index)
  }

  if (lhs.type === 'property-access' && rhs.type === 'property-access') {
    return isEqualFormula(lhs.of, rhs.of) && lhs.name === rhs.name
  }

  return false
}

export function isEqualRelationship(lhs: Relationship, rhs: Relationship) {
  if (lhs.type !== rhs.type) {
    return false
  }

  return isEqualFormula(lhs.formula, rhs.formula) && isEqualFormula(lhs.right, rhs.right)
}
