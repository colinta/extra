import * as Types from '../../types'
import * as Values from '../../values'
import {parse} from '../../formulaParser'
import {mockValueRuntime} from '../../tests/mockValueRuntime'

import repl from './repl.json'

describe('repl tests', () => {
  for (const test of repl.tests) {
    describe(test.desc, () => {
      const {skip, only} = test as {skip?: boolean; only?: boolean}

      ;(only ? it.only : skip ? it.skip : it)(`should eval formula '${test.formula}'`, () => {
        let runtimeTypes: {[K in string]: [Types.Type, Values.Value]} = {}
        let valueRuntime = mockValueRuntime(runtimeTypes)

        for (const [name, code] of test.variables) {
          const expr = parse(code)
          if (expr.isErr()) {
            throw expr.error
          }

          const type = expr.value.getType(valueRuntime)
          if (type.isErr()) {
            console.trace(type.error)
            throw type.error
          }

          const value = expr.value.eval(valueRuntime)
          if (value.isErr()) {
            throw value.error
          }

          runtimeTypes[name] = [type.value, value.value]
        }

        const expression = parse(test.formula).get()

        expect(expression!.toCode()).toEqual(test.expectedCode)
        expect(expression!.getType(valueRuntime).get()?.toCode()).toEqual(test.expectedType)
        expect(expression!.eval(valueRuntime).get()?.toCode()).toEqual(test.expectedValue)
      })
    })
  }
})
