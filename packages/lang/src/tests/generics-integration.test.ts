import {beforeEach, describe, expect, test} from 'bun:test'
import * as Types from '../types'
import {parse, parseModule} from '../formulaParser'
import {type TypeRuntime} from '../runtime'
import {mockTypeRuntime} from './mockTypeRuntime'
import * as Values from '../values'

/**
 * Integration tests for the full generics pipeline:
 * parse → compile → invoke → get type
 *
 * These test complex scenarios that exercise multiple stages at once.
 */

let typeRuntime: TypeRuntime
let runtimeTypes: {[K in string]: [Types.Type, any]}

function setup() {
  runtimeTypes = {}
  typeRuntime = mockTypeRuntime(runtimeTypes)
}

function addFormula(name: string, definition: string) {
  const expression = parse(definition).get()
  const type = expression.getType(typeRuntime).get()
  runtimeTypes[name] = [type, Values.nullValue()]
  return type
}

function addEnum(definition: string) {
  const moduleDef = parseModule(definition).get()
  const enumDef = moduleDef.expressions[0]
  const enumDefType = enumDef.getType(typeRuntime).get() as Types.NamedEnumDefinitionType
  runtimeTypes[enumDef.name] = [enumDefType, Values.nullValue()]

  for (const caseType of enumDefType.instanceTypes) {
    const member = caseType.member
    if (member.args.length === 0) {
      runtimeTypes[`.${member.name}`] = [caseType, Values.nullValue()]
    } else {
      const argTypes = member.args.map((arg): Types.Argument => {
        if (arg.is === 'named') {
          return Types.namedArgument({name: arg.name, type: arg.type, isRequired: true})
        } else {
          return Types.positionalArgument({
            name: arg.name ?? '_',
            type: arg.type,
            isRequired: true,
          })
        }
      })
      const formulaType = Types.formula(argTypes, caseType, [])
      runtimeTypes[`.${member.name}`] = [formulaType, Values.nullValue()]
    }
  }

  return enumDefType
}

function getType(code: string): Types.Type {
  const expression = parse(code).get()
  const result = expression.getType(typeRuntime)
  if (result.isErr()) {
    throw result.error
  }
  return result.get()
}

