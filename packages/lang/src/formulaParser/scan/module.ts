import {type Scanner} from '../scanner'
import * as Expressions from '../expressions'

import {scanAnyReference, scanValidName, scanValidTypeName} from './identifier'
import {type Comment, ParseError, type ParseNext} from '../types'
import {scanGenerics, scanNamedFormula} from './formula'
import {
  AS_KEYWORD,
  CLASS_KEYWORD,
  ENUM_KEYWORD,
  EXPORT_KEYWORD,
  FN_KEYWORD,
  IMPORT_KEYWORD,
  IMPORT_ONLY_KEYWORD,
  IMPORTS_CLOSE,
  IMPORTS_OPEN,
  PROVIDES_KEYWORD,
  REQUIRES_KEYWORD,
  TYPE_KEYWORD,
  VIEW_KEYWORD,
} from '../grammars'
import {scanClass} from './class'
import {scanEnum} from './enum'
import {scanArgumentType} from './argument_type'
import {scanView} from './view'
import {unexpectedToken} from './basics'

export function scanModule(scanner: Scanner, parseNext: ParseNext) {
  const range0 = scanner.charIndex
  const moduleTokens: {
    provides: Expressions.ProvidesStatement | undefined
    requires: Expressions.RequiresStatement | undefined
    imports: Expressions.ImportStatement[]
    expressions: (
      | Expressions.TypeDefinition
      | Expressions.HelperDefinition
      | Expressions.ViewDefinition
      | Expressions.ClassDefinition
      | Expressions.EnumDefinition
    )[]
  } = {
    provides: undefined,
    requires: undefined,
    imports: [],
    expressions: [],
  }

  scanner.scanAllWhitespace()
  for (;;) {
    if (scanner.isEOF()) {
      break
    }

    if (scanner.isWord(REQUIRES_KEYWORD)) {
      //
      //  REQUIRES
      //
      const requires = scanRequiresStatement(scanner)

      if (moduleTokens.requires) {
        moduleTokens.requires.envs.push(...requires.envs)
      } else {
        moduleTokens.requires = requires
      }
    } else if (scanner.isWord(PROVIDES_KEYWORD)) {
      //
      //  PROVIDES
      //
      if (moduleTokens.provides) {
        throw new ParseError(
          scanner,
          `Provides statement already defined: ${moduleTokens.provides}`,
        )
      }

      const provides = scanProvidesStatement(scanner)
      moduleTokens.provides = provides
    } else if (scanner.isWord(IMPORT_KEYWORD)) {
      //
      //  IMPORT
      //
      moduleTokens.imports.push(scanImportStatement(scanner))
    } else if (scanner.test(isExport(TYPE_KEYWORD))) {
      const typeExpr = scanModuleTypeDefinition(scanner, parseNext)
      moduleTokens.expressions.push(typeExpr as Expressions.TypeDefinition)
    } else if (scanner.test(isExport(CLASS_KEYWORD))) {
      const classExpr = scanClass(scanner, parseNext)
      moduleTokens.expressions.push(classExpr as Expressions.ClassDefinition)
    } else if (scanner.test(isExport(ENUM_KEYWORD))) {
      const enumExpr = scanEnum(scanner, parseNext)
      moduleTokens.expressions.push(enumExpr as Expressions.EnumDefinition)
    } else if (scanner.isWord(FN_KEYWORD)) {
      //
      //  HELPER
      //
      const helper = scanHelperDefinition(scanner, parseNext)
      moduleTokens.expressions.push(helper as Expressions.HelperDefinition)
    } else if (scanner.isWord(VIEW_KEYWORD)) {
      //
      //  <VIEW>
      //
      const view = scanView(scanner, parseNext)
      moduleTokens.expressions.push(view as Expressions.ViewDefinition)
    } else {
      throw new ParseError(scanner, `Unexpected token '${unexpectedToken(scanner)}'`)
    }

    scanner.scanAllWhitespace()
  }

  return new Expressions.Module(
    [range0, scanner.input.length],
    scanner.flushComments(),
    moduleTokens.provides,
    moduleTokens.requires,
    moduleTokens.imports,
    moduleTokens.expressions,
  )
}

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
  const followingComments = scanner.flushComments()

  return new Expressions.RequiresStatement(
    [range0, scanner.charIndex],
    precedingComments,
    envs,
    followingComments,
  )
}

