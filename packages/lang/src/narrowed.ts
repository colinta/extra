export type NarrowedLength = {min: number; max: number | undefined}
// min|max: number   --> _inclusive_check (e.g. >=x, <=x)
// min|max: [number] --> _exclusive_ check (e.g. >x, <x)
export type NarrowedFloat = {min: number | [number] | undefined; max: number | [number] | undefined}
export type NarrowedInt = {min: number | undefined; max: number | undefined}
export type NarrowedString = {length: NarrowedLength; regex: RegExp[]}

export const DEFAULT_NARROWED_LENGTH = {min: 0, max: undefined} as const
export const DEFAULT_NARROWED_NUMBER = {min: undefined, max: undefined} as const

export function isDefaultNarrowedLength(narrowed: NarrowedLength) {
  return narrowed === DEFAULT_NARROWED_LENGTH || (narrowed.min === 0 && narrowed.max === undefined)
}

export function isDefaultNarrowedNumber(narrowed: NarrowedFloat | NarrowedInt) {
  return (
    narrowed === DEFAULT_NARROWED_NUMBER ||
    (narrowed.min === undefined && narrowed.max === undefined)
  )
}

export function lengthDesc(narrowed: NarrowedLength) {
  if (isDefaultNarrowedLength(narrowed)) {
    return ''
  }

  const {min, max} = narrowed
  if (max === undefined) {
    return `>=${min}`
  } else {
    if (min === max) {
      return `=${min}`
    } else if (min === 0) {
      return `<=${max}`
    }

    return `${min}...${max}`
  }
}

export function numberDesc(narrowed: NarrowedFloat | NarrowedInt) {
  if (isDefaultNarrowedNumber(narrowed)) {
    return ''
  }

  const {min, max} = narrowed
  if (max === undefined) {
    if (min === undefined) {
      return ''
    } else if (Array.isArray(min)) {
      return `>${min[0]}`
    } else {
      return `>=${min}`
    }
  } else if (min === undefined) {
    if (Array.isArray(max)) {
      return `<${max[0]}`
    } else {
      return `<=${max}`
    }
  }

  if (Array.isArray(min) && Array.isArray(max)) {
    return `${min[0]}<.<${max[0]}`
  } else if (Array.isArray(min)) {
    return `${min[0]}<..${max}`
  } else if (Array.isArray(max)) {
    return `${min}..<${max[0]}`
  }

  if (min === max) {
    return `=${min}`
  }

  return `${min}...${max}`
}

export function narrowFloats(
  narrowed: NarrowedFloat,
  nextNarrowed: NarrowedFloat,
): NarrowedFloat | undefined {
  const {min, max} = narrowed
  const {min: nextMin, max: nextMax} = nextNarrowed
  let retMin: NarrowedFloat['min']
  let retMax: NarrowedFloat['max']

  if (min === undefined || nextMin === undefined) {
    retMin = min ?? nextMin
  } else if (Array.isArray(min)) {
    if (Array.isArray(nextMin)) {
      retMin = [Math.max(min[0], nextMin[0])]
    } else if (min[0] >= nextMin) {
      retMin = min
    } else {
      retMin = nextMin
    }
  } else if (Array.isArray(nextMin)) {
    if (nextMin[0] >= min) {
      retMin = nextMin
    } else {
      retMin = min
    }
  } else {
    retMin = Math.max(min, nextMin)
  }

  if (max === undefined || nextMax === undefined) {
    retMax = max ?? nextMax
  } else if (Array.isArray(max)) {
    if (Array.isArray(nextMax)) {
      retMax = [Math.min(max[0], nextMax[0])]
    } else if (max[0] <= nextMax) {
      retMax = max
    } else {
      retMax = nextMax
    }
  } else if (Array.isArray(nextMax)) {
    if (nextMax[0] <= max) {
      retMax = nextMax
    } else {
      retMax = max
    }
  } else {
    retMax = Math.min(max, nextMax)
  }

  const next = {min: retMin, max: retMax}
  if (floatIsNever(next)) {
    return undefined
  }

  return next
}

