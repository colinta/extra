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
