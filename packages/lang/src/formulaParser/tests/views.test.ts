import {c, cases} from '@extra-lang/cases'
import {parseInternalTest} from '../../formulaParser'

describe('view', () => {
  cases<[string, string] | [string, string, string]>(
    c(['view Asdf() => <></>', '(view Asdf() => <></>)']),
    c(['view Asdf() => <>{a}</>', '(view Asdf() => <> a </>)', 'view Asdf() => <>{a}</>']),
    c([
      `view AnyView() => <>{- comments? {- more comments wow -} -}</>`,
      '(view AnyView() => <></>)',
      'view AnyView() => <></>',
    ]),
    c([
      'view Asdf() => <>a{a}b</>',
      "(view Asdf() => <> 'a' a 'b' </>)",
      'view Asdf() => <>a{a}b</>',
    ]),
    c([
      'view Asdf() => <>a {a} b</>',
      "(view Asdf() => <> 'a ' a ' b' </>)",
      'view Asdf() => <>a {a} b</>',
    ]),
    c([
      'view Asdf() => <>a\\{a\\}b<\\<\\></>',
      "(view Asdf() => <> 'a{a}b<<>' </>)",
      'view Asdf() => <>a\\{a\\}b<<></>',
    ]),
    c([
      `view Asdf() =>
  <>
    a
    {a}
    b<
  </>`,
      "(view Asdf() => <> '\\n  a\\n  ' a '\\n  b<\\n' </>)",
    ]),
    c(['view Foo(a: User) => <User user=a />', '(view Foo((a: User)) => <User user=a />)']),
    c([
      `view AnyView() =>
  <>
    <Row height=8 width="auto">
      <Header style=@style>Welcome!</Header>
      <Text isBold !isFancy>Hello, {name}</Text>
      <Button title=foo . bar onPress=&action testFn=foo('bar') testArray=foo[0] testOp=(1+1) testSafe=foo?.bar />
    </Row>
  </>
    `,
      `(view AnyView() => <> '\\n  ' <Row height=8 width='auto'> '\\n  ' <Header style=@style> 'Welcome!' </Header> '\\n  ' <Text isBold !isFancy> 'Hello, ' name </Text> '\\n  ' <Button title=foo.bar onPress=&action testFn=foo('bar') testArray=foo[0] testOp=(1 + 1) testSafe=foo?.bar /> '\\n' </Row> '\\n' </>)`,
      `view AnyView() =>
  <>
    <Row height=8 width='auto'>
      <Header style=@style>Welcome!</Header>
      <Text isBold !isFancy>Hello, {name}</Text>
      <Button title=foo.bar onPress=&action testFn=foo('bar') testArray=foo[0] testOp=(1 + 1) testSafe=foo?.bar />
    </Row>
  </>`,
    ]),
  ).run(([formula, expectedLisp, expectedFormula], {only, skip}) =>
    (only ? it.only : skip ? it.skip : it)(`should parse view definition '${formula}'`, () => {
      const [expression] = parseInternalTest(formula, 'app_view_definition').get()

      expect(expression!.toCode()).toEqual(expectedFormula ?? formula)
      expect(expression!.toLisp()).toEqual(expectedLisp)
    }),
  )
})

describe('bad views', () => {
  cases<[string, string]>(
    c(['asdf() => <></>', "Expected 'view(' to start the formula expression"]),
    c(['view asdf() => <></>', "Views must start with an uppercased letter, found 'asdf'"]),
  ).run(([formula, error], {only, skip}) =>
    (only ? it.only : skip ? it.skip : it)(
      `should error parsing View definitions ${formula}`,
      () => {
        expect(() => parseInternalTest(formula, 'app_view_definition').get()).toThrow(error)
      },
    ),
  )
})
