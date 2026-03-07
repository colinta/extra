import {parse} from '../../formulaParser'
import {mockTypeRuntime} from '@/tests/mockTypeRuntime'
import {mockValueRuntime} from '../../tests/mockValueRuntime'

import repl from './repl.json'

describe('repl tests', () => {
  for (const test of repl.tests) {
    describe(test.desc, () => {
      const {skip, only} = test as {skip?: boolean; only?: boolean}

      ;(only ? it.only : skip ? it.skip : it)(`should format formula '${test.formula}'`, () => {
        const expression = parse(test.formula).get()

        expect(expression!.toCode()).toEqual(test.expectedCode)
      })
      ;(only ? it.only : skip ? it.skip : it)(`should compile formula '${test.formula}'`, () => {
        let typeRuntime = mockTypeRuntime({})

        for (const [name, code] of test.variables) {
          const expr = parse(code)
          if (expr.isErr()) {
            throw expr.error
          }

          const type = expr.value.getType(typeRuntime)
          if (type.isErr()) {
            console.trace(type.error)
            throw type.error
          }

          typeRuntime.addLocalType(name, type.value)
        }

        const expression = parse(test.formula).get()
        expect(expression!.getType(typeRuntime).get()?.toCode()).toEqual(test.expectedType)
      })
      ;(only ? it.only : skip ? it.skip : it)(`should eval formula '${test.formula}'`, () => {
        let valueRuntime = mockValueRuntime({})

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

          valueRuntime.addLocalValue(name, value.value)
        }

        const expression = parse(test.formula).get()
        expect(expression!.eval(valueRuntime).get()?.toCode()).toEqual(test.expectedValue)
      })
    })
  }
})
