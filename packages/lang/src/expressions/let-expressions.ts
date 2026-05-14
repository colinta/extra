import {err, mapAll, ok} from '@extra-lang/result'

import {ENUM_START, SPREAD_OPERATOR} from '@/formulaParser/grammars'
import type {
  Comment,
  GetNodeResult,
  GetRuntimeResult,
  GetTypeResult,
  GetValueResult,
} from '@/formulaParser/types'
import * as Nodes from '@/nodes'
import {relationshipFormula} from '@/relationship'
import {
  MutableTypeRuntime,
  MutableValueRuntime,
  type TypeRuntime,
  type ValueRuntime,
} from '@/runtime'
import type {Scope} from '@/scope'
import * as Types from '@/types'
import {difference, indent, MAX_INNER_LEN, union} from '@/util'
import * as Values from '@/values'
import {
  NamedArgument,
  NamedFormulaExpression,
  Expression,
  allDependencies,
  decorateError,
  dependencySort,
  toSource,
} from './expressions'
import {RuntimeError} from './errors'
import {Range} from './types'

//|
//|  Let Expression
//|

/**
 * Used to store 'let' declarations. I'm re-using NamedArgument for convenience.
 *
 *     let
 *       name = value
 *       ^^^^^^^^^^^^
 *     in
 */
export type LetBinding = LetAssign | LetObjectAssign | LetArrayAssign | NamedFormulaExpression

export class LetAssign extends NamedArgument {
  constructor(
    range: Range,
    precedingComments: Comment[],
    alias: string,
    readonly typeExpression: Expression | undefined,
    value: Expression,
  ) {
    super(range, precedingComments, alias, value)
  }

  dependencies(parentScopes: Scope[]) {
    return allDependencies(
      this.typeExpression ? [this.typeExpression, this.value] : [this.value],
      parentScopes,
    )
  }

  toLisp() {
    if (this.typeExpression === undefined) {
      return `(${this.alias} = ${this.value.toLisp()})`
    }

    return `(${this.alias}: ${this.typeExpression.toLisp()} = ${this.value.toLisp()})`
  }

  toCode() {
    if (this.typeExpression === undefined) {
      return `${this.alias} = ${this.value}`
    }

    return `${this.alias}: ${this.typeExpression} = ${this.value}`
  }
}

export type LetObjectAssignPart =
  | {kind: 'named'; prop: string; name: string | undefined}
  | {kind: 'positional'; index: number; name: string | undefined}

abstract class LetDestructureAssign extends Expression {
  abstract readonly value: Expression
  abstract assignmentNames(): string[]
  abstract assignTypes(runtime: MutableTypeRuntime, valueType: Types.Type): GetRuntimeResult<void>
  abstract assignValues(runtime: MutableValueRuntime, value: Values.Value): GetRuntimeResult<void>

  dependencies(parentScopes: Scope[]) {
    return this.value.dependencies(parentScopes)
  }

  childExpressions() {
    return [this.value]
  }

  getType(runtime: TypeRuntime): GetTypeResult {
    return this.value.getType(runtime)
  }

  compile(runtime: TypeRuntime): GetNodeResult {
    return this.value.compile(runtime)
  }

  eval(runtime: ValueRuntime): GetValueResult {
    return this.value.eval(runtime)
  }
}

export class LetObjectAssign extends LetDestructureAssign {
  constructor(
    range: Range,
    precedingComments: Comment[],
    readonly parts: LetObjectAssignPart[],
    readonly restName: string | undefined,
    readonly value: Expression,
  ) {
    super(range, precedingComments)
  }

  assignmentNames() {
    return this.parts
      .flatMap(part => (part.name ? [part.name] : []))
      .concat(this.restName ? [this.restName] : [])
  }

  toLisp() {
    return `(${this.patternCode()} = ${this.value.toLisp()})`
  }

  toCode() {
    return `${this.patternCode()} = ${this.value.toCode()}`
  }

  private patternCode() {
    const parts = this.parts.map(part => {
      if (part.kind === 'positional') return part.name ?? '_'
      if (part.name === undefined) return `${part.prop}: _`
      if (part.name === part.prop) return `${part.prop}:`
      return `${part.prop}: ${part.name}`
    })
    if (this.restName) parts.push(`${SPREAD_OPERATOR}${this.restName}`)
    return `{${parts.join(', ')}}`
  }

