import * as Narrowed from '../../narrowed'
import * as Values from '../../values'
import {ARRAY_CLOSE, ARRAY_OPEN, PARENS_CLOSE, isNumberChar, isNumberStart} from '../grammars'
import {type Scanner} from '../scanner'
import {ParseError} from '../types'

import {unexpectedToken} from './basics'
import {scanNumber} from './number'
import {scanRegex} from './regex'

function checkTypeGuard(scanner: Scanner, min: number, max: number | undefined) {
  if (max !== undefined && min > max) {
    throw new ParseError(
      scanner,
      `Invalid type guard. Expected min and max lengths, but min value '${min}' is greater than max value '${max}'`,
    )
  }
}

export function scanNarrowedFloat(scanner: Scanner): Narrowed.NarrowedFloat {
  scanner.whereAmI('scanNarrowedLength')

  if (scanner.scanIfString('=')) {
    scanner.scanAllWhitespace()
    const count = (scanNumber(scanner, 'float').value as Values.FloatValue).value
    return {min: count, max: count}
  } else if (scanner.scanIfString('<=') || scanner.scanIfString('≤')) {
    scanner.scanAllWhitespace()
    const count = (scanNumber(scanner, 'float').value as Values.FloatValue).value
    return {min: undefined, max: count}
  } else if (scanner.scanIfString('<')) {
    scanner.scanAllWhitespace()
    const count = (scanNumber(scanner, 'float').value as Values.FloatValue).value
    return {min: undefined, max: [count]}
  } else if (scanner.scanIfString('>=') || scanner.scanIfString('≥')) {
    scanner.scanAllWhitespace()
    const count = (scanNumber(scanner, 'float').value as Values.FloatValue).value
    return {min: count, max: undefined}
  } else if (scanner.scanIfString('>')) {
    scanner.scanAllWhitespace()
    const count = (scanNumber(scanner, 'float').value as Values.FloatValue).value
    return {min: [count], max: undefined}
  } else if (
    scanner.is('-') ||
    (isNumberChar(scanner.char) && isNumberStart(scanner.remainingInput))
  ) {
    let min = (scanNumber(scanner, 'float').value as Values.FloatValue).value
    let max: number | undefined
    scanner.scanAllWhitespace()

    if (scanner.scanIfString('<.<')) {
      scanner.scanAllWhitespace()
      max = Math.floor((scanNumber(scanner, 'float').value as Values.FloatValue).value)
      checkTypeGuard(scanner, min, max)
      return {min: [min], max: [max]}
    } else if (scanner.scanIfString('..<')) {
      scanner.scanAllWhitespace()
      max = (scanNumber(scanner, 'float').value as Values.FloatValue).value
      checkTypeGuard(scanner, min, max)
      return {min: min, max: [max]}
    } else if (scanner.scanIfString('<..')) {
      scanner.scanAllWhitespace()
      max = (scanNumber(scanner, 'float').value as Values.FloatValue).value
      checkTypeGuard(scanner, min, max)
      return {min: [min], max}
    } else if (scanner.scanIfString('...')) {
      scanner.scanAllWhitespace()
      max = (scanNumber(scanner, 'float').value as Values.FloatValue).value

      const [a, b] = min < max ? [min, max] : [max, min]
      min = a
      max = b
    } else {
      throw new ParseError(
        scanner,
        `Invalid guard on Float '${min}', expected comparison (< <= = >= >) or range (<.< <.. ..> ...)`,
      )
    }

    checkTypeGuard(scanner, min, max)

    return {min, max}
  }

  return Narrowed.DEFAULT_NARROWED_NUMBER
}

