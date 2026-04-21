import {c, cases} from '@extra-lang/cases'
import {parse} from '../formulaParser'
import * as Types from '../types'
import {type TypeRuntime, type ValueRuntime} from '../runtime'
import * as Values from '../values'
import {mockTypeRuntime} from './mockTypeRuntime'
import {mockValueRuntime} from './mockValueRuntime'

let runtimeTypes: {[K in string]: [Types.Type, Values.Value]}

let typeRuntime: TypeRuntime
let valueRuntime: ValueRuntime

beforeEach(() => {
  runtimeTypes = {}
  typeRuntime = mockTypeRuntime(runtimeTypes)
  valueRuntime = mockValueRuntime(runtimeTypes)
})

describe('number parse', () => {
  describe('types', () => {
    cases<[string, Types.Type]>(
      c([
        'Int.parse',
        Types.namedFormula(
          'parse',
          [
            Types.positionalArgument({name: 'input', type: Types.StringType, isRequired: true}),
            Types.namedArgument({
              name: 'radix',
              type: Types.IntType.narrow(0, undefined),
              isRequired: false,
            }),
          ],
          Types.optional(Types.IntType),
        ),
      ]),
      c([
        'Float.parse',
        Types.namedFormula(
          'parse',
          [Types.positionalArgument({name: 'input', type: Types.StringType, isRequired: true})],
          Types.optional(Types.FloatType),
        ),
      ]),
    ).run(([formula, expectedType], {only, skip}) =>
      (only ? it.only : skip ? it.skip : it)(
        `'${formula}' should have type '${expectedType}'`,
        () => {
          const expression = parse(formula).get()
          expect(expression.getType(typeRuntime).get()).toEqual(expectedType)
        },
      ),
    )
  })

  describe('eval', () => {
    cases<[string, Values.Value]>(
      c(['Int.parse("5")', Values.int(5)]),
      c(['Int.parse("")', Values.nullValue()]),
      c(['Int.parse("11", radix: 2)', Values.int(3)]),
      c(['Int.parse("11", radix: 10)', Values.int(11)]),
      c(['Int.parse("z", radix: 36)', Values.int(35)]),
      c(['Int.parse("z", radix: 10)', Values.nullValue()]),
      c(['Float.parse("5")', Values.float(5)]),
      c(['Float.parse("5.5")', Values.float(5.5)]),
      c(['Float.parse("  -0.25  ")', Values.float(-0.25)]),
      c(['Float.parse("")', Values.nullValue()]),
      c(['Float.parse("abc")', Values.nullValue()]),
    ).run(([formula, expectedValue], {only, skip}) =>
      (only ? it.only : skip ? it.skip : it)(
        `'${formula}' should eval to '${expectedValue}'`,
        () => {
          const expression = parse(formula).get()
          expect(expression.eval(valueRuntime).get()).toEqual(expectedValue)
        },
      ),
    )
  })
})
