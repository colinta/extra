import * as Values from '../../values'

import * as Expressions from '../expressions'
import {type Expression} from '../expressions'

import {
  isNumberStart,
  isStringStartChar,
  ARRAY_CLOSE,
  ARRAY_OPEN,
  OBJECT_CLOSE,
  OBJECT_OPEN,
  TYPE_OPEN,
  TYPE_CLOSE,
  PARENS_OPEN,
  PARENS_CLOSE,
  ARRAY_WORD_START,
  DICT_WORD_START,
  SET_WORD_START,
  OBJECT_WORD_START,
  isArgumentStartChar,
} from '../grammars'
import {SPREAD_OPERATOR} from '../operators'
import {type Scanner} from '../scanner'
import {ParseError, type ParseNext} from '../types'
import {scanIdentifier, scanValidName} from './identifier'
import {scanNumber} from './number'
import {scanParensGroup} from './parens'
import {scanArgumentType} from './scanArgumentType'
import {scanString} from './string'

function isNamedObjectArgument(scanner: Scanner) {
  return scanner.test(() => {
    // check for key: ...
    if (!isArgumentStartChar(scanner)) {
      return false
    }
    scanIdentifier(scanner)
    scanner.scanSpaces() // if we hit a newline, we should treat it as a tuple value
    return scanner.is(':')
  })
}

export function scanObject(
  scanner: Scanner,
  parseNext: ParseNext,
  type: 'object{}' | 'object-word',
) {
  scanner.whereAmI(`scanObject:${type}`)
  const range0 = scanner.charIndex

  const precedingComments = scanner.flushComments()
  if (type === 'object{}') {
    scanner.expectString(OBJECT_OPEN)
    scanner.scanAllWhitespace()

    if (scanner.scanIfString(OBJECT_CLOSE)) {
      scanner.whereAmI('scanObject: {}')
      return new Expressions.ObjectExpression(
        [range0, scanner.charIndex],
        precedingComments,
        scanner.flushComments(),
        [],
      )
    }
  } else {
    scanner.expectString(OBJECT_WORD_START)
    scanner.scanAllWhitespace()

    scanner.expectString(PARENS_OPEN, `Expected '${PARENS_OPEN}' after reserved word 'object'`)
    scanner.scanAllWhitespace()
  }

  const props: Expression[] = []
  for (;;) {
    if (scanner.isEOF()) {
      throw new ParseError(scanner, `Unexpected end of input while scanning object.`)
    }

    const argRange0 = scanner.charIndex
    if (scanner.scanIfString(SPREAD_OPERATOR)) {
      const expression = parseNext('object')
      // move the comments off of the expression, attach to the SpreadDict
      const precedingComments = expression.precedingComments
      const followingComments = expression.followingComments
      expression.precedingComments = []
      expression.followingComments = []
      const entry = new Expressions.SpreadObjectArgument(
        [argRange0, argRange0 + 2],
        precedingComments,
        expression,
      )
      entry.followingComments.push(...followingComments)
      props.push(entry)
      scanner.whereAmI(`scanObjectArg: ...${expression}`)
    } else if (isNamedObjectArgument(scanner)) {
      const nameComments = scanner.flushComments()
      scanner.whereAmI('nameComments: ' + nameComments)
      const propName = scanValidName(scanner)
      scanner.scanSpaces() // TODO: this is a weird place for comments to hide
      scanner.expectString(':')
      scanner.scanSpaces()

      if (scanner.is(',') || scanner.is(OBJECT_CLOSE) || scanner.is('\n')) {
        // { name: } shorthand
        const expression = new Expressions.NamedArgument(
          [argRange0, scanner.charIndex],
          nameComments,
          propName.name,
          propName,
        )
        expression.followingComments.push(...scanner.flushComments())
        props.push(expression)
        scanner.whereAmI(`scanObjectArg: {${propName.name}:} shorthand`)
      } else {
        const expression = parseNext('object')
        props.push(
          new Expressions.NamedArgument(
            [argRange0, scanner.charIndex],
            nameComments.concat(scanner.flushComments()),
            propName.name,
            expression,
          ),
        )
        scanner.whereAmI('scanObjectArg: ' + expression.toCode())
      }
    } else {
      // tuple value of any kind
      const expression = parseNext('object')
      props.push(expression)
    }

    scanner.whereAmI('scanObjectArg: ' + props.at(-1))
    const shouldBreak = scanner.scanCommaOrBreak(
      OBJECT_CLOSE,
      `Expected ',' separating items in the object`,
    )

    if (shouldBreak) {
      break
    }

    scanner.scanAllWhitespace()
  }

  scanner.whereAmI(
    `scanObject: ${OBJECT_OPEN}${props.map(arg => arg.toCode()).join(', ')}${OBJECT_CLOSE}`,
  )
  return new Expressions.ObjectExpression(
    [range0, scanner.charIndex],
    precedingComments,
    scanner.flushComments(),
    props,
  )
}

