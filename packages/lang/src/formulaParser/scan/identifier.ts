import * as Expressions from '../expressions'
import {isRef, isRefChar} from '../grammars'
import {type Scanner} from '../scanner'
import {ParseError} from '../types'
import {unexpectedToken} from './basics'

/**
 * scanValidName is just like scanIdentifier, but it doesn't support state or
 * action references, and fails on reserved words.
 */
export function scanValidName(scanner: Scanner): Expressions.Reference {
  scanner.whereAmI('scanValidName')
  const range0 = scanner.charIndex

  let currentToken = ''
  while (isRefChar(scanner)) {
    currentToken += scanner.char
    scanner.charIndex += 1
  }

  if (!isRef(currentToken)) {
    scanner.rewindTo(range0)
    throw new ParseError(scanner, `Expected a reference, found '${unexpectedToken(scanner)}'`)
  }

  if (/-$/.test(currentToken)) {
    throw new ParseError(
      scanner,
      `Invalid name '${currentToken}'. Identifiers cannot end with a hyphen.`,
    )
  }

  scanner.whereAmI(`scanValidName: ${currentToken}`)
  switch (currentToken) {
    case 'let':
    case 'if':
    case 'elseif':
    case 'switch':
    case 'infer':
    case 'fallback':
    case 'null':
    case 'true':
    case 'false':
    case 'this':
    case 'Boolean':
    case 'Float':
    case 'Int':
    case 'String':
    case 'object':
    case 'array':
    case 'dict':
    case 'set':
    case 'Object':
    case 'Array':
    case 'Dict':
    case 'Set':
    case 'view':
      throw new ParseError(scanner, `Invalid use of reserved word '${currentToken}'`)
  }

  return new Expressions.Reference(
    [range0, scanner.charIndex],
    scanner.flushComments(),
    currentToken,
  )
}

/**
 * scanAtom is similar to scanValidName, but allows reserved words. They are not
 * given special treatement, all values are returned as Expressions.StringAtomLiteral
 */
export function scanAtom(scanner: Scanner) {
  scanner.whereAmI('scanAtom')
  const range0 = scanner.charIndex
  scanner.expectString(':')

  let currentToken = ''
  while (isRefChar(scanner)) {
    currentToken += scanner.char
    scanner.charIndex += 1
  }

  if (!isRef(currentToken)) {
    throw new ParseError(scanner, `Expected a reference, found '${currentToken}'`)
  }

  scanner.whereAmI(`scanAtom: ${currentToken}`)
  return new Expressions.StringAtomLiteral(
    [range0, scanner.charIndex],
    scanner.flushComments(),
    currentToken,
  )
}

export function scanIdentifier(scanner: Scanner): Expressions.Identifier {
  scanner.whereAmI('scanIdentifier')
  const range0 = scanner.charIndex
  const isState = scanner.scanIfString('@')
  const isAction = !isState && scanner.scanIfString('&')

  let currentToken = ''
  while (isRefChar(scanner)) {
    currentToken += scanner.char
    scanner.charIndex += 1
  }

  if (isAction && currentToken === '') {
    return new Expressions.BuiltinActionExpression(
      [range0, scanner.charIndex],
      scanner.flushComments(),
    )
  }

  if (!isRef(currentToken)) {
    throw new ParseError(scanner, `Expected a reference, found '${currentToken}'`)
  }

  const range: [number, number] = [range0, scanner.charIndex]
  scanner.whereAmI(`scanIdentifier: ${currentToken}`)
  let identifier: Expressions.Identifier | undefined
  switch (currentToken) {
    case 'if':
      identifier = new Expressions.IfExpression(range, scanner.flushComments())
      break
    case 'elseif':
      identifier = new Expressions.ElseIfExpression(range, scanner.flushComments())
      break
    case 'switch':
      identifier = new Expressions.SwitchIdentifier(range, scanner.flushComments())
      break
    case 'infer':
      identifier = new Expressions.InferIdentifier(range, scanner.flushComments())
      break
    case 'fallback':
      identifier = new Expressions.FallbackIdentifier(range, scanner.flushComments())
      break
    case 'null':
      identifier = new Expressions.NullExpression(range, scanner.flushComments())
      break
    case 'true':
      identifier = new Expressions.TrueExpression(range, scanner.flushComments())
      break
    case 'false':
      identifier = new Expressions.FalseExpression(range, scanner.flushComments())
      break
    case 'this':
      identifier = new Expressions.ThisIdentifier(range, scanner.flushComments())
      break
    case 'Boolean':
      identifier = new Expressions.BooleanTypeExpression(range, scanner.flushComments())
      break
    case 'Float':
      identifier = new Expressions.FloatTypeExpression(range, scanner.flushComments())
      break
    case 'Int':
      identifier = new Expressions.IntTypeExpression(range, scanner.flushComments())
      break
    case 'String':
      identifier = new Expressions.StringTypeExpression(range, scanner.flushComments())
      break
    case 'object':
      identifier = new Expressions.ObjectConstructorIdentifier(range, scanner.flushComments())
      break
    case 'array':
      identifier = new Expressions.ArrayConstructorIdentifier(range, scanner.flushComments())
      break
    case 'dict':
      identifier = new Expressions.DictConstructorIdentifier(range, scanner.flushComments())
      break
    case 'set':
      identifier = new Expressions.SetConstructorIdentifier(range, scanner.flushComments())
      break
    case 'Object':
      identifier = new Expressions.ObjectTypeIdentifier(range, scanner.flushComments())
      break
    case 'Array':
      identifier = new Expressions.ArrayTypeIdentifier(range, scanner.flushComments())
      break
    case 'Dict':
      identifier = new Expressions.DictTypeIdentifier(range, scanner.flushComments())
      break
    case 'Set':
      identifier = new Expressions.SetTypeIdentifier(range, scanner.flushComments())
      break
    case 'view':
      identifier = new Expressions.ViewTypeExpression(range, scanner.flushComments())
      break
  }

  if (identifier) {
    if (isState || isAction) {
      throw new ParseError(
        scanner,
        `Invalid identifier '${isState ? '@' : ''}${isAction ? '&' : ''}${identifier.name}'`,
      )
    }

    return identifier
  }

  if (isState) {
    return new Expressions.StateReference(
      [range0, scanner.charIndex],
      scanner.flushComments(),
      currentToken,
    )
  } else if (isAction) {
    return new Expressions.ActionReference(
      [range0, scanner.charIndex],
      scanner.flushComments(),
      currentToken,
    )
  }

  return new Expressions.Reference(
    [range0, scanner.charIndex],
    scanner.flushComments(),
    currentToken,
  )
}

export function scanAnyReference(scanner: Scanner): Expressions.Reference {
  scanner.whereAmI('scanAnyIdentifier')
  const range0 = scanner.charIndex

  let currentToken = ''
  while (isRefChar(scanner)) {
    currentToken += scanner.char
    scanner.charIndex += 1
  }

  if (!isRef(currentToken)) {
    throw new ParseError(scanner, `Expected a reference, found '${currentToken}'`)
  }

  return new Expressions.Reference(
    [range0, scanner.charIndex],
    scanner.flushComments(),
    currentToken,
  )
}
