import {STATIC} from 'src/types'
import * as Expressions from '../expressions'
import {
  ENUM_KEYWORD,
  GENERIC_OPEN,
  ENUM_OPEN,
  ENUM_CLOSE,
  ENUM_START,
  ARGS_OPEN,
  FN_KEYWORD,
  PUBLIC_KEYWORD,
} from '../grammars'
import type {Scanner} from '../scanner'
import {type ParseNext, ParseError} from '../types'
import {unexpectedToken} from './basics'
import {scanGenerics, scanNamedFormula, scanStaticFormula} from './formula'
import {scanFormulaArgumentDefinitions} from './formula_arguments'
import {scanValidTypeName, scanAnyReference} from './identifier'

export function scanEnum(
  scanner: Scanner,
  parseNext: ParseNext,
  {
    isFnArg,
  }: {
    // fn args do not support features like member and static methods
    isFnArg: boolean
  },
): Expressions.NamedEnumTypeExpression {
  const range0 = scanner.charIndex
  const precedingComments = scanner.flushComments()

  const isPublic = isFnArg ? false : scanner.scanIfWord(PUBLIC_KEYWORD)
  if (isPublic) {
    scanner.expectWhitespace()
  }

  scanner.expectWord(ENUM_KEYWORD)
  const nameRef = scanValidTypeName(scanner)
  scanner.scanAllWhitespace()

  const generics: string[] = []
  if (scanner.scanIfString(GENERIC_OPEN)) {
    generics.push(...scanGenerics(scanner, parseNext))
    scanner.scanAllWhitespace()
  }

  scanner.expectString(ENUM_OPEN)
  scanner.scanAllWhitespace()

  let range1 = scanner.charIndex
  scanner.whereAmI('scanEnum')

  const members: Expressions.EnumMemberExpression[] = []
  const formulas: Expressions.NamedFormulaExpression[] = []
  while (!scanner.scanIfString(ENUM_CLOSE)) {
    if (scanner.scanIfString(ENUM_START)) {
      scanner.scanAllWhitespace()

      const enum0 = scanner.charIndex
      const enumCaseName = scanAnyReference(scanner).name
      scanner.whereAmI(`scanEnum: ${enumCaseName}`)
      let args: Expressions.FormulaLiteralArgumentAndTypeDeclaration[]
      if (scanner.is(ARGS_OPEN)) {
        args = scanFormulaArgumentDefinitions(scanner, 'fn', parseNext, false).args

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
    } else if (isFnArg && (scanner.isWord(FN_KEYWORD) || scanner.isWord(STATIC))) {
      throw new ParseError(
        scanner,
        `Enum formulas are not supported in argument definitions, only enum cases.`,
        scanner.charIndex - 1,
      )
    } else if (scanner.isWord(FN_KEYWORD)) {
      const formula = scanNamedFormula(scanner, parseNext, 'enum')
      formulas.push(formula)
    } else if (scanner.isWord(STATIC)) {
      const formula = scanStaticFormula(scanner, parseNext, 'enum')
      formulas.push(formula)
    } else {
      throw new ParseError(scanner, `Unexpected token '${unexpectedToken(scanner)}'`)
    }

    scanner.scanAllWhitespace()
  }

  if (members.length === 0) {
    throw new ParseError(scanner, `Expected at least one enum member.`, scanner.charIndex - 1)
  }

  return new Expressions.NamedEnumTypeExpression(
    [range0, scanner.charIndex],
    precedingComments,
    nameRef,
    members,
    formulas,
    generics,
    isPublic,
  )
}
