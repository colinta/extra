export const INDENT = '  '
export const NEWLINE_INDENT = '\n  '
export const SMALL_LEN = 20
export const MAX_LEN = 100
export const MAX_INNER_LEN = 80

export function wrapStrings(lhs: string, strings: string[], rhs: string, joiner: string = ', ') {
  const wrap = {totalLength: 0, hasNewline: false}
  const values = strings.map(code => {
    wrap.hasNewline = wrap.hasNewline || code.length > MAX_INNER_LEN || code.includes('\n')
    wrap.totalLength += code.length + 2
    return code
  })

  if (wrap.hasNewline || wrap.totalLength > MAX_LEN) {
    if (!lhs && !rhs) {
      return values.join('\n')
    }

    const indented = values.map(code => indent(code)).join('\n')
    return `${lhs.trim()}\n${indented}\n${rhs.trim()}`
  } else {
    return `${lhs}${values.join(joiner)}${rhs}`
  }
}

export function indent(code: string) {
  const lines = code.split('\n').map(line => (line === '' ? '' : INDENT + line))
  return lines.join('\n')
}

/**
 * Removes the items in setB (second arg) from setA (first arg).
 */
export function difference<T>(setA: Set<T>, ...sets: Set<T>[]): Set<T> {
  if ((setA as any).difference) {
    return sets.reduce((setA, setB) => (setA as any).difference(setB) as Set<T>, setA)
  }

  const _difference = new Set<T>()
  for (const elem of setA) {
    if (sets.some(setB => setB.has(elem))) {
      continue
    }

    _difference.add(elem)
  }

  return _difference
}

/**
 * Returns the intersection of two sets - the elements that are in either set.
 */
export function union<T>(setA: Set<T>, ...sets: Set<T>[]): Set<T> {
  if ((setA as any).union) {
    return sets.reduce((setA, setB) => (setA as any).union(setB) as Set<T>, setA)
  }

  const _union = new Set<T>(setA)
  for (const setB of sets) {
    for (const elem of setB) {
      _union.add(elem)
    }
  }

  return _union
}

/**
 * Returns the intersection of two sets - the elements that are in both sets.
 */
export function intersection<T>(setA: Set<T>, ...sets: Set<T>[]): Set<T> {
  if ((setA as any).intersection) {
    return sets.reduce((setA, setB) => (setA as any).intersection(setB) as Set<T>, setA)
  }

  const _intersection = new Set<T>()
  for (const elem of setA) {
    if (sets.some(setB => setB.has(elem))) {
      _intersection.add(elem)
    }
  }

  return _intersection
}

export function some<T>(iterable: Iterable<T>, test: (_: T) => boolean): boolean {
  for (const item of iterable) {
    if (test(item)) {
      return true
    }
  }

  return false
}

export function every<T>(iterable: Iterable<T>, test: (_: T) => boolean): boolean {
  for (const item of iterable) {
    if (!test(item)) {
      return false
    }
  }

  return true
}
