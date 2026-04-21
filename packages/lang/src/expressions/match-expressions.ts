import {SPREAD_OPERATOR, ENUM_START} from '@/formulaParser/grammars'
import type {
  Comment,
  GetTypeResult,
  GetNodeResult,
  GetRuntimeResult,
  GetValueResult,
  GetValueRuntimeResult,
} from '@/formulaParser/types'
import * as Nodes from '@/nodes'
import {
  type RelationshipAssign,
  isAssign,
  relationshipFormula,
  relationshipToType,
  type RelationshipFormula,
  assignRelationshipsToRuntime,
  type Relationship,
  invertSymbol,
  combineEitherTypeRuntimes,
  combineOrRelationships,
} from '@/relationship'
import {
  type TypeRuntime,
  MutableTypeRuntime,
  type ValueRuntime,
  MutableValueRuntime,
} from '@/runtime'
import * as Types from '@/types'
import {indent, MAX_LEN} from '@/util'
import * as Values from '@/values'
import {ok, reduceAll, err, mapAll, mapMany, mapOptional} from '@extra-lang/result'
import {
  Expression,
  toSource,
  Reference,
  getChildAsTypeExpression,
  okBoolean,
  Literal,
  LiteralString,
  LiteralRegex,
  comparisonOperation,
  allProvides,
  allNamesFrom,
  includeMissingNames,
} from './expressions'
import {Range} from './types'
import {RuntimeError} from './errors'

interface SwitchCompileInfo {
  subjectNode: Nodes.Node
  exhaustiveType: Types.Type
  caseNodes: Nodes.Case[]
  elseNode: Nodes.CaseMatch | undefined
}

export class SwitchExpression extends Expression {
  symbol = 'switch'

  constructor(
    range: Range,
    precedingComments: Comment[],
    followingComments: Comment[],
    readonly subjectExpr: Expression,
    readonly caseExprs: CaseExpression[],
    readonly elseExpr?: Expression,
  ) {
    super(range, precedingComments, followingComments)
  }

  /**
   * No need to enclose function invocations in `(…)`
   */
  toViewPropCode() {
    return this.toCode()
  }

  toLisp() {
    return `(switch ${this.subjectExpr.toLisp()} ${this.caseExprs
      .map(expr => expr.toLisp())
      .join(' ')}${this.elseExpr ? ` (else: ${this.elseExpr.toLisp()})` : ''})`
  }

  toCode(): string {
    const subjectCode = this.subjectExpr.toCode()
    let lines: string[] = ['switch ' + subjectCode]
    for (const caseExpr of this.caseExprs) {
      lines.push(caseExpr.toCode())
    }
    if (this.elseExpr) {
      lines.push('else')
      lines.push(indent(this.elseExpr.toCode()))
    }

    return lines.join('\n')
  }

  // rhsType(runtime: TypeRuntime, lhsType: Types.Type, lhsExpr: Expression, rhsExpr: Expression) {
  rhsType(): GetTypeResult {
    return ok(Types.AnyType)
  }

  getType(runtime: TypeRuntime): GetTypeResult {
    return this.compile(runtime).map(node => node.type)
  }

  compile(runtime: TypeRuntime): GetNodeResult {
    const subjectExpr = this.subjectExpr
    const caseExprs = this.caseExprs
    const elseExpr = this.elseExpr

    const subjectFormula = subjectExpr.relationshipFormula(runtime)
    let nextRuntime: TypeRuntime = runtime
    return subjectExpr.compile(runtime).map(subjectNode => {
      const initialSubjectType = subjectNode.type
      let trackingFormula: RelationshipAssign
      if (subjectFormula && isAssign(subjectFormula)) {
        trackingFormula = subjectFormula
      } else {
        // Let me explain this hack. No, it will take too long. Let me sum up.
        // If subjectFormula is not defined, or not expressible as an
        // assignment, then relationshipToType below will fail. We need an
        // assignable relationship in order to check the type of the subject
        // in each caseExpr 'false' branch. So we fake it! We "assign" the
        // subject to a variable named after the expression... the runtime
        // only cares about strings, so we are guaranteed this expression will
        // not be expressible by "user-land" references, and it makes
        // debugging a joy.
        const mutableRuntime = new MutableTypeRuntime(runtime)
        const code = subjectExpr.toCode()
        const id = mutableRuntime.addLocalType(code, initialSubjectType)
        trackingFormula = relationshipFormula.reference(code, id)
        nextRuntime = mutableRuntime
      }

      return reduceAll(
        {
          subjectNode,
          exhaustiveType: subjectNode.type,
          caseNodes: [],
          elseNode: undefined,
        } as SwitchCompileInfo,
        caseExprs,
        (
          {subjectNode, exhaustiveType, caseNodes},
          caseExpr,
        ): GetRuntimeResult<SwitchCompileInfo> => {
          if (exhaustiveType === Types.NeverType) {
            return err(
              new RuntimeError(
                caseExpr,
                `Unreachable case detected. '${subjectExpr}' is of type '${exhaustiveType}' because the previous cases are exhaustive.`,
              ),
            )
          }

          return caseExpr
            .compileWithSubject(nextRuntime, trackingFormula, exhaustiveType)
            .map(caseNode => {
              caseNodes.push(caseNode)

              return caseExpr
                .assumeFalseWith(nextRuntime, trackingFormula, exhaustiveType)
                .map(nextRuntime => {
                  const caseSubjectType = relationshipToType(nextRuntime, trackingFormula)
                  if (!caseSubjectType) {
                    return err(
                      new RuntimeError(
                        caseExpr,
                        "No caseSubjectType type in SwitchExpression? that shouldn't happen",
                      ),
                    )
                  }

                  const nextSubjectType = Types.narrowTypeIs(exhaustiveType, caseSubjectType)
                  return ok({
                    subjectNode,
                    exhaustiveType: nextSubjectType,
                    caseNodes,
                    elseNode: undefined,
                  })
                })
            })
        },
      )
        .map(({exhaustiveType, ...rem}): GetRuntimeResult<SwitchCompileInfo> => {
          if (elseExpr) {
            if (exhaustiveType === Types.NeverType) {
              return err(
                new RuntimeError(
                  elseExpr,
                  `Unreachable case detected. '${subjectExpr}' is of type '${exhaustiveType}' because the previous cases are exhaustive.`,
                ),
              )
            }

            const nodeResult = elseExpr.compile(nextRuntime)
            if (nodeResult.isErr()) {
              return err(nodeResult.error)
            }

            const elseNode = nodeResult.get()
            return ok({...rem, exhaustiveType: Types.NeverType, elseNode})
          } else {
            return ok({...rem, exhaustiveType})
          }
        })
        .map(({exhaustiveType, caseNodes, elseNode}) => {
          if (exhaustiveType !== Types.NeverType) {
            return err(
              `Switch is not exhaustive, '${subjectExpr}' has unhandled type '${exhaustiveType}'`,
            )
          }

          const bodyTypes = caseNodes.map(node => node.type)
          if (elseNode) {
            bodyTypes.push(elseNode.type)
          }
          const bodyType = Types.oneOf(bodyTypes)
          return new Nodes.Switch(toSource(this), bodyType, subjectNode, caseNodes, elseNode)
        })
    })
  }

  eval(runtime: ValueRuntime): GetValueResult {
    const subjectExpr = this.subjectExpr
    const caseExprs = this.caseExprs
    const elseExpr = this.elseExpr

    return subjectExpr.eval(runtime).map(subject => {
      for (const caseExpr of caseExprs) {
        const didMatchResult = caseExpr.matchExpr.evalWithSubjectReturningRuntime(
          runtime,
          caseExpr,
          subject,
        )
        if (didMatchResult.isErr()) {
          return err(didMatchResult.error)
        }

        const [didMatch, matchRuntime] = didMatchResult.value
        if (didMatch.isTruthy()) {
          return caseExpr.bodyExpression.eval(matchRuntime)
        }
      }

      if (elseExpr) {
        return elseExpr.eval(runtime)
      }

      throw 'TODO: hm, should never reach here - no cases (or else) matched'
    })
  }
}

export abstract class MatchExpression extends Expression {
  assumeTrueWith(
    runtime: TypeRuntime,
    formula: RelationshipFormula | undefined,
    subjectType: Types.Type,
  ) {
    return this.gimmeTrueStuffWith(runtime, formula, subjectType).map(stuff =>
      assignRelationshipsToRuntime(runtime, stuff, true),
    )
  }

  assumeFalseWith(
    runtime: TypeRuntime,
    formula: RelationshipFormula | undefined,
    subjectType: Types.Type,
  ) {
    return this.gimmeFalseStuffWith(runtime, formula, subjectType).map(stuff =>
      assignRelationshipsToRuntime(runtime, stuff, false),
    )
  }

  /**
   * Called from MatchOperator with the formula and expression of lhs.
   */
  gimmeTrueStuffWith(
    _runtime: TypeRuntime,
    _formula: RelationshipFormula | undefined,
    _lhsType: Types.Type,
  ): GetRuntimeResult<Relationship[]> {
    return ok([])
  }

  /**
   * Called from MatchOperator with the formula and expression of lhs.
   */
  gimmeFalseStuffWith(
    _runtime: TypeRuntime,
    _formula: RelationshipFormula | undefined,
    _lhsType: Types.Type,
  ): GetRuntimeResult<Relationship[]> {
    return ok([])
  }

  /**
   * MatchIdentifier type returns 'true', indicating a match that will always
   * succeed.
   */
  alwaysMatches(_lhs: Types.Type) {
    return false
  }

  getType(): GetTypeResult {
    return err(new RuntimeError(this, `${this.constructor.name} does not have a type`))
  }

  abstract compileWithSubject(
    runtime: TypeRuntime,
    subjectType: Types.Type,
  ): GetRuntimeResult<Nodes.CaseMatch>

  eval(): GetValueResult {
    return err(new RuntimeError(this, `${this.constructor.name} cannot be evaluated`))
  }

  evalWithSubject(_runtime: ValueRuntime, _op: Expression, _lhs: Values.Value): GetValueResult {
    return err(
      new RuntimeError(this, `TODO: implement evalWithSubject on ${this.constructor.name}`),
    )
  }

  evalWithSubjectReturningRuntime(
    runtime: ValueRuntime,
    op: Expression,
    lhs: Values.Value,
  ): GetValueRuntimeResult {
    return this.evalWithSubject(runtime, op, lhs).map(value => [value, runtime])
  }

  checkAssignRefs() {
    const assignRefs = this.matchAssignReferences()
    const found = new Set<string>()
    const duplicates = new Set<string>()
    for (const ref of assignRefs) {
      if (found.has(ref)) {
        duplicates.add(ref)
      } else {
        found.add(ref)
      }
    }
    return duplicates
  }

  abstract matchAssignReferences(): string[]

  /**
   * This function returns the type as determined by the match expression. It
   * can be informed by the `subjectType`. Most `MatchExpression`s implement the
   * `narrowUsingMatcherTypeSkippingOneOf` function, which is guaranteed to
   * never receive a `OneOfType`. It may be called multiple times, if
   * `subjectType` is a `OneOfType`.
   *
   * Default behavior is to return the `subjectType` unchanged.
   */
  narrowUsingMatcherType(runtime: TypeRuntime, subjectType: Types.Type): GetTypeResult {
    if (subjectType instanceof Types.OneOfType) {
      return mapAll(subjectType.of.map(ofType => this.narrowUsingMatcherType(runtime, ofType))).map(
        types => Types.oneOf(types),
      )
    }

    return this.narrowUsingMatcherTypeSkippingOneOf(runtime, subjectType)
  }

  narrowUsingMatcherTypeSkippingOneOf(
    _runtime: TypeRuntime,
    subjectType: Types.Type,
  ): GetTypeResult {
    return ok(subjectType)
  }
}
/**
 * foo is Int, foo is Int(>=0), foo is [Int(>1], length: >0), etc etc
 */

export class MatchTypeExpression extends MatchExpression {
  constructor(
    readonly argType: Expression,
    readonly assignRef: Reference | undefined,
  ) {
    super(argType.range, argType.precedingComments, argType.followingComments)
  }

  matchAssignReferences() {
    return this.assignRef ? [this.assignRef.name] : []
  }

  getAsTypeExpression(runtime: TypeRuntime): GetTypeResult {
    return getChildAsTypeExpression(this, this.argType, runtime)
  }

