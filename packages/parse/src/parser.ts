import {type Result, ResultClass, err} from '@extra-lang/result'

import {createParser} from './create'
import {type Err, type Parser, ReasonError, type StringParser, type ParserResult} from './types'
import {badJson, reason} from './types'
import {pipe} from './pipe'

export function parseJSON<T>(input: string, parser: Parser<T>): Result<T, Err> {
  try {
    return parser(JSON.parse(input))
  } catch (e) {
    return err(badJson())
  }
}

export const any: Parser<any> = createParser<any>(
  function any(input: any, ok) {
    return ok(input)
  },
  {type: 'unknown'},
)

export const nullType = createParser<null>(
  function nullType(input: any, ok, err, Parser: Parser<null>) {
    if (input === null) {
      return ok(null)
    } else {
      return err(Parser, 'not null')
    }
  },
  {type: 'null'},
).named('null')

export const isUndefined = createParser<undefined>(
  function isUndefined(input: any, ok, err, Parser: Parser<undefined>) {
    if (input === undefined) {
      return ok(undefined)
    } else {
      return err(Parser, 'not undefined')
    }
  },
  {type: 'undefined'},
).named('undefined')

export const nullish = createParser<null | undefined>(
  function nullish(input: any, ok, err, Parser: Parser<null | undefined>) {
    if (input === undefined || input === null) {
      return ok(input)
    } else {
      return err(Parser, 'not null or undefined')
    }
  },
  {type: 'oneOf', of: [{type: 'null'}, {type: 'undefined'}]},
).named('null | undefined')

const stringParser = createParser<string>(
  function string(input: any, ok, err, Parser: Parser<string>) {
    if (typeof input === 'string') {
      return ok(input)
    } else if (input instanceof String) {
      return ok(`${input}`)
    } else {
      return err(Parser, 'not a string')
    }
  },
  {type: 'string'},
)

const required = pipe([
  stringParser,
  createParser<string>(
    function required(input: string, ok, err, Parser: Parser<string>) {
      if (input === '') {
        return err(Parser, 'required string is empty')
      }
      if (input.match(/^\s*$/)) {
        return err(Parser, 'required string is only whitespace')
      }

      return ok(input)
    },
    {type: 'string'},
  ),
])

export function matches(pattern: RegExp): Parser<string> {
  return pipe([
    stringParser,
    createParser(
      function matches(input: string, ok, err, Parser) {
        if (!input.match(pattern)) {
          return err(Parser, `string does not match ${pattern.source}`)
        } else {
          return ok(input)
        }
      },
      {type: 'string'},
    ),
  ])
}

export const string = Object.assign(stringParser, {required, matches}) as StringParser

export const int = createParser<number>(
  function int(input: any, ok, err, Parser: Parser<number>) {
    if (typeof input === 'number' && Number.isInteger(input)) {
      return ok(input)
    } else {
      return err(Parser, 'not an integer')
    }
  },
  {type: 'int'},
)

export const float = createParser<number>(
  function float(input: any, ok, err, Parser: Parser<number>) {
    if (typeof input === 'number' && Number.isFinite(input)) {
      return ok(input)
    } else {
      return err(Parser, 'not a float')
    }
  },
  {type: 'float'},
)

export const boolean = createParser<boolean>(
  function boolean(input: any, ok, err, Parser: Parser<boolean>) {
    if (typeof input === 'boolean') {
      return ok(input)
    } else {
      return err(Parser, 'not a boolean')
    }
  },
  {type: 'boolean'},
)

export function literal<T extends boolean | number | string | null>(value: T): Parser<T> {
  const type = typeof value as 'string' | 'number' | 'boolean' | 'null'

  return createParser<T>(
    function literal(input: any, ok, err, Parser: Parser<T>) {
      if (input === value) {
        return ok(value)
      } else {
        const desc = JSON.stringify(value)
        return err(Parser, `not the value ${desc}`)
      }
    },
    {
      type: 'literal',
      of: type === 'number' ? (Number.isInteger(value) ? 'int' : 'float') : type,
    },
  ).named(`${value}`)
}

type Dict<T> = Map<string, T>

/**
 * Parses a homogenous object of string => T. Expects an object as input, where
 * every key is a string and every value is parsed using `Parser<T>`, and returns
 * Map<string, T>.
 */
export function dict<T>(parser: Parser<T>): Parser<Dict<T>> {
  return createParser(
    function dict(input: any, ok, err, Parser: Parser<Dict<T>>) {
      if (input && typeof input === 'object' && !Array.isArray(input)) {
        const dict: Dict<T> = new Map()
        const failures: ReasonError[] = []
        for (const key of Object.keys(input)) {
          const result = parser(input[key])
          if (result.isOk()) {
            dict.set(key, result.get())
          } else {
            failures.push(result.error)
          }
        }

        if (failures.length) {
          return err(reason(Parser, `parser '${Parser.name}' failed`, failures))
        }

        return ok(dict)
      } else {
        return err(reason(Parser, `parser '${Parser.name}' failed: not a dictionary`))
      }
    },
    {type: 'dict', of: parser.expected},
  ).named(`dict<${parser.name}>`)
}