  assignTypes(runtime: MutableTypeRuntime, valueType: Types.Type): GetRuntimeResult<void> {
    const objectTypes = valueType instanceof Types.OneOfType ? valueType.of : [valueType]
    if (!objectTypes.every(type => type instanceof Types.ObjectType)) {
      return err(new RuntimeError(this, `Expected Object for destructuring, found '${valueType}'`))
    }

    for (const part of this.parts) {
      const propTypes = objectTypes.map(type => {
        const objectType = type as Types.ObjectType
        return part.kind === 'named'
          ? objectType.propNamed(part.prop)
          : objectType.propAtPosition(part.index)
      })

      if (!propTypes.some(Boolean)) {
        return err(
          new RuntimeError(
            this,
            `Object destructuring property '${part.kind === 'named' ? part.prop : part.index}' does not exist on '${valueType}'`,
          ),
        )
      }

      if (part.name) {
        runtime.addLocalType(part.name, Types.oneOf(propTypes.map(type => type ?? Types.NullType)))
      }
    }
    if (this.restName) {
      const restTypes = objectTypes.map(type => this.restType(type as Types.ObjectType))
      runtime.addLocalType(this.restName, Types.oneOf(restTypes))
    }
    return ok()
  }

  private restType(valueType: Types.ObjectType): Types.ObjectType {
    const usedNamed = new Set(
      this.parts.flatMap(part => (part.kind === 'named' ? [part.prop] : [])),
    )
    const usedPositions = new Set(
      this.parts.flatMap(part => (part.kind === 'positional' ? [part.index] : [])),
    )
    let position = 0
    const restProps = valueType.props.filter(prop => {
      if (prop.is === 'named') return !usedNamed.has(prop.name)
      if (prop.is === 'spread-positional') return true
      return !usedPositions.has(position++)
    })
    return Types.object(restProps)
  }

  assignValues(runtime: MutableValueRuntime, value: Values.Value): GetRuntimeResult<void> {
    if (!(value instanceof Values.ObjectValue)) {
      return err(new RuntimeError(this, `Expected Object for destructuring, found '${value}'`))
    }

    const usedNamed = new Set<string>()
    const usedPositions = new Set<number>()
    for (const part of this.parts) {
      if (part.kind === 'named') {
        usedNamed.add(part.prop)
        if (part.name) {
          runtime.addLocalValue(part.name, value.namedValues.get(part.prop) ?? Values.NullValue)
        }
      } else {
        usedPositions.add(part.index)
        if (part.name) {
          runtime.addLocalValue(part.name, value.tupleValues[part.index] ?? Values.NullValue)
        }
      }
    }
    if (this.restName) {
      const namedValues = new Map<string, Values.Value>()
      for (const [name, namedValue] of value.namedValues) {
        if (!usedNamed.has(name)) namedValues.set(name, namedValue)
      }
      const tupleValues = value.tupleValues.filter((_, index) => !usedPositions.has(index))
      runtime.addLocalValue(this.restName, new Values.ObjectValue(tupleValues, namedValues))
    }
    return ok()
  }
}

export class LetArrayAssign extends LetDestructureAssign {
  constructor(
    range: Range,
    precedingComments: Comment[],
    readonly initialNames: (string | undefined)[],
    readonly restName: string | undefined,
    readonly trailingNames: (string | undefined)[],
    readonly value: Expression,
  ) {
    super(range, precedingComments)
  }

  assignmentNames() {
    return this.initialNames
      .concat(this.restName ? [this.restName] : [], this.trailingNames)
      .filter((name): name is string => name !== undefined)
  }

  toLisp() {
    return `(${this.patternCode()} = ${this.value.toLisp()})`
  }

  toCode() {
    return `${this.patternCode()} = ${this.value.toCode()}`
  }

  private patternCode() {
    const parts = this.initialNames.map(name => name ?? '_')
    if (this.restName !== undefined) {
      parts.push(`${SPREAD_OPERATOR}${this.restName}`)
    } else if (this.trailingNames.length) {
      parts.push(SPREAD_OPERATOR)
    }
    parts.push(...this.trailingNames.map(name => name ?? '_'))
    return `[${parts.join(', ')}]`
  }