  narrowUsingMatcherTypeSkippingOneOf(runtime: TypeRuntime, _subjectType: Types.Type) {
    return this.getAsTypeExpression(runtime)
  }

  gimmeTrueStuffWith(
    runtime: TypeRuntime,
    formula: RelationshipFormula | undefined,
    subjectType: Types.Type,
  ): GetRuntimeResult<Relationship[]> {
    if (!formula && !this.assignRef) {
      return ok([])
    }

    return this.narrowUsingMatcherType(runtime, subjectType).map(replaceType => {
      const relationships: Relationship[] = []
      if (formula) {
        relationships.push({formula, comparison: {operator: 'instanceof', rhs: replaceType}})
      }

      if (this.assignRef) {
        relationships.push({
          formula: relationshipFormula.assign(this.assignRef.name),
          comparison: {operator: 'instanceof', rhs: replaceType},
        })
      }

      return relationships
    })
  }

  gimmeFalseStuffWith(
    runtime: TypeRuntime,
    formula: RelationshipFormula | undefined,
    subjectType: Types.Type,
  ): GetRuntimeResult<Relationship[]> {
    if (!formula) {
      return ok([])
    }

    // I was tempted to just use 'instanceof' and store the desired type (i.e.
    // use `Types.narrowTypeIsNot` here). The problem is that operators like
    // `not` modify the return value of gimmeFalseStuff, changing `!instanceof`
    // to `instanceof`.
    return this.narrowUsingMatcherType(runtime, subjectType).map(replaceType => {
      return [{formula, comparison: {operator: '!instanceof', rhs: replaceType}}]
    })
  }

  compileWithSubject(
    runtime: TypeRuntime,
    _subjectType: Types.Type,
  ): GetRuntimeResult<Nodes.MatchType> {
    return this.getAsTypeExpression(runtime).map(
      matchType => new Nodes.MatchType(toSource(this), matchType),
    )
  }

  evalWithSubject(runtime: ValueRuntime, op: Expression, lhs: Values.Value) {
    return this.getAsTypeExpression(runtime).map(type => {
      const isType = Types.canBeAssignedTo(lhs.getType(), type)
      return okBoolean(isType)
    })
  }

  toLisp() {
    if (this.assignRef) {
      return `(${this.argType.toLisp()} as ${this.assignRef.toLisp()})`
    }

    return this.argType.toLisp()
  }

  toCode() {
    if (this.assignRef) {
      return `${this.argType} as ${this.assignRef}`
    }

    return this.argType.toCode()
  }
}

export abstract class MatchIdentifier extends MatchExpression {
  abstract readonly name?: string

  provides() {
    if (!this.name) {
      return super.provides()
    }

    return new Set([this.name])
  }

  alwaysMatches(_lhs: Types.Type) {
    return true
  }

  matchAssignReferences() {
    return this.name ? [this.name] : []
  }

  gimmeTrueStuffWith(
    _runtime: TypeRuntime,
    formula: RelationshipFormula | undefined,
    lhsType: Types.Type,
  ): GetRuntimeResult<Relationship[]> {
    if (!this.name) {
      return ok([])
    }

    const assign = relationshipFormula.assign(this.name)
    const relationships: Relationship[] = [
      {
        formula: assign,
        comparison: {operator: 'instanceof', rhs: lhsType},
      },
    ]
    if (formula) {
      relationships.push({
        formula: relationshipFormula.reference(this.name, assign.unstableId),
        comparison: {operator: '==', rhs: formula},
      })
    }
    return ok(relationships)
  }

  gimmeFalseStuffWith(
    _runtime: TypeRuntime,
    formula: RelationshipFormula | undefined,
    _lhsType: Types.Type,
  ): GetRuntimeResult<Relationship[]> {
    const relationships: Relationship[] = []
    if (formula) {
      relationships.push({
        formula,
        comparison: {operator: 'instanceof', rhs: Types.NeverType},
      })
    }

    if (this.name) {
      const assign = relationshipFormula.assign(this.name)
      relationships.push({
        formula: assign,
        comparison: {operator: 'instanceof', rhs: Types.NeverType},
      })
    }

    return ok(relationships)
  }
}
/**
 * `_` will match anything, but will not assign it to scope.
 */

export class MatchIgnore extends MatchIdentifier {
  readonly name?: string = undefined

  toLisp() {
    return '_'
  }

  toCode() {
    return '_'
  }

  compileWithSubject(
    _runtime: TypeRuntime,
    _subjectType: Types.Type,
  ): GetRuntimeResult<Nodes.MatchIgnore> {
    return ok(new Nodes.MatchIgnore(toSource(this)))
  }

  evalWithSubjectReturningRuntime(
    runtime: ValueRuntime,
    _op: Expression,
    lhs: Values.Value,
  ): GetValueRuntimeResult {
    return ok([Values.TrueValue, runtime])
  }
}
/**
 * `var-name` will match anything, and assigns it to scope. See MatchIdentifier for
 * implementation.
 */

export class MatchReference extends MatchIdentifier {
  readonly name: string

  constructor(nameRef: Reference) {
    super(nameRef.range, nameRef.precedingComments)
    this.name = nameRef.name
  }

  toLisp() {
    return this.name
  }

  toCode() {
    return this.name
  }

  compileWithSubject(
    _runtime: TypeRuntime,
    _subjectType: Types.Type,
  ): GetRuntimeResult<Nodes.MatchReference> {
    return ok(new Nodes.MatchReference(toSource(this), this.name))
  }

  evalWithSubjectReturningRuntime(
    runtime: ValueRuntime,
    _op: Expression,
    lhs: Values.Value,
  ): GetValueRuntimeResult {
    const mutableRuntime = new MutableValueRuntime(runtime)
    mutableRuntime.addLocalValue(this.name, lhs)
    return ok([Values.TrueValue, mutableRuntime])
  }
}
/**
 * Used to ignore the rest of the match args or array elements.
 *     .some(arg1, ...)
 *     [arg1, ...]
 *
 * TODO: Support splat (assigning remaining args to a Tuple)
 *     .some(arg, ...remaining)
 */

export class MatchIgnoreRemainingExpression extends MatchIdentifier {
  readonly name?: string = undefined

  toLisp() {
    return SPREAD_OPERATOR
  }

  toCode() {
    return SPREAD_OPERATOR
  }

  compileWithSubject(
    _runtime: TypeRuntime,
    _subjectType: Types.Type,
  ): GetRuntimeResult<Nodes.MatchIgnoreRemaining> {
    return ok(new Nodes.MatchIgnoreRemaining(toSource(this)))
  }
}
/**
 * [...values]
 */

export class MatchAssignRemainingExpression extends MatchIdentifier {
  readonly name: string
  constructor(range: Range, precedingComments: Comment[], nameRef: Reference) {
    super(range, precedingComments)
    this.name = nameRef.name
  }

  toLisp() {
    return this.toCode()
  }

  toCode() {
    return `${SPREAD_OPERATOR}${this.name}`
  }

  compileWithSubject(
    _runtime: TypeRuntime,
    _subjectType: Types.Type,
  ): GetRuntimeResult<Nodes.MatchAssignRemaining> {
    return ok(new Nodes.MatchAssignRemaining(toSource(this), this.name))
  }

  evalWithSubjectReturningRuntime(
    runtime: ValueRuntime,
    _op: Expression,
    lhs: Values.Value,
  ): GetValueRuntimeResult {
    const mutableRuntime = new MutableValueRuntime(runtime)
    mutableRuntime.addLocalValue(this.name, lhs)
    return ok([lhs, mutableRuntime])
  }
}
/**
 * A positional or named match within an enum or object match.
 */

abstract class MatchArgumentExpression extends MatchExpression {
  constructor(
    range: Range,
    precedingComments: Comment[],
    readonly matchExpr: MatchExpression,
  ) {
    super(range, precedingComments)
  }

  matchAssignReferences() {
    return this.matchExpr.matchAssignReferences()
  }

  provides() {
    return this.matchExpr.provides()
  }

  narrowUsingMatcherType(runtime: TypeRuntime, propType: Types.Type): GetTypeResult {
    return this.matchExpr.narrowUsingMatcherType(runtime, propType)
  }

  gimmeTrueStuffWith(
    runtime: TypeRuntime,
    formula: RelationshipFormula | undefined,
    subjectType: Types.Type,
  ): GetRuntimeResult<Relationship[]> {
    return this.matchExpr.gimmeTrueStuffWith(runtime, formula, subjectType)
  }

  gimmeFalseStuffWith(
    runtime: TypeRuntime,
    formula: RelationshipFormula | undefined,
    subjectType: Types.Type,
  ): GetRuntimeResult<Relationship[]> {
    return this.matchExpr.gimmeFalseStuffWith(runtime, formula, subjectType)
  }

  evalWithSubject(runtime: ValueRuntime, op: Expression, lhs: Values.Value) {
    return this.matchExpr.evalWithSubject(runtime, op, lhs)
  }

  evalWithSubjectReturningRuntime(
    runtime: ValueRuntime,
    op: Expression,
    lhs: Values.Value,
  ): GetValueRuntimeResult {
    return this.matchExpr.evalWithSubjectReturningRuntime(runtime, op, lhs)
  }
}
/**
 * A named reference within an enum or object match. Often contains a reference,
 * but can contain any match expression.
 *
 *     case .something(named: value)
 *                     ^^^^^^^^^^^^
 *     case .something(named: [value, ...])
 *                     ^^^^^^^^^^^^^^^^^^^
 *     case {name: value}  {name:}
 *           ^^^^^^^^^^^    ^^^^^ (shorthand for {name: name})
 */

export class MatchNamedArgument extends MatchArgumentExpression {
  constructor(
    range: Range,
    precedingComments: Comment[],
    readonly name: string,
    readonly matchExpr: MatchExpression,
  ) {
    super(range, precedingComments, matchExpr)
  }

  compileWithSubject(
    runtime: TypeRuntime,
    subjectType: Types.Type,
  ): GetRuntimeResult<Nodes.MatchNamedArgument> {
    return this.matchExpr
      .compileWithSubject(runtime, subjectType)
      .map(matchNode => new Nodes.MatchNamedArgument(toSource(this), this.name, matchNode))
  }

  toLisp() {
    return `(${this.name}: ${this.matchExpr.toLisp()})`
  }

  toCode() {
    if (this.matchExpr instanceof MatchReference && this.matchExpr.name === this.name) {
      // special case for {name: name} shorthand
      return this.name + ':'
    }

    return `${this.name}: ${this.matchExpr.toCode()}`
  }
}
/**
 * A positional match within an enum or object match.
 *
 *     case .something(value)
 *                     ^^^^^
 *     case .something([value, ...])
 *                      ^^^^^
 *     case {value}
 *           ^^^^^
 */

export class MatchPositionalArgument extends MatchArgumentExpression {
  constructor(
    range: Range,
    precedingComments: Comment[],
    readonly index: number,
    readonly matchExpr: MatchExpression,
  ) {
    super(range, precedingComments, matchExpr)
  }

  compileWithSubject(
    runtime: TypeRuntime,
    subjectType: Types.Type,
  ): GetRuntimeResult<Nodes.MatchPositionalArgument> {
    return this.matchExpr
      .compileWithSubject(runtime, subjectType)
      .map(matchNode => new Nodes.MatchPositionalArgument(toSource(this), matchNode))
  }

  toLisp() {
    return `(${this.matchExpr.toLisp()})`
  }

  toCode() {
    return this.matchExpr.toCode()
  }
}

export abstract class MatchLiteral extends MatchExpression {
  constructor(readonly literal: Literal) {
    super(literal.range, literal.precedingComments)
  }

  matchAssignReferences(): string[] {
    return []
  }

  getAsTypeExpression(runtime: TypeRuntime): GetTypeResult {
    return this.literal.getAsTypeExpression()
  }

  narrowUsingMatcherTypeSkippingOneOf(runtime: TypeRuntime, _subjectType: Types.Type) {
    return this.getAsTypeExpression(runtime)
  }

  gimmeTrueStuffWith(
    runtime: TypeRuntime,
    formula: RelationshipFormula | undefined,
    subjectType: Types.Type,
  ): GetRuntimeResult<Relationship[]> {
    if (!formula) {
      return ok([])
    }

    return this.narrowUsingMatcherType(runtime, subjectType).map((replaceType): Relationship[] => {
      return [{formula, comparison: {operator: 'instanceof', rhs: replaceType}}]
    })
  }