function scanGeneric(scanner: Scanner, parseNext: ParseNext) {
  let generic: Expression
  if (scanner.scanIfString(TYPE_OPEN)) {
    generic = scanArgumentType(scanner, 'argument_type', 'type', parseNext)
    scanner.scanAllWhitespace()
    scanner.expectString(TYPE_CLOSE, `Expected '${TYPE_CLOSE}'`)
  } else {
    generic = new Expressions.InferIdentifier([scanner.charIndex, scanner.charIndex], [])
  }

  return generic
}

export function scanArray(scanner: Scanner, parseNext: ParseNext, type: 'array[]' | 'array-word') {
  scanner.whereAmI(`scanArray:${type}`)
  const range0 = scanner.charIndex

  const precedingComments = scanner.flushComments()
  let generic: Expression
  if (type === 'array[]') {
    generic = new Expressions.InferIdentifier([scanner.charIndex, scanner.charIndex], [])
    scanner.expectString(ARRAY_OPEN)
    scanner.scanAllWhitespace()

    if (scanner.scanIfString(ARRAY_CLOSE)) {
      scanner.whereAmI('scanArray: []')
      return new Expressions.ArrayExpression(
        [range0, scanner.charIndex],
        precedingComments,
        scanner.flushComments(),
        [],
        generic,
      )
    }
  } else {
    scanner.expectString(ARRAY_WORD_START)
    scanner.scanAllWhitespace()

    generic = scanGeneric(scanner, parseNext)
    scanner.scanAllWhitespace()
    scanner.expectString(PARENS_OPEN)
    scanner.scanAllWhitespace()

    if (scanner.scanIfString(PARENS_CLOSE)) {
      scanner.whereAmI('scanArray: array()')
      return new Expressions.ArrayExpression(
        [range0, scanner.charIndex],
        precedingComments,
        scanner.flushComments(),
        [],
        generic,
      )
    }
  }

  const args: Expression[] = []
  for (;;) {
    if (scanner.isEOF()) {
      throw new ParseError(scanner, `Unexpected end of input while scanning array.`)
    }

    const argRange0 = scanner.charIndex
    if (scanner.scanIfString(SPREAD_OPERATOR)) {
      const expression = parseNext(type)
      // move the comments off of the expression, attach to the SpreadDict
      const precedingComments = expression.precedingComments
      const followingComments = expression.followingComments
      expression.precedingComments = []
      expression.followingComments = []
      const entry = new Expressions.SpreadArrayArgument(
        [argRange0, argRange0 + 2],
        precedingComments,
        expression,
      )
      entry.followingComments.push(...followingComments)
      args.push(entry)
    } else {
      const expression = parseNext(type)
      args.push(expression)
      scanner.whereAmI('scanArrayArg: [] ' + expression.toCode())
    }

    const shouldBreak = scanner.scanCommaOrBreak(
      type === 'array[]' ? ARRAY_CLOSE : PARENS_CLOSE,
      `Expected ',' separating items in the array`,
    )

    if (shouldBreak) {
      break
    }

    scanner.scanAllWhitespace()
  }

  scanner.whereAmI('scanArray: ' + args.map(arg => arg.toCode()).join(','))
  return new Expressions.ArrayExpression(
    [range0, scanner.charIndex],
    precedingComments,
    scanner.flushComments(),
    args,
    generic,
  )
}

