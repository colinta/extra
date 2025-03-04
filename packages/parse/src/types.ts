import {Expected} from './expected'
import type {Result} from '@extra-lang/result'

export type Prettify<T> = {
  [K in keyof T]: T[K]
} & object

type BadJSON = {type: 'bad_json'}

export function badJson(): BadJSON {
  return {type: 'bad_json'}
}

export type ParserError = ReasonError
export type Err = ParserError | BadJSON
export type ParserResult<T> = Result<T, ParserError>

export type Parser<TOut, TIn = unknown> = {
  (input: TIn): ParserResult<TOut>
  // description of the value that this parser expects
  expected: Expected
  // helpers to create optional/nullable variants
  optional: Parser<TOut | undefined, TIn>
  nullable: Parser<TOut | null, TIn>

  then<TNext>(
    name: string,
    parser: (input: TOut, fail: (reason?: string) => TOut) => TNext,
  ): Parser<TNext, TIn>

  // add metadata to the parser
  // named() should be a type-like describe of the parser and
  // because() should describe why the parser failed
  // describe() is additional context for error messages
  describe(_: string): Parser<TOut, TIn>
  description: string
  because(reason: string): Parser<TOut, TIn>
  reason: string | undefined
  named(_: string): Parser<TOut, TIn>
  name: string
}

export type StringParser = Parser<string> & {
  required: Parser<string>
  matches: (pattern: RegExp) => Parser<string>
}

export class ReasonError extends Error {
  public message: string

  constructor(
    public parser: Parser<any>,
    public reason: string,
    public failures: ReasonError[],
  ) {
    const lines = failures.length
      ? `:\n${failures.map(error => error.message.replace(/^/gm, '  ')).join('\n')}`
      : ''
    const message = lines.length
      ? `parser '${parser.name}' failed` + lines
      : `parser '${parser.name}' failed: ${reason}`
    super(message)
    this.message = message
  }
}

export function reason(
  Parser: Parser<any>,
  reason: ReasonError | string,
  failures: ReasonError[] = [],
) {
  if (reason instanceof ReasonError) {
    return reason
  } else {
    return new ReasonError(Parser, reason, failures)
  }
}
