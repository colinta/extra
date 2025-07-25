import {c, cases} from '@extra-lang/cases'
import {parse} from '../'

describe('only', () => {
  cases<[string] | [string, string]>(
    c.skip([
      `\
let
  -- I added explicit types to 'let' assignments, which really helps
  -- with testing (and is useful in general, I think), so that's fun:
  ints: Array(Int, length: 1...5) =
    [1, 2, 3] -- the assignment is of course checked;
              -- is Array(1|2|3, length: =3) assignable to Array(Int, length: 1...5)?
              -- (spoiler: yes)
in
  ints is
--     ^^ the match operator!
       [ Int(>=1) as a, b, d, ...e]
--       ^^^^^^^\\____|__|__|_____|___ type check the first arg
--                   \\__|__|_____|___ and assign it to 'a' if it matches
--                      \\__|_____|___ assign second and third, whatever they are, to 'b' and 'd'
--                               \\___ assign remainder to 'e'
        -- if it matches, run the rhs, which is populated with the matches
        -- this uses the object shorthand {key:} => {key: key}
        and {a:, b:, d:, e:}
`,
    ]),
  ).run(([formula, expectedCode], {only, skip}) =>
    (only ? it.only : skip ? it.skip : it)(`should parse`, () => {
      expectedCode = expectedCode ?? formula
      const result = parse(formula, 1)
      const expression = result.get()

      expect(expression?.toCode()).toEqual(expectedCode)
    }),
  )
})
