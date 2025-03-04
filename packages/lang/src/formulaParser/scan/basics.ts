import {isWhitespaceChar} from '../grammars'
import {type Scanner} from '../scanner'

export function unexpectedToken(scanner: Scanner) {
  if (scanner.isEOF()) {
    return 'end-of-file "EOF"'
  }

  if (scanner.char === '\n') {
    return 'newline "\\n"'
  }

  const rewind = scanner.charIndex
  let currentToken = ''
  scanner.scanAllWhitespace()
  while (!isWhitespaceChar(scanner.char) && !scanner.isEOF()) {
    currentToken += scanner.char
    scanner.charIndex += 1
    if (currentToken.length >= 20) {
      currentToken += '...'
      break
    }
  }
  scanner.rewindTo(rewind)

  return currentToken
}
