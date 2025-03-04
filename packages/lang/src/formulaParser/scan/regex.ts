import * as Values from '../../values'

import {isRegexFlag} from '../grammars'
import {type Scanner} from '../scanner'
import {ParseError} from '../types'
import * as Expressions from '../expressions'

export function scanRegex(scanner: Scanner) {
  scanner.whereAmI('scanRegex')
  scanner.expectString('/')

  const bufferRange0 = scanner.charIndex
  let stringBuffer = ''
  let escapeBuffer = ''
  let escaping: '' | 'single' | 'hex' | 'unicode' = ''
  let flags = ''
  for (;;) {
    if (scanner.isEOF()) {
      throw new ParseError(scanner, 'Unexpected end of string')
    }

    if (scanner.is('\n')) {
      throw new ParseError(scanner, `Unexpected newline found in regex literal. Use \\n instead.`)
    } else if (escaping === 'hex') {
      if (!/^[a-fA-F0-9]/.test(scanner.char)) {
        throw new ParseError(scanner, `Expected a hexadecimal number, found ${scanner.char}`)
      }

      escapeBuffer += scanner.char
      if (escapeBuffer.length === 2) {
        stringBuffer += String.fromCharCode(parseInt(escapeBuffer, 16))
        escapeBuffer = ''
        escaping = ''
      }
    } else if (escaping === 'unicode') {
      if (!/^[a-fA-F0-9]/.test(scanner.char)) {
        throw new ParseError(scanner, `Expected a hexadecimal number, found ${scanner.char}`)
      }

      escapeBuffer += scanner.char
      if (escapeBuffer.length === 4) {
        stringBuffer += String.fromCharCode(parseInt(escapeBuffer, 16))
        escapeBuffer = ''
        escaping = ''
      }
    } else if (escaping === 'single') {
      if (scanner.is('u')) {
        escaping = 'unicode'
      } else if (scanner.is('x')) {
        escaping = 'hex'
      } else {
        if (scanner.is('f')) {
          stringBuffer += '\f'
        } else if (scanner.is('n')) {
          stringBuffer += '\n'
        } else if (scanner.is('r')) {
          stringBuffer += '\r'
        } else if (scanner.is('t')) {
          stringBuffer += '\t'
        } else if (scanner.is('v')) {
          stringBuffer += '\v'
        } else if (scanner.is('0')) {
          stringBuffer += '\0'
        } else if (scanner.is('\\')) {
          stringBuffer += '\\'
        } else {
          stringBuffer += '\\' + scanner.char
        }
        escaping = ''
      }
    } else if (scanner.is('\\')) {
      escaping = 'single'
    } else if (scanner.is('/')) {
      scanner.charIndex++
      while (isRegexFlag(scanner.char)) {
        if (!flags.includes(scanner.char)) {
          flags += scanner.char
        }
        scanner.charIndex++
      }
      break
    } else {
      stringBuffer += scanner.char
    }

    scanner.charIndex++
  }

  scanner.whereAmI('scanRegex (literal): ' + stringBuffer)
  return new Expressions.Literal(
    [bufferRange0, scanner.charIndex],
    scanner.flushComments(),
    Values.regex(stringBuffer, flags),
  )
}
