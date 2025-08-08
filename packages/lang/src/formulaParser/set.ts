/**
 * Removes the items in setB (second arg) from setA (first arg).
 */
export function difference<T>(setA: Set<T>, setB: Set<T>): Set<T> {
  if ((setA as any).difference) {
    return (setA as any).difference(setB) as Set<T>
  }

  const _difference = new Set<T>()
  for (const elem of setA) {
    if (setB.has(elem)) {
      continue
    }

    _difference.add(elem)
  }

  return _difference
}

/**
 * Returns the intersection of two sets - the elements that are in either set.
 */
export function union<T>(setA: Set<T>, setB: Set<T>): Set<T> {
  if ((setA as any).union) {
    return (setA as any).union(setB) as Set<T>
  }

  const _union = new Set<T>(setA)
  for (const elem of setB) {
    _union.add(elem)
  }

  return _union
}

/**
 * Returns the intersection of two sets - the elements that are in both sets.
 */
export function intersection<T>(setA: Set<T>, setB: Set<T>): Set<T> {
  if ((setA as any).intersection) {
    return (setA as any).intersection(setB) as Set<T>
  }

  const _intersection = new Set<T>()
  for (const elem of setA) {
    if (setB.has(elem)) {
      _intersection.add(elem)
    }
  }

  return _intersection
}
