import {err, mapAll, mapMany, mapOptional, ok, type Result} from '@extra-lang/result'
import {stablePointAlgorithm} from '@extra-lang/util'
import {indent, union, difference, some} from '@/util'
import {
  type TypeRuntime,
  type ValueRuntime,
  MutableTypeRuntime,
  MutableValueRuntime,
} from '@/runtime'
import {Scope} from '@/scope'
import * as Types from '@/types'
import * as Nodes from '@/nodes'
import * as Values from '@/values'
import {
  type Comment,
  type GetTypeResult,
  type GetValueResult,
  type GetNodeResult,
  type GetRuntimeResult,
} from '@/formulaParser/types'
import {EXPORT_KEYWORD, STATE_START} from '@/formulaParser/grammars'

import {
  Expression,
  type Reference,
  type GenericExpression,
  type FormulaArgumentDefinition,
  type Range,
  RuntimeError,
  InstanceFormulaExpression,
  NamedFormulaExpression,
  argumentValues,
  formatComments,
  dependencySort,
  toSource,
  allProvides,
  allDependencies,
  getChildType,
  getChildAsTypeExpression,
  wrapValues,
  FunctionInvocationRuntimeError,
  ReferenceRuntimeError,
} from './expressions'
import {RenderFormulaExpression} from './view-expressions'

export abstract class ClassPropertyExpression extends Expression {
  constructor(
    range: Range,
    precedingComments: Comment[],
    // nameRef: StateReference for ClassStatePropertyExpression,
    // nameRef: Reference for ClassStaticPropertyExpression
    readonly nameRef: Reference,
    readonly argType: Expression | undefined,
    readonly defaultValue: Expression | undefined,
  ) {
    super(range, precedingComments)
  }

  abstract get isStatic(): boolean

  get name() {
    return this.nameRef.name
  }

  get stateName() {
    return STATE_START + this.name
  }

  dependencies(parentScopes: Scope[]) {
    let deps = new Set<string>()
    if (this.argType) {
      deps = union(deps, this.argType.dependencies(parentScopes))
    }
    if (this.defaultValue) {
      deps = union(deps, this.defaultValue.dependencies(parentScopes))
    }
    return deps
  }

  childExpressions() {
    return (this.argType ? [this.argType] : []).concat(this.defaultValue ? [this.defaultValue] : [])
  }

  toLisp() {
    let code = ''
    code += this.nameRef.toLisp()

    if (this.argType) {
      code += ': ' + this.argType.toLisp()
    }

    if (this.defaultValue) {
      code += ' ' + this.defaultValue.toLisp()
    }

    return `(${code})`
  }

  toCode() {
    let code = ''
    code += formatComments(this.precedingComments)
    if (this.isStatic) {
      code += 'static '
    }

    code += this.nameRef.toCode()
    if (this.argType) {
      code += ': ' + this.argType.toCode()
    }

    if (this.defaultValue) {
      code += ' = ' + this.defaultValue.toCode()
    }

    return code
  }

  abstract compile(
    runtime: TypeRuntime,
  ): GetRuntimeResult<Nodes.ClassStateProperty | Nodes.ClassStaticProperty>
}

/**
 * A (mutable) property of a class definition.
 *
 *     class Foo {
 *       @state_property_expression: Type = value
 *       @state_property_expression = value -- inferred type
 *       @state_property_expression: Type -- required argument
 *     }
 */
export class ClassStatePropertyExpression extends ClassPropertyExpression {
  constructor(
    readonly range: Range,
    readonly precedingComments: Comment[],
    readonly nameRef: Reference,
    readonly argType: Expression | undefined,
    readonly defaultValue: Expression | undefined,
  ) {
    super(range, precedingComments, nameRef, argType, defaultValue)
  }

  provides() {
    return new Set([this.stateName])
  }

  get isStatic() {
    return false
  }

  getType(runtime: TypeRuntime): GetTypeResult {
    if (this.argType) {
      return getChildAsTypeExpression(this, this.argType, runtime)
    }

    return getChildType(this, this.defaultValue!, runtime).map(type =>
      type.defaultInferredClassProp(),
    )
  }

  eval(): GetValueResult {
    return err(
      new RuntimeError(this, `Property '${this.nameRef}' cannot be evaluated in a static context`),
    )
  }

