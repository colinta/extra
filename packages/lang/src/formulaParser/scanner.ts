import {isCommentStart, isSpacesChar, isWhitespaceChar} from './grammars'
import {unexpectedToken} from './scan/basics'
import {ParseError, type Options, type CommentType, type Comment} from './types'

export class Scanner {
  public charIndex = 0
  debugLines: string[] = []
  indent = 0
  options: Options
  #pushOptions: Options[] = []
  #comments: [number, Comment][] = []
  #pauseComments = false

  constructor(
    readonly input: string,
    options?: Options,
  ) {
    this.options = options ?? {
      debug: 0,
      isInPipe: false,
      isInView: false,
    }
  }

  get isDebug() {
    return this.options.debug
  }

  set debug(value: number | undefined) {
    this.options.debug = value
  }

  get isInPipe() {
    return this.options.isInPipe
  }

  get isInView() {
    return this.options.isInView
  }

  pushOptions(options: Partial<Options>) {
    this.#pushOptions.push(this.options)
    this.options = {...this.options, ...options}
  }

  popOptions() {
    this.options = this.#pushOptions.pop() ?? this.options
  }

  get char(): string {
    return this.input[this.charIndex] || ''
  }

  get prevChar(): string {
    return this.input[this.charIndex - 1] || ''
  }

  get nextChar(): string {
    return this.input[this.charIndex + 1] || ''
  }

  /**
   * Runs the test scan, and rewinds after the check is performed.
   */
  test(test: () => boolean, message?: string) {
    this.#pauseComments = true
    const rewind = this.charIndex
    const result = test()
    if (message) {
      this.whereAmI(`${message}: ${result}`)
    }
    this.rewindTo(rewind)
    this.#pauseComments = false
    return result
  }

  get eofIndex(): number {
    return this.input.length
  }

  isEOF() {
    return this.charIndex >= this.input.length
  }

  get remainingInput(): string {
    return this.input.slice(this.charIndex)
  }

  is(search: string | RegExp) {
    if (this.isEOF() || search === '') {
      return false
    }

    if (typeof search === 'string') {
      let index = this.charIndex
      for (const chr of search) {
        if (this.input[index] !== chr) {
          return false
        }
        index++
      }
      return true
    } else {
      return Boolean(this.input.slice(this.charIndex).match(search))
    }
  }

  isWord(search: string) {
    if (search === '') {
      return false
    }

    let index = this.charIndex
    for (const chr of search) {
      if (this.input[index] !== chr) {
        return false
      }
      index++
    }

    if (this.input[index] && this.input[index].match(/\w/)) {
      return false
    }

    return true
  }

  scanNextChar() {
    if (this.charIndex >= this.eofIndex) {
      return ''
    }

    this.charIndex += 1
    return this.char
  }

  /**
   * Scans whitespace and then checks for the search string, then rewinds back to the
   * start. Returns whether the search string was found.
   */
  lookAhead(search: string) {
    const rewind = this.charIndex
    this.scanAllWhitespace()

    const found = this.is(search)
    this.whereAmI(`scanAhead '${search}' ? ${found}`)
    this.rewindTo(rewind)

    return found
  }

  scanAhead(search: string) {
    const rewind = this.charIndex
    this.scanAllWhitespace()

    if (this.is(search)) {
      this.charIndex += search.length
      this.whereAmI(`scanAhead '${search}' ? yes`)
      return true
    }

    this.whereAmI(`scanAhead '${search}' ? no`)
    this.rewindTo(rewind)

    return false
  }

  scanIfString(search: string, whereAmI = false) {
    for (const [offset, char] of [...search].entries()) {
      if (this.input[this.charIndex + offset] !== char) {
        if (whereAmI) this.whereAmI(`scanIfString '${search}' ? no`)
        return false
      }
    }
    if (whereAmI) this.whereAmI(`scanIfString '${search}' ? yes`)
    this.charIndex += search.length
    return true
  }

  scanIfWord(search: string) {
    if (this.isWord(search)) {
      this.charIndex += search.length
      this.whereAmI(`scanIfWord '${search}' ? yes`)
      return true
    }

    this.whereAmI(`scanIfWord '${search}' ? no`)
    return false
  }

  /**
   * Newlines are treated as commas in many cases. If we reach a comma, scan all
   * whitespace. If we reach a newline, stop there.
   */
  scanCommaOrNewline() {
    if (this.scanAhead(',')) {
      this.whereAmI("scanCommaOrNewline: ','")
      this.scanAllWhitespace()
      return true
    }

    while (isSpacesChar(this.char) || isCommentStart(this.remainingInput)) {
      if (this.is('--')) {
        // special case for -- comment - stop at end of line
        while (!this.isEOF() && this.char !== '\n') {
          this.charIndex += 1
        }
      } else if (isSpacesChar(this.char)) {
        this.charIndex += 1
      } else {
        this.scanComment()
      }
    }

    if (this.char === '\n') {
      this.whereAmI("scanCommaOrNewline: '\\n'")
      return true
    }

    this.whereAmI('scanCommaOrNewline: neither')
    return false
  }

