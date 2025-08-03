import {c, cases} from '@extra-lang/cases'
import {type TypeRuntime, type ValueRuntime} from '../../runtime'
import * as Types from '../../types'
import * as Values from '../../values'
import {parse} from '../../formulaParser'
import {type Expression} from '../expressions'
import {mockTypeRuntime} from '../../tests/mockTypeRuntime'
import {mockValueRuntime} from '../../tests/mockValueRuntime'

let runtimeTypes: {[K in string]: [Types.Type, Values.Value]}

let typeRuntime: TypeRuntime
let valueRuntime: ValueRuntime

beforeEach(() => {
  runtimeTypes = {}
  typeRuntime = mockTypeRuntime(runtimeTypes)
  valueRuntime = mockValueRuntime(runtimeTypes)
  ;(_ => {})(valueRuntime)
})

/**
 * Used in the match eval tests
 */
function truthyFalsey(name: string, expression: Expression, runtime: TypeRuntime) {
  const truthy = expression.assumeTrue(runtime).get()
  const falsey = expression.assumeFalse(runtime).get()
  return {truthy: truthy.getLocalType(name), falsey: falsey.getLocalType(name)}
}

describe('match operator', () => {
  // match is a really easy operator, so I'm not doing much parse checking
  describe('parse', () => {
    cases<[string] | [string, string]>(
      c(['foo is _']),
      c(['foo is Int']),
      c(['foo is Int(>=0)']),
      c(['foo is true']),
      c(['foo is false']),
      c(['foo is null']),
      c(['foo is 0']),
      c(["foo is 'test'"]),
      c(['foo is .some']),
      c(['foo is .some(_)']),
      c(['foo is .some(_, _)']),
      c(['foo is .some(value)']),
      c(['foo is .some(name: value, value2)']),
      c(['foo is .some(value, ...)']),
      c(['foo is .some(...)']),
      c(['foo is .some(name: value, ...)']),
      c(['foo is "test" <> value', "foo is 'test' <> value"]),
      c(['foo is value <> "test"', "foo is value <> 'test'"]),
      c([
        'foo is value1 <> "test" <> value2 <> "test"',
        "foo is value1 <> 'test' <> value2 <> 'test'",
      ]),
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
    ).run(([formula, expectedCode], {only, skip}) => {
      ;(only ? it.only : skip ? it.skip : it)(`should parse formula '${formula}'`, () => {
        expectedCode ??= formula

        let expression: Expression = parse(formula).get()
        expect(expression.toCode()).toEqual(expectedCode)
      })
    })
  })

  describe('getType', () => {
    const Ints = Types.enumType([Types.enumCase('zero'), Types.enumCase('one')])
    beforeEach(() => {
      runtimeTypes['Ints'] = [Types.typeConstructor('Ints', Ints), Values.string('test')]
      runtimeTypes['input'] = [Types.literal('test'), Values.string('test')]
    })

    cases<
      [
        Types.Type,
        string,
        {
          truthy: Types.Type
          falsey: Types.Type
          reverse?: false
        },
      ]
    >(
      c([
        Types.oneOf([Types.string(), Types.int()]),
        'foo is _',
        {
          truthy: Types.oneOf([Types.string(), Types.int()]),
          falsey: Types.oneOf([Types.string(), Types.int()]),
        },
      ]),
      c([
        Types.oneOf([Types.string(), Types.int()]),
        'foo is Int',
        {
          truthy: Types.int(),
          falsey: Types.string(),
        },
      ]),
      c([
        Types.optional(Types.string()),
        'foo is String',
        {
          truthy: Types.string(),
          falsey: Types.nullType(),
        },
      ]),
      c([
        Types.array(Types.oneOf([Types.string(), Types.int()])),
        'foo is Array(Int)',
        {
          truthy: Types.array(Types.int()),
          falsey: Types.array(Types.oneOf([Types.string(), Types.int()])),
        },
      ]),
      c([
        Types.oneOf([Types.string(), Types.int()]),
        'foo is Array(Int)',
        {
          truthy: Types.never(),
          falsey: Types.oneOf([Types.string(), Types.int()]),
        },
      ]),
      c([
        Types.oneOf([Types.array(Types.string()), Types.array(Types.int())]),
        'foo is Array(Int) as a',
        {
          truthy: Types.array(Types.int()),
          falsey: Types.array(Types.string()),
        },
      ]),
      c([
        Types.optional(Ints),
        'foo is Ints',
        {
          truthy: Ints,
          falsey: Types.nullType(),
        },
      ]),
      c([
        Types.optional(Ints),
        'foo is .one',
        {
          truthy: Ints,
          falsey: Types.optional(Ints),
        },
      ]),
      c([
        Types.oneOf([Types.string(), Types.int()]),
        'foo is 0',
        {
          truthy: Types.literal(0),
          falsey: Types.oneOf([Types.string(), Types.int()]),
        },
      ]),
      c([
        Types.oneOf([Types.string(), Types.int()]),
        'foo is >0',
        {
          truthy: Types.int({min: 1}),
          falsey: Types.oneOf([Types.string(), Types.int({max: 0})]),
        },
      ]),
      c([
        Types.int(),
        'foo is >0 or foo is <0 or foo is =0',
        {
          truthy: Types.int(),
          falsey: Types.never(),
          reverse: false,
        },
      ]),
      c([
        Types.oneOf([Types.string(), Types.int()]),
        'foo is >0 or foo is <0 or foo is =0',
        {
          truthy: Types.int(),
          falsey: Types.string(),
          reverse: false,
        },
      ]),
      c([
        Types.int({min: 200}),
        'foo is >100',
        {
          truthy: Types.int({min: 200}),
          falsey: Types.never(),
        },
      ]),
      c([
        Types.intRange({min: 0}),
        'foo is <10',
        {
          truthy: Types.never(),
          falsey: Types.intRange({min: 0}),
        },
      ]),
      c([
        Types.intRange({max: 0}),
        'foo is <10',
        {
          truthy: Types.intRange({max: 0}),
          falsey: Types.never(),
        },
      ]),
      c([
        Types.intRange({max: 20}),
        'foo is <10',
        {
          truthy: Types.intRange({max: 9}),
          falsey: Types.intRange({min: 10, max: 20}),
        },
      ]),
      c([
        Types.int(),
        'foo is <0.0',
        {
          truthy: Types.int({max: -1}),
          falsey: Types.int({min: 0}),
        },
      ]),
      c([
        Types.oneOf([Types.string(), Types.int()]),
        'foo is >0',
        {
          truthy: Types.int({min: 1}),
          falsey: Types.oneOf([Types.string(), Types.int({max: 0})]),
        },
      ]),
      c([
        Types.int(),
        'foo is 1<..4',
        {
          truthy: Types.int({min: 2, max: 4}),
          falsey: Types.int(),
        },
      ]),
      c([
        Types.int(),
        'foo is 0...10',
        {
          truthy: Types.int({min: 0, max: 10}),
          falsey: Types.int(),
        },
      ]),
      c([
        Types.oneOf([Types.string(), Types.int()]),
        "foo is 'test'",
        {
          truthy: Types.literal('test'),
          falsey: Types.oneOf([Types.string(), Types.int()]),
        },
      ]),
      c([
        Types.oneOf([Types.string(), Types.int()]),
        'foo is /test/',
        {
          truthy: Types.string({regex: [/test/]}),
          falsey: Types.oneOf([Types.string(), Types.int()]),
        },
      ]),
      c([
        Types.oneOf([Types.string(), Types.int()]),
        'foo is /<(?<foo>\\w+)>/ and foo',
        {
          // the regex by itself only guarantees regex: [...], the min: 1 comes
          // from 'and foo'
          truthy: Types.string({min: 1, regex: [/\w+/]}),
          falsey: Types.oneOf([Types.string(), Types.int()]),
          reverse: false,
        },
      ]),
      c([
        Types.oneOf([Types.string(), Types.int()]),
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
          falsey: Types.oneOf([Types.string(), Types.int()]),
          reverse: false,
        },
      ]),
      c([
        Types.oneOf([Types.string(), Types.int({min: 0})]),
        'foo is /<(?<foo>\\w+)>/ and foo',
        {
          // the regex by itself only guarantees regex: [...], the min: 1 comes
          // from 'and foo'
          truthy: Types.string({min: 1, regex: [/\w+/]}),
          falsey: Types.oneOf([Types.string(), Types.int({min: 0})]),
          reverse: false,
        },
      ]),
      c.only([
        Types.oneOf([Types.string(), Types.int({min: 0})]),
        'foo !is /<(?<foo>\\w+)>/ and foo',
        {
          truthy: Types.oneOf([Types.string({min: 1}), Types.int({min: 1})]),
          // in the false case:
          //   either `foo is /…/` (never the case for Int)
          //   _or_ `!foo` (Int => literal(0))
          falsey: Types.oneOf([Types.string(), Types.literal(0)]),
          reverse: false,
        },
      ]),
    ).run(([fooType, formula, expectedTypes], {only, skip}) => {
      ;(only ? it.only : skip ? it.skip : it)(
        `(foo: ${fooType}) '${formula}' => truthy: ${expectedTypes.truthy}, falsey: ${expectedTypes.falsey}`,
        () => {
          runtimeTypes['foo'] = [fooType, Values.nullValue()]
          const expression = parse(formula).get()
          const {truthy, falsey} = truthyFalsey('foo', expression, typeRuntime)
          // expect(truthy).toEqual(expectedTypes.truthy)
          expect(falsey).toEqual(expectedTypes.falsey)
        },
      )

      if (expectedTypes.reverse ?? true) {
        const notIsFormula = formula.replace(' is ', ' !is ')
        const expectedTruthy = expectedTypes.falsey
        const expectedFalsey = expectedTypes.truthy
        ;(only ? it.only : skip ? it.skip : it)(
          `(foo: ${fooType}) '${notIsFormula}' => truthy: ${expectedTruthy}, falsey: ${expectedFalsey}`,
          () => {
            expect(formula.split(' is ')).toEqual(2)
            runtimeTypes['foo'] = [fooType, Values.nullValue()]
            const expression = parse(notIsFormula).get()
            const {truthy, falsey} = truthyFalsey('foo', expression, typeRuntime)
            expect(truthy).toEqual(expectedTruthy)
            expect(falsey).toEqual(expectedFalsey)
          },
        )
      }
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
          runtimeTypes['foo'] = [fooType, Values.nullValue()]
          const expression = parse(formula).get()
          const type = expression.getType(typeRuntime)
          expect(type.get()).toEqual(expectedType)

          if (expectedFail) {
            const failExpression = parse(expectedFail).get()
            expect(() => {
              failExpression.getType(typeRuntime).get()
            }).toThrow("Property 'length' does not exist")
          }
        },
      ),
    )
    // describe('assigns enum values')
  })

  describe('invalid parse', () => {
    cases<[string, string]>(
      c([`foo is "$foo" <> value`, 'Interpolation is not enabled in this context']),
      c([
        `foo is value1 <> value2 <> "test"`,
        'In a match expression, after every reference you must concatenate a string',
      ]),
      c([`foo is value1 <> "" <> value2 <> "test"`, 'Empty string is invalid in match expression']),
      c([
        `foo is value1 <> "test" <> "test"`,
        'In a match expression, after every string you must concatenate a reference',
      ]),
      c(['foo is .some(value, value)', "Too many variables named 'value'"]),
      c(['foo is value <> "test" <> value', "Too many variables named 'value'"]),
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
    cases<[string, string]>(
      //
      c.skip(['1 is .some(value)', "Invalid left hand side of 'is'"]),
    ).run(([formula, message], {only, skip}) =>
      (only ? it.only : skip ? it.skip : it)(`should not parse ${formula}`, () => {
        expect(() => {
          const type = parse(formula).get().getType(typeRuntime)
          console.log('=========== match.test.ts at line 226 ===========')
          console.log({type})
        }).toThrow(message)
      }),
    )
  })
})
