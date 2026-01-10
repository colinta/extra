import * as Values from '../../values'
import * as Expressions from '../../expressions'
import {type Expression} from '../../expressions'
import {
  isNumberStart,
  isStringStartChar,
  ARRAY_CLOSE,
  ARRAY_OPEN,
  OBJECT_CLOSE,
  OBJECT_OPEN,
  GENERIC_OPEN,
  GENERIC_CLOSE,
  PARENS_OPEN,
  PARENS_CLOSE,
  ARRAY_WORD_START,
  DICT_WORD_START,
  SET_WORD_START,
  OBJECT_WORD_START,
  isArgumentStartChar,
  SET_OPEN,
  DICT_OPEN,
  DICT_CLOSE,
  SET_CLOSE,
  DICT_SEPARATOR,
  SPREAD_OPERATOR,
} from '../grammars'
import {type Scanner} from '../scanner'
import {ParseError, type ParseNext} from '../types'

import {scanIdentifier, scanAnyReference} from './identifier'
import {scanNumber} from './number'
import {scanParensGroup} from './parens'
import {scanArgumentType} from './argument_type'
import {scanString} from './string'

function isNamedObjectArgument(scanner: Scanner) {
  return scanner.test(() => {
    // check for key: ...
    if (!isArgumentStartChar(scanner)) {
      return false
    }
    scanIdentifier(scanner)
    scanner.scanSpaces() // if we hit a newline, we should treat it as a tuple value
    return scanner.is(DICT_SEPARATOR)
  })
}

