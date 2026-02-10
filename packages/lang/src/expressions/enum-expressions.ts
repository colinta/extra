import {err, mapAll, ok, type Result} from '@extra-lang/result'

import {indent} from '@/util'
import {type TypeRuntime, MutableTypeRuntime} from '@/runtime'
import * as Types from '@/types'
import * as Nodes from '@/nodes'
import {
  Expression,
  type Reference,
  type GenericExpression,
  type FormulaArgumentDefinition,
  type NamedFormulaExpression,
  type Range,
  RuntimeError,
  toSource,
  allDependencies,
  wrapValues,
  argumentToArgumentType,
  argumentToArgumentNode,
  ReferenceRuntimeError,
  InstanceFormulaExpression,
} from './expressions'
import {type ClassStaticPropertyExpression, type StaticFormulaExpression} from './class-expressions'
import {
  type Comment,
  type GetTypeResult,
  type GetValueResult,
  type GetNodeResult,
  type GetRuntimeResult,
} from '@/formulaParser/types'
import {EXPORT_KEYWORD, ENUM_START} from '@/formulaParser/grammars'
import {Scope} from '@/scope'
import {stablePointAlgorithm} from '@extra-lang/util'

/**
 * Raised from ReferenceExpression and others when a variable refers to
 * something in scope that isn't available.
 */
export class EnumReferenceRuntimeError extends RuntimeError {
  constructor(
    readonly reference: EnumLookupExpression,
    message: string,
    children: RuntimeError[] = [],
  ) {
    super(reference, message, children)
  }
}

/**
 * Records the name of an enum lookup shorthand `.name`. Does not include the
 * arguments, those are treated as function invocations.
 */
export class EnumLookupExpression extends Expression {
  constructor(
    range: Range,
    precedingComments: Comment[],
    readonly name: string,
  ) {
    super(range, precedingComments)
  }

  toLisp() {
    return `${ENUM_START}${this.name}`
  }

  toCode() {
    return `${ENUM_START}${this.name}`
  }

  compile(runtime: TypeRuntime) {
    const type = runtime.getLocalType(ENUM_START + this.name)
    if (type) {
      return ok(new Nodes.EnumLookup(toSource(this), this.name, type))
    }

    return err(
      new EnumReferenceRuntimeError(this, `There is no reference in scope named '${this.name}'`),
    )
  }

  getType(): GetTypeResult {
    return err(new RuntimeError(this, 'EnumLookupExpression does not have a type'))
  }

  eval(): GetValueResult {
    return err(
      new RuntimeError(
        this,
        'EnumLookupExpression cannot be evaluated (call formulaArgs(runtime))',
      ),
    )
  }
}

/**
 * Within an 'enum' type, EnumMemberExpression is one of the case values.
 *     -- Examples
 *     .red
 *     .blue
 *     .rgb(r: Int, g: Int, b: Int)
 *
 * Enum values don't have a type outside of the parent enum expression, so the
 * Node of an EnumMemberExpression has type `never`
 */
export class EnumMemberExpression extends Expression {
  constructor(
    range: Range,
    precedingComments: Comment[],
    readonly name: string,
    /**
     * Uses FormulaLiteralArgument, which supports default arguments.
     * EnumMemberExpression acts very much like a formula literal, which returns
     * an instance of the EnumTypeExpression
     */
    readonly args: FormulaArgumentDefinition[],
  ) {
    super(range, precedingComments)
  }

  dependencies(parentScopes: Scope[]) {
    return allDependencies(this.args, parentScopes)
  }

  childExpressions() {
    return this.args
  }

  toLisp() {
    let code = ENUM_START + this.name
    if (this.args.length) {
      code += `(${this.args.map(arg => arg.toLisp()).join(' ')})`
    }

    return code
  }

  toCode() {
    let code = ENUM_START + this.name
    if (this.args.length) {
      code += `(${this.args.map(arg => arg.toCode()).join(', ')})`
    }

    return code
  }

  getType(): GetTypeResult {
    return err(new RuntimeError(this, 'EnumEntryExpression does not have a type'))
  }

  eval(): GetValueResult {
    return err(new RuntimeError(this, 'EnumEntryExpression cannot be evaluated'))
  }

  compile(runtime: TypeRuntime): GetNodeResult {
    return mapAll(
      this.args.map(argExpr =>
        argumentToArgumentType(argExpr, runtime, undefined, 0).map(argType =>
          argumentToArgumentNode(argExpr, argType),
        ),
      ),
    ).map(args => new Nodes.EnumMember(toSource(this), this.name, args))
  }
}

