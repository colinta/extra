import {type Scanner} from '~/formulaParser/scanner'
import * as Expressions from '~/formulaParser/expressions'

import {scanAnyReference, scanValidName} from './identifier'
import {type Comment, ParseError, type ParseNext} from '../types'
import {type Expression} from '~/formulaParser/expressions'
import {
  scanActionFormula,
  scanGenerics,
  scanMainFormula,
  scanNamedFormula,
  scanViewFormula,
} from './formula'
import {IMPORTS_CLOSE, IMPORTS_OPEN} from '../grammars'

export function scanRequiresStatement(scanner: Scanner) {
  const precedingComments = scanner.flushComments()
  scanner.expectString('requires')
  if (scanner.is('\n') || scanner.isEOF()) {
    throw new ParseError(
      scanner,
      `Expected comma-separated environment names after 'requires' expression`,
    )
  }

  scanner.expectSpaces()

  const range0 = scanner.charIndex
  const envs: string[] = []
  for (;;) {
    const name = scanValidName(scanner).name
    envs.push(name)
    scanner.scanSpaces()

    if (scanner.scanIfString(',')) {
      scanner.scanAllWhitespace()
    } else {
      break
    }
  }

  return new Expressions.RequiresStatement([range0, scanner.charIndex], precedingComments, envs)
}

export function scanImportStatement(scanner: Scanner) {
  const precedingComments = scanner.flushComments()
  let precedingSpecifierComments: Comment[] = []

  scanner.expectString('import')
  scanner.expectWhitespace()
  const precedingSourceComments = scanner.flushComments()

  const range0 = scanner.charIndex
  let location: Expressions.ImportLocation
  if (scanner.scanIfString('/')) {
    location = 'project'
  } else if (scanner.scanIfString('./')) {
    location = 'relative'
  } else {
    location = 'package'
  }

  const firstPart = scanAnyReference(scanner)
  let schema: string | undefined, version: string | undefined
  const parts: Expressions.Reference[] = []
  if (scanner.scanIfString('://')) {
    schema = firstPart.name
    if (location !== 'package') {
      const errPrefix = location === 'project' ? '/' : './'
      throw new ParseError(scanner, `Invalid scheme: ${errPrefix}${firstPart.name}:`)
    }

    location = 'scheme'
  } else {
    parts.push(firstPart)
  }

  while (!parts.length || scanner.scanIfString('/')) {
    const part = scanAnyReference(scanner)
    parts.push(part)
  }

  if (schema && scanner.scanIfString('@')) {
    version = ''
    while (!scanner.is(/^\s/) && !scanner.isEOF()) {
      version += scanner.char
      scanner.charIndex += 1
    }
  }

  const source = new Expressions.ImportSource(
    [range0, scanner.charIndex],
    precedingSourceComments,
    location,
    parts,
    schema,
    version,
  )

  if (scanner.lookAhead('as') || scanner.lookAhead(':')) {
    scanner.scanAllWhitespace()
  } else {
    scanner.scanSpaces()
  }
  source.followingComments.push(...scanner.flushComments())

  const importSpecifiers: Expressions.ImportSpecific[] = []
  let aliasRef: Expressions.Reference | undefined
  if (scanner.is('as') || scanner.lookAhead(':')) {
    if (scanner.scanIfWord('as')) {
      scanner.scanAllWhitespace()
      aliasRef = scanValidName(scanner)
      if (scanner.lookAhead(':')) {
        scanner.scanAllWhitespace()
      } else {
        scanner.scanSpaces()
      }
      aliasRef.followingComments.push(...scanner.flushComments())
    }

    if (scanner.scanIfString(':')) {
      scanner.scanAllWhitespace()
      precedingSpecifierComments = scanner.flushComments()
      scanner.expectString(IMPORTS_OPEN)
      for (;;) {
        scanner.scanAllWhitespace()

        if (scanner.isEOF()) {
          throw new ParseError(scanner, 'Unexpected end of input while parsing imports list')
        }

        const specific0 = scanner.charIndex
        const nameRef = scanValidName(scanner)
        if (scanner.lookAhead('as')) {
          scanner.scanAllWhitespace()
        } else {
          scanner.scanSpaces()
        }
        nameRef.followingComments.push(...scanner.flushComments())

        let specificAlias: Expressions.Reference | undefined
        if (scanner.scanIfWord('as')) {
          scanner.expectWhitespace()
          specificAlias = scanValidName(scanner)
          scanner.scanSpaces()
          specificAlias.followingComments.push(...scanner.flushComments())
        }

        scanner.whereAmI(`scanImportStatement ${nameRef} as ${specificAlias}`)
        const importSpecifier = new Expressions.ImportSpecific(
          [specific0, scanner.charIndex],
          scanner.flushComments(),
          nameRef,
          specificAlias,
        )
        importSpecifiers.push(importSpecifier)

        const shouldBreak = scanner.scanCommaOrBreak(
          IMPORTS_CLOSE,
          "Expected ',' separating items in the import list",
        )

        if (shouldBreak) {
          importSpecifier.followingComments.push(...scanner.flushComments())
          break
        }
      }
    }
  }

  const importExpr = new Expressions.ImportStatement(
    [range0, scanner.charIndex],
    precedingComments,
    precedingSpecifierComments,
    source,
    aliasRef,
    importSpecifiers,
  )
  scanner.scanSpaces()
  importExpr.followingComments.push(...scanner.flushComments())
  scanner.whereAmI(
    `scanImportStatement ${location}:${parts.join('/')} ${aliasRef ? ` as ${aliasRef.name}` : ''}: ${importSpecifiers.join(
      ' ',
    )}`,
  )
  return importExpr
}

