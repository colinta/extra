import {c, cases} from '@extra-lang/cases'
import {parse} from '../'
import {type Expression} from '../expressions'

describe('newline-as-comma', () => {
  cases<[string, string]>(
    c([
      `\
[1
2
3
]`,
      '[1, 2, 3]',
    ]),
    c([
      `\
[ 1
  2
  3
]`,
      '[1, 2, 3]',
    ]),
    c([
      `\
[ 1
  2,
  3
]`,
      '[1, 2, 3]',
    ]),
    c([
      `\
[ 1
  2  ,
  3
]`,
      '[1, 2, 3]',
    ]),
    c([
      `\
[ 1
  2
  , 3
]`,
      '[1, 2, 3]',
    ]),
    c([
      `\
[ 1
  2
  ,3
]`,
      '[1, 2, 3]',
    ]),
    c([
      `\
[ 1 -- comment
  2
  ,3
]`,
      '[1, 2, 3]',
    ]),
    c([
      `\
[ 1
  2 -- comment
  ,3
]`,
      '[1, 2, 3]',
    ]),
    c([
      `\
[ 1
  2
  ,3 -- comment
]`,
      '[1, 2, 3]',
    ]),
    c([
      `\
[ 1
  + 2
  |> # + 3
  -3
]`,
      '[1 + 2 |> # + 3, -3]',
    ]),
    c([
      `\
[ 1
  + 2
  |> # + 3
  - 3
]`,
      '[1 + 2 |> # + 3 - 3]',
    ]),
    c([
      `\
{a: 1
 b: "2"}`,
      "{a: 1, b: '2'}",
    ]),
    c([
      `\
{ 1
 "2" }`,
      "{1, '2'}",
    ]),
    c([
      `\
dict( foo: 1
  bar: 2
)`,
      'dict(foo: 1, bar: 2)',
    ]),
    c([
      `\
dict( foo: 1
  bar: 2


 )`,
      'dict(foo: 1, bar: 2)',
    ]),
    c([
      `\
func(1
 2
 "3"
  )`,
      "func(1, 2, '3')",
    ]),
    c([
      `\
func(
foo: 1
bar: 2
baz: "3"
  )`,
      "func(foo: 1, bar: 2, baz: '3')",
    ]),
  ).run(([formula, expected], {only, skip}) =>
    (only ? it.only : skip ? it.skip : it)(
      `should allow newline in place of comma in ${formula}`,
      () => {
        let expression: Expression
        expect(() => {
          expression = parse(formula).get()

          expect(expression.toCode()).toEqual(expected)
        }).not.toThrow()
      },
    ),
  )
})