/**
 * Either a shorthand or a full enum type definition. Shorthands appear in
 * function definitions, type definitions appear in the module.
 *
 *     -- AnonymousEnumTypeExpression
 *     fn colorize(# text: String, style: .text | .alert | .warning = .text): String
 *       => …
 *
 *     -- NamedEnumDefinition (module definition)
 *     enum Style {
 *       .text
 *       .alert
 *       .warning
 *
 *       fn colour(): Colour -> ...
 *     }
 *
 * When compiled, the entire definition is compiled into a single Type, but each
 * case is mapped to an EnumMember. This node doesn't carry type information -
 * each member is, in practice, either a static value or a formula that returns
 * a value of the enum type.
 *
 *     enum Style { .text, .alert, .header(1 | 2 | 3) }
 *
 * the "type" of `.text` and `.alert` are reflexive: `.text` is only ever
 * `Style.text`. `.header`, OTOH, is considered a function that takes `1|2|3`
 * and returns a `Style` (`fn(# level: 1 | 2 | 3) -> Style`).
 *
 * EnumTypeExpression has two subclasses:
 * `NamedEnumDefinition` and `AnonymousEnumTypeExpression`
 */
export abstract class EnumTypeExpression extends Expression {
  constructor(
    readonly range: Range,
    readonly precedingComments: Comment[],
    readonly members: EnumMemberExpression[],
  ) {
    super(range, precedingComments)
  }

  dependencies(parentScopes: Scope[]) {
    return allDependencies(this.members, parentScopes)
  }

  childExpressions() {
    return this.members
  }

  getAsTypeExpression(runtime: TypeRuntime) {
    return this.compile(runtime).map(node => node.type)
  }

  getType(runtime: TypeRuntime): GetTypeResult {
    return err(new RuntimeError(this, 'EnumTypeExpression does not have a type'))
  }

  getEnumCases(runtime: TypeRuntime): GetRuntimeResult<Nodes.EnumCase[]> {
    return mapAll(
      // get types of all args, store along with the argument name
      this.members.map(member =>
        mapAll(
          member.args.map(arg => arg.argType.compile(runtime).map(argNode => ({arg, argNode}))),
        ).map(nodes => ({
          name: member.name,
          args: nodes,
        })),
      ),
    ).map(members =>
      // map into Array(Types.PositionalArgument | Types.NamedArgument)
      members.map(({name, args}) => {
        // turn args into enumArgs (positional/named arguments)
        const enumArgs = args.map(({arg, argNode}) => {
          if (arg.isPositional) {
            return new Nodes.PositionalArgument(toSource(arg), argNode.type, arg.nameRef.name, true)
          } else {
            return new Nodes.NamedArgument(
              toSource(arg),
              argNode.type,
              arg.nameRef.name,
              arg.nameRef.name,
              true,
            )
          }
        })

        return new Nodes.EnumCase(toSource(this), name, enumArgs)
      }),
    )
  }

  eval(): GetValueResult {
    return err(new RuntimeError(this, 'EnumTypeExpression cannot be evaluated'))
  }
}

type StaticNodesResult = {
  resolved: {
    expr: ClassStaticPropertyExpression | StaticFormulaExpression
    node: Nodes.ClassStaticProperty | Nodes.AnonymousFunction
  }[]
  remaining: (ClassStaticPropertyExpression | StaticFormulaExpression)[]
}

/**
 * This is the enum type used when declaring an enum at the module level
 * scope.
 *
 *     enum Colour {
 *       .pink
 *       .boring
 *
 *       fn rgb(): {Int, Int, Int} -> ...
 *
 *       static black() -> Colour { ... }
 *
 *       colourCount = 2
 *     }
 */
export class NamedEnumDefinition extends EnumTypeExpression {
  constructor(
    readonly range: Range,
    readonly precedingComments: Comment[],
    readonly nameRef: Reference,
    readonly members: EnumMemberExpression[],
    readonly staticProperties: ClassStaticPropertyExpression[],
    readonly memberFormulas: NamedFormulaExpression[],
    readonly staticFormulas: NamedFormulaExpression[],
    readonly generics: GenericExpression[],
    readonly isExport: boolean,
  ) {
    super(range, precedingComments, members)
  }

  get name() {
    return this.nameRef.name
  }

  provides(): Set<string> {
    return new Set([this.nameRef.name])
  }

  dependencies(parentScopes: Scope[]) {
    const myScopes = parentScopes.concat([new Scope(this.name)])
    return super.dependencies(myScopes)
  }