export function scanTypeDefinition(scanner: Scanner, parseNext: ParseNext) {
  const precedingComments = scanner.flushComments()
  const range0 = scanner.charIndex
  let isPublic = scanner.scanIfString('public')
  if (isPublic) {
    scanner.expectWhitespace()
  }

  let isClass: boolean
  if (scanner.scanIfString('class')) {
    isClass = true
    scanner.expectWhitespace()
  } else {
    isClass = false
    scanner.expectString('type', 'Types must be preceded by the "type" keyword.')
    scanner.expectWhitespace()

    if (scanner.is('public')) {
      isPublic = true
      scanner.expectWhitespace()
    }
  }

  const name = scanValidName(scanner).name
  if (!name.match(/^[A-Z]/)) {
    throw new ParseError(scanner, 'Types must start with an uppercased letter')
  }
  scanner.scanAllWhitespace()

  const generics: string[] = []
  if (scanner.scanIfString('<')) {
    generics.push(...scanGenerics(scanner))
    scanner.scanAllWhitespace()
  }

  if (isClass) {
    scanner.expectString('{')
    scanner.scanAllWhitespace()
    throw new ParseError(scanner, 'Classes are not yet supported')
  } else {
    scanner.expectString('=')
    const type = parseNext('application_type')

    return new Expressions.TypeDefinition(
      [range0, scanner.charIndex],
      precedingComments,
      name,
      type,
      generics,
      isPublic,
    )
  }
}

export function scanStateDefinition(scanner: Scanner, parseNext: ParseNext) {
  const precedingComments = scanner.flushComments()
  const range0 = scanner.charIndex
  const isPublic = scanner.scanIfString('public')
  if (isPublic) {
    scanner.expectWhitespace()
  }

  scanner.expectString('@', "States must start with the at '@' symbol")
  const name = scanValidName(scanner).name
  scanner.whereAmI(`scanState ${isPublic ? 'public ' : ''} ${name}`)
  if (!name.match(/^[a-z]/)) {
    throw new ParseError(scanner, `States must start with a lowercased letter, found '${name}'`)
  }
  scanner.scanAllWhitespace()

  let type: Expression = new Expressions.InferIdentifier([scanner.charIndex, scanner.charIndex], [])
  if (scanner.scanIfString(':')) {
    const argType = parseNext('argument_type')
    type = argType
    scanner.scanAllWhitespace()
  }

  scanner.expectString('=')
  const value = parseNext('expression')

  return new Expressions.StateDefinition(
    [range0, scanner.charIndex],
    precedingComments,
    name,
    type,
    value,
    isPublic,
  )
}

export function scanMainDefinition(scanner: Scanner, parseNext: ParseNext) {
  const expression = scanMainFormula(scanner, parseNext)
  if (!(expression instanceof Expressions.MainFormulaExpression)) {
    throw new ParseError(scanner, `Expected Main function definition, found '${expression}'`)
  }

  return expression
}

export function scanActionDefinition(scanner: Scanner, parseNext: ParseNext) {
  const precedingComments = scanner.flushComments()
  const range0 = scanner.charIndex
  const isPublic = scanner.scanIfString('public')
  if (isPublic) {
    scanner.expectWhitespace()
  }

  const value = scanActionFormula(scanner, parseNext)
  if (!value.nameRef.name.match(/^[a-z]/)) {
    throw new ParseError(
      scanner,
      `Actions must start with a lowercased letter, found '${value.nameRef}'`,
    )
  }

  return new Expressions.ActionDefinition(
    [range0, scanner.charIndex],
    precedingComments,
    value.nameRef,
    value,
    isPublic,
  )
}

export function scanViewDefinition(scanner: Scanner, parseNext: ParseNext) {
  const precedingComments = scanner.flushComments()
  const range0 = scanner.charIndex
  const isPublic = scanner.scanIfString('public')
  if (isPublic) {
    scanner.expectWhitespace()
  }

  const value = scanViewFormula(scanner, 'expression', parseNext)
  if (!value.nameRef.name.match(/^[A-Z]/)) {
    throw new ParseError(
      scanner,
      `Views must start with an uppercased letter, found '${value.nameRef.name}'`,
    )
  }

  return new Expressions.ViewDefinition(
    [range0, scanner.charIndex],
    precedingComments,
    value,
    isPublic,
  )
}

export function scanHelperDefinition(scanner: Scanner, parseNext: ParseNext) {
  const precedingComments = scanner.flushComments()
  const range0 = scanner.charIndex
  const isPublic = scanner.scanIfString('public')
  if (isPublic) {
    scanner.expectWhitespace()
  }

  const value = scanNamedFormula(scanner, parseNext)
  if (!value.nameRef.name.match(/^[a-z]/)) {
    throw new ParseError(
      scanner,
      `Helpers must start with a lowercased letter, found '${value.nameRef.name}'`,
    )
  }

  return new Expressions.HelperDefinition(
    [range0, scanner.charIndex],
    precedingComments,
    value.nameRef,
    value,
    isPublic,
  )
}
