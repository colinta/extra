import {c, cases} from '@extra-lang/cases'
import {type TypeRuntime, type ValueRuntime} from '../../runtime'
import * as Types from '../../types'
import * as Values from '../../values'
import {parseModule} from '../'
import {mockTypeRuntime} from '../../tests/mockTypeRuntime'
import {mockValueRuntime} from '../../tests/mockValueRuntime'

let runtimeTypes: {[K in string]: [Types.Type, Values.Value]}

let typeRuntime: TypeRuntime
let valueRuntime: ValueRuntime

beforeEach(() => {
  runtimeTypes = {}
  typeRuntime = mockTypeRuntime(runtimeTypes)
  valueRuntime = mockValueRuntime(runtimeTypes)
  ;((_1, _2) => {})(valueRuntime, typeRuntime)
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
class User {
  @name: String = ''

  default-name = ''

  fn rename(# name: String) =>
    @name = name

  static create(name: String) =>
    User(name:)
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
  static create(name: String) =>
    User(name:)
  default = User(name: default-name)
  fn rename(# name: String) =>
    @name = name
  default-name = ''
        secret-name = ''
  static addAge(user: User, age: Int) =>
    User(name: user.name, age: user.age + age)
  @name: String = ''
        @age:Int = 0
  fn age(# age: String) =>
    @age = age
}
`,
        `\
class User {
  @name: String = ''
  @age: Int = 0

  default = User(name: default-name)
  default-name = ''
  secret-name = ''

  fn rename(# name: String) =>
    @name = name

  fn age(# age: String) =>
    @age = age

  static create(name: String) =>
    User(name:)

  static addAge(user: User, age: Int) =>
    User(name: user.name, age: user.age + age)
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
    cases<[string]>(
      //
      c([
        `\
class User {
  default-name = ''
  secret-name = default-name

  @name: String = default-name

  static create(name: String) =>
    User(name:)

  static sayHi() =>
    'hi!'

  fn rename(# name: String) =>
    @name = name
}`,
      ]),
    ).run(([classDefinition], {only, skip}) =>
      (only ? it.only : skip ? it.skip : it)(
        `should getType class '${desc(classDefinition)}'`,
        () => {
          const moduleDef = parseModule(classDefinition).get()
          const classDef = moduleDef.expressions[0]
          const type = classDef.getType(typeRuntime)
          expect(type.get()).toEqual(
            Types.metaClass({
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
              props: new Map([
                ['default-name', Types.literal('')],
                ['secret-name', Types.literal('')],
                ['sayHi', Types.namedFormula('sayHi', [], Types.literal('hi!'))],
              ] as [string, Types.Type][]),
              moreProps: (_, classType) =>
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
          )
        },
      ),
    )
  })
})
