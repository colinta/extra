import * as Values from '~/values'
import {isNumber, isNumberChar} from '~/formulaParser/grammars'
import {type Scanner} from '~/formulaParser/scanner'
import {ParseError} from '~/formulaParser/types'
import * as Expressions from '~/formulaParser/expressions'

// float cannot use binary/hex/octal
// int cannot have a '.'
// length cannot be negativeNumber
export function scanNumber(scanner: Scanner, expectedType: 'int' | 'float' | 'length' = 'float') {
  const range0 = scanner.charIndex
  scanner.whereAmI('scanNumber')

  let numberToken = ''
  if (scanner.scanIfString('-')) {
    if (expectedType === 'length') {
      throw new ParseError(scanner, `Expected a positive number`, scanner.charIndex - 1)
    }
    numberToken += '-'
  }

  let base: 'decimal' | 'binary' | 'octal' | 'hexadecimal' = 'decimal'
  // b => binary
  // o => octal
  // x => hex
  if (scanner.scanIfString('0b')) {
    numberToken += '0b'
    base = 'binary'
  } else if (scanner.scanIfString('0o')) {
    numberToken += '0o'
    base = 'octal'
  } else if (scanner.scanIfString('0x')) {
    numberToken += '0x'
    base = 'hexadecimal'
  }

  if (isNumberChar(scanner.char)) {
    numberToken += scanner.char
  } else {
    throw new ParseError(scanner, `Expected a number`)
  }

  let numberType: 'float' | 'int' = scanner.is('.') ? 'float' : 'int'
  let foundE = false
  while (isNumberChar(scanner.scanNextChar()) || (foundE && (scanner.is('-') || scanner.is('+')))) {
    scanner.whereAmI('scanNextChar ' + scanner.char)
    // don't throw an error is base is used - hexadecimal expects 'e' characters
    if (scanner.is('e') && base === 'decimal') {
      foundE = true
    } else if (scanner.is('..')) {
      // not a number, something else is going on (likely a range))
      break
    } else if (scanner.is('.')) {
      if (expectedType === 'int' || expectedType === 'length') {
        throw new ParseError(
          scanner,
          `Expected integer, found floating point number (unexpected '.')`,
          scanner.charIndex - 1,
        )
      }

      if (base !== 'decimal') {
        throw new ParseError(
          scanner,
          `Expected ${base} number, found floating point number (unexpected '.')`,
          scanner.charIndex - 1,
        )
      }

      numberType = 'float'
    }

    if (foundE && scanner.is('-')) {
      numberType = 'float'
    }

    numberToken += scanner.char
  }
  numberToken = numberToken.replaceAll('_', '')
  scanner.whereAmI('scanNumber ' + numberToken + ' --> ' + Number(numberToken))

  if (!isNumber(numberToken)) {
    throw new ParseError(scanner, `Expected a number, found '${numberToken}'`)
  }

  const value = Number(numberToken)
  scanner.whereAmI(`scanNumber: ${numberToken} => ${value} (${numberType})`)
  // number of binary digits
  let magnitude = 0
  if (base === 'binary') {
    magnitude = numberToken.length - 2
  } else if (base === 'octal') {
    magnitude = 3 * (numberToken.length - 2)
  } else if (base === 'hexadecimal') {
    magnitude = 4 * (numberToken.length - 2)
  }

  return new Expressions.Literal(
    [range0, scanner.charIndex],
    scanner.flushComments(),
    numberType === 'float' ? Values.float(value) : Values.int(value, magnitude, base),
  )
}
