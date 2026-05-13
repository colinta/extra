import * as Expressions from '../../expressions'
import {
  ARG_SEPARATOR,
  ARRAY_CLOSE,
  ARRAY_OPEN,
  FN_KEYWORD,
  LET_IN_KEYWORD,
  LET_KEYWORD,
  OBJECT_CLOSE,
  OBJECT_OPEN,
  SPREAD_OPERATOR,
  TYPE_START,
} from '../grammars'
import {type Scanner} from '../scanner'
import {ParseError, type ExpressionType, type ParseNext} from '../types'
import {scanType} from './type'
import {scanNamedFormula} from './formula'
import {scanValidLocalName} from './identifier'

/**
 *     let
 *       a = 1
 *       b = 2
 *       foo = a + b
 *     in
 *       foo
 */
export function scanLet(
  scanner: Scanner,
  parseNext: ParseNext,
  outerExpressionType: ExpressionType,
): Expressions.Expression {
  const range0 = scanner.charIndex
  scanner.whereAmI('scanLet')

  const precedingComments = scanner.flushComments()
  scanner.expectWord(LET_KEYWORD)

  const bindings: Expressions.LetBinding[] = []
  const assignedNames = new Set<string>()
  for (;;) {
    if (scanner.scanIfWord(LET_IN_KEYWORD)) {
      break
    }

    let entry: Expressions.LetBinding
    if (scanner.isWord(FN_KEYWORD)) {
      entry = scanNamedFormula(scanner, parseNext, 'let')
    } else if (scanner.is(OBJECT_OPEN)) {
      entry = scanLetObjectAssign(scanner, parseNext)
    } else if (scanner.is(ARRAY_OPEN)) {
      entry = scanLetArrayAssign(scanner, parseNext)
    } else {
      const name = scanValidLocalName(scanner)
      scanner.scanAllWhitespace()
      let type: Expressions.Expression | undefined
      if (scanner.scanIfString(TYPE_START)) {
        scanner.scanAllWhitespace()
        type = scanType(scanner, 'type', parseNext)
        scanner.scanAllWhitespace()
      }

      const followingAliasComments = scanner.flushComments()
      scanner.expectString('=')
      scanner.scanAllWhitespace()
      const value = parseNext('let')

      scanner.whereAmI(`scanLet: ${name} = ${value}`)

      entry = new Expressions.LetAssign(
        [name.range[0], value.range[1]],
        name.precedingComments,
        name.name,
        type,
        value,
      )
      entry.followingAliasComments = followingAliasComments
    }
    const entryNames = letBindingNames(entry)
    if (
      (entry instanceof Expressions.LetObjectAssign || entry instanceof Expressions.LetArrayAssign) &&
      entryNames.length === 0
    ) {
      throw new ParseError(scanner, 'Destructured let assignment must assign at least one name')
    }
    for (const name of entryNames) {
      if (assignedNames.has(name)) {
        throw new ParseError(scanner, `Duplicate let assignment '${name}'`)
      }
      assignedNames.add(name)
    }
    bindings.push(entry)

    const shouldBreak = scanner.scanCommaOrBreak('in', `Expected ',' separating items in let`)

    if (shouldBreak) {
      break
    }

    scanner.scanSpaces()
    entry.followingComments.push(...scanner.flushComments())
    scanner.scanAllWhitespace()
  }

  const precedingInBodyComments = scanner.flushComments()
  scanner.whereAmI(`scanLet: body`)
  const body = parseNext(outerExpressionType)

  scanner.whereAmI(`scanLet: body = ${body}`)
  return new Expressions.LetExpression(
    [range0, body.range[1]],
    precedingComments,
    precedingInBodyComments,
    bindings,
    body,
  )
}

function letBindingNames(binding: Expressions.LetBinding): string[] {
  if (binding instanceof Expressions.NamedFormulaExpression) return [binding.name]
  if (binding instanceof Expressions.LetAssign) return [binding.alias]
  return binding.assignmentNames()
}

type LetObjectPart =
  | {kind: 'named'; prop: string; name: string | undefined}
  | {kind: 'positional'; index: number; name: string | undefined}