export function scanProvidesStatement(scanner: Scanner) {
  const precedingComments = scanner.flushComments()
  scanner.expectString('provides')
  if (scanner.is('\n') || scanner.isEOF()) {
    throw new ParseError(scanner, `Expected export type after 'provides' expression`)
  }

  scanner.expectSpaces()

  const range0 = scanner.charIndex
  const name = scanAnyReference(scanner).name
  scanner.scanSpaces()
  const followingComments = scanner.flushComments()

  return new Expressions.ProvidesStatement(
    [range0, scanner.charIndex],
    precedingComments,
    name,
    followingComments,
  )
}

export function scanImportStatement(scanner: Scanner) {
  const precedingComments = scanner.flushComments()
  let precedingSpecifierComments: Comment[] = []

  scanner.expectWord(IMPORT_KEYWORD)
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
    while (!scanner.is(/\s/) && !scanner.isEOF()) {
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

  if (scanner.lookAhead(AS_KEYWORD) || scanner.lookAhead(IMPORT_ONLY_KEYWORD)) {
    scanner.scanAllWhitespace()
  } else {
    scanner.scanSpaces()
  }
  source.followingComments.push(...scanner.flushComments())

  const importSpecifiers: Expressions.ImportSpecific[] = []
  let aliasRef: Expressions.Reference | undefined
  if (scanner.scanIfWord(AS_KEYWORD)) {
    scanner.scanAllWhitespace()
    aliasRef = scanValidName(scanner)
    if (scanner.lookAhead(IMPORT_ONLY_KEYWORD)) {
      scanner.scanAllWhitespace()
    } else {
      scanner.scanSpaces()
    }
    aliasRef.followingComments.push(...scanner.flushComments())
  }

  if (scanner.scanIfString(IMPORT_ONLY_KEYWORD)) {
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
      if (scanner.lookAhead(AS_KEYWORD)) {
        scanner.scanAllWhitespace()
      } else {
        scanner.scanSpaces()
      }
      nameRef.followingComments.push(...scanner.flushComments())

      let specificAlias: Expressions.Reference | undefined
      if (scanner.scanIfWord(AS_KEYWORD)) {
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
  if (scanner.test(isClass)) {
    return scanClass(scanner, parseNext)
  }

  if (scanner.test(isEnum)) {
    return scanEnum(scanner, parseNext, {isFnArg: false})
  }

  return scanModuleTypeDefinition(scanner, parseNext)
}

export function scanModuleTypeDefinition(scanner: Scanner, parseNext: ParseNext) {
  const precedingComments = scanner.flushComments()
  const range0 = scanner.charIndex

  let isExport = scanner.scanIfWord(EXPORT_KEYWORD)
  if (isExport) {
    scanner.expectWhitespace()
  }
  scanner.expectWord(TYPE_KEYWORD, 'Types must be preceded by the "type" keyword.')

  const nameRef = scanValidTypeName(scanner)
  scanner.scanAllWhitespace()

  const generics: string[] = []
  if (scanner.scanIfString('<')) {
    generics.push(...scanGenerics(scanner, parseNext))
    scanner.scanAllWhitespace()
  }

  scanner.expectString('=')
  scanner.scanAllWhitespace()
  const type = scanArgumentType(scanner, 'module_type_definition', parseNext)

  return new Expressions.TypeDefinition(
    [range0, scanner.charIndex],
    precedingComments,
    nameRef,
    type,
    generics,
    isExport,
  )
}

export function scanHelperDefinition(scanner: Scanner, parseNext: ParseNext) {
  const precedingComments = scanner.flushComments()
  const range0 = scanner.charIndex
  const isExport = scanner.scanIfWord(EXPORT_KEYWORD)
  if (isExport) {
    scanner.expectWhitespace()
  }

  const value = scanNamedFormula(scanner, parseNext, 'module')
  if (!value.nameRef.name.match(/^[a-z]/)) {
    throw new ParseError(
      scanner,
      `Helpers must start with a lowercased letter, found '${value.nameRef.name}'`,
    )
  }

  return new Expressions.HelperDefinition(
    [range0, scanner.charIndex],
    precedingComments,
    value,
    isExport,
  )
}

function skipPublic(scanner: Scanner) {
  if (scanner.scanIfWord(EXPORT_KEYWORD)) {
    scanner.expectWhitespace()
  }
}
function isClass(scanner: Scanner) {
  skipPublic(scanner)
  return scanner.is(CLASS_KEYWORD)
}

function isEnum(scanner: Scanner) {
  skipPublic(scanner)
  return scanner.is(ENUM_KEYWORD)
}

function isExport(keyword: string) {
  return (scanner: Scanner) => {
    scanner.scanIfWord(EXPORT_KEYWORD) && scanner.expectWhitespace()
    return scanner.isWord(keyword)
  }
}
