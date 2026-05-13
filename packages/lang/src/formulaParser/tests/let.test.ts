import {c, cases} from '@extra-lang/cases'
import {type TypeRuntime, type ValueRuntime} from '../../runtime'
import * as Types from '../../types'
import * as Values from '../../values'
import {parse} from '../../formulaParser'
import {type Expression} from '../../expressions'
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

describe('let … in …', () => {
  describe('parse', () => {
    cases<[string, string] | [string, string, string]>(
      c([
        `\
let
  a = 1
in
  a + 1
`,
        '(let (a = 1) (+ a 1))',
      ]),
      c([
        `\
let
  a: Int = 1
in
  a + 1
`,
        '(let (a: `Int` = 1) (+ a 1))',
      ]),
      c([
        `let a = 1 , b = 2 in a + b`,
        '(let (a = 1) (b = 2) (+ a b))',
        `\
let
  a = 1
  b = 2
in
  a + b
`,
      ]),
      c([
        `\
let
  a =
    1
    +
    2
in
  a + 1
`,
        '(let (a = (+ 1 2)) (+ a 1))',
        `\
let
  a = 1 + 2
in
  a + 1
`,
      ]),
      c([
        `\
let
  a = 1
  b = 2
in
  a + b
`,
        '(let (a = 1) (b = 2) (+ a b))',
      ]),
      c([
        `\
let
  a = 1
  b = a
in
  a + b
`,
        '(let (a = 1) (b = a) (+ a b))',
      ]),
      c([
        `\
let
  b = a
  a = 1
in
  a + b
`,
        '(let (b = a) (a = 1) (+ a b))',
        `\
let
  b = a
  a = 1
in
  a + b
`,
      ]),
      c([
        `\
let
  a = bla1.
    bla2?.
    bla3
in
  let
    b = 2
  in
    a + b
`,
        '(let (a = (?. (. bla1 bla2) bla3)) (let (b = 2) (+ a b)))',
        `\
let
  a = bla1.bla2?.bla3
in
  let
    b = 2
  in
    a + b
`,
      ]),
      c([
        `\
let
  fn a() => 1
in
  a() + 1
`,
        '(let (fn a() => 1) (+ (fn a ()) 1))',
      ]),
      c([
        `\
let
  {name:, age:, a, b} = object
in
  {name:, age:, a:, b:}
`,
        '(let ({name:, age:, a, b} = object) {(name:) (age:) (a:) (b:)})',
        `\
let
  {name:, age:, a, b} = object
in
  {name:, age:, a:, b:}
`,
      ]),
      c([
        `\
let
  {name:, age:, ...props} = object
in
  props
`,
        '(let ({name:, age:, ...props} = object) props)',
      ]),
      c([
        `\
let
  {name: _, ...props} = object
in
  props
`,
        '(let ({name: _, ...props} = object) props)',
        `\
let
  {name: _, ...props} = object
in
  props
`,
      ]),
      c([
        `\
let
  {name: n} = object
in
  n
`,
        '(let ({name: n} = object) n)',
      ]),
      c([
        `\
let
  {_, b, ...props} = object
in
  {b, props}
`,
        '(let ({_, b, ...props} = object) {b props})',
      ]),
      c([
        `\
let
  [first] = items
in
  first
`,
        '(let ([first] = items) first)',
      ]),
      c([
        `\
let
  [first, ..., last] = items
in
  [first, last]
`,
        '(let ([first, ..., last] = items) [first last])',
      ]),
      c([
        `\
let
  [_, second] = items
in
  second
`,
        '(let ([_, second] = items) second)',
      ]),
      c([
        `\
let
  [first, _, last] = items
in
  [first, last]
`,
        '(let ([first, _, last] = items) [first last])',
      ]),
      c([
        `\
let
  [_, ...middle, _] = items
in
  middle
`,
        '(let ([_, ...middle, _] = items) middle)',
      ]),
      c([
        `\
let
  [...items] = items
in
  items
`,
        '(let ([...items] = items) items)',
      ]),
      c([
        `\
let
  [..., last] = items
in
  last
`,
        '(let ([..., last] = items) last)',
      ]),
      c([
        `\
let
  [first, ...] = items
in
  first
`,
        '(let ([first] = items) first)',
        `\
let
  [first] = items
in
  first
`,
      ]),
      c([
        `\
let
  [first, ...middle, last] = items
in
  [first, middle, last]
`,
        '(let ([first, ...middle, last] = items) [first middle last])',
      ]),
    ).run(([formula, expectedLisp, expectedCode], {only, skip}) => {
      ;(only ? it.only : skip ? it.skip : it)(`should parse formula '${formula}'`, () => {
        expectedCode ??= formula

        let expression: Expression = parse(formula).get()
        expect(expression.toCode()).toEqual(expectedCode)
        expect(expression.toLisp()).toEqual(expectedLisp)
      })
    })
  })

  describe('eval', () => {
    beforeEach(() => {
      runtimeTypes['input'] = [Types.literal('test'), Values.string('test')]
    })

    cases<[string, Types.Type, Values.Value]>(
      c([
        `\
let
  a = 1
in
  a + 1
`,
        Types.literal(2),
        Values.int(2),
      ]),
      c([
        `\
let
  a = '1'
  b = '2'
in
  a .. b
`,
        Types.literal('12'),
        Values.string('12'),
      ]),
      c([
        `\
let
  a = '1'
  b = a
in
  a .. b
`,
        Types.literal('11'),
        Values.string('11'),
      ]),
      c([
        `\
let
  b = a
  a = '1'
in
  a .. b
`,
        Types.literal('11'),
        Values.string('11'),
      ]),
      c([
        `\
let
  a = 1
in
  let
    b = 2
  in
    a + b
`,
        Types.literal(3),
        Values.int(3),
      ]),
      c([
        `\
let
  a = input .. '!'
in
  a
`,
        Types.literal('test!'),
        Values.string('test!'),
      ]),
      c([
        `\
let
  adder: fn{(# a: Int, # b: Int): Int, inc: fn(# x: Int): Int, dec: fn(# x: Int): Int} = fn{
    (# a: Int, # b: Int): Int => a + b
    inc: fn(# x: Int): Int => x + 1
    dec: fn(# x: Int): Int => x - 1
  }
in
  adder(1, 2)
`,
        Types.int(),
        Values.int(3),
      ]),
      c([
        `\
let
  adder: fn{(# a: Int, # b: Int): Int, inc: fn(# x: Int): Int, dec: fn(# x: Int): Int} = fn{
    (# a: Int, # b: Int): Int => a + b
    inc: fn(# x: Int): Int => x + 1
    dec: fn(# x: Int): Int => x - 1
  }
in
  adder.inc(1)
`,
        Types.int(),
        Values.int(2),
      ]),
      c([
        `\
let
  {name:, age:, a, b} = {'a', 'b', name: 'Ada', age: 42}
in
  {name, age, a, b}
`,
        Types.object([
          Types.positionalProp(Types.literal('Ada')),
          Types.positionalProp(Types.literal(42)),
          Types.positionalProp(Types.literal('a')),
          Types.positionalProp(Types.literal('b')),
        ]),
        Values.object(new Map(), [
          Values.string('Ada'),
          Values.int(42),
          Values.string('a'),
          Values.string('b'),
        ]),
      ]),
      c([
        `\
let
  {name: _, age: _, ...props} = {'a', 'b', name: 'Ada', age: 42}
in
  props
`,
        Types.object([
          Types.positionalProp(Types.literal('a')),
          Types.positionalProp(Types.literal('b')),
        ]),
        Values.object(new Map(), [Values.string('a'), Values.string('b')]),
      ]),
      c([
        `\
let
  {name: n} = {name: 'Ada'}
in
  n
`,
        Types.literal('Ada'),
        Values.string('Ada'),
      ]),
      c([
        `\
let
  {_, b, ...props} = {'a', 'b', 'c', name: 'Ada'}
in
  {b, props}
`,
        Types.object([
          Types.positionalProp(Types.literal('b')),
          Types.positionalProp(
            Types.object([
              Types.positionalProp(Types.literal('c')),
              Types.namedProp('name', Types.literal('Ada')),
            ]),
          ),
        ]),
        Values.object(new Map(), [
          Values.string('b'),
          Values.object(new Map([['name', Values.string('Ada')]]), [Values.string('c')]),
        ]),
      ]),
      c([
        `\
let
  [first] = []
in
  first
`,
        Types.NullType,
        Values.NullValue,
      ]),
      c([
        `\
let
  [first] = [1]
in
  first
`,
        Types.literal(1),
        Values.int(1),
      ]),
      c([
        `\
let
  [first, ..., last] = [1]
in
  {first, last}
`,
        Types.object([
          Types.positionalProp(Types.literal(1)),
          Types.positionalProp(Types.NullType),
        ]),
        Values.object(new Map(), [Values.int(1), Values.NullValue]),
      ]),
      c([
        `\
let
  [first, _, last] = [1, 2, 3]
in
  {first, last}
`,
        Types.object([
          Types.positionalProp(Types.oneOf([Types.literal(1), Types.literal(2), Types.literal(3)])),
          Types.positionalProp(Types.oneOf([Types.literal(1), Types.literal(2), Types.literal(3)])),
        ]),
        Values.object(new Map(), [Values.int(1), Values.int(3)]),
      ]),
      c([
        `\
let
  [_, ...middle, _] = [1, 2, 3, 4]
in
  middle
`,
        Types.array(
          Types.oneOf([Types.literal(1), Types.literal(2), Types.literal(3), Types.literal(4)]),
          {min: 2, max: 2},
        ),
        Values.array([Values.int(2), Values.int(3)]),
      ]),
      c([
        `\
let
  [...items] = [1, 2]
in
  items
`,
        Types.array(Types.oneOf([Types.literal(1), Types.literal(2)]), {min: 2, max: 2}),
        Values.array([Values.int(1), Values.int(2)]),
      ]),
      c([
        `\
let
  [..., last] = [1, 2]
in
  last
`,
        Types.oneOf([Types.literal(1), Types.literal(2)]),
        Values.int(2),
      ]),
      c([
        `\
let
  [first, ...] = [1, 2]
in
  first
`,
        Types.oneOf([Types.literal(1), Types.literal(2)]),
        Values.int(1),
      ]),
      c([
        `\
let
  [first, ...middle, last] = [1, 2, 3, 4]
in
  {first, middle, last}
`,
        Types.object([
          Types.positionalProp(
            Types.oneOf([Types.literal(1), Types.literal(2), Types.literal(3), Types.literal(4)]),
          ),
          Types.positionalProp(
            Types.array(
              Types.oneOf([Types.literal(1), Types.literal(2), Types.literal(3), Types.literal(4)]),
              {min: 2, max: 2},
            ),
          ),
          Types.positionalProp(
            Types.oneOf([Types.literal(1), Types.literal(2), Types.literal(3), Types.literal(4)]),
          ),
        ]),
        Values.object(new Map(), [
          Values.int(1),
          Values.array([Values.int(2), Values.int(3)]),
          Values.int(4),
        ]),
      ]),
    ).run(([formula, expectedType, expectedValue], {only, skip}) =>
      (only ? it.only : skip ? it.skip : it)(`should parse formula '${formula}'`, () => {
        const expression = parse(formula).get()
        const type = expression.getType(typeRuntime).get()
        const value = expression.eval(valueRuntime).get()

        expect(type).toEqual(expectedType)
        expect(value).toEqual(expectedValue)
      }),
    )

    it('types [first] as optional for unconstrained arrays', () => {
      runtimeTypes['items'] = [Types.array(Types.int()), Values.array([Values.int(1)])]
      const expression = parse(`\
let
  [first] = items
in
  first
`).get()

      expect(expression.getType(typeRuntime).get()).toEqual(Types.optional(Types.int()))
      expect(expression.eval(valueRuntime).get()).toEqual(Values.int(1))
    })

    it('types [first] as non-null for arrays with length >= 1', () => {
      runtimeTypes['items'] = [Types.array(Types.int(), {min: 1}), Values.array([Values.int(1)])]
      const expression = parse(`\
let
  [first] = items
in
  first
`).get()

      expect(expression.getType(typeRuntime).get()).toEqual(Types.int())
      expect(expression.eval(valueRuntime).get()).toEqual(Values.int(1))
    })

    it('allows object destructuring one-of object types and nulls missing branch properties', () => {
      runtimeTypes['object'] = [
        Types.oneOf([
          Types.object([Types.namedProp('name', Types.literal('Ada'))]),
          Types.object([Types.namedProp('age', Types.literal(42))]),
        ]),
        Values.object(new Map([['name', Values.string('Ada')]])),
      ]
      const expression = parse(`\
let
  {name:} = object
in
  name
`).get()

      expect(expression.getType(typeRuntime).get()).toEqual(Types.optional(Types.literal('Ada')))
      expect(expression.eval(valueRuntime).get()).toEqual(Values.string('Ada'))
    })

    it('types object rest for one-of object destructuring', () => {
      runtimeTypes['object'] = [
        Types.oneOf([
          Types.object([
            Types.namedProp('name', Types.literal('Ada')),
            Types.namedProp('age', Types.literal(42)),
          ]),
          Types.object([
            Types.namedProp('name', Types.literal('Bob')),
            Types.namedProp('hobby', Types.literal('bikes')),
          ]),
        ]),
        Values.object(
          new Map<string, Values.Value>([
            ['name', Values.string('Ada')],
            ['age', Values.int(42)],
          ]),
        ),
      ]
      const expression = parse(`\
let
  {name:, ...props} = object
in
  props
`).get()

      expect(expression.getType(typeRuntime).get()).toEqual(
        Types.oneOf([
          Types.object([Types.namedProp('age', Types.literal(42))]),
          Types.object([Types.namedProp('hobby', Types.literal('bikes'))]),
        ]),
      )
      expect(expression.eval(valueRuntime).get()).toEqual(
        Values.object(new Map([['age', Values.int(42)]])),
      )
    })
  })

  describe('invalid', () => {
    cases<[string, string, string]>(
      c([
        'should not allow referencing from scope and local vars',
        `\
  let
    a = 1
  in
    let
      b = a
      a = 2
    in
      a + b
  `,
        'Ambiguous reference detected in let assignment',
      ]),
      c([
        'suggests the correct callback argument name when shorthand uses a typo',
        `\
let
  fn foo(# a: fn(input: Int): Int, initial: Int) => a(input: initial)
in
  foo(|in| in + 1, initial: 1)
`,
        "Unknown named argument 'in'. Did you mean 'input'?",
      ]),
      c([
        'does not allow duplicate array rest destructures',
        `\
let
  [...a, ...b] = [1, 2]
in
  a
`,
        'Already found remaining array elements',
      ]),
      c([
        'does not allow object rest destructures before the end',
        `\
let
  {...props, name:} = {name: 'Ada'}
in
  props
`,
        "Rest object assignment '...' must be the last item in the object destructure",
      ]),
      c([
        'does not allow duplicate object destructure assignment names',
        `\
let
  {name:, age: name} = {name: 'Ada', age: 42}
in
  name
`,
        "Duplicate let assignment 'name'",
      ]),
      c([
        'does not allow duplicate array destructure assignment names',
        `\
let
  [a, a] = [1, 2]
in
  a
`,
        "Duplicate let assignment 'a'",
      ]),
      c([
        'does not allow empty object destructures',
        `\
let
  {} = {name: 'Ada'}
in
  1
`,
        'Destructured let assignment must assign at least one name',
      ]),
      c([
        'does not allow object destructures with only ignores',
        `\
let
  {name: _} = {name: 'Ada'}
in
  1
`,
        'Destructured let assignment must assign at least one name',
      ]),
      c([
        'does not allow empty array destructures',
        `\
let
  [] = []
in
  1
`,
        'Destructured let assignment must assign at least one name',
      ]),
      c([
        'does not allow array destructures with only ignores',
        `\
let
  [_, ...] = [1, 2]
in
  1
`,
        'Destructured let assignment must assign at least one name',
      ]),
      c([
        'rejects object destructuring missing properties',
        `\
let
  {missing:} = {name: 'Ada'}
in
  missing
`,
        "Object destructuring property 'missing' does not exist",
      ]),
      c([
        'rejects object destructuring non-objects',
        `\
let
  {name:} = 1
in
  name
`,
        'Expected Object for destructuring',
      ]),
      c([
        'rejects array destructuring non-arrays',
        `\
let
  [first] = 1
in
  first
`,
        'Expected Array for destructuring',
      ]),
    ).run(([desc, code, message], {only, skip}) =>
      (only ? it.only : skip ? it.skip : it)(`${desc}`, () => {
        expect(() => {
          const expr = parse(code).get()
          expr.getType(typeRuntime).get()
        }).toThrow(message)
      }),
    )

    it('rejects object destructuring one-of types where any member is not an object', () => {
      runtimeTypes['object'] = [
        Types.oneOf([Types.object([Types.namedProp('name', Types.literal('Ada'))]), Types.int()]),
        Values.object(new Map([['name', Values.string('Ada')]])),
      ]

      expect(() => {
        parse(`\
let
  {name:} = object
in
  name
`)
          .get()
          .getType(typeRuntime)
          .get()
      }).toThrow('Expected Object for destructuring')
    })

    it('rejects object destructuring one-of types where no member has the property', () => {
      runtimeTypes['object'] = [
        Types.oneOf([
          Types.object([Types.namedProp('age', Types.literal(42))]),
          Types.object([Types.namedProp('hobby', Types.literal('bikes'))]),
        ]),
        Values.object(new Map([['age', Values.int(42)]])),
      ]

      expect(() => {
        parse(`\
let
  {name:} = object
in
  name
`)
          .get()
          .getType(typeRuntime)
          .get()
      }).toThrow("Object destructuring property 'name' does not exist")
    })
  })
})
