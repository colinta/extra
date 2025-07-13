import {c, cases} from '@extra-lang/cases'
import {parse} from '~/formulaParser'

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
  ...x
  ...y
      |>
      #
      ++
      []
]`,
      '[1, ...x, ...y |> # ++ []]',
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
[ 1
  2
  -x
]`,
      '[1, 2, -x]',
    ]),
    c([
      `\
[ 1
  2
  -(x + 1)
]`,
      '[1, 2, -(x + 1)]',
    ]),
    c([
      `\
[ 1
  2
  -x
  if foo
]`,
      '[1, 2, -x if foo]',
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
        const expression = parse(formula).get()
        expect(expression.toCode()).toEqual(expected)
      },
    ),
  )
})
