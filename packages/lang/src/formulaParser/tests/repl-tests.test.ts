import {parse, parseModule} from '../../formulaParser'
import {mockTypeRuntime} from '@/tests/mockTypeRuntime'
import {mockValueRuntime} from '../../tests/mockValueRuntime'

import repl from './repl.json'

function preloadPreamble(
  preamble: string | undefined,
  typeRuntime: ReturnType<typeof mockTypeRuntime>,
  valueRuntime: ReturnType<typeof mockValueRuntime>,
) {
  if (!preamble) {
    return
  }

  const moduleExpr = parseModule(preamble)
  if (moduleExpr.isErr()) {
    throw moduleExpr.error
  }

  const moduleType = moduleExpr.value.getType(typeRuntime)
  if (moduleType.isErr()) {
    throw moduleType.error
  }

  const moduleValue = moduleExpr.value.eval(valueRuntime)
  if (moduleValue.isErr()) {
    throw moduleValue.error
  }

  for (const [name, type] of moduleType.value.definitions) {
    typeRuntime.addLocalType(name, type)
  }

  for (const [name, value] of moduleValue.value.definitions) {
    valueRuntime.addLocalValue(name, value)
  }
}

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
        let valueRuntime = mockValueRuntime({})

        preloadPreamble((test as {preamble?: string}).preamble, typeRuntime, valueRuntime)

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
        let typeRuntime = mockTypeRuntime({})
        let valueRuntime = mockValueRuntime({})

        preloadPreamble((test as {preamble?: string}).preamble, typeRuntime, valueRuntime)

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
