import {err, mapAll, mapMany, ok} from '@extra-lang/result'
import {indent, union, difference, some} from '@/util'
import {
  type TypeRuntime,
  type ValueRuntime,
  MutableTypeRuntime,
  MutableValueRuntime,
} from '@/runtime'
import * as Types from '@/types'
import * as Nodes from '@/nodes'
import * as Values from '@/values'
import {
  Expression,
  type Reference,
  type GenericExpression,
  type FormulaLiteralArgument,
  type NamedFormulaExpression,
  type Range,
  RuntimeError,
  ReferenceRuntimeError,
  PropertyAccessRuntimeError,
  InstanceFormulaExpression,
  ViewFormulaExpression,
  RenderFormulaExpression,
  StaticFormulaExpression,
  argumentValues,
  formatComments,
  dependencySort,
  toSource,
  allProvides,
  allDependencies,
  getChildType,
  getChildAsTypeExpression,
  wrapValues,
} from './expressions'
import {organizeStaticProperties} from './organizeStaticProperties'
import {
  type Comment,
  type GetTypeResult,
  type GetValueResult,
  type GetNodeResult,
  type GetRuntimeResult,
} from '@/formulaParser/types'
import {EXPORT_KEYWORD, STATE_START} from '@/formulaParser/grammars'

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

  dependencies() {
    let deps = new Set<string>()
    if (this.argType) {
      deps = union(deps, this.argType.dependencies())
    }
    if (this.defaultValue) {
      deps = union(deps, this.defaultValue.dependencies())
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
    code += this.nameRef.toCode()
    if (this.argType) {
      code += ': ' + this.argType.toCode()
    }

    if (this.defaultValue) {
      code += ' = ' + this.defaultValue.toCode()
    }

    return code
  }
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

  compile(runtime: TypeRuntime) {
    const defaultNode: GetRuntimeResult<Nodes.Node | undefined> = this.defaultValue
      ? this.defaultValue.compile(runtime)
      : ok(undefined)
    return defaultNode.map(defaultNode => {
      const argNode: GetRuntimeResult<Nodes.Node | undefined> = this.argType
        ? this.argType.compile(runtime)
        : ok(undefined)
      return argNode.map(
        argNode =>
          new Nodes.ClassStateProperty(
            toSource(this),
            argNode?.type ?? defaultNode!.type.defaultInferredClassProp(),
            this.nameRef.name,
            defaultNode,
          ),
      )
    })
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

  compile(runtime: TypeRuntime) {
    const defaultNode: GetRuntimeResult<Nodes.Node | undefined> = this.defaultValue
      ? this.defaultValue.compile(runtime)
      : ok(undefined)
    return defaultNode.map(defaultNode => {
      const argNode: GetRuntimeResult<Nodes.Node | undefined> = this.argType
        ? this.argType.compile(runtime)
        : ok(undefined)
      return argNode.map(
        argNode =>
          new Nodes.ClassStaticProperty(
            toSource(this),
            argNode?.type ?? defaultNode!.type,
            this.nameRef.name,
            defaultNode,
          ),
      )
    })
  }
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
    readonly argDefinitions: FormulaLiteralArgument[] | undefined,
    /**
     * Properties and their type, possibly with a default value.
     *
     * StateReference's are considered instance properties, all other properties
     * are considered static and must be initialized.
     */
    readonly properties: ClassPropertyExpression[],
    readonly staticProperties: ClassPropertyExpression[],
    /**
     * Static *and* member formulas
     */
    readonly formulas: NamedFormulaExpression[],
    readonly staticFormulas: NamedFormulaExpression[],
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
    return provides
  }

  dependencies() {
    let deps = new Set<string>()
    if (this.extendsExpression) {
      const exprDeps = this.extendsExpression.dependencies()
      deps = union(deps, exprDeps)
    }
    if (this.argDefinitions) {
      const exprDeps = allDependencies(this.argDefinitions)
      deps = union(deps, exprDeps)
    }
    for (const expr of this.properties) {
      const exprDeps = expr.dependencies()
      deps = union(deps, exprDeps)
    }
    for (const expr of this.staticProperties) {
      const exprDeps = expr.dependencies()
      deps = union(deps, exprDeps)
    }
    for (const expr of this.formulas) {
      const exprDeps = expr.dependencies()
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
    // TODO: if (this.initializer)
    for (const prop of this.properties) {
      body += prop.toCode() + '\n'
    }
    if (this.properties.length && this.staticProperties.length) {
      body += '\n'
    }
    for (const prop of this.staticProperties) {
      body += 'static ' + prop.toCode() + '\n'
    }

    if (
      (this.properties.length || this.staticProperties.length) &&
      (this.formulas.length || this.staticFormulas.length)
    ) {
      body += '\n'
    }

    for (const formula of this.formulas) {
      body += formula.toCodePrefixed(true, true) + '\n'
    }
    if (this.formulas.length && this.staticFormulas.length) {
      body += '\n'
    }
    for (const formula of this.staticFormulas) {
      body += formula.toCodePrefixed(true, true) + '\n'
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
    // classLocalRuntime allows state properties, member formulas, and other
    // static properties to access statics as if they are local references
    const classLocalRuntime = new MutableTypeRuntime(runtime)

    // the parentMetaClass (and its instanceClass) is already defined, so at
    // least we have a starting point
    const parentMetaClass: GetRuntimeResult<Nodes.Node | undefined> =
      this.extendsExpression?.compile(runtime) ?? ok(undefined)
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

      const parentInstanceClass = parentMetaClass?.type.returnClassType

      const allStatics = (
        this.staticProperties as (ClassStaticPropertyExpression | StaticFormulaExpression)[]
      ).concat(this.staticFormulas)

      // This code is ordering the initialization of the static properties and
      // formulas. First, any static that uses the `User()` constructor *must*
      // come after the constructor is defined. The constructor can rely on any
      // previously initialized statics. So the order is:
      // - statics with no internal dependencies
      //       static FOO = ''
      // - statics that depend on other (internal) statics
      //       static BAR = FOO .. '!'
      // - constructor / constructor arguments
      //       class User(...)
      // - statics that depend on the constructor,
      //       static shared = User(...)
      // - statics that depend on statics that depend on the constructor
      //
      // For the sake of these comments, I'm going to use the name 'User' for
      // the class name, just to have something concrete to refer to.
      const staticPropertiesResult: GetRuntimeResult<
        [
          (ClassStaticPropertyExpression | StaticFormulaExpression)[],
          (ClassStaticPropertyExpression | StaticFormulaExpression)[],
        ]
      > = organizeStaticProperties(allStatics, this.name)
      if (staticPropertiesResult.isErr()) {
        return err(staticPropertiesResult.error)
      }

      const [staticProperties, staticsDependingOnConstructor] = staticPropertiesResult.get()
      const sortedPropertiesResult = dependencySort(
        staticProperties.map(expr => [expr.name, expr]),
        name => classLocalRuntime.has(name),
      )
      if (sortedPropertiesResult.isErr()) {
        return err(sortedPropertiesResult.error)
      }

      const staticPropertyNodes = new Map<string, Nodes.Node>()
      const staticPropertyTypes = new Map<string, Types.Type>()
      for (const [, expr] of sortedPropertiesResult.get()) {
        const staticProp = expr.compile(classLocalRuntime)
        if (staticProp.isErr()) {
          return err(staticProp.error)
        }
        classLocalRuntime.addLocalType(expr.name, staticProp.value.type)
        staticPropertyTypes.set(expr.name, staticProp.value.type)
        staticPropertyNodes.set(expr.name, staticProp.value)
      }

      // we have some - maybe not all - statics defined in nextRuntime, that
      // *should* be enough to define all the state properties. We can check by
      // looking in `staticsDependingOnConstructor` and
      // `propertyExpr.dependencies()`
      const stateProperties = new Map<string, Nodes.Node>()
      const statePropsTypes = new Map<string, Types.Type>()
      const defaultPropertyNames = new Set<string>()
      for (const propertyExpr of this.properties) {
        // TODO: I'm pretty sure that overriding properties from a parent class
        // should not be allowed. At first glance, it seems like narrowing
        // should be fine (overridng with a property that is a subtype of the
        // parent property), but instance methods can return Messages that
        // modify those properties,and so we cannot guarantee that those
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

        // instance properties can only rely on static properties that are already defined
        // (those that don't rely on the constructor to exist)
        const badDependency = staticsDependingOnConstructor.find(prop =>
          some(propertyExpr.dependencies(), dep => prop.name === dep),
        )
        if (badDependency) {
          return err(
            new RuntimeError(
              propertyExpr,
              `Property '${propertyExpr.name}' in class '${this.name}' relies on static property '${badDependency.name}' which cannot be compiled until the '${this.name}()' constructor is defined, which requires on '${propertyExpr.name}'.`,
            ),
          )
        }

        const statePropResult = propertyExpr.compile(classLocalRuntime)
        if (statePropResult.isErr()) {
          return err(statePropResult.error)
        }

        const stateProp = statePropResult.value
        if (propertyExpr.defaultValue) {
          const defaultNodeResult = propertyExpr.compile(classLocalRuntime)
          if (defaultNodeResult.isErr()) {
            return err(defaultNodeResult.error)
          }
          const defaultNode = defaultNodeResult.value
          if (!Types.canBeAssignedTo(defaultNode.type, stateProp.type)) {
            return err(
              new RuntimeError(
                propertyExpr,
                `Cannot assign default value type '${defaultNode}' to property '${propertyExpr}: ${stateProp.type}' of class '${this.name}'`,
              ),
            )
          }
          defaultPropertyNames.add(propertyExpr.name)
        }

        stateProperties.set(propertyExpr.name, stateProp)
        statePropsTypes.set(propertyExpr.name, stateProp.type)
      }

      // create these, and then "fix" the missing properties. This is hacky, but
      // works, for the most part... the stateProps *must* be resolved because
      // those are passed to the MetaClassType and used as named arguments for
      // the constructor function.
      const instanceClassType = new Types.ClassInstanceType(
        this.name,
        parentInstanceClass,
        statePropsTypes,
        // will hold formulas, they get assigned as they are resolved
        new Map(),
      )
      const metaClassType = new Types.ClassDefinitionType(
        this.name,
        parentMetaClass?.type,
        // this is assigned here, but modified in place below
        instanceClassType,
        staticPropertyTypes,
        defaultPropertyNames,
      )

      // add the metaClass to the runtime - this will act as the constructor
      // and outside the class defined for static property access
      classLocalRuntime.addLocalType(this.name, metaClassType)

      // gather the remaining items: remainingStaticDependencies and
      // formulas. Whatever is in remainingStaticDependencies depends
      // on 'User', and we don't know what methods it might call on a User
      // instance... so we try to get the type, and if it fails we look at the
      // error to see if it is related to our class - if so, put the expression
      // back onto the queue.
      //
      // We can dependencySort the remainingStaticDependencies, they might still
      // refer to an instance method on Self that hasn't been resolved yet, but
      // more likely is they refer to just the constructor (which *has* been
      // defined above) or maybe other static properties. Anyway, can't hurt?

      const remainingStaticDependenciesResult = dependencySort(
        staticsDependingOnConstructor.map(expr => [expr.name, expr]),
        name => classLocalRuntime.has(name),
      ).map(all => all.map(([_, expr]) => expr))
      if (remainingStaticDependenciesResult.isErr()) {
        return err(remainingStaticDependenciesResult.error)
      }
      const remainingStaticDependencies = remainingStaticDependenciesResult.value
      const remainingMemberFormulas = this.formulas

      let remaining = new Set([...remainingStaticDependencies, ...remainingMemberFormulas])
      let next: typeof remaining = new Set()
      // resolving member formulas usually involves accessing '@' props, which
      // require 'this' to be assigned.
      const thisRuntime = new MutableTypeRuntime(classLocalRuntime, instanceClassType)

      while (remaining.size) {
        const errors: RuntimeError[] = []
        resolveNextRemaining: for (const expr of remaining) {
          let remainingProp: GetNodeResult
          const isMemberProp =
            expr instanceof InstanceFormulaExpression || expr instanceof RenderFormulaExpression
          if (isMemberProp) {
            remainingProp = expr.compile(thisRuntime)
          } else {
            remainingProp = expr.compile(classLocalRuntime)
          }

          if (remainingProp.isErr()) {
            for (const remainingExpr of remainingMemberFormulas) {
              // if remainingProp is an error due to accessing a
              // not-yet-resolved memberFormula, show the 'did you mean this.foo' error message
              if (remainingProp.error instanceof ReferenceRuntimeError) {
                if (remainingProp.error.expression.name === remainingExpr.name) {
                  return err(
                    new ReferenceRuntimeError(
                      this,
                      `There is no reference in scope named '${remainingExpr.name}', did you mean 'this.${remainingExpr.name}'?`,
                    ),
                  )
                }
              }

              // accessing some-user.name(), where some-user is an
              // instance of User and 'name' is not yet resolved
              if (
                remainingProp.error instanceof PropertyAccessRuntimeError &&
                remainingProp.error.lhsType === instanceClassType
              ) {
                if (remainingProp.error.rhsName === remainingExpr.name) {
                  next.add(remainingExpr)
                  errors.push(remainingProp.error)

                  continue resolveNextRemaining
                }
              }
            }

            for (const remainingExpr of remainingStaticDependencies) {
              // if remainingProp is an error due to accessing a
              // not-yet-resolved static property, put expr into next
              if (remainingProp.error instanceof ReferenceRuntimeError) {
                if (remainingProp.error.expression.name === remainingExpr.name) {
                  next.add(remainingExpr)
                  errors.push(remainingProp.error)

                  continue resolveNextRemaining
                }
              }

              // similarly, if accessing User.name where 'name' is not yet resolved
              if (
                remainingProp.error instanceof PropertyAccessRuntimeError &&
                remainingProp.error.lhsType === metaClassType
              ) {
                if (remainingProp.error.rhsName === remainingExpr.name) {
                  next.add(remainingExpr)
                  errors.push(remainingProp.error)

                  continue resolveNextRemaining
                }
              }
            }

            // unknown error, return
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
            instanceClassType.formulas.set(expr.name, remainingProp.value.type)
            stateProperties.set(expr.name, remainingProp.value)
          } else {
            classLocalRuntime.addLocalType(expr.name, remainingProp.value.type)
            // static properties can be treated as local variables
            thisRuntime.addLocalType(expr.name, remainingProp.value.type)

            metaClassType.addStaticProp(expr.name, remainingProp.value.type)
            staticPropertyNodes.set(expr.name, remainingProp.value)
          }
        }

        if (remaining.size === next.size) {
          return err(
            new RuntimeError(
              this,
              `Could not resolve remaining expressions:\n- ${Array.from(remaining).join('\n- ')}`,
              errors,
            ),
          )
        }

        remaining = next
        next = new Set()
      }

      return ok(
        new Nodes.ClassDefinition(
          toSource(this),
          this.name,
          parentMetaClass,
          metaClassType,
          staticPropertyNodes,
          stateProperties,
        ),
      )
    })
  }

  eval(runtime: ValueRuntime): GetRuntimeResult<Values.ClassDefinitionValue> {
    const parentClass: GetRuntimeResult<Values.Value | undefined> =
      this.extendsExpression?.eval(runtime) ?? ok(undefined)
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
        //       foo = '' <- from thisSharedRuntime
        //       static bar() => … <- from thisSharedRuntime
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
                const stateProps = this.stateProperties().map(
                  expr => [expr.stateName, expr] as [string, ClassStatePropertyExpression],
                )
                return dependencySort(stateProps, name => thisRuntime.has(name)).map(stateProps =>
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
          new Map(staticProps),
          new Map(staticFormulas),
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
    argDefinitions: FormulaLiteralArgument[] | undefined,
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
      // generics
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
      if (metaClass.type.returnClassType instanceof Types.ViewClassInstanceType) {
        returnClassType = metaClass.type.returnClassType
      } else {
        const returnParentClass = metaClass.type.returnClassType.parent
        if (returnParentClass && !(returnParentClass instanceof Types.ViewClassInstanceType)) {
          return err(
            new RuntimeError(
              this,
              `Class '${this.nameRef.name}' extends non-view type '${this.extendsExpression!}'`,
            ),
          )
        }

        returnClassType = new Types.ViewClassInstanceType(
          metaClass.type.returnClassType.name,
          returnParentClass,
          metaClass.type.returnClassType.myProps,
          metaClass.type.returnClassType.formulas,
        )
      }

      const metaClassType = new Types.ViewClassDefinitionType(
        metaClass.name,
        parentMetaClass,
        returnClassType,
        metaClass.type.staticProps,
        metaClass.type.defaultValueNames,
      )
      return ok(
        new Nodes.ViewClassDefinition(
          toSource(this),
          this.name,
          parentMetaClass,
          metaClassType,
          metaClass.staticProperties,
          metaClass.stateProperties,
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
        metaClass.staticProps,
        metaClass.staticFormulas,
      )
    })
  }
}
