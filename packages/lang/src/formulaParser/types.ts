import {Result} from '@extra-lang/result'
import {type Type} from '../types'
import {type Value} from '../values'
import {type Expression, type Operation} from './expressions'

export type GetRuntimeResult<T> = Result<T, RuntimeError>
export type GetTypeResult = GetRuntimeResult<Type>
export type GetValueResult = GetRuntimeResult<Value>

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

export class RuntimeError extends Error {
  parents: Expression[] = []

  constructor(
    public expression: Expression,
    public message: string,
    public children: RuntimeError[] = [],
  ) {
    super()
    this.message += `\n${expression.constructor.name}: ` + expression.toCode()
  }

  pushParent(parent: Expression) {
    this.parents.push(parent)
    this.message += `\n${parent.constructor.name}: ` + parent.toCode()
  }
}

export function isRuntimeError(error: any): error is RuntimeError {
  return error instanceof RuntimeError
}

export type ExpressionType =
  | 'expression' // default
  | 'let' // let ... in
  | 'type' // parses the type within <>
  | 'object' // parses the value within {key: value}
  | 'array[]' // parses the values within [1,2,3]
  | 'array-word' // parses the values within array(1,2,3)
  | 'dict-word' // parses the values within dict(1,2,3)
  | 'set-word' // parses the values within set(1,2,3)
  | 'bracket_access' // value[access]
  | 'interpolation' // ${ … }
  | 'parens' // ( … )
  | 'generic' // separated by ',' and terminated by '>'
  | 'argument' // function value, separated by ',' and terminated by ')'
  | 'block_argument' // function value, separated by ',' and terminated by ')'
  | 'single_expression' // default argument value
  | 'view_embed' // inside {} while parsing a <View/>
  | 'view_property' // view property
  | 'argument_type' // argument types, like Int, Array<Int>, String[:], (Int | String)
  | 'app_requires_definition'
  | 'app_import_definition'
  | 'app_type_definition' // Type = Array<Int> - Object and Class types can have default values
  | 'app_state_definition' // foo = 0
  | 'app_main_definition' // Main() => …
  | 'app_action_definition' // action() => &.set(…)
  | 'app_view_definition' // SomeView() => <>…</>
  | 'app_helper_definition' // helper(input: A) => …
  | 'application_type' // Array<Int> - Object and Class types can have default values
  | 'test_formula_arguments' // for testing only: name: type pairs, separated by ',' and terminated by ')'

export type ArgumentType = 'application_type' | 'argument_type'

export type Options = {
  debug?: number
  isInPipe?: boolean
  isInView?: boolean
}

export type ParseNext = (expressionType: ExpressionType, options?: Options) => Expression
