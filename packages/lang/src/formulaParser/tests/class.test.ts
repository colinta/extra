import {c, cases} from '@extra-lang/cases'
import {type TypeRuntime, type ValueRuntime} from '../../runtime'
import * as Types from '../../types'
import * as Values from '../../values'
import {parse, parseModule} from '../'
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

function desc(def: string) {
  return def.split('\n')[0]
}
describe('class', () => {
  describe('parser', () => {
    cases<[string] | [string, string]>(
      //
      c([
        `\
class User { -- first, the name
  @name: String = ''

  static default-name = ''

  fn rename(# name: String) =>
    @name = name

  static create(name: String) =>
    User(name:)
}
`,
        `\
class User {
  static default-name = ''

  static create(name: String) => User(name:)

  -- first, the name
  @name: String = ''

  fn rename(# name: String) =>
    @name = name
}
`,
      ]),
      c([
        `\
class User(name: String) {
  @name: String = name
}
`,
      ]),
      c([
        `\
class User {
  @name = ''
}
`,
      ]),
      c([
        `\
class User {
  static create(name: String) =>
    User(name:)
  static default = User(name: default-name)
  fn rename(# name: String) =>
    @name = name
  static default-name = ''
  static
      secret-name = ''
  static addAge(user: User, age: Int) =>
    User(name: user.name, age: user.age + age)
  @name: String = ''
        @age:Int = 0
  fn set-age(# age: String) =>
    @age = age
}
`,
        `\
class User {
  static default-name = ''
  static default = User(name: default-name)
  static secret-name = ''

  static create(name: String) => User(name:)

  static addAge(user: User, age: Int) => User(name: user.name, age: user.age + age)

  @name: String = ''
  @age: Int = 0

  fn rename(# name: String) =>
    @name = name

  fn set-age(# age: String) =>
    @age = age
}
`,
      ]),
      c([
        `\
class User {
  static default-name = ''
  static create(name: String) => User(name:)
}
`,
        `\
class User {
  static default-name = ''

  static create(name: String) => User(name:)
}
`,
      ]),
      // no need to sort static properties
      c([
        `\
class User {
  static a = ''
  static b = a
}
`,
      ]),
      // sort static properties
      c([
        `\
class User {
  static d = b
  static b = a
  static a = ''
  static c = a
  static e = d
}
`,
        `\
class User {
  static a = ''
  static b = a
  static d = b
  static c = a
  static e = d
}
`,
      ]),
      // sort qualified names
      c([
        `\
class User {
  static d = User.b
  static b = User.a
  static a = ''
  static c = User.a
  static e = User.d
}
`,
        `\
class User {
  static a = ''
  static b = User.a
  static d = User.b
  static c = User.a
  static e = User.d
}
`,
      ]),
    ).run(([classDefinition, expectedCode], {only, skip}) =>
      (only ? it.only : skip ? it.skip : it)(
        `should parse class '${desc(classDefinition)}'`,
        () => {
          const classDef = parseModule(classDefinition).get()
          expect(classDef.toCode()).toEqual(expectedCode ?? classDefinition)
        },
      ),
    )
  })

  describe('getType', () => {
    cases<[string, Types.Type] | [string, Types.Type, [string, Types.Type][]]>(
      c([
        `\
class User { -- inferred @name
  @name = 'name'
}`,
        Types.classDefinition({
          name: 'User',
          class: Types.classType({
            name: 'User',
            props: new Map([['name', Types.string()]]),
            formulas: new Map(),
          }),
          defaults: ['name'],
          staticProps: new Map(),
        }),
        [],
      ]),
      c([
        `\
class User { -- explicit name
  static default-name = ''
  static secret-name = default-name

  @name: String = default-name

  static create(name: String) =>
    User(name:)

  static sayHi() =>
    'hi!'

  fn rename(# name: String) =>
    @name = name
}`,
        Types.classDefinition({
          name: 'User',
          class: Types.classType({
            name: 'User',
            props: new Map([['name', Types.string()]]),
            formulas: new Map([
              [
                'rename',
                Types.namedFormula(
                  'rename',
                  [
                    Types.positionalArgument({
                      name: 'name',
                      type: Types.string(),
                      isRequired: true,
                    }),
                  ],
                  new Types.MessageType(),
                ),
              ],
            ]),
          }),
          defaults: ['name'],
          staticProps: new Map([
            ['default-name', Types.literal('')],
            ['secret-name', Types.literal('')],
            ['sayHi', Types.namedFormula('sayHi', [], Types.literal('hi!'))],
          ] as [string, Types.Type][]),
          moreStatics: (_, classType) =>
            new Map([
              [
                'create',
                Types.namedFormula(
                  'create',
                  [Types.namedArgument({name: 'name', type: Types.string(), isRequired: true})],
                  classType,
                ),
              ],
            ]),
        }),
        [
          ['User.default-name', Types.literal('')],
          ['User.secret-name', Types.literal('')],
        ],
      ]),
      c([
        `\
class User { -- default 'name'
  static default-name = ''
  static secret-name = default-name

  @name: String = default-name

  static create() =>
    User()

  static sayHi() =>
    'hi!'

  fn rename(# name: String) =>
    @name = name
}`,
        Types.classDefinition({
          name: 'User',
          class: Types.classType({
            name: 'User',
            props: new Map([['name', Types.string()]]),
            formulas: new Map([
              [
                'rename',
                Types.namedFormula(
                  'rename',
                  [
                    Types.positionalArgument({
                      name: 'name',
                      type: Types.string(),
                      isRequired: true,
                    }),
                  ],
                  new Types.MessageType(),
                ),
              ],
            ]),
          }),
          defaults: ['name'],
          staticProps: new Map([
            ['default-name', Types.literal('')],
            ['secret-name', Types.literal('')],
            ['sayHi', Types.namedFormula('sayHi', [], Types.literal('hi!'))],
          ] as [string, Types.Type][]),
          moreStatics: (_, classType) =>
            new Map([['create', Types.namedFormula('create', [], classType)]]),
        }),
        [
          ['User.sayHi', Types.namedFormula('sayHi', [], Types.literal('hi!'))],
          ['User.sayHi()', Types.literal('hi!')],
        ],
      ]),
      c([
        `\
class User(howdy: String) {
  static default-name = ''
  static secret-name = default-name

  @name: String = default-name

  static create(name: String) =>
    User(howdy: name)

  static sayHi() =>
    'hi!'

  fn rename(# name: String) =>
    @name = name
}`,
        Types.classDefinition({
          name: 'User',
          class: Types.classType({
            name: 'User',
            props: new Map([['name', Types.string()]]),
            formulas: new Map([
              [
                'rename',
                Types.namedFormula(
                  'rename',
                  [
                    Types.positionalArgument({
                      name: 'name',
                      type: Types.string(),
                      isRequired: true,
                    }),
                  ],
                  new Types.MessageType(),
                ),
              ],
            ]),
          }),
          defaults: ['name'],
          staticProps: new Map([
            ['default-name', Types.literal('')],
            ['secret-name', Types.literal('')],
            ['sayHi', Types.namedFormula('sayHi', [], Types.literal('hi!'))],
          ] as [string, Types.Type][]),
          moreStatics: (_, classType) =>
            new Map([
              [
                'create',
                Types.namedFormula(
                  'create',
                  [Types.namedArgument({name: 'name', type: Types.string(), isRequired: true})],
                  classType,
                ),
              ],
            ]),
        }),
        [
          ['User().name', Types.string()],
          ['User().rename("")', new Types.MessageType()],
        ],
      ]),
    ).run(([classDefinition, expectedClassType, moreTests], {only, skip}) =>
      (only ? it.only : skip ? it.skip : it)(
        `should getType class '${desc(classDefinition)}'` +
          (moreTests ? ' : ' + moreTests.map(([name]) => name).join(',') : ''),
        () => {
          const moduleDef = parseModule(classDefinition).get()
          const classDef = moduleDef.expressions[0]
          const classType = classDef.getType(typeRuntime)
          expect(classType.get()).toEqual(expectedClassType)

          if (moreTests) {
            runtimeTypes[classDef.name] = [classType.get(), Values.nullValue()]
            for (const [code, expectedType] of moreTests) {
              const expr = parse(code).get()
              expect(expr.getType(typeRuntime).get()).toEqual(expectedType)
            }
          }
        },
      ),
    )
  })

  describe('eval', () => {
    cases<[string, Values.Value] | [string, Values.Value, [string, Values.Value][]]>(
      c([
        `\
class User {
  @name: String = ''
}`,
        Values.classDefinition({name: 'User', constructor: expect.anything()}),
        [['User().name', Values.string('')]],
      ]),
      c([
        `\
class User { -- name = 'value'
  @name: String = 'value'
}`,
        Values.classDefinition({name: 'User', constructor: expect.anything()}),
        [['User().name', Values.string('value')]],
      ]),
      c([
        `\
class User(howdy: String) { -- howdy: string
  @name: String = howdy
}`,
        Values.classDefinition({name: 'User', constructor: expect.anything()}),
        [['User(howdy: "fella").name', Values.string('fella')]],
      ]),
    ).run(([classDefinition, expectedClassType, moreTests], {only, skip}) =>
      (only ? it.only : skip ? it.skip : it)(
        `should eval class '${desc(classDefinition)}'` +
          (moreTests ? ' : ' + moreTests.map(([name]) => name).join(',') : ''),
        () => {
          const moduleDef = parseModule(classDefinition).get()
          const classDef = moduleDef.expressions[0]
          const classValue = classDef.eval(valueRuntime)
          expect(classValue.get()).toEqual(expectedClassType)

          if (moreTests) {
            runtimeTypes[classDef.name] = [Types.nullType(), classValue.get()]
            for (const [code, expectedType] of moreTests) {
              const expr = parse(code).get()
              expect(expr.eval(valueRuntime).get()).toEqual(expectedType)
            }
          }
        },
      ),
    )
  })

  describe('invalid', () => {
    cases<[string, string, string]>(
      c([
        `\
class User {
  @name: String
}`,
        'User()',
        "Expected argument named 'name' of type 'String'",
      ]),
    ).run(([classDefinition, code, message], {only, skip}) =>
      (only ? it.only : skip ? it.skip : it)(
        `should not get type of ${code} after defining ${desc(classDefinition)}`,
        () => {
          expect(() => {
            const moduleDef = parseModule(classDefinition).get()
            const classDef = moduleDef.expressions[0]
            const classType = classDef.getType(typeRuntime)

            runtimeTypes[classDef.name] = [classType.get(), Values.nullValue()]
            const expr = parse(code).get()
            expr.getType(typeRuntime).get()
          }).toThrow(message)
        },
      ),
    )
  })
})
