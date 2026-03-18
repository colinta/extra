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
          moreStatics: (def, _) => new Map([['default', def.lookupCase('red')!]]),
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
          moreStatics: (def, _) =>
            new Map<string, Types.Type>([
              ['fallback', def.lookupCase('low')!],
              ['default', def.lookupCase('low')!],
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
          moreStatics: (def, _) =>
            new Map([
              [
                'from-name',
                Types.namedFormula(
                  'from-name',
                  [Types.namedArgument({name: 'name', type: Types.string(), isRequired: true})],
                  def.lookupCase('red')!,
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
          moreStatics: (def, _) =>
            new Map<string, Types.Type>([
              ['default', def.lookupCase('red')!],
              [
                'from-name',
                Types.namedFormula(
                  'from-name',
                  [Types.namedArgument({name: 'name', type: Types.string(), isRequired: true})],
                  def.lookupCase('red')!,
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
          definition: (def, members) => members.map(m => Types.enumType(def, m)),
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
            definition: (def, members) => members.map(m => Types.enumType(def, m)),
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
            moreStatics: (def, _) =>
              new Map<string, Types.Type>([
                ['default', def.lookupCase('point')!],
                ['unit-circle', Types.namedFormula('unit-circle', [], def.lookupCase('circle')!)],
              ]),
          }),
          [],
        ])
      })(),
      // enum shorthand lookup: no-arg case
      c([
        `\
enum Role { -- shorthand lookup no-arg
  .stranger
  .staff
  .admin
}`,
        Types.namedEnumDefinition({
          name: 'Role',
          members: [Types.enumCase('stranger'), Types.enumCase('staff'), Types.enumCase('admin')],
        }),
        [
          [
            '.admin',
            Types.namedEnumDefinition({
              name: 'Role',
              members: [
                Types.enumCase('stranger'),
                Types.enumCase('staff'),
                Types.enumCase('admin'),
              ],
            }).lookupCase('admin')!,
          ],
        ],
      ]),
      // enum shorthand lookup: case with arguments
      (() => {
        const def = Types.namedEnumDefinition({
          name: 'Operation',
          members: [
            Types.enumCase('add', [
              Types.namedProp('a', Types.int()),
              Types.namedProp('b', Types.int()),
            ]),
            Types.enumCase('negate', [Types.positionalProp(Types.int())]),
            Types.enumCase('identity'),
          ],
        })
        return c([
          `\
enum Operation { -- shorthand lookup with args
  .add(a: Int, b: Int)
  .negate(Int)
  .identity
}`,
          def,
          [
            ['.identity', def.lookupCase('identity')!],
            [
              '.add',
              Types.namedFormula(
                'add',
                [
                  Types.namedArgument({name: 'a', type: Types.int(), isRequired: true}),
                  Types.namedArgument({name: 'b', type: Types.int(), isRequired: true}),
                ],
                def.lookupCase('add')!,
              ),
            ],
          ],
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

  describe('disambiguation', () => {
    it('should disambiguate by positional argument count', () => {
      // Register two enums with .success but different arg counts
      const resultDef = parseModule(`\
enum Result {
  .success(Int)
  .failure(String)
}`).get()
      const fooDef = parseModule(`\
enum Foo {
  .success(Int, Int)
  .failure(String, String)
}`).get()
      const resultType = resultDef.expressions[0].getType(typeRuntime).get()
      const fooType = fooDef.expressions[0].getType(typeRuntime).get()
      runtimeTypes['Result'] = [resultType, Values.nullValue()]
      runtimeTypes['Foo'] = [fooType, Values.nullValue()]

      // .success(1) has 1 positional arg → should match Result.success
      const expr1 = parse('.success(1)').get()
      const type1 = expr1.getType(typeRuntime).get()
      expect(type1).toEqual((resultType as Types.NamedEnumDefinitionType).lookupCase('success'))

      // .success(1, 2) has 2 positional args → should match Foo.success
      const expr2 = parse('.success(1, 2)').get()
      const type2 = expr2.getType(typeRuntime).get()
      expect(type2).toEqual((fooType as Types.NamedEnumDefinitionType).lookupCase('success'))
    })

    it('should disambiguate by named argument names', () => {
      const resultDef = parseModule(`\
enum Result {
  .data(value: Int)
  .none
}`).get()
      const fooDef = parseModule(`\
enum Foo {
  .data(items: Int)
  .none
}`).get()
      const resultType = resultDef.expressions[0].getType(typeRuntime).get()
      const fooType = fooDef.expressions[0].getType(typeRuntime).get()
      runtimeTypes['Result'] = [resultType, Values.nullValue()]
      runtimeTypes['Foo'] = [fooType, Values.nullValue()]

      // .data(value: 1) → should match Result.data
      const expr1 = parse('.data(value: 1)').get()
      const type1 = expr1.getType(typeRuntime).get()
      expect(type1).toEqual((resultType as Types.NamedEnumDefinitionType).lookupCase('data'))

      // .data(items: 1) → should match Foo.data
      const expr2 = parse('.data(items: 1)').get()
      const type2 = expr2.getType(typeRuntime).get()
      expect(type2).toEqual((fooType as Types.NamedEnumDefinitionType).lookupCase('data'))
    })

    it('should error when multiple enums match the same case with same arg shape', () => {
      const resultDef = parseModule(`\
enum Result {
  .success(Int)
  .failure(String)
}`).get()
      const fooDef = parseModule(`\
enum Foo {
  .success(String)
  .failure(Int)
}`).get()
      const resultType = resultDef.expressions[0].getType(typeRuntime).get()
      const fooType = fooDef.expressions[0].getType(typeRuntime).get()
      runtimeTypes['Result'] = [resultType, Values.nullValue()]
      runtimeTypes['Foo'] = [fooType, Values.nullValue()]

      // .success(1) — both have .success with 1 positional arg → ambiguous
      expect(() => {
        parse('.success(1)').get().getType(typeRuntime).get()
      }).toThrow('Ambiguous')
    })

    it('should error when multiple enums have the same no-arg case', () => {
      const colorDef = parseModule(`\
enum Color {
  .red
  .blue
}`).get()
      const lightDef = parseModule(`\
enum Light {
  .red
  .green
}`).get()
      const colorType = colorDef.expressions[0].getType(typeRuntime).get()
      const lightType = lightDef.expressions[0].getType(typeRuntime).get()
      runtimeTypes['Color'] = [colorType, Values.nullValue()]
      runtimeTypes['Light'] = [lightType, Values.nullValue()]

      // .red — both have .red with no args → ambiguous
      expect(() => {
        parse('.red').get().getType(typeRuntime).get()
      }).toThrow('Ambiguous')
    })
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
