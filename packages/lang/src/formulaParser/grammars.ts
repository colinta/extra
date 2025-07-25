import {NAMED_BINARY_OPS, NAMED_UNARY_OPS} from './operators'
import {type Scanner} from './scanner'
import {type ArgumentType, type ExpressionType} from './types'

// I've been moving these functions into 'scanner' as instance methods

export function isCommentStart(input: string) {
  const code = input.charCodeAt(0)
  if (code === 0x2190 || code === 0x2192) {
    return true
  }
  if (code >= 0x2500 && code < 0x2580) {
    return true
  }
  return /^(--|<--|\{-)/.test(input)
}

export function isSpacesChar(char: string): boolean {
  return /^\s/.test(char) && char !== '\n'
}

export function isWhitespaceChar(char: string): boolean {
  return /^\s/.test(char)
}

export function isWord(input: string): boolean {
  return /^\b\w+\b$/.test(input)
}

export function isBinaryOperatorChar(char: string) {
  return /^[~?.&|!<=>≤≥≠*+#%/^-]/.test(char)
}

const namedBinaryOpRegex = new RegExp(`^(${NAMED_BINARY_OPS.join('|')})\\b`)
export function isBinaryOperatorName(input: string) {
  return namedBinaryOpRegex.test(input)
}

export function isUnaryOperatorChar(char: string) {
  return /^[!~$.<=>≤≥-]/.test(char)
}

const namedUnaryOpRegex = new RegExp(`^(${NAMED_UNARY_OPS.join('|')})\\b`)
export function isUnaryOperatorName(input: string) {
  return namedUnaryOpRegex.test(input)
}

export function isBlockStartOperator(scanner: Scanner) {
  return scanner.is(BLOCK_OPEN) || scanner.is(SINGLE_BLOCK_OPEN)
}

export function isNumberChar(char: string) {
  // e => exponent
  // _ => comma placeholder
  return char && /^[\d.oxb_a-fA-F]/.test(char)
}

export function isNumberStart(input: string) {
  return /^(\d|\.\d)/.test(input)
}

export function isNumber(input: string) {
  return !isNaN(Number(input))
}

export function isDiceStart(input: string) {
  return /^\d*d(\d+|F)/.test(input)
}

export function isDiceChar(char: string) {
  return /^[!Fcdhkloprs>=<\d]/.test(char)
}

export function isDice(input: string) {
  return /^\d*d(\d+|[F%])[!cdhkloprs\d>=<]*$/.test(input)
}

export function isTaggedString(scanner: Scanner) {
  return scanner.is(/[a-zA-Z_][a-zA-Z0-9_-]*`/)
}

export function isStringStartChar(char: string) {
  return char === '"' || char === "'" || char === '`' || char === ATOM_START
}

export const REQUIRES_KEYWORD = 'requires'
export const PUBLIC_KEYWORD = 'public'
export const IMPORT_KEYWORD = 'import'
export const IS_KEYWORD = 'is'
export const NOT_IS_KEYWORD = '!is'
export const CASE_KEYWORD = 'case'
export const LET_KEYWORD = 'let'
export const LET_IN = 'in'
export const FN_KEYWORD = 'fn'
export const VIEW_KEYWORD = 'view'
export const STATIC_KEYWORD = 'static'
export const TYPE_KEYWORD = 'type'
export const SPLAT_OP = '...'
export const KWARG_OP = '**'

export const INCLUSION_OPERATOR = 'onlyif'
export const NULL_COALESCING = '?.'

export const ARGS_OPEN = '('
export const ARGS_CLOSE = ')'

export const IMPORTS_OPEN = '{'
export const IMPORTS_CLOSE = '}'

export const SINGLE_BLOCK_OPEN = ':'
export const BLOCK_OPEN = '{'
export const BLOCK_CLOSE = '}'

export const PARENS_OPEN = '('
export const PARENS_CLOSE = ')'

export const GENERIC_OPEN = '<'
export const GENERIC_CLOSE = '>'

export const OBJECT_WORD_START = 'object'
export const OBJECT_OPEN = '{'
export const OBJECT_CLOSE = '}'
export function isObjectLiteralStart(input: string) {
  return input[0] === OBJECT_OPEN
}

export const ARRAY_WORD_START = 'Array'
export const ARRAY_OPEN = '['
export const ARRAY_CLOSE = ']'

export const DICT_WORD_START = 'Dict'
export const SET_WORD_START = 'Set'
export const REGEX_START = '/'
export const ATOM_START = ':'
export const FUNCTION_BODY_START = '=>'

export const ENUM_KEYWORD = 'enum'
export const ENUM_START = '.'
export const ENUM_OPEN = '{'
export const ENUM_CLOSE = '}'

export const CLASS_KEYWORD = 'class'
export const CLASS_EXTENDS = 'extends'
export const CLASS_OPEN = '{'
export const CLASS_CLOSE = '}'

export function isRegexFlag(char: string) {
  return /^[gims]/.test(char)
}

export function isNamedArg(scanner: Scanner) {
  return scanner.is(/[a-zA-Z_][a-zA-Z0-9_-]*\s*:/)
}

export function isRefChar(scanner: Scanner) {
  // if code point of scanner.char is greater than 128, it's probably an emoji
  const code = scanner.char?.codePointAt(0) ?? 0
  if (code > 128) {
    return true
  }

  return /^([a-zA-Z0-9_-]|\p{Extended_Pictographic})/u.test(scanner.remainingInput)
}

// & and @ are valid start-of-reference characters
export function isRefStartChar(scanner: Scanner) {
  return /^[&@]/.test(scanner.char) || isArgumentStartChar(scanner)
}

// isArgumentStartChar doesn't allow [&@-] or [0-9]
export function isArgumentStartChar(scanner: Scanner) {
  return /^([a-zA-Z_]|\p{Extended_Pictographic})/u.test(scanner.remainingInput)
}

export function isViewStart(input: string) {
  return input.match(/^<(\w+|>)/)
}

/**
 * `isRef` allows for variables named "like-this" *or* "like_this", because I've
 * always admired that in Lisp.
 *
 * But not as the first character, because -like-this --> -(like-this)
 */
export function isRef(input: string) {
  return /^([a-zA-Z_]|\p{Extended_Pictographic})([a-zA-Z0-9_-]|\p{Extended_Pictographic})*$/u.test(
    input,
  )
}

export function isScanningType(expressionType: ExpressionType): expressionType is ArgumentType {
  return expressionType === 'argument_type' || expressionType === 'application_type'
}

export function expressionSupportsSplat(expressionType: ExpressionType) {
  return (
    expressionType === 'object' ||
    expressionType === 'array[]' ||
    expressionType === 'array-word' ||
    expressionType === 'dict-word' ||
    expressionType === 'set-word'
  )
}

export function treatNewlineAsComma(expressionType: ExpressionType) {
  return (
    expressionType === 'let' ||
    expressionType === 'case' ||
    expressionType === 'generic' ||
    expressionType === 'argument' ||
    expressionType === 'block_argument' ||
    expressionType === 'object' ||
    expressionType === 'enum' ||
    expressionType === 'class' ||
    expressionType === 'array[]' ||
    expressionType === 'array-word' ||
    expressionType === 'dict-word' ||
    expressionType === 'set-word'
  )
}

export function terminatesWithComma(expressionType: ExpressionType) {
  return (
    expressionType === 'let' ||
    expressionType === 'case' ||
    expressionType === 'generic' ||
    expressionType === 'argument' ||
    expressionType === 'block_argument' ||
    expressionType === 'object' ||
    expressionType === 'array[]' ||
    expressionType === 'array-word' ||
    expressionType === 'dict-word' ||
    expressionType === 'set-word'
  )
}

export function terminatesWithRoundBracket(expressionType: ExpressionType) {
  return (
    expressionType === 'argument' ||
    expressionType === 'array-word' ||
    expressionType === 'dict-word' ||
    expressionType === 'set-word' ||
    expressionType === 'parens'
  )
}

export function terminatesWithSquareBracket(expressionType: ExpressionType) {
  return expressionType === 'bracket_access' || expressionType === 'array[]'
}

export function terminatesWithCurlyBracket(expressionType: ExpressionType) {
  return (
    expressionType === 'block_argument' ||
    expressionType === 'view_embed' ||
    expressionType === 'interpolation' ||
    expressionType === 'object' ||
    expressionType === 'enum' ||
    expressionType === 'case' ||
    expressionType === 'class'
  )
}

export function terminatesWithAngleBracket(expressionType: ExpressionType) {
  return expressionType === 'type' || expressionType === 'generic'
}