  gimmeFalseStuffWith(
    runtime: TypeRuntime,
    formula: RelationshipFormula | undefined,
    subjectType: Types.Type,
  ): GetRuntimeResult<Relationship[]> {
    if (!formula) {
      return ok([])
    }

    return this.narrowUsingMatcherType(runtime, subjectType).map((replaceType): Relationship[] => {
      return [{formula, comparison: {operator: '!instanceof', rhs: replaceType}}]
    })
  }

  compileWithSubject(
    runtime: TypeRuntime,
    _subjectType: Types.Type,
  ): GetRuntimeResult<Nodes.MatchLiteral> {
    return this.literal.compile(runtime).map(node => new Nodes.MatchLiteral(toSource(this), node))
  }

  evalWithSubject(_runtime: ValueRuntime, _op: Expression, lhs: Values.Value) {
    if (this.literal.value.isInt() && !lhs.isInt()) {
      return okBoolean(false)
    }
    return okBoolean(this.literal.value.isEqual(lhs))
  }

  toLisp() {
    return this.literal.toLisp()
  }

  toCode() {
    return this.literal.toCode()
  }
}

export class MatchLiteralFloat extends MatchLiteral {}
export class MatchLiteralInt extends MatchLiteral {}
export class MatchLiteralString extends MatchLiteral {
  constructor(readonly literal: LiteralString) {
    super(literal)
  }
}
export class MatchLiteralRegex extends MatchLiteral {
  constructor(readonly literal: LiteralRegex) {
    super(literal)
  }

  matchAssignReferences() {
    return Array.from(this.literal.groups.keys())
  }

  getAsTypeExpression(_runtime: TypeRuntime): GetTypeResult {
    return ok(Types.StringType.narrowRegex(this.literal.value.value))
  }

  narrowUsingMatcherTypeSkippingOneOf(runtime: TypeRuntime, _subjectType: Types.Type) {
    return this.getAsTypeExpression(runtime)
  }

  gimmeTrueStuffWith(
    runtime: TypeRuntime,
    formula: RelationshipFormula | undefined,
    subjectType: Types.Type,
  ): GetRuntimeResult<Relationship[]> {
    if (!formula && !this.literal.groups.size) {
      return ok([])
    }

    return this.narrowUsingMatcherType(runtime, subjectType).map(type => {
      const relationships: Relationship[] = []
      if (formula) {
        const ref = {formula, comparison: {operator: 'instanceof', rhs: type}} as const
        relationships.push(ref)
      }

      if (!this.literal.groups.size) {
        return relationships
      }

      for (const [name, pattern] of this.literal.groups) {
        const regex = new RegExp(pattern, this.literal.flags)
        const type = Types.StringType.narrowRegex(regex)
        relationships.push({
          formula: relationshipFormula.assign(name),
          comparison: {operator: 'instanceof', rhs: type},
        })
      }

      return relationships
    })
  }

  gimmeFalseStuffWith(
    _runtime: TypeRuntime,
    formula: RelationshipFormula | undefined,
    _subjectType: Types.Type,
  ): GetRuntimeResult<Relationship[]> {
    if (!formula) {
      return ok([])
    }

    return ok([
      {
        formula,
        comparison: {
          operator: '!instanceof',
          rhs: Types.string({regex: [this.literal.value.value]}),
        },
      },
    ])
  }

  evalWithSubjectReturningRuntime(
    runtime: ValueRuntime,
    _op: Expression,
    lhs: Values.Value,
  ): GetValueRuntimeResult {
    if (!lhs.isString()) {
      return ok([Values.FalseValue, runtime])
    }

    const matchInfo = lhs.value.match(this.literal.value.value)
    if (!matchInfo || !this.literal.groups.size || !matchInfo.groups) {
      return ok([Values.booleanValue(!!matchInfo), runtime])
    }

    const mutableRuntime = new MutableValueRuntime(runtime)
    for (const [name, value] of Object.entries(matchInfo.groups)) {
      mutableRuntime.addLocalValue(name, Values.string(value))
    }
    return ok([Values.TrueValue, mutableRuntime])
  }
}

export class MatchUnaryRange extends MatchExpression {
  readonly precedence = 12 // from operators.ts

  constructor(
    readonly range: Range,
    public precedingComments: Comment[],
    readonly op: '>' | '>=' | '<' | '<=',
    readonly start: Literal,
  ) {
    super(range, precedingComments)
  }

  matchAssignReferences() {
    return []
  }

  getAsTypeExpression(_runtime: TypeRuntime, isInt?: boolean): GetTypeResult {
    // TODO: replace Literal with FloatValue and remove this check
    if (!this.start.value.isFloat()) {
      return ok(Types.NeverType)
    }

    const val = this.start.value.value
    isInt = isInt && this.start.value.isInt()
    if (isInt) {
      switch (this.op) {
        case '>':
          return ok(Types.intRange({min: val + 1}))
        case '>=':
          return ok(Types.intRange({min: val}))
        case '<':
          return ok(Types.intRange({max: val - 1}))
        case '<=':
          return ok(Types.intRange({max: val}))
      }
    }

    switch (this.op) {
      case '>':
        return ok(Types.floatRange({min: [val]}))
      case '>=':
        return ok(Types.floatRange({min: val}))
      case '<':
        return ok(Types.floatRange({max: [val]}))
      case '<=':
        return ok(Types.floatRange({max: val}))
    }
  }

  narrowUsingMatcherTypeSkippingOneOf(runtime: TypeRuntime, subjectType: Types.Type) {
    const isInt = subjectType.isInt() || subjectType.isIntRange()
    return this.getAsTypeExpression(runtime, isInt)
  }

  gimmeTrueStuffWith(
    runtime: TypeRuntime,
    formula: RelationshipFormula | undefined,
    subjectType: Types.Type,
  ): GetRuntimeResult<Relationship[]> {
    if (!formula) {
      return ok([])
    }

    return this.narrowUsingMatcherType(runtime, subjectType).map(replaceType => {
      const rhs = this.start.relationshipFormula(runtime)
      if (!rhs) {
        return ok([])
      }

      return ok([{formula, comparison: {operator: 'instanceof', rhs: replaceType}}])
    })
  }

  gimmeFalseStuffWith(
    runtime: TypeRuntime,
    formula: RelationshipFormula | undefined,
    subjectType: Types.Type,
  ): GetRuntimeResult<Relationship[]> {
    if (!formula) {
      return ok([])
    }

    return this.narrowUsingMatcherType(runtime, subjectType).map(replaceType => {
      const operator = this.op
      const relationships: Relationship[] = [
        {formula, comparison: {operator: '!instanceof', rhs: replaceType}},
      ]

      const rhs = this.start.relationshipFormula(runtime)
      if (rhs && replaceType.isFloat()) {
        relationships.push({formula, comparison: {operator: invertSymbol(operator), rhs}})
      }
      return ok(relationships)
    })
  }

  compileWithSubject(
    runtime: TypeRuntime,
    _subjectType: Types.Type,
  ): GetRuntimeResult<Nodes.MatchUnaryRange> {
    return this.start
      .compile(runtime)
      .map(range => new Nodes.MatchUnaryRange(toSource(this), this.op, range))
  }

  evalWithSubject(_runtime: ValueRuntime, op: Expression, lhs: Values.Value) {
    if (lhs.isRange()) {
      const [min, exclusiveMin] = lhs.start ?? []
      const [max, exclusiveMax] = lhs.stop ?? []
      switch (this.op) {
        case '>':
        case '>=':
          if (!min) {
            return okBoolean(false)
          }
          return comparisonOperation(op, min, this.start.value, (lhsMin, match) =>
            // exclusiveMin implies that the range's minimum is open-ended:
            //     range = 0<..10
            // Whether the match is `range is >0` or `range is >=0`, both of
            // these are true. On the other hand, a closed range
            //     range = 0...10
            //  will only match `range is >=0`, otherwise it needs to be
            //  *greater* than the range value, e.g. `range is > -1`
            exclusiveMin || this.op === '>=' ? lhsMin >= match : lhsMin > match,
          )
        case '<':
        case '<=':
          if (!max) {
            return okBoolean(false)
          }
          // see above discussion for why exclusiveMax or this.op === '<=' use
          // the '<=' comparison, and only inclusive ranges matching against '<'
          // use the '<' comparison
          return comparisonOperation(op, max, this.start.value, (lhsMax, match) =>
            exclusiveMax || this.op === '<=' ? lhsMax <= match : lhsMax < match,
          )
      }
    }

    if (!lhs.isFloat()) {
      return okBoolean(false)
    }
    switch (this.op) {
      case '>':
        return comparisonOperation(op, lhs, this.start.value, (lhs, rhs) => lhs > rhs)
      case '>=':
        return comparisonOperation(op, lhs, this.start.value, (lhs, rhs) => lhs >= rhs)
      case '<':
        return comparisonOperation(op, lhs, this.start.value, (lhs, rhs) => lhs < rhs)
      case '<=':
        return comparisonOperation(op, lhs, this.start.value, (lhs, rhs) => lhs <= rhs)
    }
  }

  toLisp() {
    return `(${this.op}${this.start.toLisp()})`
  }

  toCode(prevPrecedence = 0): string {
    if (prevPrecedence > this.precedence) {
      return `(${this.toCode(0)} ${prevPrecedence} ${this.precedence})`
    }

    return this.op + this.start.toCode()
  }
}

export class MatchBinaryRange extends MatchExpression {
  readonly precedence = 12 // from operators.ts

  constructor(
    readonly range: Range,
    public precedingComments: Comment[],
    readonly op: '...' | '<..' | '..<' | '<.<',
    readonly start: Literal,
    readonly stop: Literal,
  ) {
    super(range, precedingComments)
  }

  matchAssignReferences() {
    return []
  }

  getAsTypeExpression(_runtime: TypeRuntime, isInt?: boolean): GetTypeResult {
    // TODO: replace Literal with FloatValue and remove this check
    if (!this.start.value.isFloat() || !this.stop.value.isFloat()) {
      return ok(Types.NeverType)
    }

    const minValue = this.start.value.value
    const maxValue = this.stop.value.value
    isInt = isInt && this.start.value.isInt() && this.stop.value.isInt()
    if (isInt) {
      switch (this.op) {
        case '...':
          return ok(Types.intRange({min: Math.ceil(minValue), max: Math.floor(maxValue)}))
        case '<..':
          return ok(Types.intRange({min: Math.floor(minValue) + 1, max: Math.floor(maxValue)}))
        case '..<':
          return ok(Types.intRange({min: Math.ceil(minValue), max: Math.ceil(maxValue) - 1}))
        case '<.<':
          return ok(Types.intRange({min: Math.floor(minValue) + 1, max: Math.ceil(maxValue) - 1}))
      }
    }

    switch (this.op) {
      case '...':
        return ok(Types.floatRange({min: minValue, max: maxValue}))
      case '<..':
        return ok(Types.floatRange({min: [minValue], max: maxValue}))
      case '..<':
        return ok(Types.floatRange({min: minValue, max: [maxValue]}))
      case '<.<':
        return ok(Types.floatRange({min: [minValue], max: [maxValue]}))
    }
  }

  narrowUsingMatcherTypeSkippingOneOf(runtime: TypeRuntime, subjectType: Types.Type) {
    const isInt = subjectType.isInt() || subjectType.isIntRange()
    return this.getAsTypeExpression(runtime, isInt)
  }

  gimmeTrueStuffWith(
    runtime: TypeRuntime,
    formula: RelationshipFormula | undefined,
    subjectType: Types.Type,
  ): GetRuntimeResult<Relationship[]> {
    if (!formula) {
      return ok([])
    }

    return this.narrowUsingMatcherType(runtime, subjectType).map(replaceType => {
      const rhs = this.start.relationshipFormula(runtime)
      if (!rhs) {
        return ok([])
      }

      return ok([{formula, comparison: {operator: 'instanceof', rhs: replaceType}}])
    })
  }

