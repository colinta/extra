import {c, cases} from '@extra-lang/cases'
import {type TypeRuntime} from '../../runtime'
import * as Types from '../../types'
import * as Values from '../../values'
import {parse, parseModule} from '../'
import {mockTypeRuntime} from '../../tests/mockTypeRuntime'

let runtimeTypes: {[K in string]: [Types.Type, Values.Value]}

let typeRuntime: TypeRuntime
// let valueRuntime: ValueRuntime

beforeEach(() => {
  runtimeTypes = {}
  typeRuntime = mockTypeRuntime(runtimeTypes)
  // valueRuntime = mockValueRuntime(runtimeTypes)
})

function desc(def: string) {
  return def.split('\n')[0]
}
describe('enum', () => {
  describe('parser', () => {
    cases<[string] | [string, string]>(
      // simple members
      c([
        `\
enum User {
  .one
  .two
  .three
}
`,
      ]),
      // members with arguments (algebraic data types)
      c([
        `\
enum Operation {
  .add(a: Int, b: Int)
  .negate(Int)
  .identity
}
`,
      ]),
      // static property
      c([
        `\
enum Color {
  .red
  .green
  .blue

  static default = .red
}
`,
      ]),
      // static property reordered before members
      c([
        `\
enum User {
  static default = .one

  .one
  .two
  .three
}
`,
        `\
enum User {
  .one
  .two
  .three

  static default = .one
}
`,
      ]),
      c([
        `\
enum User {
  static default() => .one

  .one
  .two
  .three
}
`,
        `\
enum User {
  .one
  .two
  .three

  static default() =>
    .one
}
`,
      ]),
      // multiple static properties with dependency sorting
      c([
        `\
enum Priority {
  .low
  .medium
  .high

  static fallback = .low
  static default = fallback
}
`,
      ]),
      // static function
      c([
        `\
enum Color {
  .red
  .green
  .blue

  static from-name(name: String) =>
    .red
}
`,
      ]),
      // static property + static function
      c([
        `\
enum Color {
  .red
  .green
  .blue

  static default = .red

  static from-name(name: String) =>
    .red
}
`,
      ]),
      // instance function
      c([
        `\
enum Color {
  .red
  .green
  .blue

  fn is-red() =>
    this == .red
}
`,
      ]),
      // all together: members with args, static props, static fns, instance fns
      c([
        `\
enum Shape {
  .circle(Float)
  .rect(width: Float, height: Float)
  .point

  static default = .point

  static unit-circle() =>
    .circle(1.0)

  fn is-point() =>
    this == .point
}
`,
      ]),
      // all sections reordered – parser should sort them
      c([
        `\
enum Shape {
  static default = .point
  fn is-point() =>
    this == .point
  static unit-circle() =>
    .circle(1.0)
  .circle(Float)
  .rect(width: Float, height: Float)
  .point
}
`,
        `\
enum Shape {
  .circle(Float)
  .rect(width: Float, height: Float)
  .point

  static default = .point

  static unit-circle() =>
    .circle(1.0)

  fn is-point() =>
    this == .point
}
`,
      ]),
    ).run(([enumDefinition, expectedCode], {only, skip}) =>
      (only ? it.only : skip ? it.skip : it)(`should parse enum '${desc(enumDefinition)}'`, () => {
        const enumDef = parseModule(enumDefinition).get()
        expect(enumDef.toCode()).toEqual(expectedCode ?? enumDefinition)
      }),
    )
  })

  describe('getType', () => {
    cases<[string, Types.Type] | [string, Types.Type, [string, Types.Type][]]>(
      // simple members
      c([
        `\
enum Role { -- simple members
  .stranger
  .staff
  .admin
}`,
        Types.namedEnumDefinition({
          name: 'Role',
          members: [
            //
            Types.enumCase('stranger'),
            Types.enumCase('staff'),
            Types.enumCase('admin'),
          ],
        }),
        [],
      ]),
      // members with arguments (algebraic data types)
      c([
        `\
enum Operation { -- members with arguments
  .add(a: Int, b: Int)
  .negate(Int)
  .identity
}`,
        Types.namedEnumDefinition({
          name: 'Operation',
          members: [
            Types.enumCase('add', [
              Types.namedProp('a', Types.int()),
              Types.namedProp('b', Types.int()),
            ]),
            Types.enumCase('negate', [Types.positionalProp(Types.int())]),
            Types.enumCase('identity'),
          ],
        }),
        [],
      ]),
      // static property
      c([
        `\
enum Color { -- static property
  .red
  .green
  .blue

  static default = .red
}`,
        Types.namedEnumDefinition({
          name: 'Color',
          members: [Types.enumCase('red'), Types.enumCase('green'), Types.enumCase('blue')],
          moreStatics: (_, enumInstance) => new Map([['default', enumInstance]]),
        }),
        [],
      ]),
      // multiple static properties with dependency sorting
      c([
        `\
enum Priority { -- multiple static properties
  .low
  .medium
  .high

  static fallback = .low
  static default = fallback
}`,
        Types.namedEnumDefinition({
          name: 'Priority',
          members: [Types.enumCase('low'), Types.enumCase('medium'), Types.enumCase('high')],
          moreStatics: (_, enumInstance) =>
            new Map([
              ['fallback', enumInstance],
              ['default', enumInstance],
            ]),
        }),
        [],
      ]),
      // static function
      c([
        `\
enum Color { -- static function
  .red
  .green
  .blue

  static from-name(name: String) =>
    .red
}`,
        Types.namedEnumDefinition({
          name: 'Color',
          members: [Types.enumCase('red'), Types.enumCase('green'), Types.enumCase('blue')],
          moreStatics: (_, enumInstance) =>
            new Map([
              [
                'from-name',
                Types.namedFormula(
                  'from-name',
                  [Types.namedArgument({name: 'name', type: Types.string(), isRequired: true})],
                  enumInstance,
                ),
              ],
            ]),
        }),
        [],
      ]),
      // static property + static function
      c([
        `\
enum Color { -- static property + static function
  .red
  .green
  .blue

  static default = .red

  static from-name(name: String) =>
    .red
}`,
        Types.namedEnumDefinition({
          name: 'Color',
          members: [Types.enumCase('red'), Types.enumCase('green'), Types.enumCase('blue')],
          moreStatics: (_, enumInstance) =>
            new Map<string, Types.Type>([
              ['default', enumInstance],
              [
                'from-name',
                Types.namedFormula(
                  'from-name',
                  [Types.namedArgument({name: 'name', type: Types.string(), isRequired: true})],
                  enumInstance,
                ),
              ],
            ]),
        }),
        [],
      ]),
      // instance function
      c([
        `\
enum Color { -- instance function
  .red
  .green
  .blue

  fn is-red() =>
    this == .red
}`,
        Types.namedEnumDefinition({
          name: 'Color',
          definition: (def, members) => Types.enumType(def, members),
          members: [Types.enumCase('red'), Types.enumCase('green'), Types.enumCase('blue')],
          formulas: new Map([['is-red', Types.namedFormula('is-red', [], Types.booleanType())]]),
        }),
        [],
      ]),
      // all together: members with args, static props, static fns, instance fns
      (() => {
        return c([
          `\
enum Shape { -- all together
  .circle(Float)
  .rect(width: Float, height: Float)
  .point

  static default = .point

  static unit-circle() =>
    .circle(1.0)

  fn is-point() =>
    this is .point
}`,
          Types.namedEnumDefinition({
            name: 'Shape',
            definition: (def, members) => Types.enumType(def, members),
            members: [
              Types.enumCase('circle', [Types.positionalProp(Types.float())]),
              Types.enumCase('rect', [
                Types.namedProp('width', Types.float()),
                Types.namedProp('height', Types.float()),
              ]),
              Types.enumCase('point'),
            ],
            formulas: new Map([
              ['is-point', Types.namedFormula('is-point', [], Types.booleanType())],
            ]),
            moreStatics: (_, enumInstance) =>
              new Map<string, Types.Type>([
                ['default', enumInstance],
                ['unit-circle', Types.namedFormula('unit-circle', [], enumInstance)],
              ]),
          }),
          [],
        ])
      })(),
    ).run(([enumDefinition, expectedClassType, moreTests], {only, skip}) =>
      (only ? it.only : skip ? it.skip : it)(
        `should getType enum '${desc(enumDefinition)}'` +
          (moreTests ? ' : ' + moreTests.map(([name]) => name).join(',') : ''),
        () => {
          const moduleDef = parseModule(enumDefinition).get()
          const enumDef = moduleDef.expressions[0]
          const enumType = enumDef.getType(typeRuntime)
          expect(enumType.get()).toEqual(expectedClassType)

          if (moreTests) {
            runtimeTypes[enumDef.name] = [enumType.get(), Values.nullValue()]
            for (const [code, expectedType] of moreTests) {
              const expr = parse(code).get()
              expect(expr.getType(typeRuntime).get()).toEqual(expectedType)
            }
          }
        },
      ),
    )
  })

  describe('invalid', () => {
    cases<[string, string, string]>().run(([enumDefinition, code, message], {only, skip}) =>
      (only ? it.only : skip ? it.skip : it)(
        `should not get type of ${code} after defining ${desc(enumDefinition)}`,
        () => {
          expect(() => {
            const moduleDef = parseModule(enumDefinition).get()
            const enumDef = moduleDef.expressions[0]
            const enumType = enumDef.getType(typeRuntime)

            runtimeTypes[enumDef.name] = [enumType.get(), Values.nullValue()]
            const expr = parse(code).get()
            expr.getType(typeRuntime).get()
          }).toThrow(message)
        },
      ),
    )
  })
})
