// eslint-disable
import {inspect as nodeInspect} from 'util'
import {err, ok} from '@extra-lang/result'
import * as Parse from '..'

const jestIt =
  global.it === undefined
    ? (desc: string, test: () => void) => {
        it(desc, test)
      }
    : global.it
const jestOnly =
  global.it?.only === undefined
    ? (desc: string, test: () => void) => {
        it.only(desc, test)
      }
    : global.it
const jestSkip =
  global.it?.skip === undefined
    ? (desc: string, test: () => void) => {
        it.skip(desc, test)
      }
    : global.it
let runnerIt = jestIt
export function runWith<T>(
  name: string,
  parser: Parse.Parser<T>,
  tests: {valid?: [any, any][]; invalid?: any[]},
) {
  const valid = tests.valid ?? []
  const invalid = tests.invalid ?? []

  describe(`Parse.${parser.name}`, () => {
    runnerIt('should have the correct name', () => {
      expect(parser.name).toBe(name)
    })

    for (const [input, expected] of valid) {
      runnerIt(`should parse ${nodeInspect(input)}`, () => {
        expect(parser(input)).toEqual(ok(expected))
        if (input !== undefined) {
          expect(parser(input)).toEqual(ok(expected))
        }
      })
    }

    for (const input of invalid) {
      runnerIt(`should fail on ${nodeInspect(input)}`, () => {
        expect(parser(input)).toMatchObject(
          err({
            message: expect.anything(),
          }),
        )
      })
    }
  })

  return {
    extend<U>(
      name: string,
      parser: Parse.Parser<U>,
      moreTests?: {valid?: [any, any][]; invalid?: any[]},
    ) {
      const moreValid = moreTests?.valid ?? []
      const moreInvalid = moreTests?.invalid ?? []
      const valids = valid.filter(
        ([prevCase]) => !moreInvalid.some(moreCase => prevCase === moreCase),
      )
      const invalids = invalid.filter(
        prevCase => !moreValid.some(([moreCase]) => prevCase === moreCase),
      )

      return runWith(name, parser, {
        valid: [...valids, ...moreValid],
        invalid: [...invalids, ...moreInvalid],
      })
    },
  }
}

export function run<T>(
  name: string,
  parser: Parse.Parser<T>,
  tests: {valid?: any[]; invalid?: any[]},
) {
  const valid: [any, any][] = tests.valid?.map(value => [value, value]) ?? []
  const invalid = tests.invalid ?? []
  runWith(name, parser, {valid, invalid})

  return {
    extend<U>(name: string, parser: Parse.Parser<U>, moreTests?: {valid?: any[]; invalid?: any[]}) {
      const moreValid = moreTests?.valid ?? []
      const moreInvalid = moreTests?.invalid ?? []
      const valids = valid
        .filter(([prevCase]) => !moreInvalid.some(moreCase => prevCase === moreCase))
        .map(([test]) => test)
      const invalids = invalid.filter(
        prevCase => !moreValid.some(moreCase => prevCase === moreCase),
      )

      return run(name, parser, {
        valid: [...valids, ...moreValid],
        invalid: [...invalids, ...moreInvalid],
      })
    },
  }
}

runWith.only = <T>(
  name: string,
  parser: Parse.Parser<T>,
  tests: {valid?: [any, any][]; invalid?: any[]},
) => {
  const prev = runnerIt
  runnerIt = jestOnly
  const r = runWith(name, parser, tests)
  runnerIt = prev
  return r
}

run.only = <T>(name: string, parser: Parse.Parser<T>, tests: {valid?: any[]; invalid?: any[]}) => {
  const prev = runnerIt
  runnerIt = jestOnly
  const r = run(name, parser, tests)
  runnerIt = prev
  return r
}

runWith.skip = <T>(
  name: string,
  parser: Parse.Parser<T>,
  tests: {valid?: [any, any][]; invalid?: any[]},
) => {
  const prev = runnerIt
  runnerIt = jestSkip
  const r = runWith(name, parser, tests)
  runnerIt = prev
  return r
}

run.skip = <T>(name: string, parser: Parse.Parser<T>, tests: {valid?: any[]; invalid?: any[]}) => {
  const prev = runnerIt
  runnerIt = jestSkip
  const r = run(name, parser, tests)
  runnerIt = prev
  return r
}
