import {c, cases} from '@extra-lang/cases'
import {parse} from '../../formulaParser'
import {type Expression} from '../../expressions'
import * as Types from '../../types'
import {type TypeRuntime, type ValueRuntime} from '../../runtime'
import * as Values from '../../values'
import {mockTypeRuntime} from '../../tests/mockTypeRuntime'
import {mockValueRuntime} from '../../tests/mockValueRuntime'

let runtimeTypes: {[K in string]: [Types.Type, Values.Value]}

let typeRuntime: TypeRuntime
let valueRuntime: ValueRuntime

beforeEach(() => {
  runtimeTypes = {}
  typeRuntime = mockTypeRuntime(runtimeTypes)
  valueRuntime = mockValueRuntime(runtimeTypes)
})

describe('Property Access Operator', () => {
  describe('parse', () => {
    cases<[string, string] | [string, string, string]>(
      //
      c(['a.b.c[1 + 1]', '([] (. (. a b) c) (+ 1 1))']),
      c(['a?.b.c[1 + 1]', '([] (. (?. a b) c) (+ 1 1))']),
      c(['a.b?.c[1 + 1]', '([] (?. (. a b) c) (+ 1 1))']),
      c(['a.b.c?.[1 + 1]', '(?.[] (. (. a b) c) (+ 1 1))']),
      c(['a?.b.c?.[1 + 1]', '(?.[] (. (?. a b) c) (+ 1 1))']),
    ).run(([formula, expectedLisp, expectedCode], {only, skip}) =>
      (only ? it.only : skip ? it.skip : it)(`should parse '${formula}'`, () => {
        expectedCode ??= formula
        let expression: Expression = parse(formula).get()

        expect(expression!.toCode()).toEqual(expectedCode)
        expect(expression!.toLisp()).toEqual(expectedLisp)
      }),
    )
  })

  describe('getType', () => {
    cases<[string, [string, Types.Type], Types.Type]>(
      //
      c([`a.b`, ['a', Types.object([Types.namedProp('b', Types.string())])], Types.string()]),
      c([
        `a?.b`,
        ['a', Types.optional(Types.object([Types.namedProp('b', Types.string())]))],
        Types.optional(Types.string()),
      ]),
      c([
        `a?.b.c`,
        [
          'a',
          Types.optional(
            Types.object([Types.namedProp('b', Types.object([Types.namedProp('c', Types.int())]))]),
          ),
        ],
        Types.optional(Types.int()),
      ]),
      c([
        `a?.b?.c`,
        [
          'a',
          Types.optional(
            Types.object([
              Types.namedProp(
                'b',
                Types.optional(Types.object([Types.namedProp('c', Types.int())])),
              ),
            ]),
          ),
        ],
        Types.optional(Types.int()),
      ]),
    ).run(([formula, [name, type], expectedType], {only, skip}) =>
      (only ? it.only : skip ? it.skip : it)(
        `'${formula}' should have type '${expectedType}' (${name}: ${type})`,
        () => {
          runtimeTypes[name] = [type, Values.nullValue()]

          const expression = parse(formula).get()
          const actualType = expression.getType(typeRuntime).get()
          expect(actualType).toEqual(expectedType)
        },
      ),
    )
  })

  describe('formula properties', () => {
    cases<[string, Types.Type]>(
      c([
        'Int.parse',
        Types.namedFormula(
          'parse',
          [
            Types.positionalArgument({name: 'input', type: Types.StringType, isRequired: true}),
            Types.namedArgument({
              name: 'radix',
              type: Types.IntType.narrow(0, undefined),
              isRequired: false,
            }),
          ],
          Types.optional(Types.IntType),
        ),
      ]),
      c([
        `let
  adder = fn{
    (# a: Int, # b: Int): Int => a + b
    inc: fn(# x: Int): Int => x + 1
    dec: fn(# x: Int): Int => x - 1
  }
in
  adder.inc`,
        Types.formula(
          [Types.positionalArgument({name: 'x', type: Types.IntType, isRequired: true})],
          Types.IntType,
        ),
      ]),
    ).run(([formula, expectedType], {only, skip}) =>
      (only ? it.only : skip ? it.skip : it)(
        `'${formula}' should have type '${expectedType}'`,
        () => {
          const expression = parse(formula).get()
          expect(expression.getType(typeRuntime).get()).toEqual(expectedType)
        },
      ),
    )

    cases<[string, Values.Value]>(
      c(['Int.parse("5")', Values.int(5)]),
      c(['Int.parse("")', Values.nullValue()]),
      c(['Int.parse("11", radix: 2)', Values.int(3)]),
      c(['Int.parse("11", radix: 10)', Values.int(11)]),
      c(['Int.parse("z", radix: 36)', Values.int(35)]),
      c(['Int.parse("z", radix: 10)', Values.nullValue()]),
      c([
        `let
  adder = fn{
    (# a: Int, # b: Int): Int => a + b
    inc: fn(# x: Int): Int => x + 1
    dec: fn(# x: Int): Int => x - 1
  }
in
  adder.dec(1)`,
        Values.int(0),
      ]),
    ).run(([formula, expectedValue], {only, skip}) =>
      (only ? it.only : skip ? it.skip : it)(
        `'${formula}' should eval to '${expectedValue}'`,
        () => {
          const expression = parse(formula).get()
          expect(expression.eval(valueRuntime).get()).toEqual(expectedValue)
        },
      ),
    )
  })

  describe("'user' access", () => {
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
      const expression = parse('user.foo?.bar').get()
      expect(() => {
        expression.getType(typeRuntime).get()
      }).toThrow("Expected a nullable type on left hand side of '?.' operator")
    })

    it('foo.name => throws', () => {
      const expression = parse('foo.name').get()
      expect(() => expression.getType(typeRuntime).get()).toThrow(
        "There is no reference in scope named 'foo'",
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
  })

  describe('invalid', () => {
    cases<[string, [string, Types.Type], string]>(
      //
      c([
        `a?.b`,
        ['a', Types.object([Types.namedProp('b', Types.string())])],
        'Expected a nullable type on left hand side',
      ]),
      c([
        `a.b`,
        ['a', Types.optional(Types.object([Types.namedProp('b', Types.string())]))],
        "Property 'b' does not exist on null",
      ]),
      c([
        `a?.b.c`,
        [
          'a',
          Types.optional(
            Types.object([
              Types.namedProp(
                'b',
                Types.optional(Types.object([Types.namedProp('c', Types.int())])),
              ),
            ]),
          ),
        ],
        "Property 'c' does not exist on null",
      ]),
      c([`a.b`, ['a', Types.AnyType], "Property 'b' does not exist on Any"]),
    ).run(([formula, [name, type], expectedMessage], {only, skip}) =>
      (only ? it.only : skip ? it.skip : it)(
        `'${formula}' should emit error '${expectedMessage}' (${name}: ${type})`,
        () => {
          runtimeTypes[name] = [type, Values.nullValue()]

          expect(() => {
            const expression = parse(formula).get()
            expression.getType(typeRuntime).get()
          }).toThrow(expectedMessage)
        },
      ),
    )
  })
})
