import * as Types from '../types'
import * as Values from '../values'
import {parse, parseModule} from '../formulaParser'
import {type TypeRuntime} from '../runtime'
import {mockTypeRuntime} from './mockTypeRuntime'

let typeRuntime: TypeRuntime
let runtimeTypes: {[K in string]: [Types.Type, any]}

beforeEach(() => {
  runtimeTypes = {}
  typeRuntime = mockTypeRuntime(runtimeTypes)
})

function defineClass(definition: string) {
  const moduleDef = parseModule(definition).get()
  const classDef = moduleDef.expressions[0]
  const classDefType = classDef.getType(typeRuntime).get() as Types.ClassDefinitionType
  runtimeTypes[classDef.name] = [classDefType, Values.nullValue()]
  return classDefType
}

function defineFormula(name: string, definition: string) {
  const expression = parse(definition).get()
  const type = expression.getType(typeRuntime).get()
  runtimeTypes[name] = [type, Values.nullValue()]
  return type
}

function getType(code: string): Types.Type {
  const expression = parse(code).get()
  const result = expression.getType(typeRuntime)
  if (result.isErr()) throw result.error
  return result.get()
}

describe('class generics', () => {
  describe('definition', () => {
    it('generic class compiles with generic property', () => {
      const classType = defineClass(`\
class Box<T> {
  @value: T
}`)
      expect(classType).toBeInstanceOf(Types.ClassDefinitionType)
      expect(classType.genericTypes).toHaveLength(1)
      expect(classType.genericTypes[0].name).toBe('T')
    })

    it('generic class compiles with multiple generic params', () => {
      const classType = defineClass(`\
class Pair<T, U> {
  @first: T
  @second: U
}`)
      expect(classType.genericTypes).toHaveLength(2)
      expect(classType.genericTypes[0].name).toBe('T')
      expect(classType.genericTypes[1].name).toBe('U')
    })

    it('instance type has generic properties', () => {
      const classType = defineClass(`\
class Box<T> {
  @value: T
}`)
      const instanceType = classType.classInstanceType!
      expect(instanceType).toBeInstanceOf(Types.ClassInstanceType)
      expect(instanceType.hasGeneric()).toBe(true)
    })
  })

  describe('type constructor', () => {
    it('Box(Int) produces instance type with Int property', () => {
      defineClass(`\
class Box<T> {
  @value: T
}`)
      const code = `let b: Box(Int) = Box(value: 0) in b`
      const result = getType(code)
      expect(result).toBeInstanceOf(Types.ClassInstanceType)
      const instance = result as Types.ClassInstanceType
      expect(instance.allProps.get('value')).toEqual(Types.int())
    })

    it('Pair(Int, String) resolves both params', () => {
      defineClass(`\
class Pair<T, U> {
  @first: T
  @second: U
}`)
      const code = `let p: Pair(Int, String) = Pair(first: 0, second: '') in p`
      const result = getType(code)
      expect(result).toBeInstanceOf(Types.ClassInstanceType)
      const instance = result as Types.ClassInstanceType
      expect(instance.allProps.get('first')).toEqual(Types.int())
      expect(instance.allProps.get('second')).toEqual(Types.string())
    })
  })

  describe('constructor invocation', () => {
    it('constructor infers generic from argument', () => {
      defineClass(`\
class Box<T> {
  @value: T
}`)
      const result = getType(`Box(value: 42)`)
      expect(result).toBeInstanceOf(Types.ClassInstanceType)
      const instance = result as Types.ClassInstanceType
      expect(instance.allProps.get('value')).toEqual(Types.literal(42))
    })

    it('constructor infers multiple generics', () => {
      defineClass(`\
class Pair<T, U> {
  @first: T
  @second: U
}`)
      const result = getType(`Pair(first: 1, second: 'hello')`)
      expect(result).toBeInstanceOf(Types.ClassInstanceType)
      const instance = result as Types.ClassInstanceType
      expect(instance.allProps.get('first')).toEqual(Types.literal(1))
      expect(instance.allProps.get('second')).toEqual(Types.literal('hello'))
    })
  })

  describe('generic class as function parameter', () => {
    it('function accepts generic class instance', () => {
      defineClass(`\
class Box<T> {
  @value: T
}`)
      defineFormula('unbox', `fn<T>(box: Box(T)): T => box.value`)
      const result = getType(`unbox(box: Box(value: 42))`)
      expect(result).toEqual(Types.literal(42))
    })

    it('function returns generic class instance', () => {
      defineClass(`\
class Box<T> {
  @value: T
}`)
      defineFormula('wrap', `fn<T>(#value: T): Box(T) => Box(value:)`)
      const result = getType(`wrap(5)`)
      expect(result).toBeInstanceOf(Types.ClassInstanceType)
      const instance = result as Types.ClassInstanceType
      expect(instance.allProps.get('value')).toEqual(Types.literal(5))
    })
  })

  describe('property access on generic instance', () => {
    it('accessing generic property returns resolved type', () => {
      defineClass(`\
class Box<T> {
  @value: T
}`)
      runtimeTypes['b'] = [Types.int(), Values.nullValue()]
      const result = getType(`Box(value: b).value`)
      expect(result).toEqual(Types.int())
    })
  })

  describe('generic class with formulas', () => {
    it('instance formula uses generic type', () => {
      const classType = defineClass(`\
class Box<T> {
  @value: T

  fn get(): T => @value
}`)
      const instanceType = classType.classInstanceType!
      const getFormula = instanceType.formulas.get('get')
      expect(getFormula).toBeInstanceOf(Types.FormulaType)
      expect((getFormula as Types.FormulaType).returnType.hasGeneric()).toEqual(true)
    })

    it('formula on resolved instance returns concrete type', () => {
      defineClass(`\
class Box<T> {
  @value: T

  fn get(): T => @value
}`)
      runtimeTypes['b'] = [Types.int(), Values.nullValue()]
      const getFormula = getType(`Box(value: b).get`)
      const result = getType(`Box(value: b).get()`)
      expect(getFormula).toBeInstanceOf(Types.FormulaType)
      expect((getFormula as Types.FormulaType).returnType).toEqual(Types.int())
      expect(result).toEqual(Types.int())
    })
  })
})