  gimmeFalseStuffWith(
    runtime: TypeRuntime,
    formula: RelationshipFormula | undefined,
    subjectType: Types.Type,
  ): GetRuntimeResult<Relationship[]> {
    if (!formula) {
      return ok([])
    }

    return this.narrowUsingMatcherType(runtime, subjectType).map(replaceType => {
      const rhs = this.start.relationshipFormula(runtime)
      if (!rhs) {
        return ok([])
      }

      // no more information available here (the number is either less than the
      // minimum, or greater than the maximum)
      return ok([{formula, comparison: {operator: '!instanceof', rhs: replaceType}}])
    })
  }

  compileWithSubject(
    runtime: TypeRuntime,
    _subjectType: Types.Type,
  ): GetRuntimeResult<Nodes.MatchBinaryRange> {
    return mapMany(this.start.compile(runtime), this.stop.compile(runtime)).map(
      ([start, stop]) => new Nodes.MatchBinaryRange(toSource(this), this.op, start, stop),
    )
  }

  evalWithSubject(_runtime: ValueRuntime, op: Expression, lhs: Values.Value) {
    if (lhs.isRange()) {
      const [min, exclusiveMin] = lhs.start ?? []
      const [max, exclusiveMax] = lhs.stop ?? []
      if (!min || !max) {
        return okBoolean(false)
      }

      // these comparisons are similarly calculated as MatchUnaryRange
      // comparisons. The min of the lhs-range should be >= the min of the
      // match, and the max of the lhs-range should be <= the max of the match.
      // Exclusive comparisons `<` or `>` are used if the lhs-range is inclusive
      // and the comparison is exclusive.
      const minCompare: (lhs: number, rhs: number) => boolean =
        exclusiveMin || this.op === '...' || this.op === '<..'
          ? (lhsMin, matchMin) => lhsMin >= matchMin
          : (lhsMin, matchMin) => lhsMin > matchMin
      return comparisonOperation(op, min, this.start.value, minCompare).map(minOk => {
        if (!minOk.isEqual(Values.TrueValue)) {
          return okBoolean(false)
        }
        const maxCompare: (lhs: number, rhs: number) => boolean =
          exclusiveMax || this.op === '...' || this.op === '..<'
            ? (lhxMax, matchMax) => lhxMax <= matchMax
            : (lhxMax, matchMax) => lhxMax < matchMax
        return comparisonOperation(op, max, this.stop.value, maxCompare)
      })
    }

    if (!lhs.isFloat()) {
      return okBoolean(false)
    }

    const minCompare: (lhsMin: number, matchMin: number) => boolean =
      this.op === '...' || this.op === '..<'
        ? (lhsMin, matchMin) => lhsMin >= matchMin
        : (lhsMin, matchMin) => lhsMin > matchMin
    return comparisonOperation(op, lhs, this.start.value, minCompare).map(minOk => {
      if (!minOk.isEqual(Values.TrueValue)) {
        return okBoolean(false)
      }

      const maxCompare: (lhsMax: number, matchMax: number) => boolean =
        this.op === '...' || this.op === '<..'
          ? (lhsMax, matchMax) => lhsMax <= matchMax
          : (lhsMax, matchMax) => lhsMax < matchMax
      return comparisonOperation(op, lhs, this.stop.value, maxCompare)
    })
  }

  toLisp() {
    return `(${this.start.toCode()}${this.op}${this.stop.toLisp()})`
  }

  toCode(prevPrecedence = 0): string {
    if (prevPrecedence > this.precedence) {
      return `(${this.toCode(0)})`
    }

    return this.start.toCode() + this.op + this.stop.toCode()
  }
}
/**
 * The types of prefix, matches, and last enforce the alternation requirement:
 *     foo is "prefix"
 *     -- prefix = "prefix"
 *     -- matches = []
 *     -- lastRef = undefined
 *
 *     foo is "prefix" .. value
 *     -- prefix = "prefix"
 *     -- matches = []
 *     -- lastRef = value
 *
 *     foo is value .. "suffix"
 *     -- prefix = undefined
 *     -- matches = [value, 'suffix']
 *     -- lastRef = undefined
 *
 *     foo is "pre" .. value .. "post"
 *     -- prefix = "pre"
 *     -- matches = [value, 'post']
 *     -- lastRef = undefined
 *
 *     foo is "pre" .. value .. "post" .. remainder
 *     -- prefix = "pre"
 *     -- matches = [value, 'post']
 *     -- lastRef = remainder
 */

export class MatchStringExpression extends MatchExpression {
  constructor(
    range: Range,
    precedingComments: Comment[],
    readonly prefix: MatchLiteralString | undefined,
    readonly matches: [MatchReference, MatchLiteralString][],
    readonly lastRef: MatchReference | undefined,
  ) {
    super(range, precedingComments)
  }

  provides() {
    return new Set(this.matchAssignReferences())
  }

  all(): (MatchReference | MatchLiteralString)[] {
    const all: (MatchReference | MatchLiteralString)[] = this.prefix ? [this.prefix] : []
    for (const [match, literal] of this.matches) {
      all.push(match)
      all.push(literal)
    }
    if (this.lastRef) {
      all.push(this.lastRef)
    }
    return all
  }

  refs(): MatchReference[] {
    return this.matches.map(([match]) => match).concat(this.lastRef ? [this.lastRef] : [])
  }

  literals(): MatchLiteralString[] {
    return (this.prefix ? [this.prefix] : []).concat(this.matches.map(([, literal]) => literal))
  }

  matchAssignReferences() {
    return this.refs().flatMap(match => match.matchAssignReferences())
  }

  private calcMatchLength() {
    return this.literals().reduce((minLength, arg) => {
      return minLength + arg.literal.value.length
    }, 0)
  }

  /**
   * Add up all the string literals, the String is at least that length.
   */
  getAsTypeExpression(): GetTypeResult {
    return ok(
      Types.StringType.narrowString({
        length: {min: this.calcMatchLength(), max: undefined},
        regex: [],
      }),
    )
  }

  narrowUsingMatcherTypeSkippingOneOf(runtime: TypeRuntime, subjectType: Types.Type) {
    return this.getAsTypeExpression().map(type => Types.narrowTypeIs(subjectType, type))
  }

  gimmeTrueStuffWith(
    runtime: TypeRuntime,
    formula: RelationshipFormula | undefined,
    subjectType: Types.Type,
  ): GetRuntimeResult<Relationship[]> {
    let stringType: Types.Type | undefined
    let stringTypeMaxLength: number | undefined = undefined
    if (subjectType instanceof Types.OneOfType) {
      for (const type of subjectType.of) {
        if (!type.isString()) {
          continue
        }

        if (stringTypeMaxLength !== undefined) {
          const maxTypeLength = type.narrowedString.length.max
          stringTypeMaxLength =
            maxTypeLength === undefined ? undefined : Math.min(stringTypeMaxLength, maxTypeLength)
        }

        if (!stringType) {
          stringType = type
        } else {
          stringType = Types.compatibleWithBothTypes(stringType, type)
        }
      }
    } else if (subjectType.isString()) {
      stringType = subjectType
      stringTypeMaxLength = subjectType.narrowedString.length.max
    }

    if (!stringType) {
      return err(
        new RuntimeError(
          this,
          `Invalid match expression - '${this}: ${subjectType}' does not match string expression '${this}'`,
        ),
      )
    }

    const minMatchLength = this.calcMatchLength()
    if (stringTypeMaxLength !== undefined && minMatchLength > stringTypeMaxLength) {
      return err(
        new RuntimeError(
          this,
          `Invalid match expression - '${this}: ${subjectType}' always contains less characters than '${this}'`,
        ),
      )
    }

    const replaceType = Types.StringType.narrowString({
      length: {
        min: minMatchLength,
        max: undefined,
      },
      regex: [],
    })

    const relationships: Relationship[] = []
    if (formula) {
      relationships.push({
        formula,
        comparison: {operator: 'instanceof', rhs: replaceType},
      })
    }

    // all the assigned matches will have this length. They could be empty strings, but
    // at most they will have `remainingMaxLength` many characters
    const remainingMaxLength =
      stringTypeMaxLength === undefined ? undefined : stringTypeMaxLength - minMatchLength
    const type = Types.StringType.narrowString({
      length: {
        min: 0,
        max: remainingMaxLength,
      },
      regex: [],
    })

    for (const arg of this.all()) {
      const result = arg.gimmeTrueStuffWith(runtime, undefined, type)
      if (result.isErr()) {
        return err(result.error)
      }
      relationships.push(...result.value)
    }

    return ok(relationships)
  }

  gimmeFalseStuffWith(
    runtime: TypeRuntime,
    formula: RelationshipFormula | undefined,
    subjectType: Types.Type,
  ): GetRuntimeResult<Relationship[]> {
    if (!formula) {
      return ok([])
    }

    return this.narrowUsingMatcherType(runtime, subjectType).map(replaceType => {
      return [{formula, comparison: {operator: '!instanceof', rhs: replaceType}}]
    })
  }

  compileWithSubject(
    runtime: TypeRuntime,
    subjectType: Types.Type,
  ): GetRuntimeResult<Nodes.CaseMatch> {
    return this.getAsTypeExpression().map(stringType =>
      mapMany(
        mapOptional(this.prefix?.compileWithSubject(runtime, subjectType)),
        mapAll<Nodes.MatchReference | Nodes.MatchLiteral, RuntimeError>(
          this.matches.flatMap(([matchRef, matchLiteral]) => [
            matchRef.compileWithSubject(runtime, subjectType),
            matchLiteral.compileWithSubject(runtime, subjectType),
          ]),
        ),
        mapOptional(this.lastRef?.compileWithSubject(runtime, subjectType)),
      ).map(
        ([prefix, matches, last]) =>
          new Nodes.MatchStringConcat(
            toSource(this),
            stringType,
            [prefix, ...matches, last].flatMap(match => (match ? [match] : [])),
          ),
      ),
    )
  }

  evalWithSubjectReturningRuntime(
    runtime: ValueRuntime,
    _op: Expression,
    lhs: Values.Value,
  ): GetValueRuntimeResult {
    if (!lhs.isString()) {
      return ok([Values.FalseValue, runtime])
    }

    let subject = lhs.value
    // check the first arg for MatchStringLiteral, and see if it's the prefix
    if (this.prefix) {
      const firstMatch = this.prefix.literal.value.value
      if (!subject.startsWith(firstMatch)) {
        return ok([Values.FalseValue, runtime])
      }
      subject = subject.slice(firstMatch.length)
    }

    // because of how args are parsed, we always have an alternation of
    // [literal, ref, literal, ref, ...]. We removed the first and last literal
    // (if they exist), so if we have anything, we have a reference, followed by
    // (if any) a string, and another reference.
    const matches: [string, string][] = this.matches.map(([ref, lit]) => [
      ref.name,
      lit.literal.value.value,
    ])

    // small optimization: if the last arg is a MatchStringLiteral, check for
    // suffix (and pop it from the args stack)
    const lastAssign: [string, string][] = []
    const lastMatch = this.lastRef === undefined && matches.pop()
    if (lastMatch) {
      const [matchRef, matchString] = lastMatch
      if (!subject.endsWith(matchString)) {
        return ok([Values.FalseValue, runtime])
      }

      subject = subject.slice(0, -matchString.length)
      lastAssign.push([matchRef, subject])
    }

    // check the remainders and return. if didMatch is false, assigns is empty.
    const [didMatch, assigns, remainder] = this.searchRemainder(subject, matches)
    if (!didMatch) {
      ok([Values.FalseValue, runtime])
    }

    const mutableRuntime = new MutableValueRuntime(runtime)
    for (const [name, value] of assigns) {
      mutableRuntime.addLocalValue(name, Values.string(value))
    }
    if (this.lastRef) {
      mutableRuntime.addLocalValue(this.lastRef.name, Values.string(remainder))
    }
    return ok([Values.booleanValue(didMatch), mutableRuntime])
  }

  /**
   * During evaluation, returns a tuple of either
   *     [didMatch: true, assignments, remainder]`
   * on success or on failure returns
   *     [didMatch: false, [], '']
   */
  private searchRemainder(
    remainder: string,
    // array of [ref-name, literal]
    matches: [string, string][],
    assigns: [string, string][] = [],
  ): [boolean, [string, string][], string] {
    if (matches.length === 0) {
      return [true, assigns, remainder]
    }

    if (remainder === '') {
      throw "TODO: this should never happen - MatchStringLiteral is ''"
    }

    // find all the indices of 'remainder' that contain matches[0],
    // for every match, search for the remaining matches. this is a
    // breadth-first search.
    const [matchInfo, ...remaining] = matches
    const [ref, match] = matchInfo
    let index = remainder.indexOf(match)
    while (index !== -1) {
      const skipped = remainder.slice(0, index)
      const nextRemainder = remainder.slice(index + match.length)

      assigns.push([ref, skipped])
      const [found, finalAssigns, finalRemainder] = this.searchRemainder(
        nextRemainder,
        remaining,
        assigns,
      )
      if (found) {
        return [true, finalAssigns, finalRemainder]
      }
      assigns.pop()

      index = remainder.indexOf(match)
    }

    return [false, [], '']
  }