  toLisp() {
    let code = `(enum ${this.nameRef.name})`
    if (this.generics.length) {
      code += ' <' + this.generics.map(g => g.toLisp()).join(' ') + '>'
    }
    code += ' (' + this.members.map(m => m.toLisp()).join(' ') + ')'
    if (this.staticProperties.length) {
      code += ' (' + this.staticProperties.map(p => p.toLisp()).join(' ') + ')'
    }
    if (this.memberFormulas.length) {
      code += ' (' + this.memberFormulas.map(f => f.toLisp()).join(' ') + ')'
    }
    if (this.staticFormulas.length) {
      code += ' (' + this.staticFormulas.map(f => f.toLisp()).join(' ') + ')'
    }
    return `(${code})`
  }

  toCode() {
    let code = ''
    if (this.isExport) {
      code += EXPORT_KEYWORD + ' '
    }
    code += `enum ${this.nameRef.name}`
    if (this.generics.length) {
      code += wrapValues('<', this.generics, '>')
    }

    let body = ''
    for (const member of this.members) {
      body += member.toCode() + '\n'
    }

    if (this.staticProperties.length) {
      body += '\n'
      for (const property of this.staticProperties) {
        body += property.toCode() + '\n'
      }
    }

    if (this.staticFormulas.length) {
      body += '\n'
      for (const formula of this.staticFormulas) {
        body += formula.toCode() + '\n'
      }
    }

    if (this.memberFormulas.length) {
      body += '\n'
      // if (this.initializer)
      for (const formula of this.memberFormulas) {
        body += formula.toCodePrefixed(true, true) + '\n'
      }
    }

    code += ' {\n'
    code += indent(body)
    code += '}'
    return code
  }

