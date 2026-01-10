import {err, mapAll, ok} from '@extra-lang/result'

import {indent} from '@/util'
import {type TypeRuntime, MutableTypeRuntime} from '@/runtime'
import * as Types from '@/types'
import * as Nodes from '@/nodes'
import {
  Expression,
  type Reference,
  type GenericExpression,
  type FormulaLiteralArgument,
  type NamedFormulaExpression,
  type Range,
  RuntimeError,
  dependencySort,
  toSource,
  allProvides,
  allDependencies,
  getChildType,
  getChildAsTypeExpression,
  wrapValues,
} from './expressions'
import {type ClassStaticPropertyExpression} from './class-expressions'
import {
  type Comment,
  type GetTypeResult,
  type GetValueResult,
  type GetNodeResult,
  type GetRuntimeResult,
} from '@/formulaParser/types'
import {EXPORT_KEYWORD, ENUM_START} from '@/formulaParser/grammars'

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
    readonly args: FormulaLiteralArgument[],
  ) {
    super(range, precedingComments)
  }

  dependencies() {
    return allDependencies(this.args)
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

  compile(): GetNodeResult {
    return ok(new Nodes.EnumMember(toSource(this), this.name))
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
 * case is mapped to an EnumCaseNode, which uses a generic `EnumCaseType`.
 * In the expression:
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

  dependencies() {
    return allDependencies(this.members)
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
    readonly formulas: NamedFormulaExpression[],
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

  toLisp() {
    let code = `(enum ${this.nameRef.name})`
    if (this.generics.length) {
      code += ' <' + this.generics.map(g => g.toLisp()).join(' ') + '>'
    }
    code += ' (' + this.members.map(m => m.toLisp()).join(' ') + ')'
    if (this.staticProperties.length) {
      code += ' (' + this.staticProperties.map(p => p.toLisp()).join(' ') + ')'
    }
    if (this.formulas.length) {
      code += ' (' + this.formulas.map(f => f.toLisp()).join(' ') + ')'
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

    if (this.formulas.length) {
      body += '\n'
    }
    // if (this.initializer)
    for (const formula of this.formulas) {
      body += formula.toCodePrefixed(true, true) + '\n'
    }

    code += ' {\n'
    code += indent(body)
    code += '}'
    return code
  }

  getAsTypeExpression(runtime: TypeRuntime) {
    const genericTypes: Types.GenericType[] = []
    const mutableRuntime = new MutableTypeRuntime(runtime)
    for (const generic of this.generics) {
      const genericType = new Types.GenericType(generic.name)
      genericTypes.push(genericType)
      mutableRuntime.addLocalType(generic.name, genericType)
    }

    return super
      .getAsTypeExpression(mutableRuntime)
      .map(enumType => (enumType as Types.AnonymousEnumType).members)
      .map(members => {
        return Types.namedEnumType({
          name: this.nameRef.name,
          members,
          formulas: [],
          staticFormulas: [],
          genericTypes,
        })
      })
  }

  getType(): GetTypeResult {
    return err(new RuntimeError(this, 'EnumDefinition does not have a type'))
  }

  eval(): GetValueResult {
    return err(new RuntimeError(this, 'EnumDefinition cannot be evaluated'))
  }

  compile(runtime: TypeRuntime) {
    // classLocalRuntime allows state properties, member formulas, and other
    // static properties to access statics as if they are local references.
    // I called it classLocalRuntime to mirror the ClassDefinition code
    const classLocalRuntime = new MutableTypeRuntime(runtime)

    const name = this.nameRef.name
    return this.getEnumCases(runtime)
      .map(enumMembers => ({
        enumMembers,
        enumType: Types.namedEnumType({
          name,
          members: enumMembers.map(
            enumCaseNode =>
              new Types.EnumCase(
                enumCaseNode.name,
                enumCaseNode.args.map(arg => arg.toArgumentType()),
              ),
          ),
        }),
      }))
      .map(({enumMembers, enumType}) =>
        ok(
          new Nodes.NamedEnumDefinition(
            toSource(this),
            name,
            enumType,
            enumMembers,
            // staticProperties
            [],
            // formulas
            [],
            // generics
            [],
            // isExport
            this.isExport,
          ),
        ),
      )
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
  }
}