  toLisp() {
    const args = this.all().map(arg => arg.toLisp())

    return `(${args.join(' .. ')})`
  }

  toCode() {
    const args = this.all().map(arg => arg.toCode())

    return args.join(' .. ')
  }
}
/**
 * Matches the case name and args.
 *
 *     foo is .some
 *     foo is EnumName.some
 *     foo is .some(arg1, named: arg2)
 *     foo is .some(arg1, ...)
 *     foo is EnumName.some([1, 2, ...], .red)
 */

export class MatchEnumExpression extends MatchExpression {
  private minimumPositionalCount: number = 0
  private names = new Set<string>()

  constructor(
    range: Range,
    precedingComments: Comment[],
    readonly qualifiers: string[],
    readonly enumName: string | undefined,
    readonly name: string,
    readonly enumArgs: (
      | MatchNamedArgument
      | MatchPositionalArgument
      | MatchIgnoreRemainingExpression
    )[],
    readonly ignoreRemaining: boolean,
  ) {
    super(range, precedingComments)
    for (const arg of enumArgs) {
      if (arg instanceof MatchIgnoreRemainingExpression) {
        continue
      }

      if (arg instanceof MatchNamedArgument) {
        this.names.add(arg.name)
      } else {
        this.minimumPositionalCount += 1
      }
    }
  }

  provides() {
    return allProvides(this.enumArgs)
  }

  matchAssignReferences() {
    return this.enumArgs.flatMap(match => match.matchAssignReferences())
  }

  narrowUsingMatcherTypeSkippingOneOf(runtime: TypeRuntime, subjectType: Types.Type) {
    return this.findEnumTypeThatMatchesCase(runtime, subjectType).map(([type, _]) => type)
  }

  /**
   * Checks 'type' for an enum type with a case that matches the match data in
   * `this`.
   * - OneOfType searches all types for a matching enum
   * - `this.name` must match EnumType.name
   * - if `this.args` is empty only name needs to match.
   * - if `this.args` includes 'MatchIgnoreRemaining', then there should be enough
   *   positional args and names.
   * - otherwise there should be the same number of positional args and names.
   * - all the assigned names (in `this.names`) should be present in the enum case.
   */
  private findEnumTypeThatMatchesCase(
    runtime: TypeRuntime,
    subjectType: Types.Type,
  ): GetRuntimeResult<[Types.Type, Types.EnumCase[]]> {
    const result = this._findOneEnumTypeThatMatchesCase(runtime, subjectType)
    if (result.isErr()) {
      return err(result.error)
    }

    if (!result.value) {
      return err(
        new RuntimeError(
          this,
          `Invalid match expression - '${subjectType}' does not match case expression '${this}'`,
        ),
      )
    }

    return ok(result.value)
  }

  /**
   * See findEnumTypeThatMatchesCase – this function actually does the checking.
   * Three possible return values:
   * - `undefined` => no match found
   * - Err => Multiple matches found
   * - Ok([Types.Type, Types.EnumCase]) => match found
   */
  private _findOneEnumTypeThatMatchesCase(
    runtime: TypeRuntime,
    subjectType: Types.Type,
  ): GetRuntimeResult<[Types.Type, Types.EnumCase[]] | undefined> {
    if (subjectType instanceof Types.OneOfType) {
      let enumInfo: [Types.Type[], Types.EnumCase[]] | undefined
      for (const oneType of subjectType.of) {
        const result = this._findOneEnumTypeThatMatchesCase(runtime, oneType)
        if (result.isErr()) {
          return err(result.error)
        }

        if (!result.value) {
          continue
        }

        const [type, cases] = result.value
        if (enumInfo) {
          const [prevTypes, prevCases] = enumInfo
          prevTypes.push(type)
          prevCases.push(...cases)
        } else {
          // NB these arrays will be mutated in this loop via prevTypes
          enumInfo = [[type], cases]
        }
      }

      if (!enumInfo) {
        return ok(undefined)
      }
      const [types, cases] = enumInfo
      return ok([Types.oneOf(types), cases])
    }

    // must be an enum
    if (!(subjectType instanceof Types.EnumType)) {
      return ok(undefined)
    }

    let enumType: Types.EnumType = subjectType
    if (this.enumName) {
      // when the enumName is present, `type` must be of that named enum type
      // so it must first be a NamedEnumInstanceType
      if (!(enumType instanceof Types.NamedEnumInstanceType)) {
        return ok(undefined)
      }

      // starting at the first qualifier (a module name), work down to the enumName.
      const names = [...this.qualifiers, this.enumName]
      let name = names.shift()!
      let enumDef: Types.Type
      let previousType: Types.Type | undefined
      do {
        let nextType: Types.Type | undefined
        if (previousType) {
          nextType = previousType.propAccessType(name)
        } else {
          nextType = runtime.getLocalType(name)
        }

        if (!nextType) {
          const lookupType = names.length ? 'module' : 'enum'
          return err(new RuntimeError(this, `Could not find ${lookupType} name '${name}'.`))
        }
        previousType = nextType
        enumDef = nextType
        name = names.shift() ?? ''
      } while (name)

      // we better end up w/ a NamedEnumDefinitionType
      if (!(enumDef instanceof Types.NamedEnumDefinitionType)) {
        const qualifiers = [...this.qualifiers, this.enumName].join('.')
        return err(
          new RuntimeError(
            this,
            `Expected an enum match expression, but '${qualifiers}' refers to '${enumDef.toCode()}'`,
          ),
        )
      }

      // the type must come from the same enumDefinition - this is the qualifed
      // name check, after this we can use the default enum checking logic below
      if (!(enumType.metaType === enumDef)) {
        return ok(undefined)
      }
    }

    // must have a case with this name
    if (enumType.member.name !== this.name) {
      return ok(undefined)
    }
    const enumCase = enumType.member

    // if there are no args, then this is a match
    let enumCaseResult: GetRuntimeResult<Types.EnumCase>
    if (this.enumArgs.length === 0) {
      enumCaseResult = ok(enumCase)
    } else {
      // if there is no ignoreRemaining matcher, counts of all args must equal
      if (
        !this.ignoreRemaining &&
        (enumCase.positionalTypes.length !== this.minimumPositionalCount ||
          enumCase.namedTypes.size !== this.names.size)
      ) {
        return ok(undefined)
      }

      // all match args must be at least *present* in the enumType
      let argIndex = 0
      for (const arg of this.enumArgs) {
        if (arg instanceof MatchIgnoreRemainingExpression) {
          continue
        } else if (arg instanceof MatchNamedArgument) {
          const argType = enumCase.namedTypes.get(arg.name)
          if (!argType) {
            return ok(undefined)
          }
        } else {
          const argType = enumCase.positionalTypes.at(argIndex)
          if (!argType) {
            return ok(undefined)
          }
          argIndex++
        }
      }

      // now run the types through the match expressions
      argIndex = 0
      enumCaseResult = mapAll(
        this.enumArgs.map((arg): GetRuntimeResult<(Types.PositionalProp | Types.NamedProp)[]> => {
          if (arg instanceof MatchIgnoreRemainingExpression) {
            // combine remaining types
            const remaining: (Types.PositionalProp | Types.NamedProp)[] = []
            let remainingIndex = 0
            for (const arg of enumCase.args) {
              if (arg.is === 'positional') {
                if (remainingIndex >= argIndex) {
                  remaining.push(arg)
                }
                argIndex++
              } else if (!this.names.has(arg.name)) {
                remaining.push(arg)
              }
            }
            return ok(remaining)
          } else if (arg instanceof MatchNamedArgument) {
            const argType = enumCase.namedTypes.get(arg.name)
            return arg
              .narrowUsingMatcherType(runtime, argType!)
              .map(narrowedType => [Types.namedProp(arg.name, narrowedType)])
          } else {
            const argType = enumCase.positionalTypes[argIndex]
            argIndex += 1
            return arg
              .narrowUsingMatcherType(runtime, argType)
              .map(narrowedType => [Types.positionalProp(narrowedType)])
          }
        }),
      ).map(args => new Types.EnumCase(enumCase.name, args.flat()))
    }

    return enumCaseResult.map(enumCase => {
      if (enumCase.args.some(arg => arg.type === Types.NeverType)) {
        return
      }

      if (enumType instanceof Types.AnonymousEnumType) {
        enumType = Types.narrowAnonymousEnum(enumType, enumCase)
      } else if (enumType instanceof Types.NamedEnumInstanceType) {
        enumType = Types.narrowNamedEnum(enumType, enumCase)
      }

      return [enumType, [enumCase]]
    })
  }

  gimmeTrueStuffWith(
    runtime: TypeRuntime,
    formula: RelationshipFormula | undefined,
    subjectType: Types.Type,
  ): GetRuntimeResult<Relationship[]> {
    // TODO: add `ENUM_START + subjectType.members` to the runtime, so that
    // lookups can be inferred based on the subject
    return this.findEnumTypeThatMatchesCase(runtime, subjectType).map(enumInfo => {
      const [enumType, enumCases] = enumInfo
      const relationships: Relationship[] = []

      if (formula) {
        relationships.push({formula, comparison: {operator: 'instanceof', rhs: enumType}})
      }

      if (!this.enumArgs.length) {
        return ok(relationships)
      }

      let enumRelationships: Relationship[] = []
      for (const enumCase of enumCases) {
        let argIndex = 0
        for (const arg of this.enumArgs) {
          let type: Types.Type
          if (arg instanceof MatchIgnoreRemainingExpression) {
            // combine remaining types in the ObjectType
            const remaining: (Types.PositionalProp | Types.NamedProp)[] = []
            let remainingIndex = 0
            for (const arg of enumCase.args) {
              if (arg.is === 'positional') {
                if (remainingIndex >= argIndex) {
                  remaining.push(arg)
                }
                argIndex++
              } else if (!this.names.has(arg.name)) {
                remaining.push(arg)
              }
            }
            type = Types.object(remaining)
          } else if (arg instanceof MatchNamedArgument) {
            type = enumCase.namedTypes.get(arg.name)!
          } else {
            type = enumCase.positionalTypes[argIndex]
            argIndex += 1
          }

          const result = arg.gimmeTrueStuffWith(runtime, undefined, type)
          if (result.isErr()) {
            return err(result.error)
          }

          if (enumRelationships.length) {
            enumRelationships = combineOrRelationships(enumRelationships, result.value)
          } else {
            enumRelationships = result.value
          }
        }
      }

      relationships.push(...enumRelationships)
      return relationships
    })
  }

  // cannot infer anything in the 'false' case (TODO: or _at most_ the one
  // matching case could be excluded, when 'Exclude' is implemented).
  gimmeFalseStuffWith(
    runtime: TypeRuntime,
    formula: RelationshipFormula | undefined,
    subjectType: Types.Type,
  ): GetRuntimeResult<Relationship[]> {
    return this.findEnumTypeThatMatchesCase(runtime, subjectType).map(enumInfo => {
      const [enumType, _enumCase] = enumInfo
      const relationships: Relationship[] = []

      if (formula) {
        relationships.push({formula, comparison: {operator: '!instanceof', rhs: enumType}})
      }

      return ok(relationships)
    })
  }

