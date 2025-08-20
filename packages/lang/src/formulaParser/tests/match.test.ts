import {c, cases} from '@extra-lang/cases'
import {type TypeRuntime, type ValueRuntime} from '../../runtime'
import {privateOneOf} from '../../tests/privateOneOf'
import * as Types from '../../types'
import * as Values from '../../values'
import {parse} from '../../formulaParser'
import {type Expression} from '../expressions'
import {mockTypeRuntime} from '../../tests/mockTypeRuntime'
import {mockValueRuntime} from '../../tests/mockValueRuntime'

let runtimeTypes: {[K in string]: [Types.Type, Values.Value]}

let typeRuntime: TypeRuntime
let valueRuntime: ValueRuntime

const valueFalse = Values.FalseValue
const valueTrue = Values.TrueValue
const valueNull = Values.NullValue

beforeEach(() => {
  runtimeTypes = {}
  typeRuntime = mockTypeRuntime(runtimeTypes)
  valueRuntime = mockValueRuntime(runtimeTypes)
  ;(_ => {})(valueRuntime)
})

/**
 * Used in the match eval tests
 */
function truthyFalsey(
  name: string,
  {truthy: fetchTruthy, falsey: fetchFalsey}: {truthy: boolean; falsey: boolean},
  expression: Expression,
  runtime: TypeRuntime,
) {
  const truthy = fetchTruthy ? expression.assumeTrue(runtime).get() : undefined
  const falsey = fetchFalsey ? expression.assumeFalse(runtime).get() : undefined
  return {
    truthy: truthy?.getLocalType(name) ?? Types.never(),
    falsey: falsey?.getLocalType(name) ?? Types.never(),
  }
}