  compile(runtime: TypeRuntime): GetRuntimeResult<Nodes.ClassStateProperty> {
    return mapOptional(this.defaultValue?.compile(runtime)).map(defaultNode =>
      mapOptional(this.argType?.compile(runtime)).map(argNode => {
        const argType = argNode?.type ?? defaultNode!.type.defaultInferredClassProp()
        if (defaultNode && !Types.canBeAssignedTo(defaultNode.type, argType)) {
          return err(
            new RuntimeError(
              this,
              `Cannot assign default value '${this.defaultValue}' of type '${defaultNode.type}' to property '${this}: ${argType}' in class '${this.name}'`,
            ),
          )
        }

        return new Nodes.ClassStateProperty(toSource(this), argType, this.nameRef.name, defaultNode)
      }),
    )
  }
}

/**
 * A static property on a class or enum.
 *
 *     class User {
 *       static default-name = 'Guest'
 *     }
 *
 *     enum Colour {
 *       static background: Colour = .gray
 *     }
 */
export class ClassStaticPropertyExpression extends ClassPropertyExpression {
  constructor(
    readonly range: Range,
    readonly precedingComments: Comment[],
    readonly nameRef: Reference,
    readonly argType: Expression | undefined,
    readonly defaultValue: Expression,
  ) {
    super(range, precedingComments, nameRef, argType, defaultValue)
  }

  provides() {
    return new Set([this.name])
  }

  get isStatic() {
    return true
  }

  getType(runtime: TypeRuntime): GetTypeResult {
    if (this.argType) {
      return getChildAsTypeExpression(this, this.argType, runtime)
    }
    return getChildType(this, this.defaultValue, runtime)
  }

  eval(runtime: ValueRuntime): GetValueResult {
    return this.defaultValue.eval(runtime)
  }

  compile(runtime: TypeRuntime): GetRuntimeResult<Nodes.ClassStaticProperty> {
    return mapOptional(this.defaultValue?.compile(runtime)).map(defaultNode =>
      mapOptional(this.argType?.compile(runtime)).map(
        argNode =>
          new Nodes.ClassStaticProperty(
            toSource(this),
            argNode?.type ?? defaultNode!.type,
            this.nameRef.name,
            defaultNode,
          ),
      ),
    )
  }
}

/**
 * Identical in form to a NamedFormulaExpression, but prefixed w/ 'static'.
 * Static formulas act as regular formulas, with the exception that other
 * static formulas and properties in the same class can be treated as local
 * references.
 *
 * TODO: treat other static formulas and properties as local references.
 */
export class StaticFormulaExpression extends NamedFormulaExpression {
  prefix = 'static'