  assignTypes(runtime: MutableTypeRuntime, valueType: Types.Type): GetRuntimeResult<void> {
    if (!(valueType instanceof Types.ArrayType)) {
      return err(new RuntimeError(this, `Expected Array for destructuring, found '${valueType}'`))
    }

    this.initialNames.forEach((name, index) => {
      if (name) runtime.addLocalType(name, valueType.literalAccessType(index) ?? Types.NullType)
    })
    if (this.restName) {
      const consumed = this.initialNames.length + this.trailingNames.length
      const min = Math.max(0, valueType.narrowedLength.min - consumed)
      const max =
        valueType.narrowedLength.max === undefined
          ? undefined
          : Math.max(0, valueType.narrowedLength.max - consumed)
      runtime.addLocalType(this.restName, Types.array(valueType.of, {min, max}))
    }
    this.trailingNames.forEach(name => {
      const requiredLength = this.initialNames.length + this.trailingNames.length
      if (
        valueType.narrowedLength.max !== undefined &&
        valueType.narrowedLength.max < requiredLength
      ) {
        if (name) runtime.addLocalType(name, Types.NullType)
      } else if (valueType.narrowedLength.min >= requiredLength) {
        if (name) runtime.addLocalType(name, valueType.of)
      } else {
        if (name) runtime.addLocalType(name, Types.optional(valueType.of))
      }
    })
    return ok()
  }

  assignValues(runtime: MutableValueRuntime, value: Values.Value): GetRuntimeResult<void> {
    if (!(value instanceof Values.ArrayValue)) {
      return err(new RuntimeError(this, `Expected Array for destructuring, found '${value}'`))
    }

    this.initialNames.forEach((name, index) => {
      if (name) runtime.addLocalValue(name, value.values[index] ?? Values.NullValue)
    })

    const trailingStart = value.values.length - this.trailingNames.length
    this.trailingNames.forEach((name, index) => {
      const valueIndex = trailingStart + index
      const hasEnoughValues =
        value.values.length >= this.initialNames.length + this.trailingNames.length
      if (name) {
        runtime.addLocalValue(
          name,
          hasEnoughValues ? (value.values[valueIndex] ?? Values.NullValue) : Values.NullValue,
        )
      }
    })

    if (this.restName) {
      const start = this.initialNames.length
      const end = Math.max(start, value.values.length - this.trailingNames.length)
      runtime.addLocalValue(this.restName, new Values.ArrayValue(value.values.slice(start, end)))
    }
    return ok()
  }
}

function bindingSortName(binding: LetBinding) {
  if (binding instanceof NamedFormulaExpression) return binding.nameRef.name
  if (binding instanceof LetAssign) return binding.alias
  return binding.assignmentNames()[0] ?? '_'
}

function bindingNames(binding: LetBinding) {
  if (binding instanceof NamedFormulaExpression) return [binding.nameRef.name]
  if (binding instanceof LetAssign) return [binding.alias]
  return binding.assignmentNames()
}

export class LetExpression extends Expression {
  readonly name = 'let'
  readonly bindings: [string, LetBinding][]

  constructor(
    range: Range,
    precedingComments: Comment[],
    /*
     * - precedingComments: before 'let'
     * - precedingInBodyComments: before 'in'
     */
    public precedingInBodyComments: Comment[],
    bindings: LetBinding[],
    readonly body: Expression,
  ) {
    super(range, precedingComments)

    this.bindings = bindings.map(arg => [bindingSortName(arg), arg])
  }

  /**
   * In a 'let' assignment, we must take care to remove the assigments from
   * the parent scope - ie
   *
   *     class User {
   *       static foo = let
   *           -- technically, references must be lower case and modules must be
   *           -- uppercase... but I want to cover this situation anyway
   *           User = { bla: 'bla' }
   *         in
   *           User.bla <-- 'User' refers to the let assignment,
   *                     -- not the class from parent scope
   *     }
   *
   * This is only really relevant to resolving static property resolution order,
   * which here would not treat 'foo' as depending on any static property of the
   * parent class User.
   */
  dependencies(parentScopes: Scope[]) {
    const bindingExprs: Expression[] = this.bindings.map(([_, arg]) => arg)
    const providedNames = new Set(this.bindings.flatMap(([_, binding]) => bindingNames(binding)))
    const filteredScopes = parentScopes.filter(scope => !providedNames.has(scope.name))
    return difference(
      allDependencies(bindingExprs.concat([this.body]), filteredScopes),
      this.provides(),
    )
  }

