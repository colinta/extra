import * as Expressions from '../../expressions'
import {
  ENUM_KEYWORD,
  GENERIC_OPEN,
  ENUM_OPEN,
  ENUM_CLOSE,
  ENUM_START,
  ARGS_OPEN,
  FN_KEYWORD,
  EXPORT_KEYWORD,
} from '../grammars'
import type {Scanner} from '../scanner'
import {type ParseNext, ParseError} from '../types'
import {unexpectedToken} from './basics'
import {scanGenerics, scanNamedFormula, scanStaticFormula} from './formula'
import {scanFormulaLiteralArguments} from './formula_arguments'
import {scanValidTypeName, scanAnyReference} from './identifier'
import {isStaticFunction, isStaticProperty, scanClassProperty} from './class'

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

  scanner.expectString(ENUM_OPEN)
  scanner.scanAllWhitespace()

  let range1 = scanner.charIndex
  scanner.whereAmI('scanEnum')

  const members: Expressions.EnumMemberExpression[] = []
  const staticNames = new Set<string>()
  const memberNames = new Set<string>()
  const memberFormulas: Expressions.NamedFormulaExpression[] = []
  const staticProperties: Expressions.ClassStaticPropertyExpression[] = []
  const staticFormulas: Expressions.NamedFormulaExpression[] = []
  while (!scanner.scanIfString(ENUM_CLOSE)) {
    if (scanner.scanIfString(ENUM_START)) {
      scanner.scanAllWhitespace()

      const enum0 = scanner.charIndex
      const enumCaseName = scanAnyReference(scanner).name
      scanner.whereAmI(`scanEnum: ${enumCaseName}`)
      let args: Expressions.FormulaLiteralArgument[]
      if (scanner.is(ARGS_OPEN)) {
        args = scanFormulaLiteralArguments(scanner, 'fn', parseNext, false)

        // TODO: I'm being lazy, and don't want to implement spread arguments support
        // in the new enum code (specifically in the matching code)
        args.forEach(arg => {
          if (arg.spreadArg) {
            throw new ParseError(
              scanner,
              'Spread, repeated, and keyword-list arguments are not allowed in enum case definitions, only positional and named arguments.',
              scanner.charIndex - 1,
            )
          }
        })
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
      const formula = scanNamedFormula(scanner, parseNext, 'enum')

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

    scanner.scanAllWhitespace()
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
