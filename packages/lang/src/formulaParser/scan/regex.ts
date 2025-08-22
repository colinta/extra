import {isRegexFlag} from '../grammars'
import {type Scanner} from '../scanner'
import {ParseError} from '../types'
import * as Expressions from '../../expressions'
import {scanValidLocalName} from './identifier'

export function scanRegex(scanner: Scanner, embedded = false) {
  scanner.whereAmI('scanRegex')
  if (!embedded) {
    scanner.expectString('/')
  }

  const bufferRange0 = scanner.charIndex
  const groups = new Map<string, string>()
  const [stringBuffer, flags] = scanRegexString(scanner, embedded, groups)

  scanner.whereAmI('scanRegex (literal): ' + stringBuffer)
  return new Expressions.LiteralRegex(
    [bufferRange0, scanner.charIndex],
    scanner.flushComments(),
    stringBuffer,
    flags,
    groups,
  )
}

/**
 * Called recursively in capture groups, to associate the capture group with the
 * inner regex, which is pretty damn cool.
 */
function scanRegexString(
  scanner: Scanner,
  embedded: boolean,
  groups: Map<string, string>,
): [string, string] {
  let stringBuffer = ''
  let escapeBuffer = ''
  let escaping: '' | 'single' | 'hex' | 'unicode' = ''
  let flags = ''
  let parensCount = 0
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
    } else if (embedded && scanner.is('(')) {
      parensCount += 1
    } else if (embedded && scanner.is(')')) {
      if (parensCount === 0) {
        break
      }
      parensCount -= 1
    } else if (!embedded && scanner.is('/')) {
      scanner.charIndex++
      while (isRegexFlag(scanner.char)) {
        if (!flags.includes(scanner.char)) {
          flags += scanner.char
        }
        scanner.charIndex++
      }

      if (scanner.char === 'g') {
        throw new ParseError(scanner, `The 'g' flag is not allowed.`)
      }
      break
    } else if (scanner.scanIfString('(?<')) {
      if (embedded) {
        throw new ParseError(
          scanner,
          'Named capture groups are not allowed inside named capture groups',
        )
      }

      stringBuffer += '(?<'
      const startIndex = scanner.charIndex
      const reference = scanValidLocalName(scanner)
      stringBuffer += reference.name
      scanner.expectString('>')
      stringBuffer += '>'

      if (groups.has(reference.name)) {
        throw new ParseError(
          scanner,
          `Duplicate capture group name '${reference.name}'`,
          startIndex,
        )
      }

      const [inner] = scanRegexString(scanner, true, groups)
      stringBuffer += inner
      groups.set(reference.name, inner)
      continue
    } else {
      stringBuffer += scanner.char
    }

    scanner.charIndex++
  }

  return [stringBuffer, flags]
}
