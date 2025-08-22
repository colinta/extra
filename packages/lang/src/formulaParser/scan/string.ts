import * as Expressions from '../../expressions'
import {type Expression} from '../../expressions'
import {ATOM_START, isRefStartChar} from '../grammars'
import {binaryOperatorNamed} from '../../operators'
import {type Scanner} from '../scanner'
import {ParseError, type ParseNext} from '../types'

import {scanValidName, scanAtom} from './identifier'

/**
 * Supports '', "", ``, triple quotes, and "no quotes" :word
 *
 * Backtick and double quoted strings support `$string ${templates}`
 * Backtick strings support 'tags``'
 *
 * Triple quotes ignore intendation up to the closing quote.
 *      -- start indentation doesn't matter
 *      """
 *    line1    <-- no indent, aligns with closing quotes
 *      line2  <-- this line will have two spaces in front
 *    """      <-- closing quotes determine the indentation
 */
export function scanString(scanner: Scanner, enableInterpolation: boolean, parseNext: ParseNext) {
  const range0 = scanner.charIndex
  scanner.whereAmI('scanString')
  if (scanner.is(ATOM_START)) {
    const literal = scanAtom(scanner)
    scanner.whereAmI(`scanString :${literal.stringValue}`)
    return new Expressions.LiteralStringAtom(
      [range0, scanner.charIndex],
      scanner.flushComments(),
      literal.stringValue,
    )
  }

  let tag: string | undefined
  let quote: string
  if (isRefStartChar(scanner)) {
    tag = scanValidName(scanner).name
    quote = '`'
    if (!scanner.is(quote)) {
      throw new ParseError(scanner, `Expected a backtick, found ${scanner.char}`)
    }
  } else {
    tag = undefined
    quote = scanner.char
  }

  const triple = quote + quote + quote
  if (scanner.remainingInput.startsWith(triple)) {
    // triple quotes
    quote = triple
    scanner.charIndex += 3
  } else {
    scanner.charIndex += 1
  }
  scanner.whereAmI('quote: ' + JSON.stringify(quote))

  const parts: Expression[] = []
  const isSingleQuote = quote.startsWith("'")
  const quoteSupportsInterpolation = !isSingleQuote
  let bufferRange0 = scanner.charIndex
  let stringBuffer = ''
  let escapeBuffer = ''
  let indentationBuffer = ''
  let escaping: '' | 'single' | 'hex' | 'unicode' = ''
  let firstLineIsNewline = false
  let checkForIndentation = quote === triple

  function appendChar(char: string) {
    stringBuffer += char
  }

  function appendNext() {
    if (stringBuffer.length) {
      parts.push(
        new Expressions.LiteralString(
          [bufferRange0, scanner.charIndex],
          scanner.flushComments(),
          stringBuffer,
          tag,
        ),
      )

      stringBuffer = ''
    }
  }

  // ignore the very first character of a triple quoted string if it is a newline
  if (quote === triple && scanner.is('\n')) {
    scanner.charIndex += 1
    firstLineIsNewline = true
  }

  for (;;) {
    if (scanner.isEOF()) {
      throw new ParseError(scanner, 'Unexpected end of string')
    }

    if ((checkForIndentation && scanner.is(' ')) || scanner.is('\t')) {
      indentationBuffer += scanner.char
    } else {
      checkForIndentation = false
    }

    if (escaping === 'hex') {
      if (!/^[a-fA-F0-9]/.test(scanner.char)) {
        throw new ParseError(scanner, `Expected a hexadecimal number, found ${scanner.char}`)
      }

      escapeBuffer += scanner.char
      if (escapeBuffer.length === 2) {
        appendChar(String.fromCharCode(parseInt(escapeBuffer, 16)))
        escapeBuffer = ''
        escaping = ''
      }
    } else if (escaping === 'unicode') {
      if (!/^[a-fA-F0-9]/.test(scanner.char)) {
        throw new ParseError(scanner, `Expected a hexadecimal number, found ${scanner.char}`)
      }

      escapeBuffer += scanner.char
      if (escapeBuffer.length === 4) {
        appendChar(String.fromCharCode(parseInt(escapeBuffer, 16)))
        escapeBuffer = ''
        escaping = ''
      }
    } else if (escaping === 'single') {
      if (scanner.is('u')) {
        escaping = 'unicode'
      } else if (scanner.is('x')) {
        escaping = 'hex'
      } else {
        if (scanner.is('b')) {
          appendChar('\b')
        } else if (scanner.is('e')) {
          appendChar('\x1b')
        } else if (scanner.is('f')) {
          appendChar('\f')
        } else if (scanner.is('n')) {
          appendChar('\n')
        } else if (scanner.is('r')) {
          appendChar('\r')
        } else if (scanner.is('t')) {
          appendChar('\t')
        } else if (scanner.is('v')) {
          appendChar('\v')
        } else if (scanner.is('0')) {
          appendChar('\0')
        } else if (scanner.is('\n')) {
          // _does not_ append - used to *ignore* a newline
        } else {
          // all others return the character:
          //     \\ --> \, \' --> ', \" --> ", etc
          appendChar(scanner.char)
        }
        escaping = ''
      }
    } else if (scanner.is('\\')) {
      escaping = 'single'
    } else if (
      quoteSupportsInterpolation &&
      scanner.test(() => scanner.scanIfString('$') && isRefStartChar(scanner) && !scanner.is('@'))
    ) {
      if (!enableInterpolation) {
        throw new ParseError(scanner, `Interpolation is not enabled in this context`)
      }

      // string substitution for "$varname" shorthand
      appendNext()

      scanner.expectString('$')
      scanner.whereAmI('scanString: `' + stringBuffer + '`')
      const ref = scanValidName(scanner)
      parts.push(ref)
      scanner.whereAmI('ref: `' + ref.toCode() + '`')
      bufferRange0 = scanner.charIndex
      continue
    } else if (quoteSupportsInterpolation && scanner.is('${')) {
      if (!enableInterpolation) {
        throw new ParseError(scanner, `Interpolation is not enabled in this context`)
      }

      // string substitution for "${…}"
      appendNext()

      scanner.expectString('${')
      scanner.whereAmI('scanString: ' + stringBuffer)
      const expression = parseNext('interpolation')

      bufferRange0 = scanner.charIndex
      parts.push(expression)
      scanner.expectString('}')
      continue
    } else if (quote === triple && scanner.is(quote) && indentationBuffer.length) {
      scanner.charIndex += quote.length
      scanner.whereAmI('scanString: done (triple quote)')
      break
    } else if (scanner.is(quote)) {
      scanner.charIndex += quote.length
      scanner.whereAmI('scanString: done (single quote)')
      break
    } else if (scanner.is('\n')) {
      indentationBuffer = ''
      checkForIndentation = quote === triple
      appendChar(scanner.char)
    } else {
      appendChar(scanner.char)
    }

    scanner.charIndex++
  }

  appendNext()
  scanner.whereAmI('scanString: indent `' + indentationBuffer + '`')
  parts.forEach((expr, index) => {
    if (expr instanceof Expressions.LiteralString) {
      const value = expr.value.removeIndent(indentationBuffer, firstLineIsNewline)
      if (!value) {
        throw new ParseError(
          scanner,
          `Invalid indent in string literal ${scanner.input.slice(
            range0,
            scanner.charIndex,
          )}. All lines are expected to have at least the same indentation as the closing quotes.`,
        )
      }

      parts[index] = new Expressions.LiteralString(expr.range, scanner.flushComments(), value, tag)
    }
  })

  if (parts.length === 0) {
    return new Expressions.LiteralString(
      [bufferRange0, scanner.charIndex],
      scanner.flushComments(),
      '',
      tag,
    )
  }

  if (parts.length === 1) {
    scanner.whereAmI(`scanString (literal): ${parts[0]}`)
    return parts[0]
  }

  const concatOp = binaryOperatorNamed('++')
  scanner.whereAmI('scanString (template): ' + parts.map(p => p.toCode()).join(' ++ '))
  return new Expressions.StringTemplateOperation(
    [range0, scanner.charIndex],
    scanner.flushComments(),
    {...concatOp, arity: parts.length},
    parts,
    quote,
    tag,
  )
}

export function scanStringLiteral(scanner: Scanner) {
  const stringExpr = scanString(scanner, false, () => {
    throw new ParseError(
      scanner,
      'scanString should never call parseNext when enableInterpolation is false',
    )
  })
  if (!(stringExpr instanceof Expressions.LiteralString)) {
    throw new ParseError(scanner, `Expected a string literal, found ${stringExpr} instead`)
  }
  return stringExpr
}