export function compatibleWithBothFloats(
  narrowed: NarrowedFloat,
  nextNarrowed: NarrowedFloat,
): NarrowedFloat | undefined {
  const {min, max} = narrowed
  const {min: nextMin, max: nextMax} = nextNarrowed
  let retMin: NarrowedFloat['min']
  let retMax: NarrowedFloat['max']

  if (min === undefined || nextMin === undefined) {
    retMin = undefined
  } else if (Array.isArray(min)) {
    if (Array.isArray(nextMin)) {
      retMin = [Math.min(min[0], nextMin[0])]
    } else if (min[0] < nextMin) {
      retMin = min
    } else {
      retMin = nextMin
    }
  } else if (Array.isArray(nextMin)) {
    if (nextMin[0] < min) {
      retMin = nextMin
    } else {
      retMin = min
    }
  } else {
    retMin = Math.min(min, nextMin)
  }

  if (max === undefined || nextMax === undefined) {
    retMax = undefined
  } else if (Array.isArray(max)) {
    if (Array.isArray(nextMax)) {
      retMax = [Math.min(max[0], nextMax[0])]
    } else if (max[0] > nextMax) {
      retMax = max
    } else {
      retMax = nextMax
    }
  } else if (Array.isArray(nextMax)) {
    if (nextMax[0] > max) {
      retMax = nextMax
    } else {
      retMax = max
    }
  } else {
    retMax = Math.max(max, nextMax)
  }

  const next = {min: retMin, max: retMax}
  if (floatIsNever(next)) {
    return undefined
  }

  return next
}

function floatIsNever(narrowed: NarrowedFloat) {
  const {min, max} = narrowed
  if (min === undefined || max === undefined) {
    return false
  }

  if (Array.isArray(min)) {
    if (Array.isArray(max)) {
      // 4 < n < 5 ✓
      // 5 < n < 5 ✘
      // 6 < n < 5 ✘
      return min[0] >= max[0]
    }

    // 4 < n <= 5 ✓
    // 5 < n <= 5 ✘
    // 6 < n <= 5 ✘
    return min[0] >= max
  } else if (Array.isArray(max)) {
    // 4 <= n < 5 ✓
    // 5 <= n < 5 ✘
    // 6 <= n < 5 ✘
    return min >= max[0]
  }

  // 4 <= n <= 5 ✓
  // 5 <= n <= 5 ✓
  // 6 <= n <= 5 ✘
  return min > max
}

export function narrowInts(
  narrowed: NarrowedInt,
  nextNarrowed: NarrowedInt,
): NarrowedInt | undefined {
  const {min, max} = narrowed
  const {min: nextMin, max: nextMax} = nextNarrowed
  let retMin: number | undefined
  let retMax: number | undefined

  if (nextMin === undefined || min === undefined) {
    retMin = nextMin ?? min
  } else {
    retMin = Math.max(nextMin, min)
  }

  if (nextMax === undefined || max === undefined) {
    retMax = nextMax ?? max
  } else {
    retMax = Math.min(nextMax, max)
  }

  const next = {min: retMin, max: retMax}
  if (intIsNever(next)) {
    return undefined
  }

  return next
}

export function compatibleWithBothInts(
  narrowed: NarrowedInt,
  nextNarrowed: NarrowedInt,
): NarrowedInt | undefined {
  const {min, max} = narrowed
  const {min: nextMin, max: nextMax} = nextNarrowed
  let retMin: NarrowedInt['min']
  let retMax: NarrowedInt['max']

  if (min === undefined || nextMin === undefined) {
    retMin = undefined
  } else {
    retMin = Math.min(min, nextMin)
  }

  if (max === undefined || nextMax === undefined) {
    retMax = undefined
  } else {
    retMax = Math.max(max, nextMax)
  }

  const next = {min: retMin, max: retMax}
  if (intIsNever(next)) {
    return undefined
  }

  return next
}

function intIsNever(narrowed: NarrowedInt) {
  const {min, max} = narrowed
  if (min === undefined || max === undefined) {
    return false
  }

  return min > max
}

/**
 * Two strings or arrays are concatenated; concatenate their length assertion.
 */
