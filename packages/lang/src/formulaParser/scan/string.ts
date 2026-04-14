import * as Expressions from '@/expressions'
import {type StringTemplatePart, binaryOperatorNamed, LiteralString} from '@/expressions'

import {
  ATOM_START,
  MACRO_START,
  isArgumentStartChar,
  isIdentifierStartChar,
  STATE_START,
} from '../grammars'
import {type Scanner} from '../scanner'
import {ParseError, type ParseNext} from '../types'

import {scanValidName, scanAtom} from './identifier'
import {scanMacro} from './macro'

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
  if (isArgumentStartChar(scanner)) {
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

  // stringTemplateParts builds the entire string. It is composed of:
  //   (
  //     | {type: 'literal', expr: LiteralString, value: string}
  //     | {type: 'newline'}
  //     | {type: 'continuation'}
  //     | {type: 'interpolate', expr: Expression}
  //   )
  //
  // - in the simple case, it is a single {type: 'literal', expr: LiteralString, value: string}
  // - one line of a multiline string (terminated with a newline) is
  //     [{type: 'literal', expr: LiteralString}, {type: 'newline', value: string}]
  // - a multiline string that ends in a continuation '\' is
  //     [{type: 'literal', expr: LiteralString}, {type: 'continuation', value: string}]
  // - a string "interrupted" by an interpolation is
  //   [
  //     {type: 'literal', expr: LiteralString, value: string},
  //     {type: 'interpolate', expr: Expression},
  //     {type: 'literal', expr: LiteralString, value: string},
  //   ]
  //
  // Multiline strings remove initial indentation after every 'newline' and
  // 'continuation' marker.
  // Consecutive string literals are joined with '' or '\n'.
  const stringTemplateParts: StringTemplatePart[] = []
  const isBacktickQuote = quote.startsWith('`')
  const quoteSupportsInterpolation = isBacktickQuote
  let bufferRange0 = scanner.charIndex
  let stringBuffer = ''
  let escapeBuffer = ''
  let indentationBuffer = ''
  let escaping: '' | 'single' | 'hex' | 'unicode' = ''
  let firstLineIsNewline = false
  let shouldCheckForIndentation = quote === triple
  let checkForIndentation = shouldCheckForIndentation

  function appendChar(char: string) {
    stringBuffer += char
  }

  function appendNextLiteral() {
    if (stringBuffer.length) {
      stringTemplateParts.push({
        type: 'literal',
        value: stringBuffer,
        expr: new LiteralString(
          [bufferRange0, scanner.charIndex],
          scanner.flushComments(),
          stringBuffer,
          tag,
        ),
      })

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

    if (checkForIndentation && (scanner.is(' ') || scanner.is('\t'))) {
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
          // line "continuation", the newline is ignored
          appendNextLiteral()
          stringTemplateParts.push({type: 'continuation'})
          indentationBuffer = ''
          checkForIndentation = shouldCheckForIndentation
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
      // test for `...$foo...`
      scanner.test(
        () =>
          scanner.scanIfString('$') &&
          ((isIdentifierStartChar(scanner) && !scanner.is(STATE_START)) || scanner.is(MACRO_START)),
      )
    ) {
      // string substitution for "$varname" shorthand
      if (!enableInterpolation) {
        throw new ParseError(scanner, `Interpolation is not enabled in this context`)
      }

      appendNextLiteral()
      scanner.expectString('$')
      scanner.whereAmI('scanString: `' + stringBuffer + '`')
      const ref = scanner.is(MACRO_START) ? scanMacro(scanner) : scanValidName(scanner)
      stringTemplateParts.push({type: 'interpolate', expr: ref})
      scanner.whereAmI('ref: `' + ref.toCode() + '`')
      bufferRange0 = scanner.charIndex
      continue
    } else if (quoteSupportsInterpolation && scanner.is('${')) {
      if (!enableInterpolation) {
        throw new ParseError(scanner, `Interpolation is not enabled in this context`)
      }

      // string substitution for "${…}"
      appendNextLiteral()

      scanner.expectString('${')
      scanner.whereAmI('scanString: ' + stringBuffer)
      const expression = parseNext('interpolation')

      bufferRange0 = scanner.charIndex
      stringTemplateParts.push({type: 'interpolate', expr: expression})
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
      appendNextLiteral()
      stringTemplateParts.push({type: 'newline'})
      indentationBuffer = ''
      checkForIndentation = shouldCheckForIndentation
    } else {
      appendChar(scanner.char)
    }

    scanner.charIndex++
  }

  appendNextLiteral()
  scanner.whereAmI('scanString: indent `' + indentationBuffer + '`')
  if (indentationBuffer.includes(' ') && indentationBuffer.includes('\t')) {
    throw new ParseError(
      scanner,
      `Invalid indent in string literal. Indentation cannot contain a mix of spaces and tabs.`,
    )
  }

  // early exit for ''
  if (stringTemplateParts.length === 0) {
    return new LiteralString([bufferRange0, scanner.charIndex], scanner.flushComments(), '', tag)
  }

  if (shouldCheckForIndentation) {
    let removeIndentation = shouldCheckForIndentation
    stringTemplateParts.forEach((part, index) => {
      if (removeIndentation && part.type === 'literal') {
        const stringValue = part.expr.value.removeIndent(indentationBuffer, firstLineIsNewline)
        if (!stringValue) {
          throw new ParseError(
            scanner,
            `Invalid indent in string literal ${scanner.input.slice(
              range0,
              scanner.charIndex,
            )}. All lines are expected to have at least the same indentation as the closing quotes.`,
          )
        }

        stringTemplateParts[index] = {
          type: 'literal',
          value: stringValue.value,
          expr: new LiteralString(part.expr.range, scanner.flushComments(), stringValue, tag),
        }
      } else if (part.type === 'newline' || part.type === 'continuation') {
        removeIndentation = true
      }
    })
  }

  if (
    stringTemplateParts.length === 1 &&
    (stringTemplateParts[0].type === 'literal' || stringTemplateParts[0].type === 'interpolate')
  ) {
    scanner.whereAmI(`scanString (literal): ${stringTemplateParts[0].expr}`)
    return stringTemplateParts[0].expr
  }

  // join consecutive literals with '' (continuation) or '\n' (newline)
  const joinedParts: StringTemplatePart[] = []
  let pendingLiteral: {expr: LiteralString; value: string} | undefined
  let pendingJoin: '' | '\n' | undefined
  for (const {type, ...part} of stringTemplateParts) {
    if (type === 'literal') {
      const literalPart = part as {expr: LiteralString; value: string}
      // skip empty literals (e.g. trailing indentation after removeIndent)
      if (literalPart.value === '') {
        continue
      }
      if (pendingLiteral && pendingJoin !== undefined) {
        pendingLiteral = {
          value: pendingLiteral.value + pendingJoin + literalPart.value,
          expr: new LiteralString(
            [pendingLiteral.expr.range[0], literalPart.expr.range[1]],
            literalPart.expr.precedingComments,
            pendingLiteral.value + pendingJoin + literalPart.value,
          ),
        }
      } else if (pendingLiteral) {
        // two literals in a row (shouldn't happen, but handle gracefully)
        joinedParts.push({type: 'literal', ...pendingLiteral})
        pendingLiteral = literalPart
      } else {
        pendingLiteral = literalPart
      }
      pendingJoin = undefined
    } else if (type === 'continuation') {
      pendingJoin = ''
    } else if (type === 'newline') {
      pendingJoin = '\n'
    } else {
      // interpolate — flush pending literal with trailing newline if needed
      if (pendingLiteral) {
        if (pendingJoin === '\n') {
          pendingLiteral = {
            value: pendingLiteral.value + '\n',
            expr: new LiteralString(
              pendingLiteral.expr.range,
              pendingLiteral.expr.precedingComments,
              pendingLiteral.value + '\n',
            ),
          }
        }
        joinedParts.push({type: 'literal', ...pendingLiteral})
        pendingLiteral = undefined
      }
      pendingJoin = undefined
      joinedParts.push({type, ...part} as StringTemplatePart)
    }
  }
  if (pendingLiteral) {
    if (pendingJoin === '\n') {
      // trailing newline — append to the pending literal
      pendingLiteral = {
        value: pendingLiteral.value + '\n',
        expr: new LiteralString(
          pendingLiteral.expr.range,
          pendingLiteral.expr.precedingComments,
          pendingLiteral.value + '\n',
        ),
      }
    }
    // trailing continuation is dropped (the newline is ignored)
    joinedParts.push({type: 'literal', ...pendingLiteral})
  }

  const args = joinedParts.map(p => {
    if (p.type === 'newline' || p.type === 'continuation') {
      throw new ParseError(scanner, 'Unexpected newline or continuation in joined parts')
    }
    return p.expr
  })

  // filter empty literals from parts (e.g. trailing indentation after removeIndent)
  const parts = stringTemplateParts.filter(p => p.type !== 'literal' || p.value !== '')

  if (args.length === 1 && args[0] instanceof LiteralString && parts.length <= 1) {
    return args[0]
  }

  const concatOp = binaryOperatorNamed('++')
  return new Expressions.StringTemplate(
    [range0, scanner.charIndex],
    scanner.flushComments(),
    {...concatOp, arity: args.length},
    args,
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
  if (!(stringExpr instanceof LiteralString)) {
    throw new ParseError(scanner, `Expected a string literal, found ${stringExpr} instead`)
  }
  return stringExpr
}
