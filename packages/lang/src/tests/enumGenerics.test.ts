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

function defineEnum(definition: string) {
  const moduleDef = parseModule(definition).get()
  const enumDef = moduleDef.expressions[0]
  const enumType = enumDef.getType(typeRuntime).get() as Types.NamedEnumDefinitionType
  runtimeTypes[enumDef.name] = [enumType, Values.nullValue()]

  // Add enum cases to runtime scope (mirroring what NamedEnumDefinition.compile does)
  for (const caseType of enumType.instanceTypes) {
    const member = caseType.member
    if (member.args.length === 0) {
      runtimeTypes[`.${member.name}`] = [caseType, Values.nullValue()]
    } else {
      const argTypes = member.args.map((arg): Types.Argument => {
        if (arg.is === 'named') {
          return Types.namedArgument({
            name: arg.name,
            type: arg.type,
            isRequired: true,
          })
        } else {
          return Types.positionalArgument({
            name: '',
            type: arg.type,
            isRequired: true,
          })
        }
      })
      runtimeTypes[`.${member.name}`] = [
        new Types.NamedFormulaType(member.name, caseType, argTypes, enumType.genericTypes),
        Values.nullValue(),
      ]
    }
  }
}

describe('enum generics', () => {
  it('can instantiate a simple enum', () => {
    defineEnum(`\
enum Simple {
  .value
}`)
    const code = `let foo: Simple = .value in foo`
    const currentExpression = parse(code).get()
    const resolvedType = currentExpression.getType(typeRuntime).get()

    expect(resolvedType).toEqual(
      Types.namedEnumDefinition({
        name: 'Simple',
        members: [Types.enumCase('value')],
      }).instanceType,
    )
  })

  it('can use generic anonymous enums in functions', () => {
    // Defines a generic function with anonymous enum type containing generics.
    // The function compiles and the body's switch correctly narrows the enum cases.
    const code = `
      fn<T, U>(value: .nil | .val(T), mapper: fn(# input: T): U): U? =>
        switch value
        case .nil
          null
        case .val(v)
          mapper(v)
    `
    const currentExpression = parse(code).get()
    const resolvedType = currentExpression.getType(typeRuntime).get()

    // The formula type should have the correct signature
    expect(resolvedType).toBeInstanceOf(Types.FormulaType)
    const formulaType = resolvedType as Types.FormulaType
    expect(formulaType.args).toHaveLength(2)
    expect(formulaType.returnType).toEqual(Types.optional(Types.GenericType.with(['U'], U => U)))
  })

  it('can instantiate a generic enum', () => {
    defineEnum(`\
enum Result<T> {
  .value(T)
}`)
    const code = `let foo: Result(Int) = .value(0) in foo`
    const currentExpression = parse(code).get()
    const resolvedType = currentExpression.getType(typeRuntime).get()

    expect(resolvedType).toBeInstanceOf(Types.NamedEnumInstanceType)
    const enumInstance = resolvedType as Types.NamedEnumInstanceType
    expect(enumInstance.metaType.name).toEqual('Result')
    expect(enumInstance.member.name).toEqual('value')
    expect(enumInstance.member.positionalTypes).toHaveLength(1)
    expect(enumInstance.member.positionalTypes[0]).toEqual(Types.int())
  })
})
