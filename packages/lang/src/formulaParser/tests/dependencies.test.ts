import {c, cases} from '@extra-lang/cases'
import {parse, parseJsx, parseType} from '../../formulaParser'
import {Scope} from '../../scope'

describe('dependencies', () => {
  describe('basic expressions', () => {
    cases<[string, string[]]>(
      c(['a + b', ['a', 'b']]),
      c(['user', ['user']]),
      c(['@user', ['@user']]),
      c(['{ test: user }', ['user']]),
      c(['[ user ]', ['user']]),
      c(['#{ test: @user }', ['@user']]),
      c(['#[ @user ]', ['@user']]),
      c(['foo(user)', ['foo', 'user']]),
      c(['let foo = user in user', ['user']]),
      c(['fn foo(test: Int = a) => test', ['a']]),
    ).run(([formula, expectedDeps], {only, skip}) =>
      (only ? it.only : skip ? it.skip : it)(`${formula}`, () => {
        const expression = parse(formula).get()
        expect(expression.dependencies([])).toEqual(new Set(expectedDeps))
      }),
    )
  })

  describe('jsx expressions', () => {
    cases<[string, string[]]>(c(['<test />', ['test']]), c(['<test>testing</test>', ['test']])).run(
      ([formula, expectedDeps], {only, skip}) =>
        (only ? it.only : skip ? it.skip : it)(`${formula}`, () => {
          const expression = parseJsx(formula).get()
          expect(expression.dependencies([])).toEqual(new Set(expectedDeps))
        }),
    )
  })

  describe('type expressions', () => {
    cases<[string, string[]]>(
      c(['User | Foo', ['User', 'Foo']]),
      c(['User & Foo', ['User', 'Foo']]),
      c(['{ test: User }', ['User']]),
      c(['Array(User)', ['User']]),
      c(['Dict(User)', ['User']]),
      c(['Set(User)', ['User']]),
      c(['fn(test: User)', ['User']]),
    ).run(([formula, expectedDeps], {only, skip}) =>
      (only ? it.only : skip ? it.skip : it)(`${formula}`, () => {
        const expression = parseType(formula).get()
        expect(expression.dependencies([])).toEqual(new Set(expectedDeps))
      }),
    )
  })

  describe('with scopes', () => {
    it('includes all dependencies regardless of scope', () => {
      const expression = parse('a + b + c').get()
      const scopes = [new Scope('a'), new Scope('b')]
      // Scopes don't filter out dependencies, they're used for context
      expect(expression.dependencies(scopes)).toEqual(new Set(['a', 'b', 'c']))
    })
  })

  describe('property access with parentScopes', () => {
    cases<[string, string[], string[]]>(
      c(['User.foo', [], ['User']]),
      c(['User.foo', ['User'], ['foo']]),
      c(['User.foo', ['Other'], ['User']]),
    ).run(([formula, scopeNames, expectedDeps], {only, skip}) =>
      (only ? it.only : skip ? it.skip : it)(
        `${formula} with scopes [${scopeNames.join(', ')}]`,
        () => {
          const expression = parse(formula).get()
          const scopes = scopeNames.map(name => new Scope(name))
          expect(expression.dependencies(scopes)).toEqual(new Set(expectedDeps))
        },
      ),
    )
  })
})