  provides() {
    return new Set(this.bindings.flatMap(([_, binding]) => bindingNames(binding)))
  }

  private sortedBindings(
    fromRuntime: (name: string) => boolean,
    parentScopes: Scope[],
  ): GetRuntimeResult<[string, LetBinding][]> {
    // collect all deps of bindings that are referenced in another this.bindings
    // AND provided from another binding
    const allDeps = this.bindings.reduce(
      (all, [_, bindingExpr]) => union(all, bindingExpr.dependencies(parentScopes)),
      new Set<string>(),
    )
    for (const [_, binding] of this.bindings) {
      for (const name of bindingNames(binding)) {
        if (allDeps.has(name) && fromRuntime(name)) {
          return err(
            new RuntimeError(this, `Ambiguous reference detected in let assignment for '${name}'`),
          )
        }
      }
    }
    return dependencySort(this.bindings, fromRuntime, parentScopes)
  }

  toLisp() {
    const code = this.bindings.map(([_, arg]) => arg.toLisp()).join(' ')
    return `(let ${code} ${this.body.toLisp()})`
  }

  toCode() {
    let code = 'let\n'
    for (const [alias, arg] of this.bindings) {
      let line: string
      let exprCode: string
      if (arg instanceof NamedFormulaExpression) {
        line = ''
        exprCode = arg.toCode()
      } else if (arg instanceof LetAssign) {
        line = alias
        if (arg.typeExpression !== undefined) {
          line += `: ${arg.typeExpression}`
        }
        line += ' = '
        exprCode = arg.value.toCode()
      } else {
        line = ''
        exprCode = arg.toCode()
      }

      if ((line && exprCode.includes('\n')) || line.length + exprCode.length > MAX_INNER_LEN) {
        line += '\n' + indent(exprCode)
      } else {
        line += exprCode
      }
      code += indent(line) + '\n'
    }
    code += 'in\n'
    const bodyCode = indent(this.body.toCode())
    if (bodyCode.includes('\n')) {
      code += bodyCode
    } else {
      code += bodyCode + '\n'
    }

    return code
  }

  assignRelationships(
    runtime: MutableTypeRuntime,
    name: string,
    assignment: LetBinding,
    inferredType: Types.Type,
    explicitType: Types.Type | undefined,
  ) {
    let localType: Types.Type
    if (
      explicitType &&
      inferredType instanceof Types.NamedEnumInstanceType &&
      Types.canBeAssignedTo(inferredType, explicitType)
    ) {
      localType = inferredType
    } else if (explicitType) {
      localType = explicitType
    } else {
      localType = inferredType
    }

    const id = runtime.addLocalType(name, localType)

    if (localType === inferredType && assignment instanceof LetAssign) {
      const assignmentRelationship = assignment.value.relationshipFormula(runtime)
      const refFormula = relationshipFormula.reference(name, id)
      if (assignmentRelationship) {
        runtime.addRelationshipFormula({
          formula: refFormula,
          comparison: {operator: '==', rhs: assignmentRelationship},
        })
      }
    }
  }

  private enumCasesForExpectedType(type: Types.Type): Types.NamedEnumInstanceType[] {
    if (type instanceof Types.NamedEnumInstanceType) {
      return [type]
    }

    if (type instanceof Types.OneOfType) {
      return type.of.flatMap(type => this.enumCasesForExpectedType(type))
    }

    return []
  }

  private enumLookupTypeForCase(caseType: Types.NamedEnumInstanceType): Types.Type {
    const member = caseType.member
    if (!member.positionalTypes.length && !member.namedTypes.size) {
      return caseType
    }

    let argIndex = 0
    const args = member.args.map(arg => {
      if (arg.is === 'positional') {
        return Types.positionalArgument({
          name: arg.name ?? `_${argIndex++}`,
          type: arg.type,
          isRequired: true,
        })
      } else if (arg.is === 'named') {
        return Types.namedArgument({
          name: arg.name,
          type: arg.type,
          isRequired: true,
        })
      }

      throw new Error('Enum cases do not support object type spread')
    })

    return new Types.NamedFormulaType(member.name, caseType, args, caseType.metaType.genericTypes)
  }