  compileWithSubject(
    runtime: TypeRuntime,
    subjectType: Types.Type,
  ): GetRuntimeResult<Nodes.MatchEnum> {
    // TODO: add `ENUM_START + subjectType.members` to the runtime, so that
    // lookups can be inferred based on the subject
    return this.findEnumTypeThatMatchesCase(runtime, subjectType).map(enumInfo => {
      const [enumType, enumCases] = enumInfo
      let argIndex = 0
      return mapAll(
        this.enumArgs.map((arg): GetRuntimeResult<Nodes.MatchArgument | undefined> => {
          let argKey: string | number
          let argType: Types.Type | undefined
          if (arg instanceof MatchIgnoreRemainingExpression) {
            argKey = -1
            const types = enumCases.map(enumCase => {
              const remaining: (Types.PositionalProp | Types.NamedProp)[] = []
              let remainingIndex = 0
              for (const prop of enumCase.args) {
                if (prop.is === 'positional') {
                  if (remainingIndex >= argIndex) {
                    remaining.push(prop)
                  }
                  remainingIndex++
                } else if (!this.names.has(prop.name)) {
                  remaining.push(prop)
                }
              }
              return Types.object(remaining)
            })
            argType = Types.oneOf(types)
          } else if (arg instanceof MatchNamedArgument) {
            argKey = arg.name
            const types = enumCases
              .map(enumCase => enumCase.namedTypes.get(arg.name))
              .filter(arg => arg !== undefined)
            if (types.length) {
              argType = Types.oneOf(types)
            }
          } else {
            argKey = argIndex
            const types = enumCases
              .map(enumCase => enumCase.positionalTypes.at(argIndex))
              .filter(arg => arg !== undefined)
            if (types.length) {
              argType = Types.oneOf(types)
            }
          }

          if (!argType) {
            return err(
              new RuntimeError(this, `No argument type for '${argKey}' of ${enumType.toCode()}`),
            )
          }

          return arg.compileWithSubject(runtime, argType).map(node => {
            if (node instanceof Nodes.MatchNamedArgument) {
              return node
            } else {
              return new Nodes.MatchPositionalArgument(toSource(this), node)
            }
          })
        }),
      )
        .map(args => args.filter(arg => arg !== undefined))
        .map(
          args =>
            new Nodes.MatchEnum(
              toSource(this),
              enumType,
              this.qualifiers,
              this.enumName,
              this.name,
              args,
              this.ignoreRemaining,
            ),
        )
    })
  }

  evalWithSubject(runtime: ValueRuntime, _op: Expression, lhs: Values.Value) {
    if (!(lhs instanceof Values.EnumShorthandValue)) {
      return okBoolean(false)
    }

    const thisEnum = runtime.getLocalValue(ENUM_START + this.name)
    if (!thisEnum) {
      return okBoolean(false)
    }

    return okBoolean(lhs.isEqual(thisEnum))
  }

  toLisp() {
    let code: string = ''
    if (this.enumName) {
      code += [...this.qualifiers, this.enumName].join('.')
    }

    code += ENUM_START + this.name

    const args = this.enumArgs.map(arg => arg.toLisp())
    if (args.length || this.ignoreRemaining) {
      code += '('
      code += args.join(' ')
      code += ')'
    }

    return code
  }

  toCode() {
    let code: string = ''
    if (this.enumName) {
      code += [...this.qualifiers, this.enumName].join('.')
    }

    code += ENUM_START + this.name

    const args = this.enumArgs.map(arg => arg.toCode())
    if (args.length || this.ignoreRemaining) {
      code += '('
      code += args.join(', ')
      code += ')'
    }

    return code
  }
}

/**
 * The MatchObjectExpression matches against ObjectType and ClassInstanceType
 *
 * foo is {}
 * foo is {name: _} {name:, ...} {name: foo} {name?: _}
 * foo is {a, b, _, bar:, ...}
 * foo is User{name:}
 * foo is User{a, b, _, bar:}
 */
export class MatchObjectExpression extends MatchExpression {
  readonly ignoreRemaining: boolean

  constructor(
    range: Range,
    precedingComments: Comment[],
    readonly typeName: Reference | undefined,
    readonly exprs: (MatchNamedArgument | MatchPositionalArgument)[],
    ignoreRemaining: boolean,
  ) {
    super(range, precedingComments)
    this.ignoreRemaining = ignoreRemaining || !!this.typeName
  }

  alwaysMatches(lhs: Types.Type): boolean {
    if (lhs instanceof Types.OneOfType) {
      return lhs.of.every(type => this.alwaysMatches(type))
    }

    if (!(lhs instanceof Types.ObjectType)) {
      return false
    }

    const names = new Set(lhs.namedTypes.keys())
    let positions = lhs.positionalTypes.size

    let argIndex = 0
    for (const matchExpr of this.exprs) {
      let propType: Types.Type | undefined
      const matcher: MatchExpression = matchExpr.matchExpr
      if (matchExpr instanceof MatchNamedArgument) {
        propType = lhs.literalAccessType(matchExpr.name)
        names.delete(matchExpr.name)
      } else {
        propType = lhs.literalAccessType(argIndex)
        argIndex += 1
        positions -= 1
      }

      if (!propType) {
        // propType is required in the matcher, but this ObjectType doesn't
        // define it. this is a "neverMatches" case, if there was such a thing.
        return false
      }

      if (!matcher.alwaysMatches(propType)) {
        return false
      }
    }

    if (!this.ignoreRemaining && (names.size || positions)) {
      return false
    }

    return true
  }

  all() {
    return this.exprs
  }

  matchAssignReferences() {
    return this.all().flatMap(match => match.matchAssignReferences())
  }

  provides() {
    return allProvides(this.all())
  }

  /**
   * A bit of a doozy, compared to the others. ObjectType is the only matcher
   * that has to "assemble" so many types, because ObjectType is the
   * heterogenous product type.
   *
   * - Iterate over all the matchExpressions.
   * - Get the corresponding type from the ObjectType, either named or
   *   positional
   * - If the prop doesn't exist, abort (return NeverType)
   * - Narrow the propType using
   *   `matchExpr.narrowUsingMatcherTypeSkippingOneOf(runtime, propType)`
   * - Replace the prop on the original ObjectType.
   */
  narrowUsingMatcherTypeSkippingOneOf(
    runtime: TypeRuntime,
    subjectType: Types.Type,
  ): GetTypeResult {
    if (!(subjectType instanceof Types.ObjectType)) {
      return ok(Types.NeverType)
    }

    const typeResult = mapOptional(
      this.typeName ? getChildAsTypeExpression(this, this.typeName, runtime) : undefined,
    )
    if (typeResult.isErr()) {
      return err(typeResult.error)
    }
    const typeAssert = typeResult.value
    if (typeAssert && !Types.canBeAssignedTo(subjectType, typeAssert)) {
      return ok(Types.NeverType)
    }

    // do an exhaustive check first
    if (!this.ignoreRemaining) {
      const names = new Set(subjectType.namedTypes.keys())
      let positions = subjectType.positionalTypes.size
      for (const matchExpr of this.exprs) {
        if (matchExpr instanceof MatchNamedArgument) {
          names.delete(matchExpr.name)
        } else {
          positions -= 1
        }
      }

      if (names.size || positions) {
        return ok(Types.NeverType)
      }
    }

    return reduceAll(
      subjectType as Types.ObjectType | undefined,
      this.exprs,
      (subjectType, matchExpr) => {
        if (!subjectType) {
          return ok(undefined)
        }

        let propName: string | number
        let propType: Types.Type | undefined
        if (matchExpr instanceof MatchNamedArgument) {
          propName = matchExpr.name
          propType = subjectType.namedProp(propName)
        } else {
          propName = matchExpr.index
          propType = subjectType.positionalProp(propName)
        }

        if (propType) {
          return matchExpr
            .narrowUsingMatcherType(runtime, propType)
            .map(type => subjectType.replacingProp(propName, type))
        } else {
          return ok(undefined)
        }
      },
    ).map(objectType => {
      if (objectType === undefined) {
        return Types.NeverType
      } else if (typeAssert) {
        return typeAssert
      } else {
        return objectType
      }
    })
  }

  private earlyExitCheck(
    formula: RelationshipFormula | undefined,
    subjectType: Types.Type,
  ): GetRuntimeResult<Relationship[] | Types.Type> {
    // if no types are an object, raise an error
    let matchedObjectType: Types.ObjectType[] =
      subjectType instanceof Types.ObjectType ? [subjectType] : []
    if (subjectType instanceof Types.OneOfType) {
      matchedObjectType = subjectType.of.filter(type => type instanceof Types.ObjectType)
    }

    if (!matchedObjectType.length) {
      return err(
        new RuntimeError(
          this,
          `Invalid match expression. '${this}: ${subjectType.toCode()}' does not match object expression '${this.toCode()}'`,
        ),
      )
    }

    let argIndex = 0
    for (const matchExpr of this.exprs) {
      let prop: string | number
      if (matchExpr instanceof MatchNamedArgument) {
        prop = matchExpr.name
      } else {
        prop = argIndex++
      }

      const errorType = matchedObjectType.find(type => type.literalAccessType(prop) === undefined)
      if (errorType) {
        return err(
          new RuntimeError(
            this,
            `Invalid match expression. '${errorType.toCode()}' does not match object expression '${this.toCode()}' due to missing key '${prop}'`,
          ),
        )
      }
    }

    if (!formula && !this.exprs.length) {
      return ok([])
    }

    return ok(subjectType)
  }

  gimmeTrueStuffWith(
    runtime: TypeRuntime,
    formula: RelationshipFormula | undefined,
    subjectType: Types.Type,
  ): GetRuntimeResult<Relationship[]> {
    return this.earlyExitCheck(formula, subjectType).map(value => {
      if (value instanceof Array) {
        return ok(value)
      }

      return this.narrowUsingMatcherType(runtime, value).map(replaceType => {
        const relationships: Relationship[] = []

        if (formula) {
          relationships.push({
            formula,
            comparison: {
              operator: 'instanceof',
              rhs: replaceType,
            },
          })
        }

        // now iterate over each matcher and assign relationships to the object
        // properties, and give matchers a chance to assign variables via
        // relationships
        let argIndex = 0
        for (const matchExpr of this.exprs) {
          let prop: string | number
          if (matchExpr instanceof MatchNamedArgument) {
            prop = matchExpr.name
          } else {
            prop = argIndex++
          }
          const propType = replaceType.literalAccessType(prop)

          // errors due to accessing properties that don't exist on the object
          // should already be handled in `earlyExitCheck` - or it's optional
          if (!propType) {
            continue
          }

          const accessFormula = formula && relationshipFormula.propertyAccess(formula, prop)
          const result = matchExpr.gimmeTrueStuffWith(runtime, accessFormula, propType)
          if (result.isErr()) {
            return err(result.error)
          }
          relationships.push(...result.value)
        }

        return relationships
      })
    })
  }

  gimmeFalseStuffWith(
    runtime: TypeRuntime,
    formula: RelationshipFormula | undefined,
    lhsType: Types.Type,
  ): GetRuntimeResult<Relationship[]> {
    if (!formula) {
      return ok([])
    }

    return this.narrowUsingMatcherType(runtime, lhsType).map(replaceType => {
      return [{formula, comparison: {operator: '!instanceof', rhs: replaceType}}]
    })
  }

  private collectTypes(objectType: Types.Type) {
    let types = new Map<string | number, Types.Type>()
    let objectTypes: Types.ObjectType[] = []
    if (objectType instanceof Types.ObjectType) {
      objectTypes.push(objectType)
    } else if (objectType instanceof Types.OneOfType) {
      objectTypes.push(...objectType.of.filter(ofType => ofType instanceof Types.ObjectType))
    }

    for (const objectType of objectTypes) {
      for (const [name, type] of objectType.namedTypes.entries()) {
        const previousType = types.get(name)
        if (previousType) {
          types.set(name, Types.oneOf([type, previousType]))
        } else {
          types.set(name, type)
        }
      }
      for (const [index, type] of objectType.positionalTypes.entries()) {
        const previousType = types.get(index)
        if (previousType) {
          types.set(index, Types.oneOf([type, previousType]))
        } else {
          types.set(index, type)
        }
      }
    }

    return types
  }

  compileWithSubject(
    runtime: TypeRuntime,
    subjectType: Types.Type,
  ): GetRuntimeResult<Nodes.MatchObject> {
    return this.narrowUsingMatcherType(runtime, subjectType).map(objectType => {
      const types = this.collectTypes(objectType)

      return mapAll(
        this.exprs.map((arg): GetRuntimeResult<Nodes.MatchArgument | undefined> => {
          let argKey: string | number
          let argType: Types.Type | undefined
          if (arg instanceof MatchNamedArgument) {
            argKey = arg.name
          } else {
            argKey = arg.index
          }
          argType = types.get(argKey)

          if (!argType) {
            return err(
              new RuntimeError(this, `No argument type for '${argKey}' of ${objectType.toCode()}`),
            )
          }

          return arg.compileWithSubject(runtime, argType).map(node => {
            if (node instanceof Nodes.MatchNamedArgument) {
              return node
            } else {
              return new Nodes.MatchPositionalArgument(toSource(this), node)
            }
          })
        }),
      )
        .map(args => args.filter(arg => arg !== undefined))
        .map(args => new Nodes.MatchObject(toSource(this), objectType, args, this.ignoreRemaining))
    })
  }

