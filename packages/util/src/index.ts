import {err, type Result, ok} from '@extra-lang/result'

export function stablePointAlgorithm<In, Out, Err>(
  items: Iterable<In>,
  worker: (_: In, out: Out) => Result<Out, Err>,
  initial: Out,
): Result<Out, Err[]> {
  let remaining = Array.from(items)
  let next: In[] = []
  let resolved: Out = initial
  while (remaining.length) {
    const errors: Err[] = []
    for (const [index, item] of remaining.entries()) {
      const result = worker(item, resolved)
      if (result.isOk()) {
        resolved = result.value
        // success! Now start over from the top - this preserves the order (if
        // item #0 is dependent only on item #1, we would like the order of
        // resolved to be `[item#1, item#0, ...])`
        next.push(...remaining.slice(index + 1))
        break
      } else {
        next.push(item)
        errors.push(result.error)
      }
    }

    // if we did a loop with no progress, return the errors from this loop
    if (remaining.length && next.length === remaining.length) {
      return err(errors)
    }

    remaining = next
    next = []
  }

  return ok(resolved)
}

export function isEqualRegex(reg1: RegExp, reg2: RegExp) {
  return reg1.source === reg2.source && reg1.flags === reg2.flags
}

const ids = ['1a0f', '2b1g', '3c2h', '4d3i', '5e4j', '6f5k', '7g6l', '8h7m', '9i8n']
const used = new Set<string>()

export function uid(name: string = ''): string {
  const saved = ids.shift()
  const id = saved ?? Math.floor(0x1000 + Math.random() * (0x10000 - 0x1000)).toString(16)
  if (used.has(id)) {
    return uid(name)
  }
  used.add(id)
  return name ? `${name}-${id}` : id
}

export type CombinedIterator<T, U> = Array<{
  key: string | number
  lhs: T
  rhs: U
}>

type Entriesable<T> = Array<T> | Map<string | number, T>

/**
 * This function iterates over lhs, combining all the elements with the matching
 * element in rhs. If a key is missing in rhs, the missing key is returned as an
 * error.
 *
 * If ignoreExtras is false, the lhs and rhs must have the same number of keys.
 * If the count doesn't match, `false` is returned as an error. Otherwise it is
 * enough if rhs contains all the keys in lhs.
 */
export function combineIterators<T, U>(
  lhs: Entriesable<T>,
  rhs: Entriesable<U>,
  {ignoreExtras = false}: {ignoreExtras: boolean} = {ignoreExtras: false},
): Result<CombinedIterator<T, U>, string | number | false> {
  if (!ignoreExtras && getSize(lhs) !== getSize(rhs)) {
    return err(false)
  }
  const result: CombinedIterator<T, U> = []
  const rhsMap = rhs instanceof Map ? rhs : new Map(rhs.map((item, index) => [index, item]))
  for (const [index, item] of lhs.entries()) {
    const match = rhsMap.get(index)
    if (match === undefined) {
      return err(index)
    }
    result.push({key: index, lhs: item, rhs: match})
  }
  return ok(result)
}

function getSize(of: Entriesable<unknown>) {
  if (of instanceof Array) {
    return of.length
  }
  if (of instanceof Map) {
    return of.size
  }
  return of
}
