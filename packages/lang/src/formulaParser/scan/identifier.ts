import * as Expressions from '../expressions'
import {IGNORE_TOKEN, isRef, isRefChar} from '../grammars'
import {type Scanner} from '../scanner'
import {ParseError} from '../types'
import {unexpectedToken} from './basics'

/**
 * scanValidName is just like scanIdentifier, but it doesn't support state
 * references (@foo), and and cannot be a reserved word.
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
    case '_':
    case '__':
    case '___':
      throw new ParseError(scanner, `Invalid use of reserved symbol '${currentToken}'`)
    case 'let':
    case 'is':
    case 'if':
    case 'elseif':
    case 'guard':
    case 'switch':
    case 'case':
    case 'infer':
    case 'fallback':
    case 'null':
    case 'true':
    case 'false':
    case 'this':
    case 'object':
    case 'array':
    case 'dict':
    case 'set':
    case 'Boolean':
    case 'Float':
    case 'Int':
    case 'String':
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
 * Local references must be lower-cased, cannot be a reserved word, and cannot
 * be a @state reference.
 */
export function scanValidLocalName(scanner: Scanner): Expressions.Reference {
  const ref = scanValidName(scanner)
  if (!isValidLowercased(ref.name)) {
    throw new ParseError(
      scanner,
      `Invalid reference name '${ref.name}'. References must start with a lowercased letter.`,
    )
  }

  return ref
}

/**
 * View names must be capitalized, and cannot be a reserved word.
 */
export function scanValidViewName(scanner: Scanner): Expressions.Reference {
  const ref = scanValidName(scanner)
  if (!isValidUppercased(ref.name)) {
    throw new ParseError(
      scanner,
      `Invalid view name '${ref.name}'. Views must start with an uppercased letter.`,
    )
  }

  return ref
}

/**
 * Type names must be capitalized, and cannot be a reserved word.
 */
export function scanValidTypeName(scanner: Scanner): Expressions.Reference {
  const ref = scanValidName(scanner)
  if (!isValidUppercased(ref.name)) {
    throw new ParseError(
      scanner,
      `Invalid type name '${ref.name}'. Types must start with an uppercased letter.`,
    )
  }

  return ref
}

/**
 * Class properties can be "plain" (similar to object properties) or "state"
 * (`@`-prefixed), which indicates they can be mutated (via a Message, of
 * course).
 */
export function scanValidClassPropertyName(scanner: Scanner): Expressions.Reference {
  const isState = scanner.scanIfString('@')
  const ref = scanValidName(scanner)
  if (!isValidLowercased(ref.name)) {
    const name = (isState ? '@' : '') + ref.name
    throw new ParseError(
      scanner,
      `Invalid property name '${name}'. Property names must start with a lowercased letter.`,
    )
  }

  if (isState) {
    return new Expressions.StateReference(ref.range, ref.precedingComments, ref.name)
  }

  return ref
}

/**
 * "atom" is what I call strings that are of the form `:string`. All ref chars are
 * allowed - hyphens, underscores, letters, numbers, and emoji.
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
    throw new ParseError(scanner, `Expected an atom, found '${currentToken}'`)
  }

  scanner.whereAmI(`scanAtom: ${currentToken}`)
  return new Expressions.StringAtomLiteral(
    [range0, scanner.charIndex],
    scanner.flushComments(),
    currentToken,
  )
}

/**
 * The most generic and permissive. Could be a `@state` reference, a reserved
 * word (`if` `switch` `guard` etc), or a plain reference.
 */
export function scanIdentifier(scanner: Scanner): Expressions.Identifier {
  scanner.whereAmI('scanIdentifier')
  const range0 = scanner.charIndex
  const isState = scanner.scanIfString('@')

  let currentToken = ''
  while (isRefChar(scanner)) {
    currentToken += scanner.char
    scanner.charIndex += 1
  }

  if (!isRef(currentToken)) {
    throw new ParseError(scanner, `Expected a reference, found '${currentToken}'`)
  }

  const range: [number, number] = [range0, scanner.charIndex]
  scanner.whereAmI(`scanIdentifier: ${currentToken}`)
  let identifier: Expressions.Identifier | undefined
  switch (currentToken) {
    case IGNORE_TOKEN:
      identifier = new Expressions.IgnorePlaceholder(range, scanner.flushComments())
      break
    case 'if':
      identifier = new Expressions.IfIdentifier(range, scanner.flushComments())
      break
    case 'elseif':
      identifier = new Expressions.ElseIfIdentifier(range, scanner.flushComments())
      break
    case 'guard':
      identifier = new Expressions.GuardIdentifier(range, scanner.flushComments())
      break
    case 'switch':
      identifier = new Expressions.SwitchIdentifier(range, scanner.flushComments())
      break
    case 'case':
      identifier = new Expressions.CaseIdentifier(range, scanner.flushComments())
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

  // If it's a reserved word, it cannot be a state reference
  if (identifier) {
    if (isState) {
      throw new ParseError(scanner, `Invalid identifier '${isState ? '@' : ''}${identifier.name}'`)
    }

    return identifier
  }

  if (isState) {
    return new Expressions.StateReference(
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
  scanner.whereAmI('scanAnyReference')
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

/**
 * This just checks for *not* uppercased, because we do want to allow emoji as
 * valid start characters. Blame Surma for that one. 🫡
 */
function isValidLowercased(str: string) {
  return !/^[A-Z]/.test(str)
}

function isValidUppercased(str: string) {
  return /^[A-Z]/.test(str)
}