  evalWithSubjectReturningRuntime(
    runtime: ValueRuntime,
    _op: Expression,
    lhs: Values.Value,
  ): GetValueRuntimeResult {
    if (!(lhs instanceof Values.ObjectValue)) {
      return ok([Values.FalseValue, runtime])
    }

    let nextRuntime = runtime
    let argIndex = 0
    for (const matchExpr of this.exprs) {
      let propValue: Values.Value | undefined
      if (matchExpr instanceof MatchNamedArgument) {
        propValue = lhs.arrayAccessValue(matchExpr.name)
      } else {
        propValue = lhs.arrayAccessValue(argIndex++)
      }

      if (!propValue) {
        return ok([Values.FalseValue, runtime])
      }

      const nextRuntimeResult = matchExpr.evalWithSubjectReturningRuntime(
        nextRuntime,
        this,
        propValue,
      )
      if (nextRuntimeResult.isErr()) {
        return err(nextRuntimeResult.error)
      }
      if (!nextRuntimeResult.value[0].isTruthy()) {
        return ok([Values.FalseValue, runtime])
      }
      nextRuntime = nextRuntimeResult.value[1]
    }
    return ok([Values.TrueValue, nextRuntime])
  }

  toLisp() {
    const exprCode = this.all().map(arg => arg.toLisp())
    if (this.ignoreRemaining && !this.typeName) {
      exprCode.push('...')
    }

    return `{${this.typeName ? this.typeName.toLisp() + ' ' : ''}${exprCode.join(' ')}}`
  }

  toCode() {
    let code = `${this.typeName?.toCode() ?? ''}{`
    let first = true
    const exprCode = this.exprs.map(expr => expr.toCode())
    if (this.ignoreRemaining && !this.typeName) {
      exprCode.push('...')
    }

    for (const matchCode of exprCode) {
      if (!first) {
        code += ', '
      }
      first = false
      code += matchCode
    }
    code += '}'

    return code
  }
}
/**
 * foo is [value, ...values]
 * foo is [_, ...]
 * foo is [_, ..., _]
 */

export class MatchArrayExpression extends MatchExpression {
  constructor(
    range: Range,
    precedingComments: Comment[],
    readonly initialExprs: MatchExpression[],
    readonly remainingExpr:
      | MatchIgnoreRemainingExpression
      | MatchAssignRemainingExpression
      | undefined,
    readonly trailingExprs: MatchExpression[],
  ) {
    super(range, precedingComments)
  }

  all() {
    return this.initialExprs
      .concat(this.remainingExpr ? [this.remainingExpr] : [])
      .concat(this.trailingExprs)
  }

  alwaysMatches(lhs: Types.Type): boolean {
    if (lhs instanceof Types.OneOfType) {
      return lhs.of.every(type => this.alwaysMatches(type))
    }

    if (!(lhs instanceof Types.ArrayType)) {
      return false
    }

    if (this.remainingExpr && !this.remainingExpr.alwaysMatches(lhs.of)) {
      return false
    }

    const minLength = this.initialExprs.length + this.trailingExprs.length
    if (
      lhs.narrowedLength.min === undefined ||
      lhs.narrowedLength.max === undefined ||
      lhs.narrowedLength.min !== minLength ||
      lhs.narrowedLength.max !== minLength
    ) {
      return false
    }

    return this.initialExprs.concat(this.trailingExprs).every(expr => expr.alwaysMatches(lhs.of))
  }

  matchAssignReferences() {
    return this.all().flatMap(matchExpr => matchExpr.matchAssignReferences())
  }

  provides() {
    return allProvides(this.all())
  }

  private calculateArrayInformation(subjectType: Types.ArrayType) {
    const matchExprs = this.initialExprs
      .concat(this.remainingExpr ? [this.remainingExpr] : [])
      .concat(this.trailingExprs)
    const minLength = this.initialExprs.length + this.trailingExprs.length
    const maxLength = this.remainingExpr ? undefined : minLength
    const remainingMin =
      subjectType.narrowedLength.min === undefined
        ? undefined
        : Math.max(0, subjectType.narrowedLength.min - minLength)
    const remainingMax =
      subjectType.narrowedLength.max === undefined
        ? undefined
        : Math.max(0, subjectType.narrowedLength.max - minLength)
    const remainingArray = Types.array(subjectType.of, {min: remainingMin, max: remainingMax})
    return {matchExprs, minLength, maxLength, remainingArray}
  }

  /**
   * Constructs and combines a map of all the match expressions to the narrowed
   * array type for that matcher.
   * - each matcher can assign a relationship to the corresponding array entry
   * - all the matcher types can be combined to narrow the array type
   */
  mapAllMatchersToNarrowed(
    runtime: TypeRuntime,
    subjectType: Types.Type,
  ): GetRuntimeResult<Map<MatchExpression, Types.Type> | undefined> {
    if (subjectType instanceof Types.OneOfType) {
      return mapAll(
        subjectType.of.map(ofType => this.mapAllMatchersToNarrowed(runtime, ofType)),
      ).map(maps => {
        const combined = new Map<MatchExpression, Types.Type>()
        for (const map of maps) {
          if (!map) {
            continue
          }

          for (const [matchExpr, matchType] of map.entries()) {
            const existing = combined.get(matchExpr)
            if (existing) {
              combined.set(matchExpr, Types.compatibleWithBothTypes(existing, matchType))
            } else {
              combined.set(matchExpr, matchType)
            }
          }
        }
        if (combined.size === 0) {
          return undefined
        }

        return combined
      })
    } else if (!(subjectType instanceof Types.ArrayType)) {
      return ok(undefined)
    }

    const {matchExprs, remainingArray} = this.calculateArrayInformation(subjectType)
    return mapAll(
      matchExprs.map(matchExpr => {
        // remainingExpr has special handling in many places - when narrowing with
        // narrowUsingMatcherType, remainingExpr needs an array type.
        const arrayOfType = matchExpr === this.remainingExpr ? remainingArray : subjectType.of
        return matchExpr
          .narrowUsingMatcherType(runtime, arrayOfType)
          .map(matchType => [matchExpr, matchType] as const)
      }),
    ).map(entries => {
      if (entries.some(([_, matchType]) => matchType === Types.NeverType)) {
        return undefined
      }
      return new Map(entries)
    })
  }

  // narrow the array based on the length and match expressions
  narrowUsingMatcherTypeSkippingOneOf(
    runtime: TypeRuntime,
    subjectType: Types.Type,
  ): GetTypeResult {
    if (!(subjectType instanceof Types.ArrayType)) {
      return ok(Types.NeverType)
    }

    const {matchExprs, minLength, maxLength, remainingArray} =
      this.calculateArrayInformation(subjectType)

    if (!matchExprs.length) {
      return ok(subjectType.narrowLength(0, 0))
    }

    // - if any matchers result in NeverType, the entire expression cannot match
    // - we can combine the types of all the matchers into one narrowed type
    // - the initialExprs and trailingExprs can narrow the length
    const [firstExpr, ...restExprs] = matchExprs
    const arrayOfFirstType = firstExpr === this.remainingExpr ? remainingArray : subjectType.of
    const initialType = firstExpr.narrowUsingMatcherType(runtime, arrayOfFirstType)
    if (initialType.isErr()) {
      return initialType
    }

    const firstType =
      firstExpr === this.remainingExpr && initialType.value instanceof Types.ArrayType
        ? initialType.value.of
        : initialType.value

    return reduceAll(firstType, restExprs, (combinedType, matchExpr) => {
      if (combinedType === Types.NeverType) {
        return ok(Types.NeverType)
      }

      // remainingExpr has special handling in many places - when narrowing with
      // narrowUsingMatcherType, remainingExpr needs the original subjectType
      const arrayOfType = matchExpr === this.remainingExpr ? remainingArray : subjectType.of
      return matchExpr.narrowUsingMatcherType(runtime, arrayOfType).map(narrowedType => {
        // remainingExpr has special handling in many places - here we expect an array type
        // but it could be NeverType
        if (matchExpr === this.remainingExpr) {
          const narrowOfType =
            narrowedType instanceof Types.ArrayType ? narrowedType.of : narrowedType
          return Types.compatibleWithBothTypes(combinedType, narrowOfType)
        } else {
          return Types.compatibleWithBothTypes(combinedType, narrowedType)
        }
      })
    }).map(combinedType => {
      // combinedType is not ArrayType because we guarantee the matchExpr.length
      if (combinedType === Types.NeverType) {
        return ok(Types.NeverType)
      }

      return ok(
        Types.array(combinedType, subjectType.narrowedLength).narrowLength(minLength, maxLength),
      )
    })
  }

  private earlyExitCheck(
    formula: RelationshipFormula | undefined,
    subjectType: Types.Type,
  ): GetRuntimeResult<Relationship[] | Types.Type> {
    // if no types are an array, raise an error
    let foundCorrectType = subjectType instanceof Types.ArrayType
    if (subjectType instanceof Types.OneOfType) {
      foundCorrectType = subjectType.of.some(type => type instanceof Types.ArrayType)
    }

    if (!foundCorrectType) {
      return err(
        new RuntimeError(
          this,
          `Invalid match expression - '${this}: ${subjectType.toCode()}' does not match array expression '${this.toCode()}'`,
        ),
      )
    }

    if (
      !formula &&
      !this.initialExprs.length &&
      !this.remainingExpr &&
      !this.trailingExprs.length
    ) {
      return ok([])
    }

    return ok(subjectType)
  }

  gimmeTrueStuffWith(
    runtime: TypeRuntime,
    formula: RelationshipFormula | undefined,
    subjectType: Types.Type,
  ): GetRuntimeResult<Relationship[]> {
    return this.earlyExitCheck(formula, subjectType).map(value => {
      if (value instanceof Array) {
        return ok(value)
      }

      // value is either ArrayType or OneOf(..., ArrayType, ...)
      // mapAllMatchersToNarrowed iterates over all the matchExprs, turning them
      // into a map. If subjectType is a OneOf type, the propertyType in
      // matchExprMap is a combination of all the types.
      return this.mapAllMatchersToNarrowed(runtime, subjectType).map(matchExprMap => {
        // early exit (error) if the matchExpr did not match the subjectType
        if (!matchExprMap) {
          return err(
            new RuntimeError(
              this,
              `Invalid match expression - '${this}: ${subjectType.toCode()}' does not match array expression '${this.toCode()}'`,
            ),
          )
        }

        return this.narrowUsingMatcherType(runtime, value).map(arrayType => {
          const relationships: Relationship[] = []

          if (formula) {
            relationships.push({
              formula,
              comparison: {operator: 'instanceof', rhs: arrayType},
            })
          }

          // for every expression in initialExprs, we can add a relationship for
          // formula[0], formula[1], ...
          for (const [index, matchExpr] of this.initialExprs.entries()) {
            const matchType = matchExprMap.get(matchExpr)
            if (matchType) {
              // if we have a formula, we can compute an array access formula
              // based on it (otherwise accessFormula is undefined, but it's still
              // possible to add relationships)
              // TODO: if the array is a fixed length, we should also assign
              // relationships for negative indices.
              const accessFormula =
                formula && relationshipFormula.arrayAccess(formula, relationshipFormula.int(index))
              const result = matchExpr.gimmeTrueStuffWith(runtime, accessFormula, matchType)
              if (result.isErr()) {
                return err(result)
              }
              relationships.push(...result.value)
            }
          }

          // TODO: handle remainingExpr and trailingExprs in relationship.ts
          // - remainingExpr needs support for "all indices in this range"
          // - trailingExprs needs support for negative indices
          // - or, if arrayType has a maximumLength, we can assign relationships
          //   using positive indices
          const remainingAndTrailing = ([] as MatchExpression[])
            .concat(this.remainingExpr ? [this.remainingExpr] : [])
            .concat(this.trailingExprs)
          for (const matchExpr of remainingAndTrailing) {
            const matchType = matchExprMap.get(matchExpr)
            if (matchType) {
              const result = matchExpr.gimmeTrueStuffWith(runtime, undefined, matchType)
              if (result.isErr()) {
                return err(result)
              }
              relationships.push(...result.value)
            }
          }

          return ok(relationships)
        })
      })
    })
  }

