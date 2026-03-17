import {describe, expect, test} from 'bun:test'
import * as Types from '../types'
import * as Values from '../values'
import {parse} from '../formulaParser'
import {mockTypeRuntime} from './mockTypeRuntime'
import {solveConstraints, type Constraint} from '../constraints'
import {c, cases} from '@extra-lang/cases'
import {type TypeRuntime} from '@/runtime'

let runtimeTypes: {[K in string]: [Types.Type, Values.Value]}

let typeRuntime: TypeRuntime

beforeEach(() => {
  runtimeTypes = {}
  typeRuntime = mockTypeRuntime(runtimeTypes)
})

describe('generic bounds', () => {
  describe('parsing', () => {
    cases<[string, Types.Type]>(
      //
      c(['Float', Types.float()]),
      c(['Float(>=1)', Types.float({min: 1})]),
      c(['String(<10)', Types.string({max: 9})]),
      c(['0 | 1', Types.oneOf([Types.literal(0), Types.literal(1)])]),
      c(['String', Types.string()]),
      c(['{name: String}', Types.object([Types.namedProp('name', Types.string())])]),
    ).run(([typeCode, expectedType], {only, skip}) =>
      (only ? it.only : skip ? it.skip : it)(
        `fn<T is ${typeCode}> binds to ${expectedType}`,
        () => {
          const code = `fn<T is ${typeCode}>(a: T, b: T): T => a`
          const expression = parse(code).get()
          const formulaType = expression.getType(typeRuntime).get() as Types.FormulaType
          expect(formulaType.genericTypes).toHaveLength(1)
          expect(formulaType.genericTypes[0].bound).toEqual(expectedType)
        },
      ),
    )

    test('fn<T> without bound has no bound', () => {
      const runtimeTypes: {[K in string]: [Types.Type, any]} = {}
      const typeRuntime = mockTypeRuntime(runtimeTypes)

      const code = `fn<T>(a: T): T => a`
      const expression = parse(code).get()
      const formulaType = expression.getType(typeRuntime).get() as Types.FormulaType
      expect(formulaType.genericTypes[0].bound).toBeUndefined()
    })
  })

  describe('solveConstraints with bounds', () => {
    test('bound satisfied: T is Float, resolved to Int → ok', () => {
      const T = new Types.GenericType('T', undefined, Types.float())
      const constraints: Constraint[] = [{kind: 'hint', typeVar: T, type: Types.int()}]
      const result = solveConstraints(constraints, [T])
      expect(result.isOk()).toBe(true)
      expect(result.get().get(T)).toBe(Types.int())
    })

    test('bound violated: T is Float, resolved to String → error', () => {
      const T = new Types.GenericType('T', undefined, Types.float())
      const constraints: Constraint[] = [{kind: 'hint', typeVar: T, type: Types.string()}]
      const result = solveConstraints(constraints, [T])
      expect(result.isErr()).toBe(true)
      expect(result.error).toContain('does not satisfy bound')
      expect(result.error).toContain('Float')
    })

    test('bound satisfied: T is Float, resolved to Float → ok', () => {
      const T = new Types.GenericType('T', undefined, Types.float())
      const constraints: Constraint[] = [{kind: 'hint', typeVar: T, type: Types.float()}]
      const result = solveConstraints(constraints, [T])
      expect(result.isOk()).toBe(true)
    })

    test('no bound → any type accepted', () => {
      const T = new Types.GenericType('T')
      const constraints: Constraint[] = [{kind: 'hint', typeVar: T, type: Types.string()}]
      const result = solveConstraints(constraints, [T])
      expect(result.isOk()).toBe(true)
    })
  })

  describe('TypeScheme instantiate preserves bounds', () => {
    test('fresh vars inherit bounds', () => {
      const T = new Types.GenericType('T', undefined, Types.float())
      const scheme = new Types.TypeScheme([T], T)
      const {freshVars} = scheme.instantiate()
      const freshT = freshVars.get(T)!
      expect(freshT.bound).toBe(Types.float())
    })
  })

  describe('end-to-end', () => {
    test('fn<T is Float>(a: T, b: T): T invoked with ints → resolves to Int', () => {
      const runtimeTypes: {[K in string]: [Types.Type, any]} = {
        add: [
          Types.formula(
            [
              Types.positionalArgument({
                name: 'a',
                type: new Types.GenericType('T', undefined, Types.float()),
                isRequired: true,
              }),
              Types.positionalArgument({
                name: 'b',
                type: new Types.GenericType('T', undefined, Types.float()),
                isRequired: true,
              }),
            ],
            new Types.GenericType('T', undefined, Types.float()),
            [new Types.GenericType('T', undefined, Types.float())],
          ),
          null,
        ],
      }
      const typeRuntime = mockTypeRuntime(runtimeTypes)

      const code = `add(1, 2)`
      const expression = parse(code).get()
      const resultType = expression.getType(typeRuntime).get()
      // T resolves to something assignable to Float (Int or literal)
      expect(Types.canBeAssignedTo(resultType!, Types.float())).toBe(true)
    })
  })
})