export function scanObject(
  scanner: Scanner,
  parseNext: ParseNext,
  type: 'object-symbol' | 'object-word',
) {
  scanner.whereAmI(`scanObject:${type}`)
  const range0 = scanner.charIndex
  const precedingComments = scanner.flushComments()

  let closer: string
  if (type === 'object-symbol') {
    scanner.expectString(OBJECT_OPEN)
    scanner.scanAllWhitespace()
    closer = OBJECT_CLOSE
  } else {
    scanner.expectString(OBJECT_WORD_START)
    scanner.scanAllWhitespace()
    closer = PARENS_CLOSE

    scanner.expectString(PARENS_OPEN, `Expected '${PARENS_OPEN}' after reserved word 'object'`)
    scanner.scanAllWhitespace()
  }

  if (scanner.scanIfString(closer)) {
    scanner.whereAmI(`scanObject: ${type}`)
    return new Expressions.ObjectExpression(
      [range0, scanner.charIndex],
      precedingComments,
      scanner.flushComments(),
      [],
    )
  }

  const props: Expression[] = []
  for (;;) {
    if (scanner.isEOF()) {
      throw new ParseError(scanner, `Unexpected end of input while scanning object.`)
    }

    const argRange0 = scanner.charIndex
    if (scanner.scanIfString(SPREAD_OPERATOR)) {
      const expression = parseNext(type)
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
      const propName = scanAnyReference(scanner)
      // TODO: this is a weird place for comments to hide
      scanner.scanAllWhitespace()
      scanner.expectString(DICT_SEPARATOR)
      scanner.scanSpaces()

      let entry: Expression
      if (scanner.is(',') || scanner.is(closer) || scanner.is('\n')) {
        // { name: } shorthand
        // TODO: supporting '\n' to terminate this expression is a possible
        // source of confusion:
        //     {
        //        key:
        //        value
        //     } -> {key: key, value}, expected: {key: value}
        // Easy way to avoid confusion: require a comma, and always insert the
        // comma in `toCode()`
        entry = new Expressions.DictEntry(
          [argRange0, scanner.charIndex],
          nameComments,
          propName,
          undefined,
        )
        scanner.whereAmI(`scanObjectArg: {${propName.name}:} shorthand`)
      } else {
        const expression = parseNext(type)
        entry = new Expressions.DictEntry(
          [argRange0, scanner.charIndex],
          nameComments.concat(scanner.flushComments()),
          propName,
          expression,
        )
        scanner.whereAmI('scanObjectArg: ' + expression.toCode())
      }
      entry.followingComments.push(...scanner.flushComments())
      props.push(entry)
    } else {
      // tuple value of any kind
      const expression = parseNext(type)
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

/**
 * Scans a single generic or defaults to InferIdentifier
 */
function scanOptionalGeneric(scanner: Scanner, parseNext: ParseNext) {
  let generic: Expression
  if (scanner.scanIfString(GENERIC_OPEN)) {
    generic = scanArgumentType(scanner, 'argument_type', parseNext)
    scanner.scanAllWhitespace()
    scanner.expectString(GENERIC_CLOSE, `Expected '${GENERIC_CLOSE}'`)
  } else {
    return undefined
  }

  return generic
}

export function scanArray(
  scanner: Scanner,
  parseNext: ParseNext,
  type: 'array-symbol' | 'array-word',
) {
  scanner.whereAmI(`scanArray:${type}`)
  const range0 = scanner.charIndex
  const precedingComments = scanner.flushComments()

  let generic: Expression | undefined
  let closer: string
  if (type === 'array-symbol') {
    scanner.expectString(ARRAY_OPEN)
    scanner.scanAllWhitespace()
    closer = ARRAY_CLOSE
  } else {
    scanner.expectString(ARRAY_WORD_START)
    scanner.scanAllWhitespace()

    generic = scanOptionalGeneric(scanner, parseNext)
    scanner.scanAllWhitespace()
    scanner.expectString(PARENS_OPEN)
    closer = PARENS_CLOSE
  }

  scanner.scanAllWhitespace()
  if (scanner.scanIfString(closer)) {
    scanner.whereAmI(`scanArray: ${type}`)
    return new Expressions.ArrayExpression(
      [range0, scanner.charIndex],
      precedingComments,
      scanner.flushComments(),
      [],
      generic,
    )
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
      type === 'array-symbol' ? ARRAY_CLOSE : PARENS_CLOSE,
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

function scanDictKey(
  scanner: Scanner,
  parseNext: ParseNext,
): [Expression] | [Expression, Expression] {
  const range0 = scanner.charIndex
  if (isNumberStart(scanner)) {
    return [scanNumber(scanner, 'float')]
  } else if (isStringStartChar(scanner)) {
    return [scanString(scanner, true, parseNext)]
  } else if (scanner.is(PARENS_OPEN)) {
    return [scanParensGroup(scanner, parseNext)]
  } else if (scanner.isWord('null')) {
    scanner.expectString('null')
    return [new Expressions.LiteralNull([range0, scanner.charIndex], scanner.flushComments())]
  } else if (scanner.isWord('true')) {
    scanner.expectString('true')
    return [new Expressions.LiteralTrue([range0, scanner.charIndex], scanner.flushComments())]
  } else if (scanner.isWord('false')) {
    scanner.expectString('false')
    return [new Expressions.LiteralFalse([range0, scanner.charIndex], scanner.flushComments())]
  } else {
    const dictName = scanAnyReference(scanner)
    return [
      new Expressions.LiteralString(dictName.range, [], Values.string(dictName.name)),
      dictName,
    ]
  }
}

export function scanDict(
  scanner: Scanner,
  parseNext: ParseNext,
  type: 'dict-symbol' | 'dict-word',
) {
  scanner.whereAmI('scanDict')
  const range0 = scanner.charIndex
  const precedingComments = scanner.flushComments()

  let generic: Expression | undefined
  let closer: string
  if (type === 'dict-symbol') {
    generic = undefined
    scanner.expectString(DICT_OPEN)
    closer = DICT_CLOSE
  } else {
    scanner.expectString(DICT_WORD_START)
    scanner.scanAllWhitespace()
    closer = PARENS_CLOSE

    generic = scanOptionalGeneric(scanner, parseNext)
    scanner.scanAllWhitespace()
    scanner.expectString(PARENS_OPEN)
  }

  scanner.scanAllWhitespace()
  if (scanner.scanIfString(closer)) {
    scanner.whereAmI(`scanDict: ${type}`)
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
      const expression = parseNext(type)
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
      const precedingComments = scanner.flushComments()
      const [name, maybeValue] = scanDictKey(scanner, parseNext)
      scanner.scanAllWhitespace()
      scanner.expectString(
        DICT_SEPARATOR,
        `Expected '${DICT_SEPARATOR}' followed by the value for Dict entry '${name}'`,
      )
      scanner.scanSpaces()

      let entry: Expressions.DictEntry
      if (scanner.is(',') || scanner.is(closer) || scanner.is('\n')) {
        // { name: } shorthand
        scanner.whereAmI(`scanDictArg: Dict( ${name}: ${name} ) shorthand`)

        entry = new Expressions.DictEntry(
          [argRange0, scanner.charIndex],
          precedingComments,
          name,
          maybeValue,
        )
      } else {
        const expression = parseNext(type)
        scanner.whereAmI(`scanDictArg: Dict( ${name.toCode()}: ${expression.toCode()} )`)

        entry = new Expressions.DictEntry(
          [argRange0, scanner.charIndex],
          precedingComments,
          name,
          expression,
        )
      }
      entry.followingComments.push(...scanner.flushComments())
      entries.push(entry)
    }

    const shouldBreak = scanner.scanCommaOrBreak(
      closer,
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

export function scanSet(scanner: Scanner, parseNext: ParseNext, type: 'set-symbol' | 'set-word') {
  scanner.whereAmI('scanSet')
  const range0 = scanner.charIndex
  const precedingComments = scanner.flushComments()

  let generic: Expression | undefined
  let closer: string
  if (type === 'set-symbol') {
    scanner.expectString(SET_OPEN)
    closer = SET_CLOSE
  } else {
    scanner.expectString(SET_WORD_START)
    scanner.scanAllWhitespace()
    closer = PARENS_CLOSE

    generic = scanOptionalGeneric(scanner, parseNext)
    scanner.scanAllWhitespace()
    scanner.expectString(PARENS_OPEN)
  }

  scanner.scanAllWhitespace()
  if (scanner.scanIfString(closer)) {
    scanner.whereAmI(`scanSet: #[closer]`)
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
      const expression = parseNext(type)
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
      const expression = parseNext(type)
      args.push(expression)
      scanner.whereAmI('scanSetArg: Set() ' + expression.toCode())
    }

    const shouldBreak = scanner.scanCommaOrBreak(closer, `Expected ',' separating items in the set`)

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