describe('match operator', () => {
  describe('parse', () => {
    cases<[string] | [string, string]>(
      c(['foo is _']),
      c(['foo is Int']),
      c(['foo is Int(>=0)']),
      c(['foo is true']),
      c(['foo is false']),
      c(['foo is null']),
      c(['foo is 0']),
      c(['foo is 0 | 1 | 2', '(is foo (0 | 1 | 2))']),
      c(["foo is 'test'"]),
      c(['foo is .some']),
      c(['foo is .some(_)']),
      c(['foo is .some(_, _)']),
      c(['foo is .some(value)']),
      c(['foo is .some(name: value, value2)']),
      c(['foo is .some(value, ...)']),
      c(['foo is .some(...)']),
      c(['foo is .some(name: value, ...)']),
      c(["foo is 'a' | 'b' | 'c'", "(is foo ('a' | 'b' | 'c'))"]),
      c(["foo is 'test' .. value"]),
      c(["foo is value .. 'test'"]),
      c(["foo is value1 .. 'test' .. value2 .. 'test'"]),
      c(['foo is []']),
      c(['foo is [_, ...]']),
      c(['foo is [value, ...]']),
      c(['foo is [value1, value2, ...]']),
      c(['foo is [value1, ..., value2]']),
      c(['foo is [value1, ...value2, value3]']),
      c(['foo is [value1, ...value2]']),
      c(['foo is [a] or foo is [a, _]']),
      c(['foo is /a/']),
      c(['foo is /(?<name>a+)/']),
      c.skip(['foo is {}']),
      c.skip(['foo is {name: name}']),
      c.skip(['foo is {name: _}']),
    ).run(([formula, expectedLisp], {only, skip}) => {
      ;(only ? it.only : skip ? it.skip : it)(`should parse formula '${formula}'`, () => {
        const expectedCode = formula

        let expression: Expression = parse(formula).get()
        expect(expression.toCode()).toEqual(expectedCode)
        if (expectedLisp) {
          expect(expression.toLisp()).toEqual(expectedLisp)
        }
      })
    })
  })

  describe('getType / eval', () => {
    const Ints = Types.enumType([Types.enumCase('zero'), Types.enumCase('one')])
    const LiteralInts = Types.oneOf([Types.literal(0), Types.literal(1)])
    beforeEach(() => {
      runtimeTypes['Ints'] = [Types.typeConstructor('Ints', Ints), Values.string('test')]
      runtimeTypes['LiteralInts'] = [
        Types.typeConstructor('LiteralInts', LiteralInts),
        Values.string('test'),
      ]
    })

    cases<
      [
        Types.Type,
        [Values.Value, Values.Value][],
        string,
        {
          truthy?: Types.Type | undefined
          falsey?: Types.Type | undefined
          reverse?: false
          fetch?: string
        },
      ]
    >(
      c([
        Types.oneOf([Types.string(), Types.int(), Types.nullType()]),
        [
          [Values.int(0), valueTrue],
          [Values.string('1'), valueTrue],
          [Values.nullValue(), valueTrue],
        ],
        'foo is _',
        {
          truthy: Types.oneOf([Types.string(), Types.int(), Types.nullType()]),
          falsey: Types.never(),
        },
      ]),
      // I think this should be prevented by the compiler - and in most cases
      // _it is_ (in 'if', 'and', 'or', 'not' operations), but 'assumeFalse'
      // still needs to work, if only to return 'never' for the subject.
      c([
        Types.oneOf([Types.string(), Types.int(), Types.nullType()]),
        [
          [Values.int(0), Values.int(0)],
          [Values.string('1'), Values.string('1')],
          [Values.nullValue(), Values.nullValue()],
        ],
        'foo is bar and bar',
        {
          truthy: Types.oneOf([Types.string({min: 1}), Types.int()]),
          falsey: Types.never(),
          reverse: false,
        },
      ]),
      c([
        Types.oneOf([Types.string(), Types.int(), Types.nullType()]),
        [
          [Values.int(0), Values.FalseValue],
          [Values.string('1'), Values.FalseValue],
          [Values.nullValue(), Values.FalseValue],
        ],
        'foo !is bar',
        {
          truthy: Types.never(),
          falsey: Types.oneOf([Types.string(), Types.int(), Types.nullType()]),
          reverse: false,
        },
      ]),
      c([
        Types.oneOf([Types.string(), Types.int()]),
        [
          [Values.int(0), valueTrue],
          [Values.int(1), valueTrue],
          [Values.string('1'), valueFalse],
        ],
        'foo is Int',
        {
          truthy: Types.int(),
          falsey: Types.string(),
        },
      ]),
      c([
        Types.optional(Types.string()),
        [
          [valueNull, valueFalse],
          [Values.string(''), valueTrue],
          [Values.string('1'), valueTrue],
        ],
        'foo is String',
        {
          truthy: Types.string(),
          falsey: Types.nullType(),
        },
      ]),
      c([
        Types.optional(Types.string()),
        [
          [valueNull, valueFalse],
          [Values.string(''), Values.string('')],
          [Values.string('1'), Values.string('1')],
        ],
        'foo is String and foo',
        {
          truthy: Types.string({min: 1}),
          falsey: Types.optional(Types.literal('')),
          reverse: false,
        },
      ]),
      c([
        Types.optional(Types.string()),
        [
          [valueNull, valueFalse],
          [Values.string(''), Values.int(0)],
          [Values.string('1'), Values.int(1)],
        ],
        'foo is String and foo.length',
        {
          truthy: Types.string({min: 1}),
          falsey: Types.optional(Types.literal('')),
          reverse: false,
        },
      ]),
      c([
        Types.array(Types.oneOf([Types.string(), Types.int()])),
        [
          [Values.array([Values.int(0)]), valueTrue],
          [Values.array([Values.float(1)]), valueFalse],
          [Values.array([Values.string('1')]), valueFalse],
        ],
        'foo is Array(Int)',
        {
          truthy: Types.array(Types.int()),
          falsey: Types.array(Types.oneOf([Types.string(), Types.int()])),
        },
      ]),
      c([
        Types.oneOf([Types.string(), Types.int()]),
        // don't need to test values again
        [],
        'foo is Array(Int)',
        {
          truthy: Types.never(),
          falsey: Types.oneOf([Types.string(), Types.int()]),
        },
      ]),
      c([
        Types.oneOf([Types.array(Types.string()), Types.array(Types.int())]),
        // don't need to test values again
        [],
        'foo is Array(Int) as a',
        {
          truthy: Types.array(Types.int()),
          falsey: Types.array(Types.string()),
        },
      ]),
      // user-type test
      c([
        Types.optional(Ints),
        // TODO: test enum values
        [],
        'foo is Ints',
        {
          truthy: Ints,
          falsey: Types.nullType(),
        },
      ]),
      c([
        Types.optional(Ints),
        [
          // TODO: enum values
          // [valueNull, valueNull],
        ],
        'foo is .one',
        {
          truthy: Ints,
          falsey: Types.optional(Ints),
        },
      ]),
      c.skip([
        Types.optional(LiteralInts),
        [
          [valueNull, valueFalse],
          [Values.int(0), valueTrue],
          [Values.int(1), valueTrue],
          [Values.int(2), valueFalse],
          [Values.float(1), valueFalse],
        ],
        'foo is LiteralInts',
        {
          truthy: LiteralInts,
          falsey: Types.nullType(),
        },
      ]),
      c([
        Types.oneOf([Types.string(), Types.int()]),
        [
          [Values.string('0'), valueFalse],
          [Values.int(0), valueTrue],
        ],
        'foo is 0',
        {
          truthy: Types.literal(0),
          falsey: Types.oneOf([Types.string(), Types.int({max: -1}), Types.int({min: 1})]),
        },
      ]),
      c([
        Types.oneOf([Types.string(), Types.float()]),
        [
          [Values.string('0'), valueFalse],
          [Values.int(0), valueTrue],
          [Values.float(0), valueTrue],
        ],
        'foo is 0.0',
        {
          truthy: Types.literal(0, 'float'),
          falsey: Types.oneOf([Types.string(), Types.float()]),
        },
      ]),
      c([
        Types.oneOf([Types.string(), Types.int()]),
        [
          [Values.string('0'), valueFalse],
          [Values.int(-1), valueFalse],
          [Values.int(0), valueTrue],
          [Values.int(1), valueTrue],
          [Values.int(2), valueTrue],
          [Values.int(3), valueFalse],
        ],
        'foo is 0 | 1 | 2',
        {
          truthy: Types.oneOf([Types.literal(0), Types.literal(1), Types.literal(2)]),
          falsey: Types.oneOf([Types.string(), Types.int()]),
        },
      ]),
      c([
        Types.oneOf([
          Types.string(),
          Types.literal(0, 'float'),
          Types.literal(1, 'float'),
          Types.literal(2, 'float'),
        ]),
        [
          [Values.string('0'), valueFalse],
          [Values.int(-1), valueFalse],
          [Values.int(0), valueTrue],
          [Values.int(1), valueTrue],
          [Values.int(2), valueTrue],
          [Values.int(3), valueFalse],
          [Values.float(-1), valueFalse],
          [Values.float(0), valueFalse],
          [Values.float(1), valueFalse],
          [Values.float(2), valueFalse],
          [Values.float(3), valueFalse],
        ],
        'foo is 0 | 1 | 2',
        {
          truthy: Types.oneOf([Types.literal(0), Types.literal(1), Types.literal(2)]),
          falsey: Types.oneOf([
            Types.string(),
            Types.literal(0, 'float'),
            Types.literal(1, 'float'),
            Types.literal(2, 'float'),
          ]),
        },
      ]),
      c([
        Types.oneOf([Types.string(), Types.float()]),
        [
          [Values.string('0'), valueFalse],
          [Values.int(-1), valueFalse],
          [Values.int(0), valueTrue],
          [Values.int(1), valueTrue],
          [Values.int(2), valueTrue],
          [Values.int(3), valueFalse],
          [Values.float(-1), valueFalse],
          [Values.float(0), valueTrue],
          [Values.float(1), valueTrue],
          [Values.float(2), valueTrue],
          [Values.float(3), valueFalse],
        ],
        'foo is 0.0 | 1.0 | 2.0',
        {
          truthy: Types.oneOf([
            Types.literal(0, 'float'),
            Types.literal(1, 'float'),
            Types.literal(2, 'float'),
          ]),
          falsey: Types.oneOf([Types.string(), Types.float()]),
        },
      ]),
      c([
        Types.oneOf([Types.string(), Types.int()]),
        [
          [Values.int(-1), valueFalse],
          [Values.int(0), valueFalse],
          [Values.int(1), valueTrue],
        ],
        'foo is >0',
        {
          truthy: Types.int({min: 1}),
          falsey: Types.oneOf([Types.string(), Types.int({max: 0})]),
        },
      ]),
      c([
        Types.float(),
        [
          [Values.int(-1), valueFalse],
          [Values.float(-1), valueFalse],
          [Values.int(0), valueFalse],
          [Values.float(0), valueFalse],
          [Values.int(1), valueTrue],
          [Values.float(1), valueTrue],
        ],
        'foo is >0',
        {
          truthy: Types.float({min: [0]}),
          falsey: Types.float({max: 0}),
        },
      ]),
      c([
        Types.float(),
        [
          [Values.int(-1), valueFalse],
          [Values.float(-1), valueFalse],
          [Values.int(0), valueTrue],
          [Values.float(0), valueTrue],
          [Values.int(1), valueTrue],
          [Values.float(1), valueTrue],
        ],
        'foo is >=0',
        {
          truthy: Types.float({min: 0}),
          falsey: Types.float({max: [0]}),
        },
      ]),
      c([
        Types.float(),
        [
          [Values.int(-1), valueTrue],
          [Values.float(-1), valueTrue],
          [Values.int(0), valueFalse],
          [Values.float(0), valueFalse],
          [Values.int(1), valueFalse],
          [Values.float(1), valueFalse],
        ],
        'foo is <0',
        {
          truthy: Types.float({max: [0]}),
          falsey: Types.float({min: 0}),
        },
      ]),
      c([
        Types.float(),
        [
          [Values.int(-1), valueTrue],
          [Values.float(-1), valueTrue],
          [Values.int(0), valueTrue],
          [Values.float(0), valueTrue],
          [Values.int(1), valueFalse],
          [Values.float(1), valueFalse],
        ],
        'foo is <=0',
        {
          truthy: Types.float({max: 0}),
          falsey: Types.float({min: [0]}),
        },
      ]),
      c([
        Types.int(),
        [],
        'foo is >0 or foo is <0 or foo is =0',
        {
          truthy: Types.int(),
          falsey: Types.never(),
          reverse: false,
        },
      ]),
      c([
        Types.oneOf([Types.string(), Types.int()]),
        [],
        'foo is >0 or foo is <0 or foo is =0',
        {
          truthy: Types.int(),
          falsey: Types.string(),
          reverse: false,
        },
      ]),
      c([
        Types.int({min: 200}),
        [[Values.int(200), valueTrue]],
        'foo is >100',
        {
          truthy: Types.int({min: 200}),
          falsey: Types.never(),
        },
      ]),
      c([
        Types.intRange(),
        [
          [Values.range([Values.int(-10), false], [Values.int(0), false]), valueTrue],
          [Values.range([Values.int(0), false], [Values.int(10), false]), valueFalse],
          [Values.range([Values.int(0), false], undefined), valueFalse],
          [Values.range(undefined, [Values.int(0), false]), valueTrue],
          [Values.range([Values.int(0), false], [Values.int(0), false]), valueTrue],
        ],
        'foo is <10',
        {
          truthy: Types.intRange({max: 9}),
          falsey: Types.intRange({min: 10}),
        },
      ]),
      c([
        Types.intRange({min: 0}),
        // don't need to test values again
        [],
        'foo is <10',
        {
          truthy: Types.intRange({min: 0, max: 9}),
          falsey: Types.intRange({min: 10}),
        },
      ]),
      c([
        Types.intRange({max: 0}),
        // don't need to test values again
        [[valueNull, valueFalse]],
        'foo is <10',
        {
          truthy: Types.intRange({max: 0}),
          falsey: Types.never(),
        },
      ]),
      c([
        Types.intRange({max: 20}),
        // don't need to test values again
        [[valueNull, valueFalse]],
        'foo is <10',
        {
          truthy: Types.intRange({max: 9}),
          falsey: Types.intRange({min: 10, max: 20}),
        },
      ]),
      c([
        Types.int(),
        // don't need to test values again
        [],
        'foo is <0.5',
        {
          truthy: Types.int({max: 0}),
          falsey: Types.int({min: 1}),
        },
      ]),
      c([
        Types.int(),
        // don't need to test values again
        [],
        'foo is =0.5',
        {
          truthy: Types.never(),
          falsey: Types.int(),
        },
      ]),
      c([
        Types.oneOf([Types.string(), Types.int()]),
        // don't need to test values again
        [],
        'foo is >0',
        {
          truthy: Types.int({min: 1}),
          falsey: Types.oneOf([Types.string(), Types.int({max: 0})]),
        },
      ]),
      c([
        Types.intRange({min: 0, max: 5}),
        // don't need to test values again
        [],
        'foo is 0...3',
        {
          truthy: Types.intRange({min: 0, max: 3}),
          falsey: Types.intRange({min: 4, max: 5}),
        },
      ]),
      c([
        Types.int(),
        // don't need to test values again
        [
          [Values.int(0), valueFalse],
          [Values.int(1), valueFalse],
          [Values.int(2), valueTrue],
          [Values.int(4), valueTrue],
          [Values.int(5), valueFalse],
        ],
        'foo is 1<..4',
        {
          truthy: Types.int({min: 2, max: 4}),
          falsey: Types.oneOf([Types.int({max: 1}), Types.int({min: 5})]),
        },
      ]),
      c([
        Types.float(),
        [
          [Values.float(-1), valueFalse],
          [Values.int(-1), valueFalse],
          [Values.float(0), valueTrue],
          [Values.int(0), valueTrue],
          [Values.float(1), valueTrue],
          [Values.int(1), valueTrue],
          [Values.float(4), valueTrue],
          [Values.int(4), valueTrue],
          [Values.float(10), valueTrue],
          [Values.int(10), valueTrue],
          [Values.float(11), valueFalse],
          [Values.int(11), valueFalse],
        ],
        'foo is 0...10',
        {
          truthy: Types.float({min: 0, max: 10}),
          falsey: Types.oneOf([Types.float({max: [0]}), Types.float({min: [10]})]),
        },
      ]),
      c([
        Types.oneOf([Types.string(), Types.int()]),
        [
          [Values.int(0), valueFalse],
          [Values.string('0'), valueFalse],
          [Values.string('test'), valueTrue],
        ],
        "foo is 'test'",
        {
          truthy: Types.literal('test'),
          falsey: Types.oneOf([Types.string(), Types.int()]),
        },
      ]),
      c([
        Types.oneOf([Types.string(), Types.int()]),
        [
          [Values.int(0), valueFalse],
          [Values.string('0'), valueFalse],
          [Values.string('test'), valueTrue],
        ],
        'foo is /test/',
        {
          truthy: Types.string({regex: [/test/]}),
          falsey: Types.oneOf([Types.string(), Types.int()]),
        },
      ]),
      c([
        Types.oneOf([Types.string(), Types.int()]),
        [
          [Values.int(0), valueFalse],
          [Values.string('0'), valueFalse],
          [Values.string(''), valueFalse],
          [Values.string(' <bar> '), Values.string('bar')],
          [Values.string('<div>'), Values.string('div')],
        ],
        'foo is /<(?<foo>\\w*)>/ and foo',
        {
          // the regex by itself only guarantees regex: [...], the min: 1 comes
          // from 'and foo'
          truthy: Types.string({min: 1, regex: [/\w*/]}),
          falsey: Types.oneOf([Types.string(), Types.int()]),
          reverse: false,
        },
      ]),
      c([
        Types.oneOf([Types.string(), Types.int()]),
        [
          [Values.int(0), Values.int(0)],
          [Values.int(-1), Values.int(-1)],
          [Values.int(1), Values.int(1)],
          [Values.string('0'), Values.string('0')],
          [Values.string(''), Values.string('')],
          [Values.string(' <bar> '), Values.TrueValue],
          [Values.string('<div>'), Values.TrueValue],
        ],
        'foo is /<(?<foo>\\w+)>/ or foo',
        {
          truthy: Types.oneOf([
            Types.string({regex: [/\w+/]}),
            Types.string({min: 1}),
            Types.int(),
          ]),
          falsey: Types.oneOf([Types.literal(''), Types.literal(0)]),
          reverse: false,
        },
      ]),
      c([
        Types.oneOf([Types.string(), Types.int()]),
        // don't need to test values again
        [],
        'foo is /<(?<foo>\\w+)>/ or !foo',
        {
          truthy: privateOneOf(
            //
            Types.literal(''),
            Types.string({regex: [/\w+/]}),
            Types.literal(0),
          ),
          falsey: Types.oneOf([Types.string({min: 1}), Types.int()]),
          reverse: false,
        },
      ]),
      c([
        Types.oneOf([Types.string(), Types.int()]),
        // don't need to test values again
        [],
        'foo !is /<(?<foo>\\w+)>/ and foo',
        {
          // this one took me a bit - but yes; the inverse case is:
          //     foo !is /.../ and foo
          // if this is true, then foo didn't match the regex, but it *is*
          // truthy, ie `String(length: >=1) | Int()`
          // if this is false, that means *the first condition* as false, ie
          // `foo is /.../` - it matched!
          //
          // OK so why is min: 0? because we don't eval the rhs of the 'and',
          // and matching the regex doesn't guarantee string length (this would
          // involve parsing the regex to make sure it always matches N
          // characters)
          truthy: Types.oneOf([Types.string({min: 1}), Types.int()]),
          falsey: privateOneOf(
            //
            Types.literal(''),
            Types.string({regex: [/\w+/]}),
            Types.literal(0),
          ),
          reverse: false,
        },
      ]),
      c([
        Types.oneOf([Types.string(), Types.int({min: 0})]),
        // don't need to test values again
        [],
        'foo is /<(?<foo>\\w+)>/ and foo',
        {
          // the regex by itself only guarantees regex: [...], the min: 1 comes
          // from 'and foo'
          truthy: Types.string({min: 1, regex: [/\w+/]}),
          falsey: Types.oneOf([Types.string(), Types.int({min: 0})]),
          reverse: false,
        },
      ]),
      c([
        Types.oneOf([Types.string(), Types.int({min: 0})]),
        [
          [Values.int(0), Values.TrueValue],
          [Values.int(1), valueFalse],
          [Values.string(''), Values.TrueValue],
          [Values.string('0'), valueFalse],
          [Values.string('<div>'), Values.TrueValue],
          [Values.string(' <div>'), Values.TrueValue],
          [Values.string('<div> '), Values.TrueValue],
        ],
        '!foo or foo is /<(?<foo>\\w+)>/',
        {
          truthy: Types.oneOf([
            Types.literal(''),
            Types.string({regex: [/\w+/]}),
            Types.literal(0),
          ]),
          falsey: Types.oneOf([Types.string({min: 1}), Types.int({min: 1})]),
          reverse: false,
        },
      ]),
      c([
        Types.array(Types.string()),
        [
          [Values.array([]), valueFalse],
          [Values.array([Values.string('one')]), valueTrue],
          [Values.array([Values.string('one'), Values.string('two')]), valueFalse],
        ],
        'foo is [_]',
        {
          truthy: Types.array(Types.string(), {min: 1, max: 1}),
          falsey: Types.oneOf([
            Types.array(Types.string(), {max: 0}),
            Types.array(Types.string(), {min: 2}),
          ]),
          reverse: false,
        },
      ]),
      c([
        Types.array(Types.string()),
        [
          [Values.array([]), Values.array([])],
          [Values.array([Values.string('one')]), valueTrue],
          [
            Values.array([Values.string('one'), Values.string('two')]),
            Values.array([Values.string('one'), Values.string('two')]),
          ],
        ],
        'foo is [_] or foo',
        {
          truthy: Types.array(Types.string(), {min: 1}),
          falsey: Types.array(Types.string(), {max: 0}),
          reverse: false,
        },
      ]),
      c([
        Types.array(Types.string()),
        [
          [Values.array([]), valueTrue],
          [Values.array([Values.string('one')]), valueTrue],
          [Values.array([Values.string('one'), Values.string('two')]), valueFalse],
        ],
        'foo is [_] or !foo',
        {
          truthy: Types.array(Types.string(), {min: 0, max: 1}),
          falsey: Types.array(Types.string(), {min: 2}),
          reverse: false,
        },
      ]),
      c([
        Types.array(Types.string()),
        [
          [Values.array([]), valueFalse],
          [Values.array([Values.string('one')]), Values.string('one')],
          [Values.array([Values.string('')]), Values.string('')],
          [Values.array([Values.string('one'), Values.string('two')]), valueFalse],
        ],
        'foo is [bar] and bar',
        {
          truthy: Types.array(Types.string(), {min: 1, max: 1}),
          falsey: Types.array(Types.string()),
          reverse: false,
        },
      ]),
      c([
        Types.array(Types.string()),
        [
          [Values.array([]), valueFalse],
          [Values.array([Values.string('one')]), Values.string('one')],
          [Values.array([Values.string('')]), Values.string('')],
          [Values.array([Values.string('one'), Values.string('two')]), valueFalse],
        ],
        'foo is [bar] and bar',
        {
          truthy: Types.string({min: 1}),
          reverse: false,
          fetch: 'bar',
        },
      ]),
      c([
        Types.array(Types.string()),
        [],
        'foo is [_] or foo is [_, _]',
        {
          truthy: Types.array(Types.string(), {min: 1, max: 2}),
          falsey: Types.oneOf([
            Types.array(Types.string(), {max: 0}),
            Types.array(Types.string(), {min: 3}),
          ]),
          reverse: false,
        },
      ]),
      c([
        Types.oneOf([
          Types.array(Types.oneOf([Types.string(), Types.int()])),
          Types.array(Types.booleanType()),
        ]),
        [],
        'foo is [_] or foo is [_, _]',
        {
          truthy: Types.oneOf([
            Types.array(Types.booleanType(), {min: 1, max: 2}),
            Types.array(Types.oneOf([Types.string(), Types.int()]), {min: 1, max: 2}),
          ]),
          falsey: Types.oneOf([
            Types.oneOf([
              Types.array(Types.booleanType(), {max: 0}),
              Types.array(Types.oneOf([Types.string(), Types.int()]), {max: 0}),
            ]),
            Types.oneOf([
              Types.array(Types.booleanType(), {min: 3}),
              Types.array(Types.oneOf([Types.string(), Types.int()]), {min: 3}),
            ]),
          ]),
          reverse: false,
        },
      ]),
      c([
        Types.array(Types.string()),
        [],
        'foo is [bar] or foo is [bar, _]',
        {
          truthy: Types.array(Types.string(), {min: 1, max: 2}),
          falsey: Types.oneOf([
            Types.array(Types.string(), {min: 0, max: 0}),
            Types.array(Types.string(), {min: 3}),
          ]),
          reverse: false,
        },
      ]),
      c([
        Types.array(Types.string()),
        [],
        'foo is [bar] or foo is [bar, _]',
        {
          truthy: Types.string(),
          falsey: Types.never(),
          reverse: false,
          fetch: 'bar',
        },
      ]),
      c([
        Types.array(Types.string()),
        [],
        'foo is [_] or !foo',
        {
          truthy: Types.array(Types.string(), {max: 1}),
          falsey: undefined,
          reverse: false,
        },
      ]),
    ).run(([fooType, values, formula, expectedTypes], {only, skip}) => {
      const fetch = expectedTypes.fetch ?? 'foo'
      describe(`(foo: ${fooType}) '${formula}'`, () => {
        ;(only ? it.only : skip ? it.skip : it)(
          `${fetch === 'foo' ? '' : fetch + ': '}truthy: ${expectedTypes.truthy}, falsey: ${expectedTypes.falsey}`,
          () => {
            runtimeTypes['foo'] = [fooType, valueNull]
            const expression = parse(formula).get()
            const {truthy, falsey} = truthyFalsey(
              fetch,
              {
                truthy: expectedTypes.truthy !== undefined,
                falsey: expectedTypes.falsey !== undefined,
              },
              expression,
              typeRuntime,
            )
            if (expectedTypes.truthy) {
              expect(truthy).toEqual(expectedTypes.truthy)
            }
            if (expectedTypes.falsey) {
              expect(falsey).toEqual(expectedTypes.falsey)
            }
          },
        )

        if (expectedTypes.reverse ?? true) {
          const notIsFormula = formula.replace(' is ', ' !is ')
          const expectedTruthy = expectedTypes.falsey
          const expectedFalsey = expectedTypes.truthy
          ;(only ? it.only : skip ? it.skip : it)(
            `notIsFormula => ${fetch === 'foo' ? '' : fetch + ': '}truthy: ${expectedTruthy}, falsey: ${expectedFalsey}`,
            () => {
              expect(formula.split(' is ').length).toEqual(2)
              runtimeTypes['foo'] = [fooType, valueNull]
              const expression = parse(notIsFormula).get()
              const {truthy, falsey} = truthyFalsey(
                fetch,
                {truthy: expectedTruthy !== undefined, falsey: expectedFalsey !== undefined},
                expression,
                typeRuntime,
              )
              if (expectedTruthy) {
                expect(truthy).toEqual(expectedTruthy)
              }
              if (expectedFalsey) {
                expect(falsey).toEqual(expectedFalsey)
              }
            },
          )
        }

        if (values.length) {
          describe(`${fetch === 'foo' ? '' : fetch + ': '} values`, () => {
            for (const [fooValue, expected] of values) {
              ;(only ? it.only : skip ? it.skip : it)(
                `foo = ${fooValue}, expected = ${expected}`,
                () => {
                  runtimeTypes['foo'] = [fooType, fooValue]
                  runtimeTypes['bar'] = [Types.classType({name: 'Bar'}), valueNull]
                  const expression = parse(formula).get()
                  valueRuntime = mockValueRuntime(runtimeTypes)
                  expect(expression.eval(valueRuntime).get()).toEqual(expected)
                },
              )
            }
          })
        }
      })
    })

    cases<[Types.Type, string, Types.Type, string]>(
      c([
        Types.optional(Types.string()),
        'foo is String and foo.length',
        Types.oneOf([Types.literal(false), Types.int({min: 0})]),
        'foo.length',
      ]),
      c([
        Types.object([Types.namedProp('bar', Types.oneOf([Types.string(), Types.int()]))]),
        'foo.bar is String and foo.bar.length',
        Types.oneOf([Types.literal(false), Types.int({min: 0})]),
        'foo.bar.length',
      ]),
      c([
        Types.object([
          Types.namedProp(
            'bar',
            Types.object([Types.namedProp('baz', Types.oneOf([Types.string(), Types.int()]))]),
          ),
        ]),
        'foo.bar.baz is String and foo.bar.baz.length',
        Types.oneOf([Types.literal(false), Types.int({min: 0})]),
        'foo.bar.baz.length',
      ]),
    ).run(([fooType, formula, expectedType, expectedFail], {only, skip}) =>
      (only ? it.only : skip ? it.skip : it)(
        `(foo: ${fooType}) '${formula}' => ${expectedType} (and fails on ${expectedFail})`,
        () => {
          runtimeTypes['foo'] = [fooType, valueNull]
          expect(() => {
            const expression = parse(formula).get()
            const type = expression.getType(typeRuntime)
            expect(type.get()).toEqual(expectedType)
          }).not.toThrow("Property 'length' does not exist")

          if (expectedFail) {
            const failExpression = parse(expectedFail).get()
            expect(() => {
              failExpression.getType(typeRuntime).get()
            }).toThrow("Property 'length' does not exist")
          }
        },
      ),
    )
  })

  describe('invalid parse', () => {
    cases<[string, string]>(
      c([`foo is "$foo" .. value`, 'Interpolation is not enabled in this context']),
      c([
        `foo is value1 .. value2 .. "test"`,
        'In a match expression, after every reference you must concatenate a string',
      ]),
      c([`foo is value1 .. "" .. value2 .. "test"`, 'Empty string is invalid in match expression']),
      c([
        `foo is value1 .. "test" .. "test"`,
        'In a match expression, after every string you must concatenate a reference',
      ]),
      c(['foo is .some(value, value)', "Too many variables named 'value'"]),
      c(['foo is value .. "test" .. value', "Too many variables named 'value'"]),
      c(['foo is [value, ...value]', "Too many variables named 'value'"]),
    ).run(([formula, message], {only, skip}) =>
      (only ? it.only : skip ? it.skip : it)(`should not parse ${formula}`, () => {
        expect(() => {
          parse(formula).get()
        }).toThrow(message)
      }),
    )
  })

  describe('invalid getType', () => {
    cases<[string, [string, Types.Type][], string]>(
      //
      c.skip(['1 is .some(value)', [], "Invalid left hand side of 'is'"]),
      c([
        'foo is [bar] or foo',
        [['foo', Types.array(Types.string())]],
        "Invalid expressions in 'or'. 'foo is [bar]' assigns to 'bar', but 'foo' does not.",
      ]),
    ).run(([formula, values, message], {only, skip}) =>
      (only ? it.only : skip ? it.skip : it)(`should not parse ${formula}`, () => {
        expect(() => {
          values.forEach(([name, type]) => {
            runtimeTypes[name] = [type, Values.NullValue]
          })

          const expr = parse(formula).get()
          expr.assumeTrue(typeRuntime).get()
        }).toThrow(message)
      }),
    )
  })
})
