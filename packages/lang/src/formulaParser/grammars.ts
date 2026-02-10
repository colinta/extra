import {type Scanner} from './scanner'
import {type ExpressionType} from './types'

export const REQUIRES_KEYWORD = 'requires'
export const PROVIDES_KEYWORD = 'provides'
export const EXPORT_KEYWORD = 'export'
export const IMPORT_KEYWORD = 'import'
export const IMPORT_ONLY_KEYWORD = 'only'
export const AS_KEYWORD = 'as'
export const IS_KEYWORD = 'is'
export const NOT_IS_KEYWORD = '!is'
export const CASE_KEYWORD = 'case'
export const LET_KEYWORD = 'let'
export const LET_IN = 'in'
export const IGNORE_TOKEN = '_'
export const FN_KEYWORD = 'fn'
export const OVERRIDE_KEYWORD = 'override'
export const VIEW_KEYWORD = 'view'
export const RENDER_KEYWORD = 'render'
export const STATIC_KEYWORD = 'static'
export const TYPE_KEYWORD = 'type'
export const TYPE_START = ':'
export const DICT_SEPARATOR = ':'
export const ARG_SEPARATOR = ':'
export const CASE_SEPARATOR = ':'

export const ARGS_OPEN = '('
export const ARGS_CLOSE = ')'

export const SINGLE_BLOCK_OPEN = ':'
export const BLOCK_OPEN = '{'
export const BLOCK_CLOSE = '}'

export const PARENS_OPEN = '('
export const PARENS_CLOSE = ')'

export const GENERIC_OPEN = '<'
export const GENERIC_CLOSE = '>'

export const OBJECT_WORD_START = 'Object'
export const OBJECT_OPEN = '{'
export const OBJECT_CLOSE = '}'

export const ARRAY_WORD_START = 'Array'
export const ARRAY_OPEN = '['
export const ARRAY_CLOSE = ']'

export const DICT_WORD_START = 'Dict'
export const DICT_OPEN = '#{'
export const DICT_CLOSE = '}'
export const SET_WORD_START = 'Set'
export const SET_OPEN = '#['
export const SET_CLOSE = ']'
export const REGEX_START = '/'
export const ATOM_START = ':'
export const STATE_START = '@'
export const VERSION_START = '@'
export const FUNCTION_BODY_START = '=>'

export const ENUM_KEYWORD = 'enum'
export const ENUM_START = '.'

export const CLASS_KEYWORD = 'class'
export const CLASS_EXTENDS = 'extends'

export const MSG_TYPE = '&'

export const KWARG_OPERATOR = '**'
export const SPREAD_OPERATOR = '...'
export const STRING_CONCAT_OPERATOR = '..'
export const INCLUSION_OPERATOR = 'onlyif'
export const FUNCTION_INVOCATION_OPERATOR = '()'
export const PROPERTY_ACCESS_OPERATOR = '.'
export const NULL_COALESCING_OPERATOR = '?.'
export const NULL_COALESCE_INVOCATION_OPERATOR = '?.()'
export const NULL_COALESCE_INVOCATION_OPEN = `${NULL_COALESCING_OPERATOR}(`
export const NULL_COALESCE_ARRAY_ACCESS_OPERATOR = '?.[]'
export const NULL_COALESCE_ARRAY_OPEN = `${NULL_COALESCING_OPERATOR}[`

export const BINARY_OP_NAMES = ['and', 'or', 'has', '!has', 'is', '!is', 'matches'] as const
export const BINARY_OP_ALIASES = {
  '&&': 'and',
  '||': 'or',
  '!?': INCLUSION_OPERATOR,
  '?!': INCLUSION_OPERATOR,
  '≤': '<=',
  '≥': '>=',
  '≠': '!=',
} as const
export const UNARY_OP_NAMES = ['not'] as const
export const UNARY_OP_ALIASES = {
  '!': 'not',
} as const

export const BINARY_ASSIGN_OPERATORS = [
  {name: 'logical-and-assign', symbol: '&=', binarySymbol: '&'},
  {name: 'logical-or-assign', symbol: '|=', binarySymbol: '|'},
  {name: 'logical-xor-assign', symbol: '^=', binarySymbol: '^'},
  {name: 'array-concat-assign', symbol: '++=', binarySymbol: '++'},
  {name: 'string-concat-assign', symbol: '..=', binarySymbol: STRING_CONCAT_OPERATOR},
  {name: 'object-merge-assign', symbol: '~~=', binarySymbol: '~~'},
  {name: 'left-shift-assign', symbol: '<<=', binarySymbol: '<<'},
  {name: 'right-shift-assign', symbol: '>>=', binarySymbol: '>>'},
  {name: 'addition-assign', symbol: '+=', binarySymbol: '+'},
  {name: 'subtraction-assign', symbol: '-=', binarySymbol: '-'},
  {name: 'multiplication-assign', symbol: '*=', binarySymbol: '*'},
  {name: 'division-assign', symbol: '/=', binarySymbol: '/'},
  {name: 'floor-division-assign', symbol: '//=', binarySymbol: '//'},
  {name: 'modulo-assign', symbol: '%=', binarySymbol: '%'},
  {name: 'exponentiation-assign', symbol: '**=', binarySymbol: '**'},
] as const

export const BINARY_ASSIGN_SYMBOLS = BINARY_ASSIGN_OPERATORS.map(({symbol}) => symbol)
const BINARY_OP_SYMBOLS = [
  '=',
  '|>',
  '?|>',
  '??',
  '^',
  '|',
  '&',
  '==',
  '!=',
  '>',
  '>=',
  '<',
  '<=',
  '<=>',
  '::',
  '++',
  STRING_CONCAT_OPERATOR,
  '~~',
  '...',
  '<..',
  '..<',
  '<.<',
  '<<',
  '>>',
  '+',
  '-',
  '*',
  '/',
  '//',
  '%',
  '**',
  PROPERTY_ACCESS_OPERATOR,
  NULL_COALESCING_OPERATOR,
  '&&',
  '||',
  '!?',
  '?!',
  '≤',
  '≥',
  '≠',
] as const

