import * as Expressions from '~/formulaParser/expressions'
import {type Expression} from '~/formulaParser/expressions'
import {isViewStart, isWhitespaceChar} from '~/formulaParser/grammars'

import {type Scanner} from '~/formulaParser/scanner'
import {ParseError, type ParseNext} from '~/formulaParser/types'

import {unexpectedToken} from './basics'
import {scanValidName} from './identifier'

export function scanView(scanner: Scanner, parseNext: ParseNext) {
  scanner.whereAmI('scanView')
  const range0 = scanner.charIndex

  scanner.expectString('<')
  // no whitespace allowed after '<'

  let nameRef: Expressions.Reference | undefined // '' --> <></> fragment
  let scanChildren = true
  const props: Expressions.NamedArgument[] = []
  let children: Expression[] = []
  if (scanner.scanIfString('>')) {
    scanner.whereAmI('scanView <>')
    // fragment - don't scan name or props
  } else {
    nameRef = scanValidName(scanner)

    scanner.scanAllWhitespace()

    if (scanner.scanIfString('/>')) {
      scanner.whereAmI(`scanView:closer <${nameRef.name} />`)
      scanChildren = false
    } else {
      // scan props a=b a=(b + c) a=foo.bar, etc
      scanner.whereAmI(`scanView <${nameRef?.name}`)
      for (;;) {
        if (scanner.scanIfString('>')) {
          scanner.whereAmI(
            `scanView <${nameRef?.name} ${props.map(prop => prop.alias + '=…').join(' ')}>`,
          )
          break
        }

        if (scanner.scanIfString('/>')) {
          scanner.whereAmI(`scanView:closer <${nameRef?.name} />`)
          scanChildren = false
          break
        }

        const isNegate = scanner.scanIfString('!')
        const argRange0 = scanner.charIndex
        const propName = scanPropName(scanner)

        if (isNegate) {
          scanner.whereAmI(`scanView:isNegate <${nameRef?.name} !${propName}`)
          props.push(
            new Expressions.NamedArgument(
              [argRange0, scanner.charIndex],
              scanner.flushComments(),
              propName,
              new Expressions.FalseExpression(
                [argRange0, scanner.charIndex],
                scanner.flushComments(),
              ),
            ),
          )
          if (!isWhitespaceChar(scanner.char) && scanner.char !== '>') {
            throw new ParseError(
              scanner,
              `Expected property name or '>', found '${unexpectedToken(scanner)}'`,
            )
          }

          scanner.scanAllWhitespace()
        } else if (scanner.scanIfString('=')) {
          scanner.whereAmI(`scanView:propName <${nameRef?.name} ${propName}=`)
          const propValue = parseNext('view_property')
          scanner.whereAmI(`scanView:propValue <${nameRef?.name} ${propName}=${propValue}`)

          props.push(
            new Expressions.NamedArgument(
              [argRange0, scanner.charIndex],
              scanner.flushComments(),
              propName,
              propValue,
            ),
          )

          scanner.scanAllWhitespace()
        } else {
          scanner.whereAmI(`scanView:boolean <${nameRef?.name} ${propName}`)
          props.push(
            new Expressions.NamedArgument(
              [argRange0, scanner.charIndex],
              scanner.flushComments(),
              propName,
              new Expressions.TrueExpression(
                [argRange0, scanner.charIndex],
                scanner.flushComments(),
              ),
            ),
          )

          scanner.scanAllWhitespace()
        }
      }
    }
  }

  const name = nameRef?.name ?? ''
  if (scanChildren) {
    let indent = ''
    scanner.whereAmI(`scanView <${name}>{children}`)
    for (;;) {
      const scanStart = scanner.charIndex
      if (scanner.scanIfString('</')) {
        if (!scanner.scanIfString(name + '>')) {
          throw new ParseError(
            scanner,
            `Expected a matching closing tag '</${name}>', found '</${unexpectedToken(scanner)}>'`,
          )
        }

        // save location after closing tag
        const rewind = scanner.charIndex
        // rewind to just before '</...>'
        scanner.rewindTo(scanStart - 1)
        // rewind as long as we are at a space or tab
        while (scanner.charIndex > 0 && (scanner.is(' ') || scanner.is('\t'))) {
          scanner.charIndex -= 1
        }

        // if we are at the start of the line, save the indent
        if (scanner.charIndex === 0 || scanner.is('\n')) {
          const offset = scanner.is('\n') ? 1 : 0
          indent = scanner.input.substring(scanner.charIndex + offset, scanStart)
        }
        scanner.whereAmI(`scanView <${name}>…(${children.length})…</${name}>`)
        scanner.rewindTo(rewind)
        break
      }

      // only {- -} comments are supported in views
      // -- should be printed
      if (scanner.is('{-')) {
        scanner.scanComment()
      } else if (scanner.scanIfString('{')) {
        const child = parseNext('view_embed')
        scanner.expectString('}')
        children.push(child)
        scanner.whereAmI(`scanView <${name}> {${child}}`)
      } else if (isViewStart(scanner.remainingInput)) {
        const view = scanView(scanner, parseNext)
        children.push(view)
        scanner.whereAmI(`scanView <${name}> ${view}`)
      } else {
        // anything but whitespace --> text node, until EOL
        const textRange0 = scanner.charIndex
        let stringBuffer = ''
        for (;;) {
          if (scanner.scanIfString('\\{', false)) {
            stringBuffer += '{'
          } else if (scanner.scanIfString('\\}', false)) {
            stringBuffer += '}'
          } else if (scanner.scanIfString('\\<', false)) {
            stringBuffer += '<'
          } else if (scanner.scanIfString('\\>', false)) {
            stringBuffer += '>'
          } else if (scanner.scanIfString('\\\n', false)) {
            stringBuffer += '\n'
          } else if (scanner.is('<')) {
            if (scanner.is(/^<[a-zA-Z/]/)) {
              break
            }
            stringBuffer += scanner.char
            scanner.charIndex += 1
          } else if (scanner.is('{')) {
            // don't consume, leave for next iteration
            break
          } else {
            stringBuffer += scanner.char
            scanner.charIndex += 1
          }
        }

        if (stringBuffer.length > 0) {
          scanner.whereAmI(`scanView <${name}>: ${stringBuffer}`)
          children.push(
            new Expressions.StringLiteral(
              [textRange0, scanner.charIndex],
              scanner.flushComments(),
              stringBuffer,
            ),
          )
        }
      }
    }

    children = children.map(child => {
      if (child instanceof Expressions.StringLiteral) {
        const lines = child.stringValue.split('\n').map(line => {
          if (line === '') {
            return line
          } else if (line.startsWith(indent)) {
            return line.substring(indent.length)
          }

          throw new ParseError(
            scanner,
            `Inconsistent indent, expected '${indent.replaceAll('\t', '\\t')}'`,
            child.range[0],
          )
        })

        return new Expressions.StringLiteral(child.range, scanner.flushComments(), lines.join('\n'))
      } else {
        return child
      }
    })
  }

  if (nameRef) {
    return new Expressions.UserViewExpression(
      [range0, scanner.charIndex],
      scanner.flushComments(),
      nameRef,
      props,
      children,
    )
  } else {
    return new Expressions.FragmentViewExpression(
      [range0, scanner.charIndex],
      scanner.flushComments(),
      props,
      children,
    )
  }
}

/**
 * Any valid name character, _plus_ ':'
 */
function scanPropName(scanner: Scanner) {
  let name = ''
  for (;;) {
    name += scanValidName(scanner).name
    if (scanner.scanIfString(':', false)) {
      name += ':'
    } else {
      break
    }
  }

  return name
}
