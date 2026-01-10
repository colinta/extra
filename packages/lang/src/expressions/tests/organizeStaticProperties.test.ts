import {c, cases} from '@extra-lang/cases'

import {parse} from '@/formulaParser'
import * as Expressions from '@/expressions'
import {type Expression, ClassStaticPropertyExpression} from '@/expressions'

import {organizeStaticProperties} from '../organizeStaticProperties'

type NamedExpr = Expression & {get name(): string}

class TestNamedStaticProperty extends ClassStaticPropertyExpression {
  constructor(name: string, argType: Expression | undefined, value: Expression) {
    super([0, 0], [], new Expressions.Reference([0, 0], [], name), argType, value)
  }
}

function prop(code: string) {
  const [name, formula] = code.split(' = ')
  return new TestNamedStaticProperty(name, undefined, parse(formula).get())
}

describe('organizeStaticProperties', () => {
  cases<[string, NamedExpr[], [NamedExpr[], NamedExpr[]]]>(
    //
    c(['empty case', [], [[], []]]),
    c([
      'no depencies on User',
      [prop('foo = null'), prop('bar = null'), prop('baz = bux')],
      [[prop('foo = null'), prop('bar = null'), prop('baz = bux')], []],
    ]),
    c([
      'some deps using local references',
      [prop('foo = null'), prop('baz = foo'), prop('bux = foo + 1')],
      [[prop('foo = null'), prop('baz = foo'), prop('bux = foo + 1')], []],
    ]),
    c([
      'some deps using class name',
      [prop('foo = null'), prop('bar = foo'), prop('baz = foo + 1'), prop('bux = foo.bar')],
      [[prop('foo = null'), prop('bar = foo'), prop('baz = foo + 1'), prop('bux = foo.bar')], []],
    ]),
    c([
      'constructor',
      [prop('foo = null'), prop('baz = foo'), prop('shared = User()')],
      [[prop('foo = null'), prop('baz = foo')], [prop('shared = User()')]],
    ]),
    c([
      'constructor transitive dependencies',
      [
        prop('foo = null'),
        prop('baz = foo'),
        prop('shared = User()'),
        prop('special = shared.foo'),
        prop('special-2 = shared.foo'),
      ],
      [
        [prop('foo = null'), prop('baz = foo')],
        [prop('shared = User()'), prop('special = shared.foo'), prop('special-2 = shared.foo')],
      ],
    ]),
  ).run(([desc, allStatics, expected], {only, skip}) =>
    (only ? it.only : skip ? it.skip : it)(desc, () => {
      const [expectedStaticDeps, expectedConstructorDeps] = expected
      const [actualStatics, actualConstructorDeps] = organizeStaticProperties(
        allStatics,
        'User',
      ).get()
      expect(actualStatics).toEqual(expectedStaticDeps)
      expect(actualConstructorDeps).toEqual(expectedConstructorDeps)
    }),
  )

  describe('invalid', () => {
    cases<[string, NamedExpr[], string]>(
      //
      c([
        'Accessing static property',
        [prop('foo = User.bar')],
        "Invalid property access 'static foo = User.bar' in class User. In the body of User, treat 'bar' as a local variable.",
      ]),
    ).run(([desc, allStatics, expectedMessage], {only, skip}) =>
      (only ? it.only : skip ? it.skip : it)(desc, () => {
        const result = organizeStaticProperties(allStatics, 'User')

        expect(() => {
          result.get()
        }).toThrow(expectedMessage)
      }),
    )
  })
})