  /**
   * In the false case, we might be able to refine the array type.
   * - If the array matches all elements, then the array type is 'never'
   * - If the array matches the minimum array length, then the false case has
   * the minimum increased by one
   * - Likewise if the array matches the maximum array length, the false case
   * has the maximum decreased by one
   * - It gets weirder... if the array matches *somewhere* in the length
   * range, the array could have less OR more than the matched items.
   *
   * But oh, good news, it's all handled by asserting against the length, using
   * `[all, minLength ... minLength]`. This comment was a lot more relevant
   * when this implementation was a hundred+ lines.
   */
  gimmeFalseStuffWith(
    runtime: TypeRuntime,
    formula: RelationshipFormula | undefined,
    subjectType: Types.Type,
  ): GetRuntimeResult<Relationship[]> {
    if (!formula) {
      return ok([])
    }

    return this.earlyExitCheck(formula, subjectType).map(value => {
      if (value instanceof Array) {
        return ok(value)
      }

      return this.narrowUsingMatcherType(runtime, value).map(arrayType => {
        const relationships: Relationship[] = []

        relationships.push({
          formula,
          comparison: {operator: '!instanceof', rhs: arrayType},
        })

        return ok(relationships)
      })
    })
  }

  private collectTypes(arrayType: Types.Type) {
    if (arrayType instanceof Types.ArrayType) {
      return arrayType.of
    } else if (arrayType instanceof Types.OneOfType) {
      const ofTypes = arrayType.of
        .filter(ofType => ofType instanceof Types.ArrayType)
        .map(arrayType => arrayType.of)
      return Types.oneOf(ofTypes)
    }

    return Types.NeverType
  }

  compileWithSubject(
    runtime: TypeRuntime,
    subjectType: Types.Type,
  ): GetRuntimeResult<Nodes.MatchArray> {
    return this.narrowUsingMatcherType(runtime, subjectType).map(arrayType => {
      const combinedOfType = this.collectTypes(arrayType)

      return mapMany(
        mapAll(this.initialExprs.map(expr => expr.compileWithSubject(runtime, combinedOfType))),
        mapOptional<Nodes.MatchIgnoreRemaining | Nodes.MatchAssignRemaining, RuntimeError>(
          this.remainingExpr?.compileWithSubject(runtime, combinedOfType),
        ),
        mapAll(this.trailingExprs.map(expr => expr.compileWithSubject(runtime, combinedOfType))),
      ).map(
        ([initialNodes, remainingNode, trailingNodes]) =>
          new Nodes.MatchArray(
            toSource(this),
            arrayType,
            initialNodes,
            remainingNode,
            trailingNodes,
          ),
      )
    })
  }

  evalWithSubjectReturningRuntime(
    runtime: ValueRuntime,
    _op: Expression,
    lhs: Values.Value,
  ): GetValueRuntimeResult {
    if (!(lhs instanceof Values.ArrayValue)) {
      return ok([Values.FalseValue, runtime])
    }

    const minLength = this.initialExprs.length + this.trailingExprs.length
    if (lhs.values.length < minLength || (!this.remainingExpr && lhs.values.length !== minLength)) {
      return ok([Values.FalseValue, runtime])
    }

    const initialValues = lhs.values.slice(0, this.initialExprs.length)
    const trailingValues = lhs.values.slice(-this.trailingExprs.length)

    let nextRuntime = runtime
    for (const index in this.initialExprs) {
      const matchExpr = this.initialExprs[index]
      const value = initialValues[index]
      const nextRuntimeResult = matchExpr.evalWithSubjectReturningRuntime(nextRuntime, this, value)
      if (nextRuntimeResult.isErr()) {
        return err(nextRuntimeResult.error)
      }
      if (!nextRuntimeResult.value[0].isTruthy()) {
        return ok([Values.FalseValue, runtime])
      }
      nextRuntime = nextRuntimeResult.value[1]
    }

    if (this.remainingExpr) {
      const remainingValues = lhs.values.slice(this.initialExprs.length, -this.trailingExprs.length)
      const nextRuntimeResult = this.remainingExpr.evalWithSubjectReturningRuntime(
        nextRuntime,
        this,
        new Values.ArrayValue(remainingValues),
      )
      if (nextRuntimeResult.isErr()) {
        return err(nextRuntimeResult.error)
      }
      if (!nextRuntimeResult.value[0].isTruthy()) {
        return ok([Values.FalseValue, runtime])
      }
      nextRuntime = nextRuntimeResult.value[1]
    }

    for (const index in this.trailingExprs) {
      const matchExpr = this.trailingExprs[index]
      const value = trailingValues[index]
      const nextRuntimeResult = matchExpr.evalWithSubjectReturningRuntime(nextRuntime, this, value)
      if (nextRuntimeResult.isErr()) {
        return err(nextRuntimeResult.error)
      }
      if (!nextRuntimeResult.value[0].isTruthy()) {
        return ok([Values.FalseValue, runtime])
      }
      nextRuntime = nextRuntimeResult.value[1]
    }

    return ok([Values.TrueValue, nextRuntime])
  }

  toLisp() {
    const args = this.all().map(arg => arg.toLisp())

    return `[${args.join(' ')}]`
  }

  toCode() {
    const args = this.all().map(arg => arg.toCode())

    return `[${args.join(', ')}]`
  }
}

export class MatchAnyOneOfExpression extends MatchExpression {
  constructor(
    range: Range,
    precedingComments: Comment[],
    readonly matches: MatchExpression[],
  ) {
    super(range, precedingComments)
  }

  matchAssignReferences() {
    return this.matches.flatMap(match => match.matchAssignReferences())
  }

  /**
   * H'okay, so. Case expressions can have multiple matches:
   *     switch subject
   *       case [first] or [_, first] or …
   *
   * We combine all these matches using the same logic as we do with 'or'
   *
   *      subject is [first] or subject is [_, first]
   *
   * Except, unlike 'or' expressions, cases need not have the same assignments
   * in all branches (missing assignments default to 'null').
   *
   * To calculate this, we need to iterate through the matches, keeping track
   * of the previous match-expression (so that we can calculate its
   * `assumeFalse` runtime) and previous truthy-runtime (so that we can combine
   * it with the current match's `assumeTrue` runtime). The return value is the
   * final `combineEitherTypeRuntimes` (or if there is only one match
   * expression, this all reduces to just calculating its `assumeTrue` runtime)
   */
  assumeTrueWith(
    runtime: TypeRuntime,
    formula: RelationshipFormula | undefined,
    subjectType: Types.Type,
  ) {
    let currentRuntime = runtime
    let nextRuntime: TypeRuntime | undefined
    let prevExpr: MatchExpression | undefined
    for (const matchExpr of this.matches) {
      if (prevExpr) {
        const prevFalseRuntimeResult = prevExpr.assumeFalseWith(
          currentRuntime,
          formula,
          subjectType,
        )
        if (prevFalseRuntimeResult.isErr()) {
          return err(prevFalseRuntimeResult.error)
        }

        currentRuntime = prevFalseRuntimeResult.value
      }

      const nextRuntimeResult = matchExpr.assumeTrueWith(currentRuntime, formula, subjectType)
      if (nextRuntimeResult.isErr()) {
        return err(nextRuntimeResult.error)
      }

      if (nextRuntime && prevExpr) {
        const combinedRuntimeResult = combineEitherTypeRuntimes(
          currentRuntime,
          nextRuntime,
          nextRuntimeResult.value,
          'case',
        )
        nextRuntime = combinedRuntimeResult.get()
      } else {
        nextRuntime = nextRuntimeResult.value
      }

      prevExpr = matchExpr
    }

    return ok(nextRuntime ?? runtime)
  }

  /**
   * The false condition is much simpler - `assumeFalse` of every match
   * expression (again, the same logic as `or` expressions).
   */
  assumeFalseWith(
    runtime: TypeRuntime,
    formula: RelationshipFormula | undefined,
    subjectType: Types.Type,
  ) {
    return reduceAll(runtime, this.matches, (runtime, matchExpr): GetRuntimeResult<TypeRuntime> => {
      return matchExpr.assumeFalseWith(runtime, formula, subjectType)
    })
  }

  toLisp() {
    const caseCode = this.matches.map(match => match.toLisp()).join(' ')
    return '(' + caseCode + ')'
  }

  toCode() {
    const cases = this.matches.map(match => match.toCode()).join(' or ')
    const hasNewline = cases.includes('\n') || cases.length > MAX_LEN

    let code = ''
    if (hasNewline) {
      code += this.matches[0].toCode()
      code += this.matches.slice(1).map(match => ' or\n' + indent(match.toCode()))
    } else {
      code += cases
    }
    return code
  }

  compileWithSubject(
    runtime: TypeRuntime,
    subjectType: Types.Type,
  ): GetRuntimeResult<Nodes.MatchAnyOneOf> {
    return mapAll(
      this.matches.map(matchExpr => matchExpr.compileWithSubject(runtime, subjectType)),
    ).map(matchNodes => new Nodes.MatchAnyOneOf(matchNodes))
  }

  evalWithSubjectReturningRuntime(
    runtime: ValueRuntime,
    caseExpr: Expression,
    subject: Values.Value,
  ): GetValueRuntimeResult {
    const allAssigns = allNamesFrom(this.matches)
    for (const matchExpr of this.matches) {
      const didMatchResult = matchExpr.evalWithSubjectReturningRuntime(runtime, caseExpr, subject)
      if (didMatchResult.isErr()) {
        return err(didMatchResult.error)
      }

      const [didMatch, matchRuntimeUnchecked] = didMatchResult.value
      if (didMatch.isTruthy()) {
        const matchRuntime = includeMissingNames(matchRuntimeUnchecked, allAssigns, matchExpr)
        return ok([didMatch, matchRuntime])
      }
    }
    return ok([Values.booleanValue(false), runtime])
  }
}

export class CaseExpression extends Expression {
  constructor(
    range: Range,
    precedingComments: Comment[],
    readonly matchExpr: MatchExpression,
    readonly bodyExpression: Expression,
  ) {
    super(range, precedingComments)
  }

  matchAssignReferences() {
    return this.matchExpr.matchAssignReferences()
  }

  assumeTrueWith(
    runtime: TypeRuntime,
    formula: RelationshipFormula | undefined,
    subjectType: Types.Type,
  ) {
    return this.matchExpr.assumeTrueWith(runtime, formula, subjectType)
  }

  /**
   * The false condition is much simpler - `assumeFalse` of every match
   * expression (again, the same logic as `or` expressions).
   */
  assumeFalseWith(
    runtime: TypeRuntime,
    formula: RelationshipFormula | undefined,
    subjectType: Types.Type,
  ) {
    return this.matchExpr.assumeFalseWith(runtime, formula, subjectType)
  }

  toLisp() {
    const caseCode = this.matchExpr.toLisp()
    const bodyCode = this.bodyExpression.toLisp()
    return `(case ${caseCode} : ${bodyCode})`
  }

  toCode() {
    let code = 'case '
    code += this.matchExpr.toCode()
    code += '\n'
    code += indent(this.bodyExpression.toCode())
    return code
  }

  getType(): GetTypeResult {
    return err(new RuntimeError(this, `CaseExpression does not have a type`))
  }

  eval(): GetValueResult {
    return err(new RuntimeError(this, `CaseExpression cannot be evaluated`))
  }

  compile(_runtime: TypeRuntime) {
    return err(
      new RuntimeError(
        this,
        'case expressions cannot be compiled without a formula and subject expression',
      ),
    )
  }

  compileWithSubject(
    runtime: TypeRuntime,
    formula: RelationshipAssign,
    subjectType: Types.Type,
  ): GetRuntimeResult<Nodes.Case> {
    return this.matchExpr.compileWithSubject(runtime, subjectType).map(matchNode =>
      this.assumeTrueWith(runtime, formula, subjectType)
        .map(truthyRuntime => this.bodyExpression.compile(truthyRuntime))
        .map(bodyNode => new Nodes.Case(toSource(this), matchNode, bodyNode)),
    )
  }
}
