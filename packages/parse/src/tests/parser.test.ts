import * as Parse from '..'
import {err} from '@extra-lang/result'

import {run, runWith} from './runner'

const __: any[] = []

describe('one', () => {
  const stringCases = ['test1', '←→', '   \nhey']
  // const blankCases = ['', '   ', '   \n\t']
  const booleanCases = [true, false]
  // const intCases = [123, 0]
  // const floatCases = [12.3, 0.1]
  const nullishCases = [undefined, null]
  // const nullCases = [null]
  // const optionalCases = [undefined]
  // const arrayCases = [[], intCases, floatCases, stringCases]
  // const objectCases = [{}, {strings: stringCases}, {ints: intCases}]
  // const containerCases = [arrayCases, objectCases]
  const optionalInts = {a: undefined, b: 0}

  run(
    '{foo: string, bar: float?}',
    Parse.object([
      ['foo', Parse.string],
      ['bar', Parse.float.optional],
    ]),
    {
      valid: [{foo: 'bar', bar: 123}, {foo: 'bar', bar: undefined}, {foo: 'bar'}],
      invalid: __.concat(
        nullishCases,
        stringCases,
        booleanCases,
        optionalInts,
        {},
        {foo: 'bar', bar: ''},
      ),
    },
  )
})

describe('Parsers', () => {
  const stringCases = ['test1', '←→', '   \nhey']
  const blankCases = ['', '   ', '   \n\t']
  const booleanCases = [true, false]
  const intCases = [123, 0]
  const floatCases = [12.3, 0.1]
  const nullishCases = [undefined, null]
  const nullCases = [null]
  const optionalCases = [undefined]
  const arrayCases = [[], intCases, floatCases, stringCases]
  const objectCases = [{}, {strings: stringCases}, {ints: intCases}]
  const containerCases = [arrayCases, objectCases]

  //
  // Strings
  //
  const strings = run('string', Parse.string, {
    valid: __.concat(stringCases, blankCases),
    invalid: __.concat(nullishCases, intCases, floatCases, booleanCases, containerCases),
  })
  strings.extend('required<string>', Parse.string.required, {
    invalid: blankCases,
  })
  strings.extend('matches<string>', Parse.string.matches(/^a.*z$/), {
    valid: ['abcdz', 'a…z', 'az'],
    invalid: __.concat(stringCases, blankCases),
  })

  strings.extend('string?', Parse.string.optional, {
    valid: optionalCases,
  })
  strings.extend('string | null', Parse.string.nullable, {
    valid: nullCases,
  })

  //
  // Ints
  //
  const ints = run('int', Parse.int, {
    valid: intCases,
    invalid: __.concat(nullishCases, stringCases, booleanCases, containerCases),
  })
  ints.extend('int', Parse.int, {
    invalid: floatCases,
  })
  ints.extend('int?', Parse.int.optional, {
    valid: optionalCases,
  })
  ints.extend('int | null', Parse.int.nullable, {
    valid: nullCases,
  })

  //
  // Floats (number)
  //
  ints.extend('float', Parse.float, {
    valid: floatCases,
  })
  ints.extend('float?', Parse.float.optional, {
    valid: optionalCases,
  })
  ints.extend('float | null', Parse.float.nullable, {
    valid: nullCases,
  })

  //
  // Booleans
  //
  const bools = run('boolean', Parse.boolean, {
    valid: [true, false],
    invalid: __.concat(nullishCases, stringCases, floatCases, intCases, containerCases),
  })
  bools.extend('boolean?', Parse.boolean.optional, {
    valid: optionalCases,
  })
  bools.extend('boolean | null', Parse.boolean.nullable, {
    valid: nullCases,
  })

  //
  // Null | Undefined
  //
  run('null', Parse.nullType, {
    valid: [null],
    invalid: __.concat(booleanCases, stringCases, floatCases, intCases, containerCases, [
      undefined,
    ]),
  })
  run('undefined', Parse.isUndefined, {
    valid: [undefined],
    invalid: __.concat(booleanCases, stringCases, floatCases, intCases, containerCases, [null]),
  })
  run('null | undefined', Parse.nullish, {
    valid: [null, undefined],
    invalid: __.concat(booleanCases, stringCases, floatCases, intCases, containerCases),
  })

  //
  // Arrays
  //
  run('array<int>', Parse.array(Parse.int), {
    valid: [[], intCases],
    invalid: __.concat(nullishCases, stringCases, booleanCases, objectCases),
  })

  //
  // Dicts
  //
  const optionalInts = {a: undefined, b: 0}
  runWith('dict<int>', Parse.dict(Parse.int), {
    valid: [
      [{}, new Map()],
      [
        {a: 1, b: 0},
        new Map([
          ['a', 1],
          ['b', 0],
        ]),
      ],
    ],
    invalid: __.concat(nullishCases, stringCases, booleanCases, optionalInts),
  })

  runWith('dict<int?>', Parse.dict(Parse.int.optional), {
    valid: [
      [
        {a: undefined, b: 0},
        new Map([
          ['a', undefined],
          ['b', 0],
        ]),
      ],
      [{}, new Map()],
      [
        {a: 1, b: 0},
        new Map([
          ['a', 1],
          ['b', 0],
        ]),
      ],
    ],
    invalid: __.concat(nullishCases, stringCases, booleanCases),
  })

  //
  // Maps
  //
  run(
    'fooBar<foo: string, bar: string>',
    Parse.map(
      function fooBar(foo, bar) {
        return {foo, bar}
      },
      [Parse.field('foo', Parse.string), Parse.field('bar', Parse.string)],
    ),
    {
      valid: [{foo: 'bar', bar: 'baz'}],
      invalid: __.concat(
        nullishCases,
        stringCases,
        booleanCases,
        optionalInts,
        {},
        {foo: 1, bar: 0},
      ),
    },
  )

  //
  // Tuples
  //
  run('(int, string)', Parse.tuple([Parse.int, Parse.string]), {
    valid: [[1, 'test']],
    invalid: __.concat(
      nullishCases,
      stringCases,
      booleanCases,
      optionalInts,
      [],
      ['', ''],
      ['test', 1],
      [1, 1],
    ),
  })

  //
  // Objects
  //
  run(
    '{foo: string, bar: float?}',
    Parse.object([
      ['foo', Parse.string],
      ['bar', Parse.float.optional],
    ]),
    {
      valid: [{foo: 'bar', bar: 123}, {foo: 'bar', bar: undefined}, {foo: 'bar'}],
      invalid: __.concat(
        nullishCases,
        stringCases,
        booleanCases,
        optionalInts,
        {},
        {foo: 'bar', bar: ''},
      ),
    },
  )

  //
  // One Of
  //
  run('string | int', Parse.oneOf([Parse.string, Parse.int]), {
    valid: __.concat(stringCases, intCases),
    invalid: __.concat(nullishCases, booleanCases, optionalInts, containerCases),
  })

  //
  // Partials
  //
  runWith(
    '{foo: string, bar: float?, ...{baz: string | int | undefined}}',
    Parse.partial(
      [
        ['foo', Parse.string],
        ['bar', Parse.float.optional],
      ],
      Parse.object([['baz', Parse.oneOf([Parse.string, Parse.int]).optional]]),
    ),
    {
      valid: [
        [{foo: '', bar: 0, baz: ''}, [{foo: '', bar: 0}, {baz: ''}]],
        [{foo: '', bar: undefined, baz: 1}, [{foo: ''}, {baz: 1}]],
        [{foo: '', baz: 1}, [{foo: '', bar: undefined}, {baz: 1}]],
        [{foo: '', bar: 0}, [{foo: '', bar: 0}, {}]],
        [{foo: '', bar: 0, baz: undefined}, [{foo: '', bar: 0}, {baz: undefined}]],
        [{foo: '', baz: undefined}, [{foo: ''}, {baz: undefined}]],
        [{foo: ''}, [{foo: ''}, {}]],
      ],
      invalid: __.concat(nullishCases, booleanCases, optionalInts, containerCases),
    },
  )

  run(
    'FBZ<{foo: string, bar: float?, ...{baz: string | int?}}>',
    Parse.map(
      function FBZ([lhs, rhs]: [
        {foo: string; bar?: number | undefined},
        {baz?: string | number | undefined},
      ]) {
        return {
          ...lhs,
          ...rhs,
        }
      },
      [
        Parse.partial(
          [
            ['foo', Parse.string],
            ['bar', Parse.float.optional],
          ],
          Parse.object([['baz', Parse.oneOf([Parse.string, Parse.int]).optional]]),
        ),
      ],
    ),
    {
      valid: [
        {foo: '', bar: 0, baz: ''},
        {foo: '', bar: undefined, baz: 1},
        {foo: '', baz: 1},
        {foo: '', bar: 0},
        {foo: '', bar: 0, baz: undefined},
        {foo: '', baz: undefined},
        {foo: ''},
      ],
      invalid: __.concat(nullishCases, booleanCases, optionalInts, containerCases),
    },
  )

  describe('Operations', () => {
    it('has a description', () => {
      const parser = Parse.attempt(() => {}).describe('description')
      expect(parser.description).toEqual('description')
    })
    it('keeps its description', () => {
      const parser1 = Parse.attempt(() => {}).describe('description1')
      const parser2 = parser1.describe('description2').then('foo', (i: any) => i)
      const parser3 = parser1
        .describe('description_')
        .then('foo', (i: any) => i)
        .describe('description3')
      expect(parser1.description).toEqual('description1')
      expect(parser2.description).toEqual('description2')
      expect(parser3.description).toEqual('description3')
    })
  })

  describe('Error messages', () => {
    expect(Parse.string(123)).toMatchObject(err({message: `parser 'string' failed: not a string`}))
    expect(Parse.string.required(123)).toMatchObject(
      err({message: `parser 'required<string>' failed: not a string`}),
    )
    expect(Parse.string.required('')).toMatchObject(
      err({message: `parser 'required<string>' failed: required string is empty`}),
    )
    expect(Parse.string.required('  ')).toMatchObject(
      err({message: `parser 'required<string>' failed: required string is only whitespace`}),
    )
    const foo: any = Parse.array(Parse.string)([123, ''])
    expect(foo).toMatchObject(
      err({
        message: `
parser 'array<string>' failed:
  parser 'string' failed: not a string`.slice(1),
      }),
    )
    expect(Parse.array(Parse.string)([123, null])).toMatchObject(
      err({
        message: `
parser 'array<string>' failed:
  parser 'string' failed: not a string
  parser 'string' failed: not a string`.slice(1),
      }),
    )
  })
})