const BINARY_OPS = new Set<string>(BINARY_OP_SYMBOLS)
const BINARY_ASSIGNS = new Set<string>(BINARY_ASSIGN_SYMBOLS)
const BINARY_OP_CHARS = new Set(
  BINARY_OP_SYMBOLS.join('')
    .split('')
    .filter(c => !/[a-zA-Z]/.test(c)),
)

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

export function isBinaryOperatorSymbol(scanner: Scanner) {
  return BINARY_OP_SYMBOLS.some(symbol => scanner.is(symbol))
}

// cnanot just iterate BINARY_OP_SYMBOLS and return the one that matches - many
// operators share a prefix (< and <=, > and >=), and so ordering would matter.
// I suppose this could be reconciled by length, but instead we just scan as
// many op characters as we can, and then make a special exception for
// '-' (to support ...-1 and similar).
export function scanBinaryOperatorSymbol(scanner: Scanner) {
  const alias = Object.keys(BINARY_OP_ALIASES).find(alias => scanner.is(alias))
  if (alias) {
    scanner.expectString(alias)
    return alias
  }

  let op = ''
  let rewind = scanner.charIndex
  while (BINARY_OP_CHARS.has(scanner.char)) {
    op += scanner.char
    scanner.charIndex += 1
  }

  if (op.endsWith('-') && BINARY_OPS.has(op.slice(0, -1))) {
    // remove '-' from the operator if the operator is not valid. It is possibly
    // (likely) part of a negative number, or the unary '-' operator.
    op = op.slice(0, -1)
    scanner.rewindTo(scanner.charIndex - 1)
  } else if (op.endsWith('=') && BINARY_ASSIGNS.has(op)) {
    return op
  }

  if (!BINARY_OPS.has(op)) {
    scanner.rewindTo(rewind)
    return undefined
  }

  return op
}

export function isBinaryOperatorName(scanner: Scanner) {
  return BINARY_OP_NAMES.some(name => scanner.isWord(name))
}

export function isUnaryOperatorChar(char: string) {
  return /^[!~$<=>≤≥-]/.test(char)
}

const namedUnaryOpRegex = new RegExp(`^(${UNARY_OP_NAMES.join('|')})\\b`)
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

export function isNumberStart(scanner: Scanner) {
  return scanner.is(/^(\d|\.\d)/)
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
  return scanner.is(/^[a-zA-Z_][a-zA-Z0-9_-]*`/)
}

// special care for ATOM_START, because it's also an operator we check for
//     :<anything>
// but not
//     ::<anything>
export function isStringStartChar(scanner: Scanner) {
  return scanner.is(/^["'`]/) || (scanner.is(ATOM_START) && scanner.nextChar !== ATOM_START)
}

export function isObjectLiteralStart(input: string) {
  return input[0] === OBJECT_OPEN
}

export function isRegexFlag(char: string) {
  return /^[ims]/.test(char)
}

export function isNamedArg(scanner: Scanner) {
  return scanner.is(/^[a-zA-Z_][a-zA-Z0-9_-]*\s*:/)
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

export function expressionSupportsSplat(expressionType: ExpressionType) {
  return (
    expressionType === 'object-symbol' ||
    expressionType === 'object-word' ||
    expressionType === 'array-symbol' ||
    expressionType === 'array-word' ||
    expressionType === 'dict-symbol' ||
    expressionType === 'dict-word' ||
    expressionType === 'set-symbol' ||
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
    expressionType === 'module' ||
    expressionType === 'enum' ||
    expressionType === 'class' ||
    expressionType === 'default' ||
    expressionType === 'object-symbol' ||
    expressionType === 'object-word' ||
    expressionType === 'array-symbol' ||
    expressionType === 'array-word' ||
    expressionType === 'dict-symbol' ||
    expressionType === 'dict-word' ||
    expressionType === 'set-symbol' ||
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
    expressionType === 'default' ||
    expressionType === 'object-symbol' ||
    expressionType === 'object-word' ||
    expressionType === 'array-symbol' ||
    expressionType === 'array-word' ||
    expressionType === 'dict-symbol' ||
    expressionType === 'dict-word' ||
    expressionType === 'set-symbol' ||
    expressionType === 'set-word'
  )
}

export function terminatesWithRoundBracket(expressionType: ExpressionType) {
  return (
    expressionType === 'argument' ||
    expressionType === 'object-word' ||
    expressionType === 'array-word' ||
    expressionType === 'dict-word' ||
    expressionType === 'set-word' ||
    expressionType === 'parens'
  )
}

export function terminatesWithSquareBracket(expressionType: ExpressionType) {
  return (
    expressionType === 'bracket_access' ||
    expressionType === 'set-symbol' ||
    expressionType === 'array-symbol'
  )
}

export function terminatesWithCurlyBracket(expressionType: ExpressionType) {
  return (
    expressionType === 'block_argument' ||
    expressionType === 'jsx_embed' ||
    expressionType === 'interpolation' ||
    expressionType === 'object-symbol' ||
    expressionType === 'dict-symbol' ||
    expressionType === 'enum' ||
    expressionType === 'case' ||
    expressionType === 'class' ||
    expressionType === 'default'
  )
}

export function terminatesWithAngleBracket(expressionType: ExpressionType) {
  return expressionType === 'type' || expressionType === 'generic'
}
