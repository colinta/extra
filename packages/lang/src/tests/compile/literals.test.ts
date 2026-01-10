import {c, cases} from '@extra-lang/cases'
import {err, type Result} from '@extra-lang/result'

import * as Types from '@/types'
import * as Nodes from '@/nodes'
import {type RuntimeError} from '@/expressions'
import * as Values from '@/values'
import {type TypeRuntime} from '@/runtime'
import {parse} from '@/formulaParser'
import {type ParseError} from '@/formulaParser/types'
import {mockTypeRuntime} from '@/tests/mockTypeRuntime'

let typeRuntime: TypeRuntime
let runtimeTypes: {[K in string]: [Types.Type, Values.Value]}

beforeEach(() => {
  runtimeTypes = {}
  typeRuntime = mockTypeRuntime(runtimeTypes)
})

describe('compile literals', () => {
  const source = expect.anything()

  cases<[string, Nodes.Node]>(
    //
    c(['true', new Nodes.LiteralTrue(source)]),
    c(['false', new Nodes.LiteralFalse(source)]),
    c(['null', new Nodes.LiteralNull(source)]),
    c(['0', new Nodes.LiteralInt(source, 0, 'decimal')]),
    c(['0.', new Nodes.LiteralFloat(source, 0)]),
    c(['0.0', new Nodes.LiteralFloat(source, 0)]),
    c(['0.25', new Nodes.LiteralFloat(source, 0.25)]),
    c(['0b11001', new Nodes.LiteralInt(source, 0b11001, 'binary')]),
    c(['0o765', new Nodes.LiteralInt(source, 0o765, 'octal')]),
    c(['0xFF', new Nodes.LiteralInt(source, 0xff, 'hexadecimal')]),
    c(['/\\w+/', new Nodes.LiteralRegex(source, '\\w+', '', new Map())]),
    c([
      '/(?<foo>\\w+)/',
      new Nodes.LiteralRegex(source, '(?<foo>\\w+)', '', new Map([['foo', '\\w+']])),
    ]),
    c(['"a"', new Nodes.LiteralString(source, 'a', ['a'])]),
    c(['"🙂"', new Nodes.LiteralString(source, '🙂', ['🙂'])]),
    c(['"👩🏻"', new Nodes.LiteralString(source, '👩🏻', ['👩🏻'])]),
    c([
      '`a ${"dog"}`',
      new Nodes.StringTemplate(
        source,
        [
          new Nodes.LiteralString(source, 'a ', ['a', ' ']),
          new Nodes.LiteralString(source, 'dog', ['d', 'o', 'g']),
        ],
        Types.literal('a dog'),
      ),
    ]),
  ).run(([formula, expected], {only, skip}) =>
    (only ? it.only : skip ? it.skip : it)(
      `should compile '${formula}' into node '${expected}'`,
      () => {
        const compiled = parse(formula).mapResult(
          (exprResult): Result<Nodes.Node, ParseError | RuntimeError> => {
            if (exprResult.isOk()) {
              return exprResult.value.compile(typeRuntime)
            } else {
              return err(exprResult.error)
            }
          },
        )

        expect(compiled.get()).toEqual(expected)
      },
    ),
  )
})
