import {err, ok} from '@extra-lang/result'
import {type Expression, Operation, Reference, RuntimeError} from './expressions'
import {
  FUNCTION_INVOCATION_OPERATOR,
  NULL_COALESCE_INVOCATION_OPERATOR,
  NULL_COALESCING_OPERATOR,
  PROPERTY_ACCESS_OPERATOR,
} from '@/formulaParser/grammars'
import {type GetRuntimeResult} from '@/formulaParser/types'

/**
 * Groups the property expressions into two groups:
 * - `statics`: does not depend on the constructorName, but may depend on
 *   another static property.
 * - `constructorDeps`: depends on the class constructor (possibly via a
 *   transitive dependence), and so must be defined after the constructor
 */
export function organizeStaticProperties<T extends Expression & {get name(): string}>(
  allStatics: T[],
  constructorName: string,
): GetRuntimeResult<[T[], T[]]> {
  // First, might as well check for static property access, ie User.foo, and
  // throw an error if it occurs.
  // This turns out to be tedious to support. At runtime, a temporary object
  // User must be created with the static properties - but only the static
  // properties that don't rely on the constructors - and at compile time,
  // dependencies must be sorted according not only to the local references, but
  // also by investigating User.property-name
  const invalidProps = allStatics.flatMap(staticProp => {
    const foundInvalidAccess = staticProp.searchExpressions<Operation | undefined, undefined>(
      (expr, foundExpression) => {
        if (foundExpression) {
          // already found a constructor invocation
          return [true, foundExpression, undefined]
        }

        // check for `User.` and `User?.` - property access operator, with
        // the lhs being a reference to constructorName
        if (
          expr instanceof Operation &&
          (expr.operator.symbol === PROPERTY_ACCESS_OPERATOR ||
            expr.operator.symbol === NULL_COALESCING_OPERATOR)
        ) {
          const lhsName = expr.args[0]
          if (lhsName instanceof Reference && lhsName.name === constructorName) {
            // stop searching and return the expression
            return [true, expr, undefined]
          }
        }

        // the name `constructorName` is being shadowed by this node. Stop
        // searching this tree.
        if (expr.provides().has(constructorName)) {
          return [true, undefined, undefined]
        }

        // keep searching
        return [false, undefined, undefined]
      },
      undefined,
    )
    return foundInvalidAccess ? [{name: staticProp.name, expr: foundInvalidAccess}] : []
  })

  if (invalidProps.length) {
    const {name, expr: invalidProp} = invalidProps[0]
    const [, rhs] = invalidProp.args
    return err(
      new RuntimeError(
        invalidProp,
        `Invalid property access 'static ${name} = ${invalidProp.toCode()}' in class ${constructorName}. In the body of ${constructorName}, treat '${rhs.toCode()}' as a local variable.`,
      ),
    )
  }

  const staticNames = allStatics.map(staticProp => staticProp.name).concat([constructorName])
  const [remainingDeps, constructorDeps] = allStatics.reduce(
    ([remainingDeps, constructorDeps], staticProp) => {
      if (staticProp.dependencies().has(constructorName)) {
        // only constructor *invocations* count as constructorDeps
        // otherwise it should go in someDeps, which is picked up below
        const foundConstructor = staticProp.searchExpressions<boolean, undefined>(
          (expr, foundConstructor) => {
            if (foundConstructor) {
              // already found a constructor invocation
              return [true, true, undefined]
            }

            // is this too simple of a check? It only finds:
            //     User()
            //     User?.()
            //         ^^ function invocations
            //     ^^^^ name == constructorName
            if (
              expr instanceof Operation &&
              (expr.operator.symbol === FUNCTION_INVOCATION_OPERATOR ||
                expr.operator.symbol === NULL_COALESCE_INVOCATION_OPERATOR)
            ) {
              const fnName = expr.args[0]
              if (fnName instanceof Reference && fnName.name === constructorName) {
                // stop searching (true) and return found==true
                return [true, true, undefined]
              }
            }

            // the name `constructorName` is being shadowed by this node, for
            // example a function or `let`. Stop searching this tree.
            if (expr.provides().has(constructorName)) {
              return [true, false, undefined]
            }

            // keep searching
            return [false, false, undefined]
          },
          undefined,
        )

        if (foundConstructor) {
          return [remainingDeps, constructorDeps.concat([staticProp])]
        }
      }

      return [remainingDeps.concat(staticProp), constructorDeps]
    },
    [[], []] as [T[], T[]],
  )

  // now scan remainingDeps - if they depend on `constructorName`, we need to
  // determine whether they depend on any of the values in `constructorDeps`,
  // otherwise put them in `someDeps`. `noDeps` don't depend on any of the
  // static values. Whenever we add a value to constructorDeps we have to scan
  // remainingDeps again.
  let prevCount: number
  do {
    prevCount = constructorDeps.length
    const nextRemainingDeps = remainingDeps.reduce((remainingDeps, staticProp) => {
      const constructorRefs = new Set(constructorDeps.map(dep => dep.name))
      // This will find references to other static properties (accessed as local
      // variables) *and* it will find references to the constructorName, which
      // is included in staticNames.
      if (staticNames.some(name => staticProp.dependencies().has(name))) {
        // if the property is a property-access operation, and `constructorName`
        // is the lhs of the property-access, then it needs to go in constructorDeps
        const foundConstructorName = staticProp.searchExpressions<boolean, Set<string>>(
          (expr, foundConstructorName, constructorRefs) => {
            if (foundConstructorName) {
              // already found a constructor invocation
              return [true, true, constructorRefs]
            }

            // check for `User.` and `User?.` - property access operator, with
            // the lhs being a reference to constructorName, and the rhs being
            // one of the constructorRefs
            if (
              expr instanceof Operation &&
              (expr.operator.symbol === PROPERTY_ACCESS_OPERATOR ||
                expr.operator.symbol === NULL_COALESCING_OPERATOR)
            ) {
              const lhsName = expr.args[0]
              const rhsName = expr.args[1]
              if (
                lhsName instanceof Reference &&
                lhsName.name === constructorName &&
                rhsName instanceof Reference &&
                constructorRefs.has(rhsName.name)
              ) {
                // stop searching and return true
                return [true, true, constructorRefs]
              }
            }

            // the expression refers to one of the names that are dependent on
            // the User() constructor
            if (expr instanceof Reference && constructorRefs.has(expr.name)) {
              // stop searching and return true
              return [true, true, constructorRefs]
            }

            // remove any constructorRefs that are shadowed by new local
            // references
            const nextConstructorRefs: Set<string> = new Set(
              Array(...constructorRefs).filter(name => !expr.provides().has(name)),
            )
            if (!nextConstructorRefs.size) {
              return [true, false, nextConstructorRefs]
            }

            // keep searching
            return [false, false, nextConstructorRefs]
          },
          constructorRefs,
        )

        if (foundConstructorName) {
          constructorDeps.push(staticProp)
          return remainingDeps
        }
      }

      return remainingDeps.concat([staticProp])
    }, [] as T[])
    remainingDeps.splice(0, remainingDeps.length, ...nextRemainingDeps)
  } while (prevCount < constructorDeps.length && remainingDeps.length)

  return ok([remainingDeps, constructorDeps])
}