/**
 * Parses the property of an object into its value, mostly for use to compose arguments to map()
 *
 *     parser = Parse.field('name', Parse.string): Parser<string>
 *     // expects object as input, with name property having a string value
 *
 *     parser(undefined) => err(expected({expected: 'object', found: 'undefined'}))
 *     parser(null) => err(expected({expected: 'object', found: 'null'}))
 *     parser(123) => err(expected({expected: 'object', found: 'int'}))
 *     parser({}) => err(expected({expected: 'string', found: 'undefined'}))
 *     parser({name: {}}) => err(expected({expected: 'string', found: 'object'}))
 *     parser({name: ''}) => ok('')
 *     parser({name: 'hi'}) => ok('hi')
 */
export function field<T>(name: string, parser: Parser<T>): Parser<T> {
  return createParser<T>(
    function field(input: any, ok, err, Parser: Parser<T>) {
      if (input && typeof input === 'object') {
        const result = parser(input[name])
        if (result.isOk()) {
          return result
        } else {
          return err(Parser, result.error.reason)
        }
      }

      return err(Parser, `not an object`)
    },
    {type: 'field', name, of: parser.expected},
  ).named(`${name}: ${parser.name}`)
}

export function array<T>(parser: Parser<T>): Parser<T[]> {
  return createParser(
    function array(input: any, ok, err, Parser: Parser<T[]>) {
      if (!Array.isArray(input)) {
        return err(Parser, 'not an array')
      }

      const parsed: T[] = []
      const failures: ReasonError[] = []

      for (const index in input) {
        const result = parser(input[index])
        if (result.isOk()) {
          parsed.push(result.get())
        } else {
          failures.push(result.error)
        }
      }

      if (failures.length) {
        return err(reason(Parser, `parser '${Parser.name}' failed`, failures))
      }

      return ok(parsed)
    },
    {type: 'array', of: parser.expected},
  ).named(`array<${parser.name}>`)
}

export function instanceOf<T>(type: new () => T): Parser<T> {
  return createParser(
    function instanceOf(input: any, ok, err, Parser: Parser<T>) {
      if (input instanceof type) {
        return ok(input)
      } else {
        return err(Parser, `not an instance of ${type.name}`)
      }
    },
    {type: 'instanceof', of: type},
  )
}

export function decide<TOut, TMiddle = any, TIn = any>(
  parserIn: Parser<TMiddle, TIn>,
  fn: (input: TMiddle, fail: (reason?: string) => Parser<TOut, TIn>) => Parser<TOut, TIn>,
): Parser<TOut, TIn> {
  return createParser<TOut, TIn>(
    (input: TIn, ok, err, Parser) => {
      const decideInput = parserIn(input)
      if (decideInput.isErr()) {
        return err(decideInput.error)
      }

      // the type signature here is a little weird; I _say_ that fail() returns a
      // Parser<TOut>, but actually it returns a ParserResult<TOut>. If a ParserResult
      // is returned from the callback, we assume it is from the err() and return it.
      const parserResult = fn(decideInput.get(), (reason?: string) => {
        return err(Parser, reason ?? 'unknown') as unknown as Parser<TOut>
      })

      if (parserResult instanceof ResultClass) {
        return parserResult
      }

      return parserResult(input)
    },
    {type: 'unknown'},
  ).named(fn.name || 'unknown')
}

// the type signature here is a little weird; I _say_ that fail() returns a
// TOut, but actually it returns a ParserResult<TOut>, If a ParserResult
// is returned from the callback, we assume it is from the err() and return it.
export function attempt<TOut, TIn = any>(
  fn: (input: TIn, fail: (reason?: string) => TOut) => TOut | ParserResult<TOut>,
): Parser<TOut, TIn> {
  return createParser<TOut, TIn>(
    function attempt(input: TIn, ok, err, Parser) {
      const result = fn(input, (reason?: string) => {
        return err(Parser, reason ?? 'unknown') as TOut
      })

      if (result instanceof ResultClass) {
        return result
      }

      return ok(result)
    },
    {type: 'unknown'},
  ).named(fn.name || 'unknown')
}

export function not<T>(parser: Parser<T>): Parser<any> {
  return createParser(
    function not(input: any, ok, err, Parser: Parser<any>) {
      const result = parser(input)
      if (result.isOk()) {
        return err(Parser, `parser '${Parser.name}' should not match`)
      }
      return ok(input)
    },
    {type: 'unknown'},
  ).named(`!(${parser.name})`)
}

export function succeed<T>(value: T | (() => T)): Parser<T> {
  return createParser(
    function succeed(_input: any, ok, _err, _Parser: Parser<any>) {
      return ok(value instanceof Function ? value() : value)
    },
    {type: 'unknown'},
  ).named(`succeed()`)
}

export function fail<T>(failReason?: string): Parser<T> {
  return createParser(
    function fail(_input: any, _ok, err, Parser: Parser<any>) {
      return err(reason(Parser, failReason ?? 'unknown'))
    },
    {type: 'unknown'},
  ).named(`fail()`)
}

// export function save<T>(parser: Parser<T>): Parser<T> {
//   return createParser(
//     function succeed(input: any, ok, err, Parser: Parser<any>) {
//       return ok(value)
//     },
//     {type: 'unknown'},
//   ).named(`!(${parser.name})`)
// }