export function combineConcatLengths(
  narrowed: NarrowedLength,
  nextNarrowed: NarrowedLength,
): NarrowedLength {
  const {min, max} = narrowed
  const {min: nextMin, max: nextMax} = nextNarrowed

  const next = {
    min: min + nextMin,
    max: max === undefined || nextMax === undefined ? undefined : max + nextMax,
  }

  if (isDefaultNarrowedLength(next)) {
    return DEFAULT_NARROWED_LENGTH
  }

  return next
}

/**
 * Two sets are combined; return the bigger of the min size, and the smaller of the
 * max size.
 */
export function combineSetLengths(
  narrowed: NarrowedLength,
  nextNarrowed: NarrowedLength,
): NarrowedLength {
  const {min, max} = narrowed
  const {min: nextMin, max: nextMax} = nextNarrowed

  const next = {
    min: Math.max(min, nextMin),
    max: max === undefined || nextMax === undefined ? undefined : Math.min(max, nextMax),
  }

  if (isDefaultNarrowedLength(next)) {
    return DEFAULT_NARROWED_LENGTH
  }

  return next
}

export function narrowLengths(
  narrowed: NarrowedLength,
  nextNarrowed: NarrowedLength,
): NarrowedLength | undefined {
  const {min, max} = narrowed
  const {min: nextMin, max: nextMax} = nextNarrowed
  const retMin = Math.max(min, nextMin)
  let retMax: number | undefined

  if (nextMax !== undefined && max !== undefined) {
    retMax = Math.min(nextMax, max)
  } else {
    retMax = nextMax ?? max
  }

  const next = {min: retMin, max: retMax}
  if (intIsNever(next)) {
    return undefined
  }

  if (isDefaultNarrowedLength(next)) {
    return DEFAULT_NARROWED_LENGTH
  }

  return next
}

export function compatibleWithBothLengths(
  narrowed: NarrowedLength,
  nextNarrowed: NarrowedLength,
): NarrowedLength | undefined {
  const {min, max} = narrowed
  const {min: nextMin, max: nextMax} = nextNarrowed
  const retMin = Math.min(min, nextMin)
  let retMax: number | undefined

  if (nextMax !== undefined && max !== undefined) {
    retMax = Math.max(nextMax, max)
  } else {
    retMax = undefined
  }

  const next = {min: retMin, max: retMax}
  if (intIsNever(next)) {
    return undefined
  }

  if (isDefaultNarrowedLength(next)) {
    return DEFAULT_NARROWED_LENGTH
  }

  return next
}

