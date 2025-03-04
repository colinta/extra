import {err as resultErr, ok as resultOk} from '@extra-lang/result'
import {Expected} from './expected'
import {type Parser, type ParserResult, reason, ReasonError} from './types'

type ParserProps = Pick<Parser<any>, 'reason' | 'description' | 'expected'> & {_name: string}
type Ok<T> = (_: T) => ParserResult<T>
type Err<T> = (...reason: [Parser<T, any>, string] | [ReasonError]) => ParserResult<T>

function ok<T>(value: T): ParserResult<T> {
  return resultOk(value)
}

function err<T = any>(...args: [Parser<T>, string] | [ReasonError]): ParserResult<T> {
  if (args[0] instanceof ReasonError) {
    return resultErr(args[0])
  }

  const [parser, desc] = args
  return resultErr(reason(parser, desc ?? ''))
}

/**
 * Creates a Parser instance, which is a decorated function.
 *
 * Properties like reason, description, etc, are assigned to Parser, and copied using
 * Object.assign in helpers.
 *
 * function.name is not assignable, so I used _name for that value.
 *
 * enumerability is important, because we copy all enumerable properties in many places.
 *
 * If you are creating a Parser that needs to possibly return a Result two (e.g.
 * Parser<Result<T>>), then god help you. Or file an issue, because I'd like to fix this.
 */
export function createParser<TOut, TIn = any>(
  parserFn: (
    input: TIn,
    ok: Ok<TOut>,
    err: Err<TOut>,
    parser: Parser<TOut, TIn>,
  ) => ParserResult<TOut>,
  expected: Expected,
  name?: string,
): Parser<TOut, TIn> {
  const Parser = function (input: any): ParserResult<TOut> {
    return parserFn(input, ok, err, Parser)
  } as unknown as Parser<TOut, TIn> & ParserProps

  // enumerable properties - these are copied in Object.assign via `extends()`
  Parser.reason = undefined as string | undefined
  Parser.description = ''
  Parser.expected = expected
  Parser._name = name ?? (parserFn.name || 'unknown')

  function extend(parser: Parser<any, any>, props: Partial<ParserProps>) {
    return Object.assign(parser, Parser, props)
  }

  // no other properties should be enumerable
  Object.defineProperties(Parser, {
    name: {
      enumerable: false,
      get() {
        return Parser._name
      },
    },
    named: {
      enumerable: false,
      value: function named(name: string) {
        return extend(createParser(parserFn, expected), {_name: name})
      },
    },
    because: {
      enumerable: false,
      value: function because(reason: string) {
        return extend(createParser(parserFn, expected), {reason})
      },
    },
    describe: {
      enumerable: false,
      value: function describe(description: string) {
        return extend(createParser(parserFn, expected), {description})
      },
    },
    then: {
      enumerable: false,
      value: <TNext>(
        name: string,
        parser: (input: TOut, ok: Ok<TNext>, err: Err<TNext>) => TNext,
      ) => {
        const _name = `${name}<${Parser.name}>`

        return extend(
          createParser<TNext, TIn>((input, ok, err) => {
            return Parser(input).map(value => parser(value, ok, err))
          }, expected),
          {_name},
        )
      },
    },
    optional: {
      enumerable: false,
      get: () =>
        createParser<TOut | undefined>(
          (input: any, ok: Ok<TOut | undefined>, err: Err<TOut | undefined>) => {
            if (input === undefined) {
              return ok(undefined)
            }

            return parserFn(input, ok as Ok<TOut>, err as Err<TOut>, Parser)
          },
          {type: 'oneOf', of: [{type: 'null'}, expected]},
        ).named(`${Parser.name}?`),
    },
    nullable: {
      enumerable: false,
      get: () =>
        createParser<TOut | null>(
          (input: any, ok: Ok<TOut | null>, err: Err<TOut | null>) => {
            if (input === null) {
              return ok(null)
            }

            return parserFn(input, ok as Ok<TOut>, err as Err<TOut>, Parser)
          },
          {type: 'oneOf', of: [{type: 'null'}, expected]},
        ).named(`${Parser.name} | null`),
    },
  })

  return Parser as unknown as Parser<TOut>
}