export function scanDict(scanner: Scanner, parseNext: ParseNext) {
  scanner.whereAmI('scanDict')
  const range0 = scanner.charIndex
  scanner.expectString(DICT_WORD_START)
  scanner.scanAllWhitespace()

  const generic = scanGeneric(scanner, parseNext)
  scanner.scanAllWhitespace()
  scanner.expectString(PARENS_OPEN)
  const precedingComments = scanner.flushComments()

  scanner.scanAllWhitespace()
  if (scanner.scanIfString(PARENS_CLOSE)) {
    scanner.whereAmI('scanDict: Dict()')
    return new Expressions.DictExpression(
      [range0, scanner.charIndex],
      precedingComments,
      scanner.flushComments(),
      [],
      generic,
    )
  }

  const entries: (Expressions.DictEntry | Expressions.SpreadDictArgument)[] = []
  for (;;) {
    if (scanner.isEOF()) {
      throw new ParseError(scanner, `Unexpected end of input while scanning dict.`)
    }

    const argRange0 = scanner.charIndex
    if (scanner.scanIfString(SPREAD_OPERATOR)) {
      const expression = parseNext('dict-word')
      // move the comments off of the expression, attach to the SpreadDict
      const precedingComments = expression.precedingComments
      const followingComments = expression.followingComments
      expression.precedingComments = []
      expression.followingComments = []
      const entry = new Expressions.SpreadDictArgument(
        [argRange0, argRange0 + 2],
        precedingComments,
        expression,
      )
      entry.followingComments.push(...followingComments)
      entries.push(entry)
      scanner.whereAmI(`scanDictArg: ...${expression}`)
    } else {
      let name: Expression
      let value: Expression
      if (isNumberStart(scanner.char)) {
        name = value = scanNumber(scanner, 'float')
      } else if (isStringStartChar(scanner.char)) {
        name = value = scanString(scanner, parseNext)
        scanner.whereAmI(`scanDictArg: Dict( ${name.toCode()} )`)
      } else if (scanner.is(PARENS_OPEN)) {
        name = value = scanParensGroup(scanner, parseNext)
      } else if (scanner.isWord('null')) {
        scanner.expectString('null')
        name = value = new Expressions.NullExpression(
          [range0, scanner.charIndex],
          scanner.flushComments(),
        )
      } else if (scanner.isWord('true')) {
        scanner.expectString('true')
        name = value = new Expressions.TrueExpression(
          [range0, scanner.charIndex],
          scanner.flushComments(),
        )
      } else if (scanner.isWord('false')) {
        scanner.expectString('false')
        name = value = new Expressions.FalseExpression(
          [range0, scanner.charIndex],
          scanner.flushComments(),
        )
      } else {
        const dictName = scanValidName(scanner)
        name = new Expressions.LiteralKey(dictName.range, [], Values.string(dictName.name))
        value = dictName
      }

      scanner.scanSpaces()
      scanner.expectString(':', `Expected ':' followed by the value for Dict entry '${name}'`)
      // we just parsed the key, but comments on the key are now attached to what *may*
      // become the value, so pluck those off, and add them to whatever comments are
      // still in the queue.
      const valueComments = value.precedingComments
      value.precedingComments = []
      const precedingComments = valueComments.concat(scanner.flushComments())
      scanner.scanSpaces()

      if (scanner.is(',') || scanner.is(PARENS_CLOSE) || scanner.is('\n')) {
        // { name: } shorthand
        scanner.whereAmI(`scanDictArg: Dict( ${name}: ${name} ) shorthand`)

        const entry = new Expressions.DictEntry(
          [argRange0, scanner.charIndex],
          precedingComments,
          name,
          value,
        )
        entry.followingComments.push(...scanner.flushComments())
        entries.push(entry)
      } else {
        const expression = parseNext('dict-word')
        scanner.whereAmI(`scanDictArg: Dict( ${name.toCode()}: ${expression.toCode()} )`)

        const entry = new Expressions.DictEntry(
          [argRange0, scanner.charIndex],
          precedingComments,
          name,
          expression,
        )
        entry.followingComments.push(...scanner.flushComments())
        entries.push(entry)
      }
    }

    const shouldBreak = scanner.scanCommaOrBreak(
      PARENS_CLOSE,
      `Expected ',' separating items in the dict`,
    )

    if (shouldBreak) {
      break
    }

    scanner.scanAllWhitespace()
  }

  scanner.whereAmI(
    `scanDict: ${PARENS_OPEN}${entries.map(entry => entry.toCode()).join(',')}${PARENS_CLOSE}`,
  )
  return new Expressions.DictExpression(
    [range0, scanner.charIndex],
    precedingComments,
    scanner.flushComments(),
    entries,
    generic,
  )
}

export function scanSet(scanner: Scanner, parseNext: ParseNext) {
  scanner.whereAmI('scanSet')
  const precedingComments = scanner.flushComments()
  const range0 = scanner.charIndex
  scanner.expectString(SET_WORD_START)
  scanner.scanAllWhitespace()

  const generic = scanGeneric(scanner, parseNext)
  scanner.scanAllWhitespace()
  scanner.expectString(PARENS_OPEN)
  scanner.scanAllWhitespace()

  if (scanner.scanIfString(PARENS_CLOSE)) {
    scanner.whereAmI('scanSet: Set()')
    return new Expressions.SetExpression(
      [range0, scanner.charIndex],
      scanner.flushComments(),
      [],
      [],
      generic,
    )
  }

  const args: Expression[] = []
  for (;;) {
    if (scanner.isEOF()) {
      throw new ParseError(scanner, `Unexpected end of input while scanning set.`)
    }

    const argRange0 = scanner.charIndex
    if (scanner.scanIfString(SPREAD_OPERATOR)) {
      const expression = parseNext('set-word')
      // move the comments off of the expression, attach to the SpreadDict
      const precedingComments = expression.precedingComments
      const followingComments = expression.followingComments
      expression.precedingComments = []
      expression.followingComments = []
      const entry = new Expressions.SpreadSetArgument(
        [argRange0, argRange0 + 2],
        precedingComments,
        expression,
      )
      entry.followingComments.push(...followingComments)
      args.push(entry)
    } else {
      const expression = parseNext('set-word')
      args.push(expression)
      scanner.whereAmI('scanSetArg: Set() ' + expression.toCode())
    }

    const shouldBreak = scanner.scanCommaOrBreak(
      PARENS_CLOSE,
      `Expected ',' separating items in the set`,
    )

    if (shouldBreak) {
      break
    }

    scanner.scanAllWhitespace()
  }

  scanner.whereAmI(
    `scanSet: ${PARENS_OPEN}${args.map(arg => arg.toCode()).join(',')}${PARENS_CLOSE}`,
  )
  return new Expressions.SetExpression(
    [range0, scanner.charIndex],
    precedingComments,
    scanner.flushComments(),
    args,
    generic,
  )
}