  compile(runtime: TypeRuntime): GetRuntimeResult<Nodes.NamedEnumDefinition> {
    // See ClassDefinition for a more commented version of pretty much the same
    // function. The difference is only that Enum types don't have constructors
    // and properties, but they do have static properties, static formulas, and
    // member formulas.
    const moduleRuntime = new MutableTypeRuntime(runtime)
    const name = this.nameRef.name
    moduleRuntime.pushScope(name)

    const genericNodes: Nodes.Generic[] = []
    for (const expr of this.generics) {
      const genericProp = expr.compile()
      if (genericProp.isErr()) {
        return err(genericProp.error)
      }

      // static properties can be treated as local variables
      moduleRuntime.addLocalType(expr.name, genericProp.value.type)

      genericNodes.push(genericProp.value)
    }
    const genericTypes = genericNodes.map(g => g.type)

    // see class-expressions.ts:ClassDefinition for more detailed notes.
    const allStatics = (
      this.staticProperties as (ClassStaticPropertyExpression | StaticFormulaExpression)[]
    ).concat(this.staticFormulas)

    const tempClassType = new Types.ObjectType([])
    const tempClassProps: Types.NamedProp[] = []
    const enumMemberNames = new Set(this.members.map(m => m.name))
    const remainingNames: string[] = []
    moduleRuntime.addLocalType(name, tempClassType)
    const tempModuleRuntime = new MutableTypeRuntime(moduleRuntime)
    return stablePointAlgorithm(
      allStatics,
      (expr, {resolved, remaining}): Result<StaticNodesResult, RuntimeError> => {
        const compiled = expr.compile(tempModuleRuntime)
        if (compiled.isErr()) {
          // if the error is due to referencing one of the enum members, put
          // this in the 'remaining' stack
          if (
            compiled.error instanceof EnumReferenceRuntimeError &&
            enumMemberNames.has(compiled.error.reference.name)
          ) {
            remainingNames.push(expr.name)
            return ok({resolved, remaining: remaining.concat([expr])})
          }

          // if the error is due to referencing a static property that was put
          // in the 'remaining' stack, also put this in the 'remaining' stack
          if (
            compiled.error instanceof ReferenceRuntimeError &&
            remainingNames.includes(compiled.error.reference.name)
          ) {
            remainingNames.push(expr.name)
            return ok({resolved, remaining: remaining.concat([expr])})
          }

          return err(compiled.error)
        }

        if (expr.name !== name) {
          tempModuleRuntime.addLocalType(expr.name, compiled.value.type)
        }

        tempClassProps.push({
          is: 'named',
          name: expr.name,
          type: compiled.value.type,
        })

        const nextClassType = new Types.ObjectType(tempClassProps)
        tempModuleRuntime.addLocalType(name, nextClassType)

        return ok({
          resolved: resolved.concat([{expr, node: compiled.value}]),
          remaining,
        })
      },
      {
        resolved: [],
        remaining: [],
      } as StaticNodesResult,
    )
      .mapError(errors => new RuntimeError(this, 'TODO', errors))
      .map(({resolved: resolvedStatics, remaining: remainingStatics}) =>
        // I guess enum cases don't need access to the temporary User class
        // object, because they are just names + arguments.
        this.getEnumCases(moduleRuntime)
          .map(enumMembers => {
            const staticPropertyTypes = new Map<string, Types.Type>()
            const staticPropertyNodes = new Map<string, Nodes.Node>()

            for (const {expr, node} of resolvedStatics) {
              moduleRuntime.addLocalType(expr.name, node.type)

              staticPropertyTypes.set(expr.name, node.type)
              staticPropertyNodes.set(expr.name, node)
            }

            const enumType = new Types.NamedEnumDefinitionType(
              name,
              enumMembers.map(
                enumCaseNode =>
                  new Types.EnumCase(
                    enumCaseNode.name,
                    enumCaseNode.args.map(arg => arg.toArgumentType()),
                  ),
              ),
              //
              staticPropertyTypes,
              genericTypes,
            )

            moduleRuntime.addLocalType(name, enumType)

            const instanceType = new Types.EnumInstanceType(
              name,
              // will hold formulas, they get assigned as they are resolved
              new Map(),
            )
            const thisRuntime = new MutableTypeRuntime(moduleRuntime, instanceType)

            for (const enumCaseNode of enumMembers) {
              // TODO: ideally each enum case would have a corresponding
              // "literal" value
              //     enum Letter {
              //       .a
              //       .b
              //       .c
              //     }
              //
              //     let a = .a in ...
              // `a: Letter`, but more precisely it is of type `Letter.a`. Just
              // like an Int can be narrowed to just one value, an enum should
              // be narrowable to just one value. For now they are typed as the
              // enum instance type.
              if (enumCaseNode.args.length === 0) {
                moduleRuntime.addLocalType(ENUM_START + enumCaseNode.name, instanceType)
              } else {
                const argTypes = enumCaseNode.args.map(arg => arg.toArgumentType())
                moduleRuntime.addLocalType(
                  ENUM_START + enumCaseNode.name,
                  // TODO: determine the generics - are they just the genericNodes from above?
                  new Types.NamedFormulaType(enumCaseNode.name, instanceType, argTypes, []),
                )
              }
            }

            const formulaProperties = new Map<string, Nodes.Node>()
            return stablePointAlgorithm(
              [...remainingStatics, ...this.memberFormulas],
              (expr, out) => {
                let remainingProp: GetNodeResult
                const isMemberProp = expr instanceof InstanceFormulaExpression
                if (isMemberProp) {
                  remainingProp = expr.compile(thisRuntime)
                } else {
                  remainingProp = expr.compile(moduleRuntime)
                }

                if (remainingProp.isErr()) {
                  return err(remainingProp.error)
                }

                if (isMemberProp) {
                  instanceType.addFormula(expr.name, remainingProp.value.type)
                  formulaProperties.set(expr.name, remainingProp.value)
                } else {
                  // static properties can be treated as local variables
                  moduleRuntime.addLocalType(expr.name, remainingProp.value.type)

                  enumType.addStaticProp(expr.name, remainingProp.value.type)
                  staticPropertyNodes.set(expr.name, remainingProp.value)
                }

                return ok(out)
              },
              {
                enumType,
                enumMembers,
                instanceType,
                staticPropertyNodes,
                formulaProperties,
              },
            ).mapError(errors => new RuntimeError(this, 'TODO - 526', errors))
          })
          .map(
            ({enumType, enumMembers, instanceType, staticPropertyNodes, formulaProperties}) =>
              new Nodes.NamedEnumDefinition(
                toSource(this),
                name,
                enumType,
                enumMembers,
                instanceType,
                staticPropertyNodes,
                formulaProperties,
                genericNodes,
                this.isExport,
              ),
          ),
      )
  }

  getType(runtime: TypeRuntime) {
    return this.compile(runtime).map(node => node.type)
  }

  eval(): GetValueResult {
    return err(new RuntimeError(this, 'EnumDefinition cannot be evaluated'))
  }
}

/**
 * An anonymous enum expression as part of a formula argument list
 *
 *     fn (foo: .a | .b | .c(Int))
 */
export class AnonymousEnumTypeExpression extends EnumTypeExpression {
  constructor(
    readonly range: Range,
    readonly precedingComments: Comment[],
    readonly members: EnumMemberExpression[],
  ) {
    super(range, precedingComments, members)
  }

  toLisp() {
    return '(enum | ' + this.members.map(m => m.toLisp()).join(' | ') + ')'
  }

  toCode() {
    return this.members.map(m => m.toCode()).join(' | ')
  }

  compile(runtime: TypeRuntime) {
    // return this.getEnumCases(runtime)
    //   .map(enumMembers => Types.enumType(enumMembers))
    //   .map(enumType => ok(new Nodes.AnonymousEnumDefinition(toSource(this), enumType)))
    return {} as any
  }
}
