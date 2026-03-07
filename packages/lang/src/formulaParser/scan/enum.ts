import * as Expressions from '../../expressions'
import {
  ARGS_CLOSE,
  ARGS_OPEN,
  BLOCK_CLOSE,
  BLOCK_OPEN,
  ENUM_KEYWORD,
  ENUM_START,
  EXPORT_KEYWORD,
  FN_KEYWORD,
  GENERIC_OPEN,
} from '../grammars'
import type {Scanner} from '../scanner'
import {type ParseNext, ParseError} from '../types'
import {unexpectedToken} from './basics'
import {scanGenerics, scanInstanceFormula, scanStaticFormula} from './formula'
import {scanValidTypeName, scanEnumName} from './identifier'
import {isStaticFunction, isStaticProperty, scanClassProperty} from './class'
import {scanInsideObjectType} from './argument_type'

export function scanNamedEnum(
  scanner: Scanner,
  parseNext: ParseNext,
): Expressions.NamedEnumDefinition {
  const range0 = scanner.charIndex
  const precedingComments = scanner.flushComments()

  const isExport = scanner.scanIfWord(EXPORT_KEYWORD)
  if (isExport) {
    scanner.expectWhitespace()
  }

  scanner.expectWord(ENUM_KEYWORD)
  const nameRef = scanValidTypeName(scanner)
  scanner.scanAllWhitespace()

  const generics: Expressions.GenericExpression[] = []
  if (scanner.scanIfString(GENERIC_OPEN)) {
    generics.push(...scanGenerics(scanner, parseNext))
    scanner.scanAllWhitespace()
  }

  scanner.expectString(BLOCK_OPEN)
  scanner.scanAllWhitespace()

  let range1 = scanner.charIndex
  scanner.whereAmI('scanEnum')

  const members: Expressions.EnumMemberExpression[] = []
  const caseNames = new Set<string>()
  const staticNames = new Set<string>()
  const memberNames = new Set<string>()
  const memberFormulas: Expressions.InstanceFormulaExpression[] = []
  const staticProperties: Expressions.ClassStaticPropertyExpression[] = []
  const staticFormulas: Expressions.NamedFormulaExpression[] = []
  while (!scanner.scanIfString(BLOCK_CLOSE)) {
    if (scanner.scanIfString(ENUM_START)) {
      scanner.scanAllWhitespace()

      const enum0 = scanner.charIndex
      const enumCaseName = scanEnumName(scanner).name
      if (caseNames.has(enumCaseName)) {
        throw new ParseError(scanner, `Found duplicate enum case name '${enumCaseName}'.`)
      }
      caseNames.add(enumCaseName)

      scanner.whereAmI(`scanEnum: ${enumCaseName}`)
      let args: [Expressions.Reference | undefined, Expressions.Expression][]
      if (scanner.scanIfString(ARGS_OPEN)) {
        // scans `Type` and `named: Type` until it reaches ')'
        args = scanInsideObjectType(scanner, 'argument_type', ARGS_CLOSE, parseNext)
      } else {
        args = []
      }
      range1 = scanner.charIndex

      members.push(
        new Expressions.EnumMemberExpression(
          [enum0, range1],
          scanner.flushComments(),
          enumCaseName,
          args,
        ),
      )

      scanner.scanCommaOrNewline()
    } else if (scanner.isWord(FN_KEYWORD)) {
      const formula = scanInstanceFormula(scanner, parseNext, 'enum')

      if (memberNames.has(formula.name)) {
        throw new ParseError(scanner, `Found duplicate property '${formula.name}'.`)
      }

      memberNames.add(formula.name)
      memberFormulas.push(formula)
    } else if (scanner.test(isStaticProperty)) {
      const property = scanEnumProperty(scanner, parseNext)

      if (staticNames.has(property.name)) {
        throw new ParseError(scanner, `Found duplicate static property '${property}'.`)
      }

      staticNames.add(property.name)
      staticProperties.push(property)
    } else if (scanner.test(isStaticFunction)) {
      const formula = scanStaticFormula(scanner, parseNext, 'enum')

      if (staticNames.has(formula.name)) {
        throw new ParseError(scanner, `Found duplicate static property '${formula.name}'.`)
      }

      staticNames.add(formula.name)
      staticFormulas.push(formula)
    } else {
      throw new ParseError(scanner, `Unexpected token '${unexpectedToken(scanner)}'`)
    }

    scanner.scanAllWhitespace('enum')
  }

  if (members.length === 0) {
    throw new ParseError(scanner, `Expected at least one enum member.`, scanner.charIndex - 1)
  }

  return new Expressions.NamedEnumDefinition(
    [range0, scanner.charIndex],
    precedingComments,
    nameRef,
    members,
    staticProperties,
    memberFormulas,
    staticFormulas,
    generics,
    isExport,
  )
}

function scanEnumProperty(scanner: Scanner, parseNext: ParseNext) {
  return scanClassProperty(scanner, parseNext, true) as Expressions.ClassStaticPropertyExpression
}

/**
 * Matches `.name` expressions. These are enum lookup shorthands. If the enum
 * requires arguments, those are scanned as usual, and the enum lookup will be
 * treated as a function invocation.
 */
export function scanEnumLookup(scanner: Scanner): Expressions.Expression {
  const range0 = scanner.charIndex
  const precedingComments = scanner.flushComments()

  scanner.expectString(ENUM_START)
  const name = scanEnumName(scanner).name

  return new Expressions.EnumLookupExpression([range0, scanner.charIndex], precedingComments, name)
}