  constructor(
    range: Range,
    precedingComments: Comment[],
    precedingNameComments: Comment[],
    precedingArgsComments: Comment[],
    followingArgsComments: Comment[],
    precedingReturnTypeComments: Comment[],
    nameRef: Reference,
    argDefinitions: FormulaArgumentDefinition[],
    returnType: Expression,
    body: Expression,
    generics: GenericExpression[],
  ) {
    super(
      range,
      precedingComments,
      precedingNameComments,
      precedingArgsComments,
      followingArgsComments,
      precedingReturnTypeComments,
      nameRef,
      argDefinitions,
      returnType,
      body,
      generics,
    )
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
 * ClassDefinition, like all definitions, are meant to be declared at the module
 * scope. They are much like Object types, but do not support positional
 * properties, only named, and they support `@state` properties.
 */
export class ClassDefinition extends Expression {
  prefix = 'class'

  constructor(
    range: Range,
    precedingComments: Comment[],
    readonly lastComments: Comment[],
    /**
     * Comments attached to the opening '(' beginning the arguments list
     */
    readonly precedingArgumentsComments: Comment[],
    /**
     * Comments attached to the closing ')' ending the arguments list
     */
    readonly followingArgumentsComments: Comment[],
    readonly nameRef: Reference,
    readonly generics: GenericExpression[],
    readonly extendsExpression: Reference | undefined,
    readonly argDefinitions: FormulaArgumentDefinition[] | undefined,
    // properties (instance and static)
    readonly properties: ClassStatePropertyExpression[],
    readonly staticProperties: ClassStaticPropertyExpression[],
    readonly formulas: NamedFormulaExpression[],
    readonly staticFormulas: StaticFormulaExpression[],
    //
    readonly isExport: boolean,
  ) {
    super(range, precedingComments)
  }

  provides() {
    return new Set([this.nameRef.name])
  }

  childrenProvides() {
    let provides = new Set<string>(this.provides())
    if (this.argDefinitions) {
      provides = union(provides, allProvides(this.argDefinitions))
    }
    for (const expr of this.properties) {
      provides = union(provides, expr.provides())
    }
    for (const expr of this.staticProperties) {
      provides = union(provides, expr.provides())
    }
    for (const expr of this.formulas) {
      provides = union(provides, expr.provides())
    }
    for (const expr of this.staticFormulas) {
      provides = union(provides, expr.provides())
    }
    return provides
  }

  dependencies(parentScopes: Scope[]) {
    const myScopes = parentScopes.concat([new Scope(this.name)])
    let deps = new Set<string>()
    if (this.extendsExpression) {
      const exprDeps = this.extendsExpression.dependencies()
      deps = union(deps, exprDeps)
    }
    if (this.argDefinitions) {
      const exprDeps = allDependencies(this.argDefinitions, myScopes)
      deps = union(deps, exprDeps)
    }
    for (const expr of this.properties) {
      const exprDeps = expr.dependencies(myScopes)
      deps = union(deps, exprDeps)
    }
    for (const expr of this.staticProperties) {
      const exprDeps = expr.dependencies(myScopes)
      deps = union(deps, exprDeps)
    }
    for (const expr of this.formulas) {
      const exprDeps = expr.dependencies(myScopes)
      deps = union(deps, exprDeps)
    }
    for (const expr of this.staticFormulas) {
      const exprDeps = expr.dependencies(myScopes)
      deps = union(deps, exprDeps)
    }
    return difference(deps, this.childrenProvides())
  }

  childExpressions() {
    const children: Expression[] = []
    if (this.extendsExpression) {
      children.push(this.extendsExpression)
    }
    if (this.argDefinitions) {
      children.push(...this.argDefinitions)
    }
    children.push(...this.properties)
    children.push(...this.staticProperties)
    children.push(...this.formulas)
    children.push(...this.staticFormulas)
    return children
  }

  get name() {
    return this.nameRef.name
  }

  toLisp() {
    let code = '('
    if (this.isExport) {
      code += EXPORT_KEYWORD + ' '
    }
    code += `${this.prefix} ${this.nameRef.name})`
    if (this.generics.length) {
      code += ' <' + this.generics.map(g => g.toLisp()).join(' ') + '>'
    }
    if (this.extendsExpression) {
      code += ` extends ${this.extendsExpression.name}`
    }
    if (this.argDefinitions) {
      code += ' (' + this.argDefinitions.map(expr => expr.toLisp()).join(' ') + ')'
    }
    if (this.properties.length) {
      code += ' (' + this.properties.map(m => m.toLisp()).join(' ') + ')'
    }
    if (this.staticProperties.length) {
      code += ' (' + this.staticProperties.map(m => m.toLisp()).join(' ') + ')'
    }
    if (this.formulas.length) {
      code += ' (' + this.formulas.map(f => f.toLisp()).join(' ') + ')'
    }
    if (this.staticFormulas.length) {
      code += ' (' + this.staticFormulas.map(f => f.toLisp()).join(' ') + ')'
    }
    return `(${code})`
  }

  toCode() {
    const scopes = [new Scope(this.nameRef.name)]
    let code = ''
    if (this.isExport) {
      code += EXPORT_KEYWORD + ' '
    }
    code += `${this.prefix} ${this.nameRef.name}`
    if (this.generics.length) {
      code += wrapValues('<', this.generics, '>')
    }
    if (this.argDefinitions) {
      code += '(' + this.argDefinitions.map(expr => expr.toCode()).join(', ') + ')'
    }
    if (this.extendsExpression) {
      code += ` extends ${this.extendsExpression.name}`
    }
    code += ' {\n'
    let body = ''
    let insertNewline = false

    if (this.staticProperties) {
      const sortedStaticProperties =
        dependencySort(
          this.staticProperties.map(expr => [expr.name, expr]),
          _name => true,
          scopes,
        )
          .map(props => props.map(([, expr]) => expr))
          .getOr() ?? this.staticProperties
      for (const prop of sortedStaticProperties) {
        body += prop.toCode() + '\n'
        insertNewline = true
      }
    }

    if (this.staticFormulas.length) {
      if (insertNewline) {
        body += '\n'
      }

      const sortedStaticFormulas =
        dependencySort(
          this.staticFormulas.map(expr => [expr.name, expr]),
          _name => true,
          [new Scope(this.nameRef.name)],
        )
          .map(props => props.map(([, expr]) => expr))
          .getOr() ?? this.staticFormulas
      for (const [index, prop] of sortedStaticFormulas.entries()) {
        if (index > 0) {
          body += '\n'
        }
        body += prop.toCode() + '\n'
        insertNewline = true
      }
    }

    // TODO: if (this.initializer)

    if (this.properties.length) {
      if (insertNewline) {
        body += '\n'
      }

      const sortedProperties =
        dependencySort(
          this.properties.map(expr => [expr.name, expr]),
          _name => true,
          scopes,
        )
          .map(props => props.map(([, expr]) => expr))
          .getOr() ?? this.properties
      for (const prop of sortedProperties) {
        body += prop.toCode() + '\n'
        insertNewline = true
      }
    }

    if (this.formulas.length) {
      if (insertNewline && this.formulas.length) {
        body += '\n'
      }

      const sortedFormulas =
        dependencySort(
          this.formulas.map(expr => [expr.name, expr]),
          _name => true,
          [new Scope(this.nameRef.name)],
        )
          .map(props => props.map(([, expr]) => expr))
          .getOr() ?? this.formulas
      for (const [index, prop] of sortedFormulas.entries()) {
        if (index > 0) {
          body += '\n'
        }
        body += prop.toCodePrefixed(true, true) + '\n'
        insertNewline = true
      }
    }

    code += indent(body)
    code += '}'

    return code
  }

  getType(runtime: TypeRuntime): GetRuntimeResult<Types.ClassDefinitionType> {
    return this.compile(runtime).map(node => node.type)
  }

  /**
   * Follow along in the comments, but high level:
   * - try to evaulate statics, but some could depend on the class already
   *   existing, like a static 'create() => Self(...)'.
   * - then evaluate all stateProps, those could depend on static methods or
   *   properties, but we should have those in nextRuntime by then
   *   (if not it's a reasonable error)
   * - That's enough to create `ClassDefinitionType` and `ClassInstanceType`
   * - Build those up with the remaining statics and instance methods
   * - Errors that occur during this time need to be analyzed for whether they
   *   access a not-yet defined property or method - defer those for later
   */
  compile(runtime: TypeRuntime): GetRuntimeResult<Nodes.ClassDefinition> {
    // moduleRuntime allows state properties, member formulas, and other
    // static properties to access statics as if they are local references
    const moduleRuntime = new MutableTypeRuntime(runtime)

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
    const genericTypes = genericNodes.map(node => node.type)

    // the parentMetaClass (and its instanceClass) is already defined, so at
    // least we have a starting point
    const parentMetaClass = mapOptional(this.extendsExpression?.compile(runtime))
    return parentMetaClass.map(extendsNode => {
      const parentMetaClass = extendsNode?.type
      if (parentMetaClass && !(parentMetaClass instanceof Nodes.ClassDefinition)) {
        return err(
          new RuntimeError(
            this,
            `Class '${this.nameRef.name}' extends non-class type '${this.extendsExpression!}'`,
          ),
        )
      }

      const parentInstanceClass = parentMetaClass?.type.classInstanceType
      const parentScopes = runtime.parentScopes().concat([new Scope(this.name)])

      const allStatics = (
        this.staticProperties as (ClassStaticPropertyExpression | StaticFormulaExpression)[]
      ).concat(this.staticFormulas)

      // It turns out, it's a fools errand to try to predict all the ways that
      // you could access the class while it's being created. In general, we
      // want to do the following:
      //
      //   1. define all the statics whose dependencies are already defined
      //           class User {
      //             static foo = 1
      //           }
      //   2. and all the statics that define on ↑ those
      //           class User {
      //             static foo = 1
      //             static bar = foo + 1
      //           }
      //   3. once that list is exhausted, define the constructor based on the
      //      state properties. State properties can refer to statics that have
      //      been defined above.
      //           class User {
      //             static default-name = ''
      //             @name = User.default-name
      //           }
      //   4. now we can define member formulas, and the remaining statics,
      //      again according to how they depend on previously defined
      //      properties.
      //           class User {
      //             @name = ''
      //             static default = User()
      //
      //             fn greet() => 'Hello, ' .. this.name
      //           }
      // OK *BUT* look at this edge case:
      //     class User {
      //       static foo = let
      //           u = User
      //         in
      //           u.bar
      //       static bar = ''
      //     }
      //
      // It should be clear that studying the *expression tree* , it is almost
      // impossible to detect all the possible cases. Instead, we create a
      // temporary 'User' type, and as we resolve the properties, if the
      // properties' dependencies are properly formed, we will eventually
      // resolve them all.

      // TODO: remove:
      // const tempInstanceType = new Types.ClassInstanceType(
      //   this.name,
      //   parentInstanceClass,
      //   new Map(this.properties.map(expr => [expr.name, Types.NeverType])),
      //   new Map(this.formulas.map(expr => [expr.name, Types.NeverType])),
      // )

      let tempClassType = new Types.ObjectType([])
      const tempClassProps: Types.NamedProp[] = []
      const remainingNames: string[] = []
      const tempModuleRuntime = new MutableTypeRuntime(moduleRuntime)
      tempModuleRuntime.addLocalType(this.name, tempClassType)

      return stablePointAlgorithm(
        allStatics,
        (expr, {resolved, remaining}): Result<StaticNodesResult, RuntimeError> => {
          const compiled = expr.compile(tempModuleRuntime)
          if (compiled.isErr()) {
            // if the error is due to invoking the class constructor, put this in the
            // 'later' stack and be chill about it.
            if (
              compiled.error instanceof FunctionInvocationRuntimeError &&
              compiled.error.lhsType === tempClassType
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

          // Hey we resolved one! that means either it had no dependencies:
          //     static foo = 1
          // or the dependency was previously resolved
          //     static bar = foo + 1
          //     static bux = User.foo + 1
          // for future runs of stablePointAlgorithm, we need to add this
          // resolved type, both as a local variable (bar = foo + 1) and as a
          // property on the placeholder 'User' object.

          if (expr.name !== this.name) {
            // statics can be accessed as local variables, so put this
            // expression into the temp runtime... but only if it isn't the name
            // of the class itself.
            moduleRuntime.addLocalType(expr.name, compiled.value.type)
          }

          // add the resolved expression to the (placeholder) object type
          // representing the class name
          //     User.name = resolvedExpression
          // once we know all the expressions can be resolved, and the order, we
          // can build up the actual ClassDefinitionType
          tempClassProps.push({
            is: 'named',
            name: expr.name,
            type: compiled.value.type,
          })

          tempClassType = new Types.ObjectType(tempClassProps)
          tempModuleRuntime.addLocalType(this.name, tempClassType)

          return ok({
            resolved: resolved.concat([{expr, node: compiled.value}]),
            remaining,
          })
        },
        {resolved: [], remaining: []} as StaticNodesResult,
      )
        .mapError(errors => new RuntimeError(this, 'TODO', errors))
        .map(({resolved: resolvedStatics, remaining: remainingStatics}) => {
          // here is the class definition we will build up. Static properties are
          // added to this instance, then we create the ClassInstanceType and
          // attach it back to the ClassDefinitionType, and finally finish
          // compiling the remaining static and instance formulas.
          const classType = new Types.ClassDefinitionType(
            this.name,
            parentMetaClass?.type,
            // static properties - this is built up later
            new Map(),
            genericTypes,
          )

          // add the metaClass to the runtime - for static access, and eventually
          // it will act as the constructor (when we resolve the instance type)
          moduleRuntime.addLocalType(this.name, classType)

          // I've made an assumption here that 'node' was resolved to something
          // reasonable, and that nothing bad will happen despite the fact that
          // 'User' used to be an ObjectType, and now it's a ClassDefinitionType
          const staticPropertyNodes = new Map<string, Nodes.Node>()
          for (const {expr, node} of resolvedStatics) {
            // support static properties as local variables
            if (expr.name !== this.name) {
              moduleRuntime.addLocalType(expr.name, node.type)
            }

            classType.addStaticProp(expr.name, node.type)
            staticPropertyNodes.set(expr.name, node)
          }

          // we have some - maybe not all - statics defined in moduleRuntime, that
          // *should* be enough to define all the state properties. If it isn't,
          // that means a property is defining on a static that references the
          // constructor, which is considered a circular dependency
          //     class User {
          //       static a = User()
          //       static b = ''
          //
          //       @name = a.name  -- × invalid - cannot instantiate 'a'
          //       @bla = b        -- ✓ can be resolved
          //     }
          const stateProperties = new Map<string, Nodes.Node>()
          const statePropsTypes = new Map<string, Types.Type>()
          const defaultPropertyNames = new Set<string>()

          return mapAll(
            this.properties.map(propertyExpr => {
              // TODO: I'm pretty sure that overriding properties from a parent class
              // should not be allowed. At first glance, it seems like narrowing
              // should be fine (overriding with a property that is a subtype of the
              // parent property), but instance methods can return Messages that
              // modify those properties, and so we cannot guarantee that those
              // mutations will not assign an incompatible value to the child class'
              // redefinition.
              if (parentInstanceClass?.allProps.has(propertyExpr.name)) {
                return err(
                  new RuntimeError(
                    propertyExpr,
                    `Cannot redefine property '${propertyExpr.name}' in class '${this.name}', it is already defined in parent class '${parentInstanceClass.name}'`,
                  ),
                )
              }

              // instance properties can only rely on static properties that are
              // already defined (those that don't rely on the constructor to exist)
              const badDependency = remainingStatics.find(prop =>
                some(propertyExpr.dependencies(parentScopes), dep => prop.name === dep),
              )
              if (badDependency) {
                return err(
                  new RuntimeError(
                    propertyExpr,
                    `Property '${propertyExpr.name}' in class '${this.name}' relies on static property '${badDependency.name}' which cannot be compiled until the '${this.name}()' constructor is defined, which depends on '${propertyExpr.name}' being defined.`,
                  ),
                )
              }

              const statePropResult = propertyExpr.compile(moduleRuntime)
              if (statePropResult.isErr()) {
                return err(statePropResult.error)
              }

              const stateProp = statePropResult.value
              if (propertyExpr.defaultValue) {
                defaultPropertyNames.add(propertyExpr.name)
              }

              stateProperties.set(propertyExpr.name, stateProp)
              statePropsTypes.set(propertyExpr.name, stateProp.type)

              return ok()
            }),
          ).map(() => {
            // With the statePropsTypes resolved, we can construct the
            // ClassInstanceType, and assign it to the ClassDefinitionType in
            // order to define the constructor. The remaining properties (member
            // formulas and static properties that depend on the constructor)
            // can finally be resolved.
            const instanceType = new Types.ClassInstanceType(
              this.name,
              parentInstanceClass,
              statePropsTypes,
              // will hold formulas, they get assigned as they are resolved
              new Map(),
            )
            classType.resolveInstanceType(instanceType, defaultPropertyNames)
            const thisRuntime = new MutableTypeRuntime(moduleRuntime, instanceType)

            // The remaining items are remainingStatics and instance formulas.
            // Just like resolving the original statics, we use
            // stablePointAlgorithm to loop over all the remaining items,
            // resolving as many as possible in each iteration.
            // The remainingStatics all rely on the class constructor, but may
            // be invoking a member formula (which may not be defined yet).
            // Likewise, a member formula may refer to a static property. Rather
            // than sort these by dependency, we just attempt and retry.

            const formulaProperties = new Map<string, Nodes.Node>()
            return stablePointAlgorithm(
              [...remainingStatics, ...this.formulas],
              expr => {
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

                // messy business, we mutate these *in-place* because I seem to think
                // I know what I'm doing. It would be safer to *replace* the metaClass
                // in nextRuntime, but YOLO.
                //
                // It would be pretty easy, actually - create a new
                // Types.ClassInstanceType, create another runtime and assign it to
                // the thisRuntime variable. The important thing is above where we
                // search for references to the instanceClassType.
                if (isMemberProp) {
                  instanceType.addFormula(expr.name, remainingProp.value.type)
                  formulaProperties.set(expr.name, remainingProp.value)
                } else {
                  // static properties can be treated as local variables
                  moduleRuntime.addLocalType(expr.name, remainingProp.value.type)

                  classType.addStaticProp(expr.name, remainingProp.value.type)
                  staticPropertyNodes.set(expr.name, remainingProp.value)
                }

                return ok()
              },
              undefined,
            )
              .mapError(errors => new RuntimeError(this, 'TODO', errors))
              .map(
                () =>
                  new Nodes.ClassDefinition(
                    toSource(this),
                    this.name,
                    parentMetaClass,
                    classType,
                    staticPropertyNodes,
                    stateProperties,
                    formulaProperties,
                    // generics
                    genericNodes,
                    this.isExport,
                  ),
              )
          })
        })
    })
  }

  eval(runtime: ValueRuntime): GetRuntimeResult<Values.ClassDefinitionValue> {
    const parentClass = mapOptional(this.extendsExpression?.eval(runtime))
    return mapMany(
      parentClass,
      mapAll(
        this.staticProperties.map(expr =>
          expr.eval(runtime).map(value => [expr.nameRef.name, value] as const),
        ),
      ),
      mapAll(
        this.staticFormulas.map(expr =>
          expr.eval(runtime).map(value => [expr.nameRef.name, value] as const),
        ),
      ),
      mapAll(
        this.formulas.map(expr =>
          expr.eval(runtime).map(value => [expr.nameRef.name, value] as const),
        ),
      ),
    ).map(([parentClass, staticProps, staticFormulas, memberFormulas]) => {
      if (parentClass && !(parentClass instanceof Values.ClassDefinitionValue)) {
        return err(
          new RuntimeError(
            this,
            `Class '${this.nameRef.name}' extends non-class type '${this.extendsExpression!}'`,
          ),
        )
      }

      const allStatics = staticProps.concat(staticFormulas)
      const thisSharedRuntime = new MutableValueRuntime(runtime)
      for (const [name, value] of staticProps) {
        thisSharedRuntime.addLocalValue(name, value)
      }
      for (const [name, value] of staticFormulas) {
        thisSharedRuntime.addLocalValue(name, value)
      }

      const konstructor = (classDef: Values.ClassDefinitionValue) =>
        // this NamedFormulaValue is run in the context of the static class
        // definition, plus whatever is already in runtime, plus whatever args
        // were defined in the constructor, plus whatever args were passed to
        // the formula:
        //     class User(...) <- constructor (argDefinitions?.args)
        //     class User {
        //       static bar() => … <- from thisSharedRuntime
        //       foo = '' <- from stateProps
        //     }
        //     User(...) <- formula (args)
        new Values.NamedFormulaValue(
          this.nameRef.name,
          args =>
            // yeeees the constructor is called in the context of the class
            // definition (ie static functions are treated as "in scope"), but
            // I'm not passing classDef as 'this'.
            argumentValues(thisSharedRuntime, this.argDefinitions ?? [], args, undefined).map(
              thisRuntime => {
                const stateProps = this.properties.map(
                  expr => [expr.stateName, expr] as [string, ClassStatePropertyExpression],
                )
                return dependencySort(
                  stateProps,
                  name => thisRuntime.has(name),
                  thisRuntime.parentScopes(),
                ).map(stateProps =>
                  mapAll(
                    stateProps.flatMap(([_stateName, expr]) => {
                      if (!expr.defaultValue) {
                        return []
                      }
                      return expr.defaultValue.eval(thisRuntime).map(value => {
                        thisRuntime.addStateValue(expr.name, value)
                        return [expr.name, value] as const
                      })
                    }),
                  ).map(defaultState => {
                    const props = new Map<string, Values.Value>()
                    for (const [name, value] of defaultState) {
                      props.set(name, value)
                    }

                    for (const [_stateName, stateProp] of stateProps) {
                      const name = stateProp.name
                      if (props.has(name)) {
                        continue
                      }

                      const value = thisRuntime.getLocalValue(name)
                      if (!value) {
                        return err(
                          new RuntimeError(
                            this,
                            `Could not get value for property '${name}' in class constructor '${this.name}()'`,
                          ),
                        )
                      }
                      props.set(name, value)
                      thisRuntime.addStateValue(name, value)
                    }

                    return ok(
                      new Values.ClassInstanceValue(classDef, props, new Map(memberFormulas)),
                    )
                  }),
                )
              },
            ),
          undefined,
        )

      return ok(
        new Values.ClassDefinitionValue(
          this.nameRef.name,
          konstructor,
          parentClass,
          new Map(allStatics),
        ),
      )
    })
  }
}

export class ViewClassDefinition extends ClassDefinition {
  prefix = 'view'

  readonly renderFormula: NamedFormulaExpression

  constructor(
    range: Range,
    precedingComments: Comment[],
    lastComments: Comment[],
    precedingArgumentsComments: Comment[],
    followingArgumentsComments: Comment[],
    nameRef: Reference,
    argDefinitions: FormulaArgumentDefinition[] | undefined,
    properties: ClassStatePropertyExpression[],
    staticProperties: ClassStaticPropertyExpression[],
    formulas: InstanceFormulaExpression[],
    staticFormulas: StaticFormulaExpression[],
    isExport: boolean,
  ) {
    super(
      range,
      precedingComments,
      lastComments,
      precedingArgumentsComments,
      followingArgumentsComments,
      nameRef,
      // generics are not supported yet on Views. Eventually they could be used to
      // require certain 'host' components, for example a component could require
      // all its children to be Text, or a specific tag.
      [],
      // extends
      undefined,
      argDefinitions,
      properties,
      staticProperties,
      formulas,
      staticFormulas,
      isExport,
    )
    const renderFormula = formulas.find(formula => formula instanceof RenderFormulaExpression)
    if (!renderFormula) {
      throw "Expected view function named 'render'"
    }
    this.renderFormula = renderFormula
  }

  getType(runtime: TypeRuntime) {
    return this.compile(runtime).map(node => node.type)
  }

  compile(runtime: TypeRuntime) {
    return super.compile(runtime).map((metaClass): GetRuntimeResult<Nodes.ViewClassDefinition> => {
      const parentMetaClass = metaClass.parentClass
      if (parentMetaClass && !(parentMetaClass instanceof Types.ViewClassDefinitionType)) {
        return err(
          new RuntimeError(
            this,
            `Class '${this.nameRef.name}' extends non-view type '${this.extendsExpression!}'`,
          ),
        )
      }

      let returnClassType: Types.ViewClassInstanceType
      if (metaClass.type.classInstanceType instanceof Types.ViewClassInstanceType) {
        returnClassType = metaClass.type.classInstanceType
      } else {
        const returnParentClass = metaClass.type.classInstanceType!.parent
        if (returnParentClass && !(returnParentClass instanceof Types.ViewClassInstanceType)) {
          return err(
            new RuntimeError(
              this,
              `Class '${this.nameRef.name}' extends non-view type '${this.extendsExpression!}'`,
            ),
          )
        }

        returnClassType = new Types.ViewClassInstanceType(
          metaClass.type.classInstanceType!.name,
          returnParentClass,
          metaClass.type.classInstanceType!.myProps,
          metaClass.type.classInstanceType!.formulas,
        )
      }

      const metaClassType = new Types.ViewClassDefinitionType(
        metaClass.name,
        parentMetaClass,
        metaClass.type.staticProps,
        metaClass.generics.map(node => node.type),
      )
      // TODO: calculate which arguments have default values
      metaClassType.resolveInstanceType(returnClassType, new Set())

      return ok(
        new Nodes.ViewClassDefinition(
          toSource(this),
          this.name,
          parentMetaClass,
          metaClassType,
          metaClass.staticProperties,
          metaClass.stateProperties,
          metaClass.formulaProperties,
          metaClass.generics,
          this.isExport,
        ),
      )
    })
  }

  /**
   * Type checks the arguments
   * - return value of konstructor should be a ClassInstanceValue,
   * - with a 'render' property that is a ViewFormulaValue.
   */
  guaranteeConstructor(
    instance: Values.Value,
  ): GetRuntimeResult<[Values.ClassInstanceValue, Values.ViewFormulaValue<Nodes.Node>]> {
    if (!(instance instanceof Values.ClassInstanceValue)) {
      return err(
        new RuntimeError(
          this,
          `Expected ClassInstanceValue, got '${instance}' (${instance.constructor.name})`,
        ),
      )
    }

    const render = instance.formulas.get('render')
    if (!render) {
      return err(
        new RuntimeError(
          this,
          `View class '${this.nameRef.name}' does not have a 'render' formula`,
        ),
      )
    }

    if (!(render instanceof Values.ViewFormulaValue)) {
      return err(
        new RuntimeError(
          this,
          `Impossible! 'render' should've been guaranteed to be ViewFormulaValue at this point`,
        ),
      )
    }

    return ok([instance, render])
  }

  eval(runtime: ValueRuntime) {
    return super.eval(runtime).map(metaClass => {
      const parentClass = metaClass.parent
      if (parentClass && !(parentClass instanceof Values.ViewClassDefinitionValue)) {
        return err(
          new RuntimeError(
            this,
            `Class '${this.nameRef.name}' extends non-view type '${this.extendsExpression!}'`,
          ),
        )
      }

      // I shouldn't have to apologize for not bothering to do some sort of
      // proper OOP design pattern here. But I will: I'm sorry.
      //
      // This code takes the instances of  ClassDefinitionValue and
      // ClassInstanceValue and turns them into ViewClassDefinitionValue and
      // ViewClassInstanceValue. There's not a *ton* of reason to keep these
      // separate, but it does indicate good housekeeping on both the code and
      // user-land side of things.
      //
      // I could later decide that any class with a 'render' function should be
      // "viewable", but I can't go the other way around, so I'm starting with
      // this.
      return new Values.ViewClassDefinitionValue(
        metaClass.name,
        classDef => {
          const konstructor = metaClass.konstructor(classDef)
          return new Values.NamedFormulaValue(
            konstructor.name,
            (args: Values.FormulaArgs) =>
              konstructor
                .call(args)
                .map(value =>
                  this.guaranteeConstructor(value).map(
                    ([instance, render]) =>
                      new Values.ViewClassInstanceValue(
                        classDef,
                        render,
                        instance.props,
                        instance.formulas,
                      ),
                  ),
                ),
            undefined,
          )
        },
        metaClass.parent,
        metaClass.statics,
      )
    })
  }
}