describe('generics integration', () => {
  beforeEach(setup)

  describe('basic resolution', () => {
    test('fn<T>(a: T): T returns the argument type', () => {
      addFormula('id', `fn<T>(a: T): T => a`)
      expect(getType(`id(a: 42)`).toCode()).toEqual('42')
    })

    test('fn<T>(a: T, b: T): T with same literal resolves', () => {
      addFormula('pick', `fn<T>(a: T, b: T): T => a`)
      // Same literal value — unifies cleanly
      expect(getType(`pick(a: 1, b: 1)`).toCode()).toEqual('1')
    })

    test('fn<T>(a: T, b: T): T with different int literals widens to union', () => {
      addFormula('pick', `fn<T>(a: T, b: T): T => a`)
      // Same-family widening: both int literals → 1 | 2
      const result = getType(`pick(a: 1, b: 2)`)
      expect(result).toBeInstanceOf(Types.OneOfType)
      expect(result.toCode()).toEqual('1 | 2')
    })

    test('fn<T>(a: T, b: T): T with different string literals widens', () => {
      addFormula('pick', `fn<T>(a: T, b: T): T => a`)
      const result = getType(`pick(a: "hello", b: "world")`)
      expect(result).toBeInstanceOf(Types.OneOfType)
    })

    test('fn<T>(a: T, b: T): T with int and string still fails', () => {
      addFormula('pick', `fn<T>(a: T, b: T): T => a`)
      runtimeTypes['i'] = [Types.int(), Values.nullValue()]
      runtimeTypes['s'] = [Types.string(), Values.nullValue()]
      // Different families — no widening
      expect(() => getType(`pick(a: i, b: s)`)).toThrow()
    })

    test('fn<T>(a: T, b: T): T with meta Int widens literals', () => {
      addFormula('pick', `fn<T>(a: T, b: T): T => a`)
      runtimeTypes['x'] = [Types.int(), Values.nullValue()]
      // meta Int + literal 1 → Int (literal widens)
      expect(getType(`pick(a: x, b: 1)`).toCode()).toEqual('Int')
    })
  })

  describe('subtype widening', () => {
    test('Int and Float widen to Float', () => {
      addFormula('pick', `fn<T>(a: T, b: T): T => a`)
      runtimeTypes['i'] = [Types.int(), Values.nullValue()]
      runtimeTypes['f'] = [Types.float(), Values.nullValue()]
      expect(getType(`pick(a: i, b: f)`).toCode()).toEqual('Float')
    })

    test('literal Int and meta Float widen to Float', () => {
      addFormula('pick', `fn<T>(a: T, b: T): T => a`)
      runtimeTypes['f'] = [Types.float(), Values.nullValue()]
      // literal 1 is Int, Int <: Float → T widens to Float
      expect(getType(`pick(a: 1, b: f)`).toCode()).toEqual('Float')
    })
  })

  describe('compound types', () => {
    test('fn<T>(a: Array(T)): T extracts element type', () => {
      addFormula('first', `fn<T>(#a: Array(T)): T => a[0]`)
      runtimeTypes['nums'] = [Types.array(Types.int()), Values.nullValue()]
      expect(getType(`first(nums)`).toCode()).toEqual('Int')
    })
  })

  describe('multiple generics', () => {
    test('fn<T, U> with two independent generics', () => {
      // Use inferred return type to avoid [T] / {a: T} annotation issues
      addFormula('pair', `fn<T, U>(a: T, b: U) => {first: a, second: b}`)
      const result = getType(`pair(a: 1, b: "hello")`)
      expect(result).toBeInstanceOf(Types.ObjectType)
      const obj = result as Types.ObjectType
      expect(obj.namedProp('first')).toEqual(Types.literal(1))
      expect(obj.namedProp('second')).toEqual(Types.literal('hello'))
    })
  })

  describe('callbacks (contravariance)', () => {
    test('map: fn<T,U>(input: T, map: fn(in: T): U): U', () => {
      addFormula('map', `fn<T, U>(#input: T, map: fn(#in: T): U) => map(input)`)
      addFormula('stringify', `fn(#n: Int): String => ""`)
      runtimeTypes['n'] = [Types.int(), Values.nullValue()]
      const result = getType(`map(n, map: stringify)`)
      expect(result).toBe(Types.string())
    })

    test('identity callback preserves type', () => {
      addFormula('map', `fn<T, U>(#input: T, map: fn(#in: T): U) => map(input)`)
      addFormula('identity', `fn<T>(val: T) => val`)
      const result = getType(`map(1, map: identity)`)
      expect(result.toCode()).toEqual('1')
    })

    test('callback with wider param type than provided value', () => {
      addFormula('apply', `fn<T, U>(#value: T, transform: fn(#in: T): U) => transform(value)`)
      addFormula('intToStr', `fn(#in: Int): String => ""`)
      // apply(5, transform: intToStr) — intToStr accepts Int, 5 is literal Int
      const result = getType(`apply(5, transform: intToStr)`)
      expect(result).toBe(Types.string())
    })

    test('compactMap: callback returns optional, outer strips null', () => {
      addFormula('compactMap', `fn<T, U>(#input: T, map: fn(#in: T): U?) => map(input)`)
      addFormula('tryParse', `fn(#in: String): Int? => null`)
      runtimeTypes['s'] = [Types.string(), Values.nullValue()]
      const result = getType(`compactMap(s, map: tryParse)`)
      // T=String, U?=Int? → return type is Int?
      expect(Types.canBeAssignedTo(result, Types.optional(Types.int()))).toBe(true)
    })
  })

  describe('nested generics (generic calling generic)', () => {
    test('outer generic passes through to inner', () => {
      addFormula('identity', `fn<T>(val: T) => val`)
      // wrapId calls identity internally — its return type is inferred
      addFormula('wrapId', `fn<U>(x: U) => identity(val: x)`)
      runtimeTypes['n'] = [Types.int(), Values.nullValue()]
      const result = getType(`wrapId(x: n)`)
      expect(result.toCode()).toEqual('Int')
    })

    test('chained generic functions', () => {
      addFormula('identity', `fn<T>(val: T) => val`)
      addFormula('double', `fn<T>(val: T) => identity(val: identity(val: val))`)
      const result = getType(`double(val: 42)`)
      expect(result.toCode()).toEqual('42')
    })
  })

  describe('bounds', () => {
    test('bound satisfied: Int args with Float bound', () => {
      addFormula('add', `fn<T is Float>(a: T, b: T): T => a`)
      runtimeTypes['x'] = [Types.int(), Values.nullValue()]
      runtimeTypes['y'] = [Types.int(), Values.nullValue()]
      const result = getType(`add(a: x, b: y)`)
      expect(Types.canBeAssignedTo(result, Types.float())).toBe(true)
    })

    test('bound violated: String args with Float bound', () => {
      addFormula('add', `fn<T is Float>(a: T, b: T): T => a`)
      runtimeTypes['s'] = [Types.string(), Values.nullValue()]
      expect(() => getType(`add(a: s, b: s)`)).toThrow(/does not satisfy bound/)
    })

    test('multiple generics with different bounds', () => {
      addFormula('convert', `fn<T is Float, U is String>(num: T, fmt: U) => {value: num, label: fmt}`)
      runtimeTypes['n'] = [Types.int(), Values.nullValue()]
      runtimeTypes['s'] = [Types.string(), Values.nullValue()]
      const result = getType(`convert(num: n, fmt: s)`)
      expect(result).toBeInstanceOf(Types.ObjectType)
      const obj = result as Types.ObjectType
      expect(obj.namedProp('value')).toBe(Types.int())
      expect(obj.namedProp('label')).toBe(Types.string())
    })

    test('bound with literal that widens within bound', () => {
      addFormula('clamp', `fn<T is Float>(value: T): T => value`)
      const result = getType(`clamp(value: 42)`)
      expect(Types.canBeAssignedTo(result, Types.float())).toBe(true)
    })

    test('cross-bound violation: T is Float but U is String gets wrong arg', () => {
      addFormula('convert', `fn<T is Float, U is String>(num: T, fmt: U) => {value: num, label: fmt}`)
      runtimeTypes['s'] = [Types.string(), Values.nullValue()]
      // Passing String for num (T is Float) should fail
      expect(() => getType(`convert(num: s, fmt: s)`)).toThrow(/does not satisfy bound/)
    })
  })

  describe('generic enums', () => {
    test('generic enum used as function parameter', () => {
      addEnum(`\
enum Box<T> {
  .empty
  .full(T)
}`)
      addFormula('unbox', `\
fn<T>(box: Box(T)): T? =>
  switch box
  case .full(value)
    value
  case .empty
    null`)
      const result = getType(`unbox(box: .full(42))`)
      expect(Types.canBeAssignedTo(result, Types.optional(Types.int()))).toBe(true)
    })

    test('generic enum return type from function', () => {
      addEnum(`\
enum Result<T> {
  .nil
  .val(T)
}`)
      addFormula('wrap', `\
fn<T>(value: T): Result(T) =>
  Result.val(value)`)
      const result = getType(`wrap(value: 5)`)
      // Should contain the enum with T=5
      expect(result).toBeInstanceOf(Types.OneOfType)
    })
  })

  describe('edge cases', () => {
    test('unresolved generics stay generic in return type', () => {
      addFormula('apply', `fn<T, U>(#v: T, apply: fn(#in: T): U) => apply(v)`)
      const formulaType = runtimeTypes['apply'][0] as Types.FormulaType
      expect(formulaType.returnType).toBeInstanceOf(Types.GenericType)
    })

    test('same generic constrained from nested positions: Array(T) and Array(T)', () => {
      addFormula('concat', `fn<T>(#a: Array(T), #b: Array(T)) => a`)
      runtimeTypes['ints'] = [Types.array(Types.int()), Values.nullValue()]
      runtimeTypes['floats'] = [Types.array(Types.float()), Values.nullValue()]
      const result = getType(`concat(ints, floats)`)
      // T from Array(Int) and Array(Float) → T widens to Float → return is Array(Float)
      expect(Types.canBeAssignedTo(result, Types.array(Types.float()))).toBe(true)
    })

    test('generic constrained from both direct and nested position', () => {
      // T appears both as a direct arg and inside Array(T)
      addFormula('prepend', `fn<T>(#item: T, #list: Array(T)) => list`)
      runtimeTypes['nums'] = [Types.array(Types.int()), Values.nullValue()]
      // item=literal 5, list=Array(Int) → T gets hint(5) and hint(Int) → widens to Int
      const result = getType(`prepend(5, nums)`)
      expect(Types.canBeAssignedTo(result, Types.array(Types.int()))).toBe(true)
    })
  })
})
