import {c, cases} from '@extra-lang/cases'
import * as Types from '../../types'
import {type TypeRuntime, type ValueRuntime} from '../../runtime'
import {parse} from '../../formulaParser'
import * as Values from '../../values'
import {mockTypeRuntime} from '../../tests/mockTypeRuntime'
import {mockValueRuntime} from '../../tests/mockValueRuntime'

let typeRuntime: TypeRuntime
let valueRuntime: ValueRuntime
let runtimeTypes: {[K in string]: [Types.Type, Values.Value]}

beforeEach(() => {
  runtimeTypes = {}
  typeRuntime = mockTypeRuntime(runtimeTypes)
  valueRuntime = mockValueRuntime(runtimeTypes)
})

describe('getType', () => {
  describe('BooleanOperation', () => {
    it('true or false => Boolean', () => {
      const expression = parse('true or false').get()
      expect(expression.getType(typeRuntime).get()).toEqual(Types.literal(true))
    })

    it('true and false => Boolean', () => {
      const expression = parse('true and false').get()
      expect(expression.getType(typeRuntime).get()).toEqual(Types.literal(false))
    })

    it('not true => Boolean', () => {
      const expression = parse('not true').get()
      expect(expression.getType(typeRuntime).get()).toEqual(Types.literal(false))
    })

    it('false or stringVar => string', () => {
      runtimeTypes['stringVar'] = [Types.string(), Values.string('')]
      expect(parse('false or stringVar').get().getType(typeRuntime).get()).toEqual(Types.StringType)
    })
  })

  describe('FloatOperations', () => {
    cases<[string, Types.Type | undefined]>(
      c(['1 + 1', Types.literal(2)]),
      c(['1.1 + 1.1', Types.literal(2.2)]),
      c(['1 + 1.1', Types.literal(2.1)]),
      c(['1.1 + 1', Types.literal(2.1)]),
      c(['1.1 + "1"', undefined]),
      c(['10 - 1', Types.literal(9)]),
      c(['10.1 - 1.1', Types.literal(9, 'float')]),
      c(['10 - 1.1', Types.literal(8.9)]),
      c(['10.1 - 1', Types.literal(9.1)]),
      c(['10.1 - "1"', undefined]),
      c(['2 * 2', Types.literal(4)]),
      c(['2.25 * 2.25', Types.literal(5.0625)]),
      c(['4 * 2.5', Types.literal(10, 'float')]),
      c(['2.2 * 2', Types.literal(4.4)]),
      c(['2.2 * "2"', undefined]),
      c(['4 / 2', Types.literal(2)]),
      c(['4.4 / 1.1', Types.literal(4, 'float')]),
      c(['4 / 2.5', Types.literal(1.6)]),
      c(['4.4 / 2', Types.literal(2.2)]),
      c(['4.4 / "2"', undefined]),
      c(['40 % 7', Types.literal(5)]),
      c(['50.5 % 3.5', Types.literal(1.5)]),
      c(['5 % 7.5', Types.literal(5, 'float')]),
      c(['7.5 % 5', Types.literal(2.5)]),
      c(['5.5 % "7"', undefined]),
      c(['2 ** 8', Types.literal(256)]),
      c(['0.5 ** 2.0', Types.literal(0.25)]),
      c(['1 ** 1.1', Types.literal(1, 'float')]),
      c(['1.1 ** 1', Types.literal(1.1)]),
      c(['1.1 ** "1"', undefined]),
      c(['10 // 3', Types.literal(3)]),
      c(['10.0 // 3', Types.literal(3)]),
      c(['10 // 3.0', Types.literal(3)]),
      c(['-(1)', Types.literal(-1)]),
      c(['-(1.0)', Types.literal(-1, 'float')]),
      c(['-(1.1)', Types.literal(-1.1)]),
      c(['10 | 3', Types.literal(11)]),
      c(['10 & 3', Types.literal(2)]),
      c(['10 ^ 3', Types.literal(9)]),
      c(['~0b101', Types.literal(2)]),
      c(['~0b0101', Types.literal(10)]),
      c(['~0b00101', Types.literal(26)]),
      c(['~0x0a', Types.literal(245)]),
    ).run(([formula, type], {only, skip}) =>
      (only ? it.only : skip ? it.skip : it)(`operation ${formula}`, () => {
        const expression = parse(formula).get()
        if (type) {
          expect(expression.getType(typeRuntime).get()).toEqual(type)
        } else {
          expect(() => expression.getType(typeRuntime).get()).toThrow()
        }
      }),
    )

    it('1 // 1 => Int', () => {
      const expression = parse('1 // 1').get()
      expect(expression.getType(typeRuntime).get().isInt()).toBe(true)
      expect(expression.getType(typeRuntime).get().isFloat()).toBe(true)
    })

    it('1.0 // 1.0 => Int', () => {
      const expression = parse('1.0 // 1.0').get()
      expect(expression.getType(typeRuntime).get().isInt()).toBe(true)
    })

    it('-(1) => Int', () => {
      const expression = parse('-(1)').get()
      expect(expression.getType(typeRuntime).get().isInt()).toBe(true)
    })

    it('-(1.1) => Float', () => {
      const expression = parse('-(1.1)').get()
      expect(expression.getType(typeRuntime).get().isInt()).toBe(false)
      expect(expression.getType(typeRuntime).get().isFloat()).toBe(true)
    })
  })

  describe('ComparisonOperations', () => {
    describe('number comparisons', () => {
      cases<[string, Types.Type]>(
        // literals
        c(['1 == 1', Types.literal(true)]),
        c(['1 != 1', Types.literal(false)]),
        c(['1 == 0', Types.literal(false)]),
        c(['1 != 0', Types.literal(true)]),
        c(['1 > 1', Types.literal(false)]),
        c(['1 > 0', Types.literal(true)]),
        c(['1 >= 1', Types.literal(true)]),
        c(['1 >= 2', Types.literal(false)]),
        c(['1 <= 1', Types.literal(true)]),
        c(['1 <= 0', Types.literal(false)]),
        c(['1 < 1', Types.literal(false)]),
        c(['1 < 2', Types.literal(true)]),
        c(['10 <=> 20', Types.literal(-1)]),
        c(['20 <=> 10', Types.literal(1)]),
        c(['20 <=> 20', Types.literal(0)]),
        c(['"a" <=> "b"', Types.literal(-1)]),
        c(['"a" <=> "A"', Types.literal(-1)]),
        c(['"19" <=> "2"', Types.literal(1)]),
        // runtime types
        c(['a == b', Types.booleanType()]),
        c(['a != b', Types.booleanType()]),
        c(['a > b', Types.booleanType()]),
        c(['a >= b', Types.booleanType()]),
        c(['a <= b', Types.booleanType()]),
        c(['a < b', Types.booleanType()]),
        // different types
        c(['a == "dog"', Types.literal(false)]),
        c(['1 == "dog"', Types.literal(false)]),
        c(['1 != "dog"', Types.literal(true)]),
      ).run(([formula, expected], {only, skip}) =>
        (only ? it.only : skip ? it.skip : it)(
          `operation ${formula} should be type ${expected}`,
          () => {
            runtimeTypes['a'] = [Types.int(), Values.int(97)]
            runtimeTypes['b'] = [Types.int(), Values.int(98)]

            const expression1 = parse(formula).get()
            expect(expression1.getType(typeRuntime).get()).toEqual(expected)
          },
        ),
      )
    })

    describe('invalid comparisons', () => {
      cases<[string, boolean]>(
        c(['1 > "dog"', false]),
        c(['1 >= "dog"', true]),
        c(['1 <= "dog"', true]),
        c(['1 < "dog"', false]),
      ).run(([formula, expected], {only, skip}) =>
        (only ? it.only : skip ? it.skip : it)(`operation ${formula} should throw`, () => {
          const expression2 = parse(formula).get()
          expect(() => expression2.getType(typeRuntime).get()).toThrow()
        }),
      )
    })
  })

  describe('pipe operator', () => {
    it('"test" |> # <> "test" => String', () => {
      const expression = parse('"test" |> # <> "test"').get()
      expect(expression.getType(typeRuntime).get()).toEqual(Types.literal('testtest'))
    })

    it('1 |> # + 1 |> # * 2 => int', () => {
      const expression = parse('1 |> # + 1 |> # * 2').get()
      expect(expression.getType(typeRuntime).get()).toEqual(Types.literal(4))
    })
  })

  describe('StringTemplateOperation', () => {
    it('`test ${ing}` => String', () => {
      const expression = parse('`test ${ing}`').get()
      expect(expression.getType(typeRuntime).get()).toEqual(Types.string())
    })
  })

  describe('CoalescingOperation', () => {
    it('null ?? 1 => Int', () => {
      const expression = parse('null ?? 1').get()
      expect(expression.getType(typeRuntime).get()).toEqual(Types.literal(1))
    })

    describe('a ?? b', () => {
      it('=> a if a is not null', () => {
        runtimeTypes['a'] = [Types.int(), Values.int(1)]
        runtimeTypes['b'] = [Types.string(), Values.string('dog')]

        const expression = parse('a ?? b').get()
        expect(expression.getType(typeRuntime).get()).toEqual(Types.int())
      })

      it('=> b if a is only null', () => {
        runtimeTypes['a'] = [Types.nullType(), Values.nullValue()]
        runtimeTypes['b'] = [Types.string(), Values.string('dog')]

        const expression = parse('a ?? b').get()
        expect(expression.getType(typeRuntime).get()).toEqual(Types.string())
      })

      it('=> a|b if a is optional', () => {
        runtimeTypes['a'] = [Types.optional(Types.int()), Values.nullValue()]
        runtimeTypes['b'] = [Types.string(), Values.string('dog')]

        const expression = parse('a ?? b').get()
        expect(expression.getType(typeRuntime).get()).toEqual(
          Types.oneOf([Types.int(), Types.string()]),
        )
      })
    })

    it('1 ?? "str" => Int', () => {
      const expression = parse('1 ?? "str"').get()
      expect(expression.getType(typeRuntime).get()).toEqual(Types.literal(1))
    })
  })

  describe('AccessOperations', () => {
    beforeEach(() => {
      runtimeTypes['user'] = [
        Types.object([
          Types.namedProp('name', Types.string()),
          Types.namedProp(
            'foo',
            Types.object([Types.namedProp('bar', Types.optional(Types.string()))]),
          ),
          Types.namedProp(
            'FOO',
            Types.optional(Types.object([Types.namedProp('bar', Types.string())])),
          ),
        ]),
        Values.nullValue(),
      ]
    })

    it('anInt => anInt type (Int)', () => {
      runtimeTypes['anInt'] = [Types.int(), Values.int(1)]
      const expression = parse('anInt').get()
      expect(expression.getType(typeRuntime).get()).toEqual(Types.int())
    })

    it('user.name => user.name type (String)', () => {
      const expression = parse('user.name').get()
      expect(expression.getType(typeRuntime).get()).toEqual(Types.string())
    })

    it('user?.name => Expected a nullable', () => {
      const expression = parse('user?.name').get()
      expect(() => {
        expression.getType(typeRuntime).get()
      }).toThrow(
        "Expected a nullable type on left hand side of '?.' operator, found {name: String,",
      )
    })

    it('user?.foo.bar => Expected a nullable', () => {
      const expression = parse('user?.foo.bar').get()
      expect(() => {
        expression.getType(typeRuntime).get()
      }).toThrow(
        "Expected a nullable type on left hand side of '?.' operator, found {name: String,",
      )
    })

    it('user.foo?.bar => user.name type (String)', () => {
      debugger
      const expression = parse('user.foo?.bar').get()
      expect(() => {
        expression.getType(typeRuntime).get()
      }).toThrow("Expected a nullable type on left hand side of '?.' operator")
    })

    it('foo.name => throws', () => {
      const expression = parse('foo.name').get()
      expect(() => console.log(expression.getType(typeRuntime).get())).toThrow(
        "Cannot get type of variable named 'foo'",
      )
    })

    it('user.foo.bar => Optional(String)', () => {
      const expression = parse('user.foo.bar').get()
      expect(expression.getType(typeRuntime).get()).toEqual(Types.optional(Types.string()))
    })

    it('user.FOO.bar => Optional(String)', () => {
      const expression = parse('user.FOO.bar').get()
      expect(() => expression.getType(typeRuntime).get()).toThrow(
        "Property 'bar' does not exist on null",
      )
    })

    it('user.FOO?.bar => Optional(String)', () => {
      const expression = parse('user.FOO?.bar').get()
      expect(expression.getType(typeRuntime).get()).toEqual(Types.optional(Types.string()))
    })

    it('intThings[0] => intThings[0] type (Int)', () => {
      runtimeTypes['intThings'] = [
        Types.array(Types.int()),
        Values.array([Values.int(1), Values.int(2)]),
      ]
      const expression = parse('intThings[0]').get()
      expect(expression.getType(typeRuntime).get()).toEqual(Types.optional(Types.int()))
    })

    it.skip('this.arg => this.arg type (literal)', () => {
      runtimeTypes['this'] = runtimeTypes['user']
      const expression = parse('this.arg').get()
      expect(expression.getType(typeRuntime).get()).toEqual(Types.literal('argtype'))
    })
  })

  describe('type is operation', () => {
    cases<[string, Types.Type | undefined]>(c(['10 is Int', Types.booleanType()])).run(
      ([formula, type]) =>
        it(`operation ${formula}`, () => {
          const expression = parse(formula).get()
          if (type) {
            expect(expression.getType(typeRuntime).get()).toEqual(type)
          } else {
            expect(() => expression.getType(typeRuntime).get()).toThrow()
          }
        }),
    )
  })
})

