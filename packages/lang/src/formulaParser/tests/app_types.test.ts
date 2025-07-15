import {c, cases} from '@extra-lang/cases'
import {parseInternalTest} from '../../formulaParser'

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
enum RemoteData<Tsuccess, Tfail> {
  .notLoaded
  .loading
  .success(#value: Tsuccess)
  .failure(#value: Tfail)
}
`,
      '((enum RemoteData) <Tsuccess Tfail> (.notLoaded .loading .success((#value: Tsuccess)) .failure((#value: Tfail))))',
      `\
enum RemoteData<Tsuccess, Tfail> {
  .notLoaded
  .loading
  .success(#value: Tsuccess)
  .failure(#value: Tfail)
}`,
    ]),
    c([
      `\
enum RemoteData<Tsuccess, Tfail> {
  .notLoaded
  .loading
  .success(#value: Tsuccess)
  .failure(#value: Tfail)

  fn toMaybe(): Maybe(Tsuccess) =>
      switch(this) {
      case: .success(value) => .some(value)
      else: .none
      }
}
`,
      '((enum RemoteData) <Tsuccess Tfail> (.notLoaded .loading .success((#value: Tsuccess)) .failure((#value: Tfail))))',
      `\
enum RemoteData<Tsuccess, Tfail> {
  .notLoaded
  .loading
  .success(#value: Tsuccess)
  .failure(#value: Tfail)

  fn toMaybe(): Maybe(Tsuccess) =>
    switch(this) { case: .success(value) => .some(value), else: .none }
}`,
    ]),
    c([
      `\
public class User<T> {
    first-name: String
    last-name: String
    data: T

    fn name() =>
        first-name <> ' ' <> last-name
    static default() =>
        User(first-name: '', last-name: '', data: 0)
}
`,
      "((class User) <T> ((first-name: `String`) (last-name: `String`) (data: T))((fn name() => (<> (<> first-name ' ') last-name)) (static default() => (fn User ((first-name: '') (last-name: '') (data: 0))))))",
      `class User<T> {
  first-name: String
  last-name: String
  data: T

  fn name() =>
    first-name <> ' ' <> last-name
  static default() =>
    User(first-name: '', last-name: '', data: 0)
}`,
    ]),
  ).run(([formula, expectedLisp, expectedCode], {only, skip}) =>
    (only ? it.only : skip ? it.skip : it)(`should parse type definition '${formula}'`, () => {
      expectedCode = expectedCode ?? formula
      const [expression] = parseInternalTest(formula, 'app_type_definition').get()

      expect(expression?.toCode()).toEqual(expectedCode)
      expect(expression?.toLisp()).toEqual(expectedLisp)
    }),
  )
})

describe('classes', () => {
  cases<[string, string] | [string, string, string]>(
    c([
      'class Point { x: Int = 0, y: Int = 0 }',
      '(class Point {(x: `Int` = 0) (y: `Int` = 0)})',
      'class Point {x: Int = 0, y: Int = 0}',
    ]),
    c([
      'class Rect extends Point { w: Int = 0, h: Int = 0 }',
      '(class Rect extends Point {(w: `Int` = 0) (h: `Int` = 0)})',
      'class Rect extends Point {w: Int = 0, h: Int = 0}',
    ]),
    c([
      `\
class User {
  first-name: String(length: >=1)
  age: Age = 0
}`,
      '(class User {(first-name: `String(length: >=1)`) (age: Age = 0)})',
      'User = {first-name: String(length: >=1), age: Age = 0}',
    ]),
    c([
      `\
class User {
  first-name: String = ''
  last-name: String(length: >=1)?
  age: Int(>=0) = 0

  fn fullname(): String =>
    if (this.first-name and this.last-name) {
    then:
      this.first-name <> this.last-name
    else:
      this.first-name or this.last-name or '<no name>'
    }
}`,
      "(type User {(first-name: `String` = '') (last-name: (`String(length: >=1)` | `null`)) (age: `Int(>=0)` = 0) (fn fullname(() : (`String`) => (fn if ((&& (. this first-name) (. this last-name)) (then (<> (. this first-name) (. this last-name))) (else (|| (|| (. this first-name) (. this last-name)) '<no name>'))))))})",
      `\
class User {
  first-name: String = ''
  last-name: String(length: >=1) | null
  age: Int(>=0) = 0

  fn fullname(): String =>
    if ((this.first-name and this.last-name)) {
    then:
      this.first-name <> this.last-name
    else:
      this.first-name or this.last-name or '<no name>'
    }
}`,
    ]),
  ).run(([formula, expectedLisp, expectedCode], {only, skip}) =>
    (only ? it.only : skip ? it.skip : it)(`should parse class definition '${formula}'`, () => {
      expectedCode = expectedCode ?? formula
      const [expression] = parseInternalTest(formula, 'app_type_definition').get()

      expect(expression?.toCode()).toEqual(expectedCode)
      expect(expression?.toLisp()).toEqual(expectedLisp)
    }),
  )
})