  /**
   * Scan for a comma (or newline equivalent), and then check for the closer.
   * If the closer is present -> break, otherwise continue.
   * If there is no comma or newline separator, we expect the closer.
   * Example
   *     [ …,  // found comma
   *       more…  // no closer found, return false (continue)
   *     ]
   *     [ …  // found newline separator
   *       more…  // no closer found, return false (continue)
   *     ]
   *     [ …,  // found comma
   *     ]     // closer found, return true (break)
   *
   *     [ … ] // no comma or newline - expect closer, return true (break)
   */
  scanCommaOrBreak(closer: string, expectedCommaMessage: string) {
    if (this.scanCommaOrNewline()) {
      // consume whitespace only if the next symbol is the closing bracket
      if (
        this.test(() => {
          this.scanAllWhitespace()
          return this.is(closer)
        })
      ) {
        this.scanAllWhitespace()
        this.expectString(closer)
        this.whereAmI('scanCommaOrBreak: break')
        return true
      }

      this.whereAmI('scanCommaOrBreak: continue')
      return false
    }

    this.expectString(closer, expectedCommaMessage)
    this.whereAmI('scanCommaOrBreak: break')
    return true
  }

  expectString(str: string, message?: string) {
    if (this.input.slice(this.charIndex, this.charIndex + str.length) !== str) {
      throw new ParseError(this, message ?? `Expected '${str}', found '${unexpectedToken(this)}'`)
    }
    this.charIndex += str.length
    this.whereAmI('expectedString: ' + str.replaceAll('\n', '\\n'))
  }

  scanSpaces() {
    let found = false
    while (isSpacesChar(this.char) || isCommentStart(this.remainingInput)) {
      if (isCommentStart(this.remainingInput)) {
        this.scanComment()
      } else {
        found = true
        ++this.charIndex
      }
    }

    if (found) {
      this.whereAmI('scanSpaces')
    }
  }

  scanAllWhitespace(label?: string) {
    return this._scanWhitespace(label)
  }

  _scanWhitespace(label?: string) {
    let found = false
    while (isWhitespaceChar(this.char) || isCommentStart(this.remainingInput)) {
      if (isCommentStart(this.remainingInput)) {
        this.scanComment()
      } else {
        found = true
        ++this.charIndex
      }
    }

    if (found || label) {
      this.whereAmI('scanWhitespace' + (label ? `: ${label}` : ''))
    }
  }

  expectSpaces() {
    if (!isSpacesChar(this.char)) {
      throw new ParseError(this, `Expected spaces, found '${unexpectedToken(this)}'`)
    }

    this.scanSpaces()
  }

  expectWhitespace() {
    if (!isWhitespaceChar(this.char)) {
      throw new ParseError(this, `Expected whitespace, found '${unexpectedToken(this)}'`)
    }

    this._scanWhitespace()
  }

  scanComment() {
    this.whereAmI('scanComment')
    let commentIndex = this.charIndex
    let comment: string
    if (this.is('--')) {
      // ADA style comments ❤
      comment = scanCommentLine(this)
      this.pushComment('line', comment, '--', commentIndex)
    } else if (this.is('{-')) {
      // Elm style {- -}
      comment = scanCommentContainer(this)
      this.pushComment('block', comment, '{-', commentIndex)
    } else if (this.is('<--')) {
      // point at thing comment
      comment = scanArrowCommentLine(this)
      this.pushComment('arrow', comment, '<--', commentIndex)
    } else {
      // whatever this is
      const char = this.char
      comment = scanCommentBox(this)
      this.pushComment('box', comment, char, commentIndex)
    }
  }

  pushComment(type: CommentType, comment: string, delim: string, index: number) {
    this.whereAmI(`pushComment ${delim}${comment}`)
    this.#comments.push([index, {type, delim, comment}])
  }

  flushComments() {
    if (this.#pauseComments) {
      this.whereAmI('flushComments: <paused>')
      return []
    }
    const comments = this.#comments.map(([_, comment]) => comment)
    this.#comments = []
    this.whereAmI('flushComments: ' + comments.map(({comment}) => comment).join(', '))
    return comments
  }

