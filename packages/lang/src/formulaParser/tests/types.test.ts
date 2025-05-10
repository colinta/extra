import {c, cases} from '@extra-lang/cases'
import {type Expression} from '~/formulaParser/expressions'
import {parseInternalTest} from '~/formulaParser'

describe('types', () => {
  cases<[string, string] | [string, string, string]>(
    c(['type Age = Int', '(type Age `Int`)']),
    c(['public type Age = Int(>=0)', '(public type Age `Int(>=0)`)']),
    c([
      'type Point = { x: Int, y: Int }',
      '(type Point {(x: `Int`) (y: `Int`)})',
      'type Point = {x: Int, y: Int}',
    ]),
    c([
      `type Point = {
  x: Int
  y: Int
}`,
      '(type Point {(x: `Int`) (y: `Int`)})',
      'type Point = {x: Int, y: Int}',
    ]),
    c([
      `type Point = {
  x: Int?
  y: Int?
}`,
      '(type Point {(x: (`Int` | `null`)) (y: (`Int` | `null`))})',
      'type Point = {x: Int?, y: Int?}',
    ]),
    c([
      `type Point = {
  x: {a: Int} & {b: Int}
  y: Int
}`,
      '(type Point {(x: ({(a: `Int`)} & {(b: `Int`)})) (y: `Int`)})',
      'type Point = {x: {a: Int} & {b: Int}, y: Int}',
    ]),
    c(['type Box<T> = {value: T}', '(type Box <T> {(value: T)})']),
    c([
      'public type Student = User & { grade: Int(>=0) }',
      '(public type Student (User & {(grade: `Int(>=0)`)}))',
      'public type Student = User & {grade: Int(>=0)}',
    ]),
    c([
      `\
type User = {
  first-name: String(length: >=1)
  last-name: String(length: >=1)
  fullname: fn(): String
}`,
      '(type User {(first-name: `String(length: >=1)`) (last-name: `String(length: >=1)`) (fullname: (fn () : (`String`)))})',
      `\
type User = {first-name: String(length: >=1), last-name: String(length: >=1), fullname: fn(): String}`,
    ]),
    c([
      `\
type RemoteData<Tsuccess, Tfail> = enum
  | NotLoaded
  | Loading
  | Success(#value: Tsuccess)
  | Failure(#value: Tfail)
`,
      '(type RemoteData <Tsuccess, Tfail> (enum | NotLoaded | Loading | Success((#value: Tsuccess)) | Failure((#value: Tfail))))',
      `type RemoteData<Tsuccess, Tfail> = enum
  | NotLoaded
  | Loading
  | Success(#value: Tsuccess)
  | Failure(#value: Tfail)`,
    ]),
  ).run(([formula, expectedLisp, expectedCode], {only, skip}) =>
    (only ? it.only : skip ? it.skip : it)(`should parse type definition '${formula}'`, () => {
      expectedCode = expectedCode ?? formula
      let expression: Expression | undefined
      expect(() => {
        ;[expression] = parseInternalTest(formula, 'app_type_definition').get()
      }).not.toThrow()

      expect(expression?.toCode()).toEqual(expectedCode)
      expect(expression?.toLisp()).toEqual(expectedLisp)
    }),
  )
})

describe.skip('classes', () => {
  cases<[string, string] | [string, string, string]>(
    c([
      'class Point() { x: Int = 0, y: Int = 0 }',
      '(class Point() {(x: `Int` = 0) (y: `Int` = 0)})',
      'class Point() {x: Int = 0, y: Int = 0}',
    ]),
    c([
      `\
type User = class {
  first-name: String(length: >=1)
  age: Age = 0
}`,
      '(type User {(first-name: `String(length: >=1)`) (age: Age = 0)})',
      'User = {first-name: String(length: >=1), age: Age = 0}',
    ]),
    c([
      `\
class User() {
  first-name: String = ''
  last-name: String(length: >=1)?
  age: Int(>=0) = 0

  fn fullname(): String =>
    if (this.first-name and this.last-name)
    then
      this.first-name ++ this.last-name
    else
      this.first-name or this.last-name or '<no name>'
}`,
      "(type User {(first-name: `String` = '') (last-name: (`String(length: >=1)` | `null`)) (age: `Int(>=0)` = 0) (fn fullname(() : (`String`) (=> (fn if ((&& (. this first-name) (. this last-name)) (then (++ (. this first-name) (. this last-name))) (else (|| (|| (. this first-name) (. this last-name)) '<no name>')))))))})",
      `\
class User() {
  first-name: String = ''
  last-name: String(length: >=1) | null
  age: Int(>=0) = 0
  fn fullname(): String =>
    if ((this.first-name and this.last-name)) then
      this.first-name ++ this.last-name
    else
      this.first-name or this.last-name or '<no name>'
}`,
    ]),
  ).run(([formula, expectedLisp, expectedCode], {only, skip}) =>
    (only ? it.only : skip ? it.skip : it)(`should parse class definition '${formula}'`, () => {
      expectedCode = expectedCode ?? formula
      let expression: Expression | undefined
      expect(() => {
        ;[expression] = parseInternalTest(formula, 'app_type_definition').get()
      }).not.toThrow()

      expect(expression?.toCode()).toEqual(expectedCode)
      expect(expression?.toLisp()).toEqual(expectedLisp)
    }),
  )
})
