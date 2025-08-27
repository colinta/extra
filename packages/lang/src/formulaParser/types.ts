import {Result} from '@extra-lang/result'
import {type Type} from '../types'
import {type Value} from '../values'
import {type Node} from '../nodes'
import {type ValueRuntime} from '../runtime'
import {type Expression, type Operation, type RuntimeError} from '../expressions'

export type GetRuntimeResult<T> = Result<T, RuntimeError>
export type GetTypeResult = GetRuntimeResult<Type>
export type GetValueResult = GetRuntimeResult<Value>
export type GetNodeResult = GetRuntimeResult<Node>
export type GetValueRuntimeResult = GetRuntimeResult<[Value, ValueRuntime]>

export type Associativity = 'left' | 'right'
export type GetParserResult<T> = Result<T, ParseError>

export interface Operator {
  name: string
  symbol: string
  precedence: number
  associativity: Associativity
  arity: number
  precedingComments: Comment[]
  followingOperatorComments: Comment[]
  create(
    range: [number, number],
    precedingComments: Comment[],
    followingOperatorComments: Comment[],
    operator: Operator,
    args: Expression[],
  ): Operation
}

export type AbstractOperator = Omit<Operator, 'precedingComments' | 'followingOperatorComments'>

interface Scanner {
  input: string
  charIndex: number
  debugLines: string[]
}

/**
 * line: --
 * box: {- -}
 * arrow: <--
 * box: lots of unicode chrs (in delim)
 */
export type CommentType = 'line' | 'box' | 'block' | 'arrow'

export interface Comment {
  type: CommentType
  delim: string // redundant in most cases, but necessary for 'box' comments
  comment: string
}

export class ParseError extends Error {
  constructor(
    public scanner: Scanner,
    public description: string,
    charIndex?: number,
  ) {
    let code = ''
    const lines = scanner.input.split('\n')
    let charIndexCorrect = charIndex ?? scanner.charIndex
    for (const line of lines) {
      if (code.length) {
        code += '\n'
      }
      code += line
      if (charIndexCorrect <= line.length && charIndexCorrect >= 0) {
        const dots = '.'.repeat(charIndexCorrect)
        code += `\n${dots}^`
        break
      }
      charIndexCorrect -= line.length + 1
    }

    super(
      `${description}\n${code}${scanner.debugLines.length ? '\n\n' : ''}${scanner.debugLines.join(
        '\n',
      )}`,
    )
    // console.error(
    //   `${description}\n${code}${scanner.debugLines.length ? '\n\n' : ''}${scanner.debugLines.join('\n')}`,
    // )
  }
}
export type ExpressionType =
  | 'expression' // default, but greedy
  | 'let' // let ... in
  | 'type' // parses the type within fn<..>()
  | 'module' // all module-level definitions are scanned in this context
  | 'enum' // parses enum members, member and static functions, closes w/ }
  | 'case' // parses the argument after 'case [match]:'
  | 'class' // parses properties, member and static functions, closes w/ }
  | 'default' // parses a single expression in the context of a class default value
  | 'object-symbol' // parses the values within {key: value}
  | 'object-word' // parses the values within Object(key: value)
  | 'array-symbol' // parses the values within [1,2,3]
  | 'array-word' // parses the values within Array(1,2,3)
  | 'dict-symbol' // parses the values within #{1,2,3}
  | 'dict-word' // parses the values within Dict(1,2,3)
  | 'set-symbol' // parses the values within #{1,2,3}
  | 'set-word' // parses the values within Set(1,2,3)
  | 'bracket_access' // value[access]
  | 'interpolation' // ${ … }
  | 'parens' // ( … )
  | 'generic' // separated by ',' and terminated by '>'
  | 'argument' // function value, separated by ',' and terminated by ')'
  | 'block_argument' // function value, separated by ',' and terminated by ')'
  | 'single_expression' // default argument value (and class/state properties)
  | 'jsx_embed' // inside {} while parsing a <View/>
  | 'view_property' // view property
  | 'argument_type' // argument types, like Int, Array<Int>, String[:], (Int | String)

export type ArgumentType = 'module_type_definition' | 'argument_type'

export type Options = {
  debug?: number
  isInPipe?: boolean
  isInView?: boolean
}

export type ParseNext = (expressionType: ExpressionType, options?: Options) => Expression