  whereAmI(message: string) {
    message = message.replaceAll('\n', '\\n').replaceAll('\t', '\\t')
    const indexNewline = Math.max(0, this.input.slice(0, this.charIndex).split('\n').length - 1)
    const lines = this.input.split('\n')
    const precedingLines = lines.slice(0, indexNewline)
    const lineStart = precedingLines.length ? precedingLines.join('\n').length + 1 : 0
    const correctIndex = this.charIndex - lineStart

    const tabs = '  '.repeat(this.indent)
    precedingLines.push(lines[indexNewline])
    const precedingLinesStr =
      precedingLines
        .slice(-5)
        .map(line => tabs + line.replaceAll(' ', '⋅'))
        .join('\n') + '\n'
    let remainingLinesStr = lines
      .slice(indexNewline + 1, indexNewline + 6)
      .map(line => tabs + line.replaceAll(' ', '⋅'))
      .join('\n')
    remainingLinesStr = '\x1b[2m' + remainingLinesStr + '\x1b[22m'

    const dots = '.'.repeat(correctIndex)
    const escapedCharAtIndex = (this.input[this.charIndex] || '')
      .replaceAll('\n', '\\n')
      .replaceAll('\t', '\\t')
    const escapedChar = this.char.replaceAll('\n', '\\n').replaceAll('\t', '\\t')
    const output = ''.concat(
      tabs + (this.isDebug ? `\x1b[1m${message}\x1b[0m` : message) + '\n',
      (precedingLines.length > 5 ? `...${precedingLines.length - 5} skipped...\n` : '') +
        precedingLinesStr,
      tabs +
        (this.isDebug ? `\x1b[1;32m${dots + '^'}\x1b[0m` : dots + '^') +
        (this.input.length <= this.charIndex
          ? ' EOF'
          : ` '${escapedCharAtIndex}' char: '${escapedChar}'`) +
        '\n',
      remainingLinesStr +
        (lines.length - indexNewline > 5 ? `\n...${lines.length - 5} skipped...\n` : ''),
    )

    if (this.isDebug) {
      console.log(output)
    } else {
      this.debugLines.push(output)
    }
  }

  rewindTo(rewind: number) {
    if (this.charIndex === rewind) {
      return
    }
    this.charIndex = rewind
    this.whereAmI('rewindTo')
    const removedComments = this.#comments.filter(([index]) => index >= rewind)
    this.#comments = this.#comments.filter(([index]) => index < rewind)
    if (removedComments.length) {
      this.whereAmI(
        `removed comments: ${removedComments.map(([_, {comment}]) => comment).join(', ')}`,
      )
    }
  }
}

function scanCommentLine(scanner: Scanner) {
  scanner.whereAmI('scanCommentLine:start')
  scanner.expectString('--')
  let comment = ''
  while (scanner.input[scanner.charIndex] !== '\n') {
    comment += scanner.char

    ++scanner.charIndex
    if (scanner.charIndex >= scanner.eofIndex) {
      return comment
    }
  }
  scanner.whereAmI('scanCommentLine:end')

  return comment
}

function scanCommentBox(scanner: Scanner) {
  const code = scanner.char.charCodeAt(0)
  if (code < 0x2500 || code >= 0x2580) {
    throw new ParseError(
      scanner,
      `Expected character in range U+2500 ..< U+2580, found '${unexpectedToken(scanner)}'`,
    )
  }

  let comment = ''
  while (scanner.input[scanner.charIndex] !== '\n') {
    comment += scanner.char

    ++scanner.charIndex
    if (scanner.charIndex >= scanner.eofIndex) {
      scanner.whereAmI('scanCommentBox')
      return comment
    }
  }
  scanner.expectString('\n')
  scanner.whereAmI('scanCommentBox')

  return comment
}

function scanArrowCommentLine(scanner: Scanner) {
  scanner.whereAmI('scanArrowCommentLine')
  scanner.expectString('<--')

  let comment = ''
  while (scanner.input[scanner.charIndex] !== '\n') {
    comment += scanner.char

    ++scanner.charIndex
    if (scanner.charIndex >= scanner.eofIndex) {
      scanner.whereAmI('scanArrowCommentLine')
      return comment
    }
  }
  scanner.expectString('\n')
  scanner.whereAmI('scanArrowCommentLine')

  return comment
}

function scanCommentContainer(scanner: Scanner) {
  scanner.whereAmI('scanCommentContainer')
  scanner.expectString('{-')
  let embeddedCount = 0
  let comment = ''
  for (;;) {
    if (scanner.is('-}')) {
      scanner.expectString('-}')
      if (embeddedCount) {
        comment += '-}'

        embeddedCount -= 1
        scanner.whereAmI('scanCommentContainer embeddedCount ' + embeddedCount)
      } else {
        break
      }
    } else if (scanner.is('{-')) {
      comment += '{-'

      scanner.expectString('{-')
      embeddedCount += 1
      scanner.whereAmI('scanCommentContainer embeddedCount ' + embeddedCount)
    } else {
      comment += scanner.char
    }

    scanner.charIndex += 1
    if (scanner.charIndex >= scanner.eofIndex) {
      break
    }
  }

  return comment
}