  private addEnumLookupTypesForExpectedType(runtime: MutableTypeRuntime, expectedType: Types.Type) {
    const byCaseName = new Map<string, Types.NamedEnumInstanceType[]>()
    for (const caseType of this.enumCasesForExpectedType(expectedType)) {
      byCaseName.set(
        caseType.member.name,
        (byCaseName.get(caseType.member.name) ?? []).concat(caseType),
      )
    }

    byCaseName.forEach((caseTypes, name) => {
      if (caseTypes.length === 1) {
        runtime.addLocalType(ENUM_START + name, this.enumLookupTypeForCase(caseTypes[0]))
      }
      // TODO: else, add a local type lookup that throws a more descriptive error
    })
  }

  private compileLetAssign(
    runtime: TypeRuntime,
    nextRuntime: MutableTypeRuntime,
    assignment: LetAssign,
  ): GetRuntimeResult<[Nodes.Node, Nodes.Node | undefined]> {
    if (!assignment.typeExpression) {
      return assignment
        .compile(nextRuntime)
        .map((assignmentNode): [Nodes.Node, Nodes.Node | undefined] => [assignmentNode, undefined])
    }

    return assignment.typeExpression
      .compileAsTypeExpression(runtime)
      .mapResult(decorateError(this))
      .map(explicitNode => {
        const explicitType = explicitNode.type.fromTypeConstructor()
        const assignmentRuntime = new MutableTypeRuntime(nextRuntime)
        this.addEnumLookupTypesForExpectedType(assignmentRuntime, explicitType)

        return assignment
          .compile(assignmentRuntime)
          .map((assignmentNode): [Nodes.Node, Nodes.Node | undefined] => [
            assignmentNode,
            explicitNode,
          ])
      })
  }

  getType(runtime: TypeRuntime): GetTypeResult {
    return this.compile(runtime).map(node => node.type)
  }

  compile(runtime: TypeRuntime) {
    let nextRuntime = new MutableTypeRuntime(runtime)
    return this.sortedBindings(name => runtime.has(name), runtime.parentScopes())
      .map(deps =>
        mapAll(
          deps.map(([name, assignment]): GetRuntimeResult<Nodes.LetAssign[]> => {
            if (assignment instanceof LetObjectAssign || assignment instanceof LetArrayAssign) {
              return assignment.compile(nextRuntime).map(assignmentNode => {
                const assignResult = assignment.assignTypes(nextRuntime, assignmentNode.type)
                if (assignResult.isErr()) return err(assignResult.error)
                return ok(
                  assignment.assignmentNames().map(name => ({
                    is: 'let-assign' as const,
                    name,
                    node: assignmentNode,
                    type: undefined,
                  })),
                )
              })
            }

            const compileAssignment =
              assignment instanceof LetAssign
                ? this.compileLetAssign(runtime, nextRuntime, assignment)
                : assignment
                    .compile(nextRuntime)
                    .map((assignmentNode): [Nodes.Node, Nodes.Node | undefined] => [
                      assignmentNode,
                      undefined,
                    ])

            return compileAssignment.map(([assignmentNode, explicitNode]) => {
              const explicitType = explicitNode?.type.fromTypeConstructor()
              if (explicitType && !Types.canBeAssignedTo(assignmentNode.type, explicitType)) {
                return err(
                  new RuntimeError(
                    this,
                    `Cannot assign inferred type '${assignmentNode.type.toCode()}' to '${explicitType.toCode()}'`,
                  ),
                )
              }

              this.assignRelationships(
                nextRuntime,
                name,
                assignment,
                assignmentNode.type,
                explicitType,
              )

              return ok([{is: 'let-assign', name, node: assignmentNode, type: explicitNode}])
            })
          }),
        ),
      )
      .map(nodeGroups =>
        this.body
          .compile(nextRuntime)
          .map(body => new Nodes.Let(toSource(this), body, nodeGroups.flat())),
      )
  }

  eval(runtime: ValueRuntime) {
    let nextRuntime = new MutableValueRuntime(runtime)
    return this.sortedBindings(name => runtime.has(name), runtime.parentScopes())
      .map(deps =>
        mapAll(
          deps.map(([name, dep]) =>
            dep.eval(nextRuntime).map(value => {
              if (dep instanceof LetObjectAssign || dep instanceof LetArrayAssign) {
                return dep.assignValues(nextRuntime, value)
              }
              nextRuntime.addLocalValue(name, value)
              return ok()
            }),
          ),
        ),
      )
      .map(() => this.body.eval(nextRuntime))
  }
}