export function scanNarrowedInt(scanner: Scanner): Narrowed.NarrowedInt {
  scanner.whereAmI('scanNarrowedInt')

  if (scanner.scanIfString('=')) {
    scanner.scanAllWhitespace()
    const count = Math.floor((scanNumber(scanner, 'int').value as Values.IntValue).value)
    return {min: count, max: count}
  } else if (scanner.scanIfString('<=') || scanner.scanIfString('≤')) {
    scanner.scanAllWhitespace()
    const count = Math.floor((scanNumber(scanner, 'int').value as Values.IntValue).value)
    return {min: undefined, max: count}
  } else if (scanner.scanIfString('<')) {
    scanner.scanAllWhitespace()
    const count = Math.floor((scanNumber(scanner, 'int').value as Values.IntValue).value)
    return {min: undefined, max: count - 1}
  } else if (scanner.scanIfString('>=') || scanner.scanIfString('≥')) {
    scanner.scanAllWhitespace()
    const count = Math.floor((scanNumber(scanner, 'int').value as Values.IntValue).value)
    return {min: count, max: undefined}
  } else if (scanner.scanIfString('>')) {
    scanner.scanAllWhitespace()
    const count = Math.floor((scanNumber(scanner, 'int').value as Values.IntValue).value)
    return {min: count + 1, max: undefined}
  } else if (
    scanner.is('-') ||
    (isNumberChar(scanner.char) && isNumberStart(scanner.remainingInput))
  ) {
    let min = Math.floor((scanNumber(scanner, 'int').value as Values.IntValue).value)
    let max: number | undefined
    scanner.scanAllWhitespace()

    if (scanner.scanIfString('<.<')) {
      scanner.scanAllWhitespace()
      max = Math.floor((scanNumber(scanner, 'int').value as Values.IntValue).value)
      min += 1
      max -= 1
    } else if (scanner.scanIfString('..<')) {
      scanner.scanAllWhitespace()
      max = Math.floor((scanNumber(scanner, 'int').value as Values.IntValue).value)
      max -= 1
    } else if (scanner.scanIfString('<..')) {
      scanner.scanAllWhitespace()
      max = Math.floor((scanNumber(scanner, 'int').value as Values.IntValue).value)
      min += 1
    } else if (scanner.scanIfString('...')) {
      scanner.scanAllWhitespace()
      max = Math.floor((scanNumber(scanner, 'int').value as Values.IntValue).value)

      const [a, b] = min < max ? [min, max] : [max, min]
      min = a
      max = b
    } else {
      throw new ParseError(
        scanner,
        `Invalid guard on Int '${min}', expected comparison (< <= = >= >) or range (<.< <.. ..> ...)`,
      )
    }

    checkTypeGuard(scanner, min, max)

    return {min, max}
  }

  return Narrowed.DEFAULT_NARROWED_NUMBER
}

/**
 * String(matches: /regex/)
 * String(matches: [/regex1/, /regex2/])
 * String(length: =n), String(length: <=n)
 * String(length: n...m)  n <= length <= m
 */
export function scanNarrowedString(scanner: Scanner): Narrowed.NarrowedString {
  scanner.whereAmI('scanNarrowedString')

  let narrowedLength: Narrowed.NarrowedLength = Narrowed.DEFAULT_NARROWED_LENGTH
  let didSetNarrowedLength = false
  const narrowedRegex: RegExp[] = []
  let didSetNarrowedRegex = false

  scanner.scanAllWhitespace()
  while (!scanner.is(PARENS_CLOSE)) {
    if (didSetNarrowedLength || didSetNarrowedRegex) {
      scanner.expectString(',')
      scanner.scanAllWhitespace()
    }

    if (!didSetNarrowedLength && scanner.scanIfWord('length')) {
      didSetNarrowedLength = true

      scanner.scanAllWhitespace()
      scanner.expectString(':')
      scanner.scanAllWhitespace()
      narrowedLength = scanNarrowedLength(scanner)
      scanner.scanAllWhitespace()
      scanner.whereAmI(`scanDictType: (length: ${narrowedLength})`)
    } else if (!didSetNarrowedRegex && scanner.scanIfWord('matches')) {
      didSetNarrowedRegex = true

      scanner.scanAllWhitespace()
      scanner.expectString(':')
      scanner.scanAllWhitespace()
      if (scanner.scanIfString(ARRAY_OPEN)) {
        scanner.scanAllWhitespace()
        for (;;) {
          const regexExpr = scanRegex(scanner)
          const regexValue = regexExpr.value as Values.RegexValue
          const regex = regexValue.value
          narrowedRegex.push(regex)

          const shouldBreak = scanner.scanCommaOrBreak(
            ARRAY_CLOSE,
            `Expected ',' or '${ARRAY_CLOSE}' in dict keys`,
          )
          scanner.whereAmI(`shouldBreak: ${shouldBreak}`)

          if (shouldBreak) {
            break
          }

          scanner.scanAllWhitespace()
        }
      } else {
        scanner.scanAllWhitespace()
        const regex = (scanRegex(scanner).value as Values.RegexValue).value
        narrowedRegex.push(regex)
      }

      scanner.scanAllWhitespace()
      scanner.whereAmI(`scanNarrowedString: (matches: ${narrowedRegex})`)
    } else {
      throw new ParseError(
        scanner,
        `Unexpected token '${unexpectedToken(scanner)}'`,
        scanner.charIndex - 1,
      )
    }
  }

  return {length: narrowedLength, regex: narrowedRegex}
}