function scanLetObjectAssign(scanner: Scanner, parseNext: ParseNext): Expressions.LetObjectAssign {
  scanner.whereAmI('scanLetObjectAssign')
  const range0 = scanner.charIndex
  const precedingComments = scanner.flushComments()
  const parts: LetObjectPart[] = []
  let restName: string | undefined
  let position = 0

  scanner.expectString(OBJECT_OPEN)
  scanner.scanAllWhitespace()
  if (!scanner.scanIfString(OBJECT_CLOSE)) {
    for (;;) {
      if (restName) {
        scanner.expectString(
          OBJECT_CLOSE,
          "Rest object assignment '...' must be the last item in the object destructure",
        )
      }

      if (scanner.scanIfString(SPREAD_OPERATOR)) {
        scanner.scanAllWhitespace()
        restName = scanValidLocalName(scanner).name
      } else {
        const propName = scanLetDestructureName(scanner)
        scanner.scanSpaces()
        if (scanner.scanIfString(ARG_SEPARATOR)) {
          scanner.scanSpaces()
          let name = propName
          if (scanner.scanIfString('_')) {
            name = undefined
          } else if (
            !scanner.lookAhead(OBJECT_CLOSE) &&
            !scanner.lookAhead(',') &&
            !scanner.is('\n')
          ) {
            name = scanLetDestructureName(scanner)
          }
          if (!propName) {
            throw new ParseError(scanner, "Expected property name before ':' in object destructure")
          }
          parts.push({kind: 'named', prop: propName, name})
        } else {
          parts.push({kind: 'positional', index: position, name: propName})
          position += 1
        }
      }

      const shouldBreak = scanner.scanCommaOrBreak(
        OBJECT_CLOSE,
        "Expected ',' separating items in the object destructure",
      )
      if (shouldBreak) break
      scanner.scanAllWhitespace()
    }
  }

  scanner.scanAllWhitespace()
  scanner.expectString('=')
  scanner.scanAllWhitespace()
  const value = parseNext('let')
  return new Expressions.LetObjectAssign(
    [range0, value.range[1]],
    precedingComments,
    parts,
    restName,
    value,
  )
}

function scanLetArrayAssign(scanner: Scanner, parseNext: ParseNext): Expressions.LetArrayAssign {
  scanner.whereAmI('scanLetArrayAssign')
  const range0 = scanner.charIndex
  const precedingComments = scanner.flushComments()
  const initialNames: (string | undefined)[] = []
  const trailingNames: (string | undefined)[] = []
  let restName: string | undefined
  let foundRest = false

  scanner.expectString(ARRAY_OPEN)
  scanner.scanAllWhitespace()
  if (!scanner.scanIfString(ARRAY_CLOSE)) {
    for (;;) {
      if (scanner.scanIfString(SPREAD_OPERATOR)) {
        if (foundRest) {
          throw new ParseError(scanner, 'Already found remaining array elements')
        }
        foundRest = true
        scanner.scanSpaces()
        if (!scanner.lookAhead(ARRAY_CLOSE) && !scanner.lookAhead(',')) {
          restName = scanValidLocalName(scanner).name
        }
      } else {
        const name = scanLetDestructureName(scanner)
        if (foundRest) {
          trailingNames.push(name)
        } else {
          initialNames.push(name)
        }
      }

      const shouldBreak = scanner.scanCommaOrBreak(
        ARRAY_CLOSE,
        "Expected ',' separating items in the array destructure",
      )
      if (shouldBreak) break
      scanner.scanAllWhitespace()
    }
  }

  scanner.scanAllWhitespace()
  scanner.expectString('=')
  scanner.scanAllWhitespace()
  const value = parseNext('let')
  return new Expressions.LetArrayAssign(
    [range0, value.range[1]],
    precedingComments,
    initialNames,
    restName,
    trailingNames,
    value,
  )
}

function scanLetDestructureName(scanner: Scanner): string | undefined {
  if (scanner.scanIfString('_')) {
    return undefined
  }
  return scanValidLocalName(scanner).name
}
