import {parse} from '../'
import {type Expression} from '../expressions'

import * as Types from '../../types'
import * as Values from '../../values'

import {mockValueRuntime} from './mockValueRuntime'

import repl from './repl.json'

describe('repl tests', () => {
  for (const test of repl.tests) {
    describe(test.desc, () => {
      const {skip, only} = test as {skip?: boolean; only?: boolean}

      ;(only ? it.only : skip ? it.skip : it)(`should eval formula '${test.formula}'`, () => {
        let runtimeTypes: {[K in string]: [Types.Type, Values.Value]} = {}
        let valueRuntime = mockValueRuntime(runtimeTypes)

        let expression: Expression
        expect(() => {
          for (const [name, code] of test.variables) {
            const expr = parse(code)
            if (expr.isErr()) {
              throw expr.error
            }

            const type = expr.value.getType(valueRuntime)
            if (type.isErr()) {
              throw type.error
            }

            const value = expr.value.eval(valueRuntime)
            if (value.isErr()) {
              throw value.error
            }

            runtimeTypes[name] = [type.value, value.value]
          }

          expression = parse(test.formula).get()
        }).not.toThrow()

        expect(expression!.eval(valueRuntime).get()?.toCode()).toEqual(test.expectedValue)
      })
    })
  }
})