export function testNumber(
  testRange: number | NarrowedFloat | NarrowedInt,
  assertRange: NarrowedFloat | NarrowedInt,
) {
  // these are also covered below, but early exit for "no assertion" case.
  if (isDefaultNarrowedNumber(assertRange)) {
    return true
  }

  if (typeof testRange === 'number') {
    return testNumber({min: testRange, max: testRange}, assertRange)
  }

  if (Array.isArray(assertRange.min)) {
    // assert float(>5)
    if (Array.isArray(testRange.max)) {
      if (testRange.max[0] <= assertRange.min[0]) {
        // test float(<4) , assert float(>5) ✘
        // test float(<5) , assert float(>5) ✘
        return false
      }
    } else if (testRange.max !== undefined && testRange.max <= assertRange.min[0]) {
      // test float(<=4) , assert float(>5) ✘
      // test float(<=5) , assert float(>5) ✘
      return false
    }

    if (Array.isArray(testRange.min)) {
      if (testRange.min[0] < assertRange.min[0]) {
        // test float(>4) , assert float(>5) ✘
        return false
      }
      // test float(>5) , assert float(>5) ✓
      // test float(>6) , assert float(>5) ✓
    } else if (testRange.min === undefined) {
      return false
    } else if (testRange.min <= assertRange.min[0]) {
      // test int(>=4) , assert float(>5) ✘
      // test int(>=5) , assert float(>5) ✘
      // test int(>=6) , assert float(>5) ✓
      // test float(>=5) , assert float(>5) ✘
      // test float(>=5.1) , assert float(>5) ✓
      return false
    }
  } else if (assertRange.min !== undefined) {
    // assert float(>=5)
    if (Array.isArray(testRange.max)) {
      if (testRange.max[0] <= assertRange.min) {
        // test float(<4) , assert float(>=5) ✘
        // test float(<5) , assert float(>=5) ✘
        return false
      }
    } else if (testRange.max !== undefined && testRange.max < assertRange.min) {
      // test float(<=4) , assert float(>=5) ✘
      // test float(<=5) , assert float(>=5) ✓
      return false
    }

    if (Array.isArray(testRange.min)) {
      if (testRange.min[0] < assertRange.min) {
        // float(>4) , assert float(>=5) ✘
        // float(>5) , assert float(>=5) ✓)
        return false
      }
    } else if (testRange.min === undefined) {
      return false
    } else if (testRange.min < assertRange.min) {
      // float(>=4) , assert float(>=5) ✘
      // float(>=5) , assert float(>=5) ✓)
      return false
    }
  }

  if (Array.isArray(assertRange.max)) {
    // assert float(<5)
    if (Array.isArray(testRange.min)) {
      if (testRange.min[0] >= assertRange.max[0]) {
        // test float(>4) , assert float(<5) ✘
        // test float(>5) , assert float(<5) ✘
        return false
      }
    } else if (testRange.min !== undefined && testRange.min >= assertRange.max[0]) {
      // test float(>=4) , assert float(<5) ✘
      // test float(>=5) , assert float(<5) ✘
      return false
    }

    if (Array.isArray(testRange.max)) {
      // test float(>4) , assert float(<5) ✘
      if (testRange.max[0] > assertRange.max[0]) {
        // test float(>5) , assert float(<5) ✓
        // test float(>6) , assert float(<5) ✓
        return false
      }
    } else if (testRange.max === undefined) {
      return false
    } else if (testRange.max >= assertRange.max[0]) {
      // test int(<=6) , assert float(<5) ✘
      // test int(<=5) , assert float(<5) ✘
      // test int(<=4) , assert float(<5) ✓
      // test float(<=5) , assert float(<5) ✘
      // test float(<=4.9) , assert float(<5) ✓
      return false
    }
  } else if (assertRange.max !== undefined) {
    // assert float(<=5)
    if (Array.isArray(testRange.min)) {
      if (testRange.min[0] >= assertRange.max) {
        // test float(<4) , assert float(<=5) ✘
        // test float(<5) , assert float(<=5) ✘
        return false
      }
    } else if (testRange.min !== undefined && testRange.min > assertRange.max) {
      // test float(<=4) , assert float(<=5) ✘
      // test float(<=5) , assert float(<=5) ✓
      return false
    }

    if (Array.isArray(testRange.max)) {
      if (testRange.max[0] > assertRange.max) {
        // test float(>4) , assert float(>5) ✘
        return false
      }

      // float(>4) , assert float(<=5) ✘
      // float(>5) , assert float(<=5) ✓)
    } else if (testRange.max === undefined) {
      return false
    } else if (testRange.max > assertRange.max) {
      // float(>=4) , assert float(<=5) ✘
      // float(>=5) , assert float(<=5) ✓)
      return false
    }
  }

  return true
}

export function testLength(testRange: NarrowedLength | number, assertRange: NarrowedLength) {
  // early exit for "no assertion" case, which is different for NarrowedLength
  // than NarrowedFloat
  if (isDefaultNarrowedLength(assertRange)) {
    return true
  }

  // same tests, with the addition (unncessary in this case) of the Array cases
  // for open ranges.
  return testNumber(testRange, assertRange)
}

export function testRegex(testString: string, regex: RegExp | RegExp[] | undefined): boolean {
  if (regex === undefined) {
    return true
  }

  if (Array.isArray(regex)) {
    return regex.every(regex => regex.test(testString))
  }

  return regex.test(testString)
}

export function testNames(
  testNames: Set<string | number | boolean | null>,
  assertNames: Set<string | number | boolean | null>,
) {
  for (const name of testNames) {
    if (!assertNames.has(name)) {
      return false
    }
  }

  return true
}