describe('eval', () => {
  cases<[Values.Value, Values.Value, string, Values.Value]>(
    c([Values.NullValue, Values.int(5), 'lhs ?? rhs', Values.int(5)]),
    c([Values.NullValue, Values.int(5), 'lhs ?? null ?? rhs', Values.int(5)]),

    c([Values.int(0), Values.int(5), 'lhs or rhs', Values.int(5)]),
    c([Values.int(0), Values.FalseValue, 'lhs or rhs', Values.FalseValue]),
    c([Values.int(0), Values.int(5), 'lhs and rhs', Values.int(0)]),
    c([Values.int(0), Values.FalseValue, 'lhs and rhs', Values.int(0)]),
    c([Values.int(1), Values.FalseValue, 'lhs and rhs', Values.FalseValue]),
    c([Values.int(1), Values.int(5), 'lhs and rhs', Values.int(5)]),

    c([Values.int(1), Values.int(1), 'lhs == rhs', Values.TrueValue]),
    c([Values.int(1), Values.int(5), 'lhs == rhs', Values.FalseValue]),
    c([Values.int(1), Values.string('1'), 'lhs == rhs', Values.FalseValue]),
    c([Values.int(1), Values.int(1), 'lhs != rhs', Values.FalseValue]),
    c([Values.int(1), Values.int(5), 'lhs != rhs', Values.TrueValue]),

    c([Values.int(1), Values.int(5), 'lhs > rhs', Values.FalseValue]),
    c([Values.int(1), Values.int(1), 'lhs > rhs', Values.FalseValue]),
    c([Values.int(5), Values.int(1), 'lhs > rhs', Values.TrueValue]),

    c([Values.int(1), Values.int(5), 'lhs < rhs', Values.TrueValue]),
    c([Values.int(1), Values.int(1), 'lhs < rhs', Values.FalseValue]),
    c([Values.int(5), Values.int(1), 'lhs < rhs', Values.FalseValue]),

    c([Values.int(1), Values.int(5), 'lhs >= rhs', Values.FalseValue]),
    c([Values.int(1), Values.int(1), 'lhs >= rhs', Values.TrueValue]),
    c([Values.int(5), Values.int(1), 'lhs >= rhs', Values.TrueValue]),

    c([Values.int(1), Values.int(5), 'lhs <= rhs', Values.TrueValue]),
    c([Values.int(1), Values.int(1), 'lhs <= rhs', Values.TrueValue]),
    c([Values.int(5), Values.int(1), 'lhs <= rhs', Values.FalseValue]),

    c([Values.int(1), Values.int(1), 'lhs + rhs', Values.int(2)]),
    c([Values.float(1.5), Values.float(2.25), 'lhs + rhs', Values.float(3.75)]),
    c([Values.float(1.5), Values.int(2), 'lhs + rhs', Values.float(3.5)]),

    c([Values.int(1), Values.int(1), 'lhs - rhs', Values.int(0)]),
    c([Values.float(1.5), Values.float(2.25), 'lhs - rhs', Values.float(-0.75)]),
    c([Values.float(2), Values.int(1), 'lhs - rhs', Values.float(1)]),

    c([Values.int(3), Values.int(2), 'lhs |> # + rhs', Values.int(5)]),
    c([Values.nullValue(), Values.int(2), 'lhs ?|> # + rhs', Values.nullValue()]),

    c([Values.int(10), Values.int(20), 'lhs * rhs', Values.int(200)]),
    c([Values.float(1.5), Values.float(2), 'lhs * rhs', Values.float(3)]),

    c([Values.int(20), Values.int(10), 'lhs / rhs', Values.int(2)]),
    c([Values.int(20), Values.int(8), 'lhs / rhs', Values.float(2.5)]),
    c([Values.int(10), Values.int(-20), 'lhs / rhs', Values.float(-0.5)]),
    c([Values.int(10), Values.float(20), 'lhs / rhs', Values.float(0.5)]),
    c([Values.float(1.5), Values.float(2), 'lhs / rhs', Values.float(0.75)]),

    c([Values.int(20), Values.int(10), 'lhs // rhs', Values.int(2)]),
    c([Values.int(20), Values.int(9), 'lhs // rhs', Values.int(2)]),
    c([Values.int(10), Values.int(20), 'lhs // rhs', Values.int(0)]),
    c([Values.int(10), Values.float(3), 'lhs // rhs', Values.int(3)]),
    c([Values.int(10), Values.float(-20), 'lhs // rhs', Values.int(-1)]),
    c([Values.float(11.5), Values.float(2.1), 'lhs // rhs', Values.int(5)]),

    c([Values.int(20), Values.int(10), 'lhs % rhs', Values.int(0)]),
    c([Values.int(177), Values.int(6), 'lhs % rhs', Values.int(3)]),
    c([Values.float(177), Values.float(6), 'lhs % rhs', Values.float(3)]),
    c([Values.float(8.5), Values.float(1.5), 'lhs % rhs', Values.float(1)]),
    c([Values.int(10), Values.float(3), 'lhs % rhs', Values.float(1)]),

    c([Values.int(2), Values.int(8), 'lhs ** rhs', Values.int(256)]),
    c([Values.float(16), Values.float(0.5), 'lhs ** rhs', Values.float(4)]),

    c([Values.int(123), Values.int(0), '$lhs', Values.string('123')]),
    c([Values.int(123), Values.int(0), '$lhs.length', Values.int(3)]),
    c([Values.int(1234), Values.int(0), '$lhs', Values.string('1234')]),
    c([Values.int(1234), Values.int(0), '$lhs.length', Values.int(4)]),
    c([Values.int(0), Values.int(0), '"👨‍👩‍👧".length', Values.int(1)]),
    c([Values.int(0), Values.int(0), '"🌷🎁💩😜👍🏳️‍🌈".length', Values.int(6)]),
    c([Values.int(0), Values.int(0), '"a 👨‍👩‍👧 of three".length', Values.int(12)]),
    c([Values.string('a'), Values.int(3), 'lhs.repeat(rhs)', Values.string('aaa')]),

    c([
      Values.object(new Map([['foo', Values.string('bazz')]])),
      Values.string('foo'),
      'lhs[rhs]',
      Values.string('bazz'),
    ]),
    c([
      Values.object(new Map([['foo', Values.string('bazz')]])),
      Values.object(new Map([['bar', Values.string('barr')]])),
      '{...lhs, ...rhs}',
      Values.object(
        new Map([
          ['foo', Values.string('bazz')],
          ['bar', Values.string('barr')],
        ]),
      ),
    ]),

    c([Values.array([Values.string('bazz')]), Values.int(0), 'lhs[rhs]', Values.string('bazz')]),
    c([
      Values.array([Values.string('bazz')]),
      Values.array([Values.string('barr')]),
      '[...lhs, ...rhs]',
      Values.array([Values.string('bazz'), Values.string('barr')]),
    ]),
  ).run(([lhs, rhs, formula, expected], {only, skip}) =>
    (only ? it.only : skip ? it.skip : it)(
      `should eval ${formula} = ${expected} (lhs = ${lhs}, rhs = ${rhs})`,
      () => {
        runtimeTypes['lhs'] = [lhs.getType(), lhs]
        runtimeTypes['rhs'] = [rhs.getType(), rhs]
        const expression = parse(formula).get()
        expect(expression.eval(valueRuntime).get()).toEqual(expected)
      },
    ),
  )

  it('foo?.bar.baz --> T?', () => {
    runtimeTypes['foo'] = [
      Types.optional(
        Types.object([
          Types.namedProp(
            'bar',
            Types.object([
              Types.namedProp('baz', Types.string()),
              Types.namedProp('bazz', Types.object([Types.namedProp('bazzz', Types.string())])),
            ]),
          ),
        ]),
      ),
      Values.string('abc'),
    ]

    expect(parse('foo?.bar.baz').get().getType(typeRuntime).get()).toEqual(
      Types.optional(Types.string()),
    )
    expect(() => parse('foo.bar.baz)').get().getType(typeRuntime).get()).toThrow()

    expect(parse('foo?.bar.bazz.bazzz').get().getType(typeRuntime).get()).toEqual(
      Types.optional(Types.string()),
    )
    expect(() => parse('foo.bar.bazz.bazzz)').get().getType(typeRuntime).get()).toThrow()
  })
})