export function scanNarrowedLength(scanner: Scanner): Narrowed.NarrowedLength {
  scanner.whereAmI('scanNarrowedLength')

  if (scanner.scanIfString('=')) {
    scanner.scanAllWhitespace()
    const count = Math.floor((scanNumber(scanner, 'length').value as Values.IntValue).value)
    return {min: count, max: count}
  } else if (scanner.scanIfString('<=') || scanner.scanIfString('≤')) {
    scanner.scanAllWhitespace()
    const count = Math.floor((scanNumber(scanner, 'length').value as Values.IntValue).value)
    return {min: 0, max: count}
  } else if (scanner.scanIfString('<')) {
    scanner.scanAllWhitespace()
    const count = Math.floor((scanNumber(scanner, 'length').value as Values.IntValue).value)
    return {min: 0, max: count - 1}
  } else if (scanner.scanIfString('>=') || scanner.scanIfString('≥')) {
    scanner.scanAllWhitespace()
    const count = Math.floor((scanNumber(scanner, 'length').value as Values.IntValue).value)
    return {min: count, max: undefined}
  } else if (scanner.scanIfString('>')) {
    scanner.scanAllWhitespace()
    const count = Math.floor((scanNumber(scanner, 'length').value as Values.IntValue).value)
    return {min: count + 1, max: undefined}
  } else if (isNumberChar(scanner.char) && isNumberStart(scanner.remainingInput)) {
    let min = Math.floor((scanNumber(scanner, 'length').value as Values.IntValue).value)
    let max: number | undefined
    scanner.scanAllWhitespace()

    if (scanner.scanIfString('<.<')) {
      scanner.scanAllWhitespace()
      max = Math.floor((scanNumber(scanner, 'length').value as Values.IntValue).value)
      max -= 1
      min += 1
    } else if (scanner.scanIfString('..<')) {
      scanner.scanAllWhitespace()
      max = Math.floor((scanNumber(scanner, 'length').value as Values.IntValue).value)
      max -= 1
    } else if (scanner.scanIfString('<..')) {
      scanner.scanAllWhitespace()
      max = Math.floor((scanNumber(scanner, 'length').value as Values.IntValue).value)
      min += 1
    } else if (scanner.scanIfString('...')) {
      scanner.scanAllWhitespace()
      max = Math.floor((scanNumber(scanner, 'length').value as Values.IntValue).value)

      const [a, b] = min < max ? [min, max] : [max, min]
      min = a
      max = b
    } else {
      throw new ParseError(
        scanner,
        `Invalid guard on length '${min}', expected comparison (< <= = >= >) or range (<.. <.< ..> ...) or min/max (n+ n-)`,
      )
    }

    checkTypeGuard(scanner, min, max)

    return {min, max}
  }

  return Narrowed.DEFAULT_NARROWED_LENGTH
}
