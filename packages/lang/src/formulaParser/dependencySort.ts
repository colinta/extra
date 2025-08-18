import {err, ok} from '@extra-lang/result'
import {type Expression, RuntimeError} from './expressions'
import {difference} from './set'
import {type GetRuntimeResult} from './types'

function findChain(
  needles: Set<string>,
  haystack: string,
  visited: Set<string>,
  circular: Map<string, Set<string>>,
): Set<string> | undefined {
  if (needles.size === 0) {
    return
  }

  for (const needle of needles) {
    if (needle === haystack) {
      return new Set(needle)
    }

    if (visited.has(needle)) {
      continue
    }

    visited.add(needle)
    const next = circular.get(needle) ?? new Set()
    const found = findChain(next, haystack, visited, circular)
    if (found) {
      return new Set([needle, ...found])
    }
  }
}

export function dependencySort<T extends Expression>(
  expressions: [string, T][],
  // returns 'true' if the depenency is available via an outer context
  ignoreExternal: (name: string) => boolean,
): GetRuntimeResult<[string, T][]> {
  let expressionDeps: {
    name: string
    expr: T
    deps: Set<string>
  }[] = expressions.map(([name, expr]) => ({name, expr, deps: expr.dependencies()}))
  const locallyResolved = expressionDeps.map(({name}) => name)

  let nextIter: typeof expressionDeps = []
  const orderedExpressions: [string, T][] = []
  const resolved = new Set<string>()
  while (expressionDeps.length) {
    const circular = new Map<string, Set<string>>()
    for (const {name, expr, deps} of expressionDeps) {
      if (
        [...deps].every(
          dep => resolved.has(dep) || (ignoreExternal(dep) && !locallyResolved.includes(dep)),
        )
      ) {
        resolved.add(name)
        orderedExpressions.push([name, expr])
      } else {
        circular.set(name, deps)
        nextIter.push({name, expr, deps})
      }
    }

    // expressionDeps should always be decreasing, if it stays the same we've hit an
    // unresolvable loop
    if (expressionDeps.length === nextIter.length) {
      const firstName = expressionDeps[0].name
      const dependencies = expressionDeps[0].expr.dependencies()
      const chain = findChain(circular.get(firstName) ?? new Set(), firstName, new Set(), circular)
      if (chain && chain.size) {
        return err(
          new RuntimeError(
            expressionDeps[0].expr,
            `Circular dependency detected: ${firstName} --> ${[...chain].join(
              ' --> ',
            )} (dependencies: ${[...dependencies].join(', ')})`,
          ),
        )
      } else {
        const remainingDependencies = difference(dependencies, resolved)
        return err(
          new RuntimeError(
            expressionDeps[0].expr,
            `Unresolvable dependency detected: ${firstName} --> ${[...remainingDependencies].join(
              ', ',
            )}`,
          ),
        )
      }
    }

    expressionDeps = nextIter
    nextIter = []
  }

  return ok(orderedExpressions)
}
