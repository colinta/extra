import React, {useEffect, useMemo, useReducer, useState} from 'react'
import {existsSync, readFileSync, writeFileSync} from 'node:fs'
import {resolve} from 'node:path'

import {interceptConsoleLog, red} from '@teaui/core'
import {
  Box,
  Button,
  Checkbox,
  Input,
  Scrollable,
  Space,
  Stack,
  Style,
  Text,
  run,
} from '@teaui/react'

import {Runtime, parseModule, parse, Expressions, dependencySort} from '@extra-lang/lang'
import {attempt} from '@extra-lang/result'
import {
  decide,
  field,
  object,
  boolean,
  int,
  string,
  array,
  parseJSON,
  succeed,
  map,
} from '@extra-lang/parse'
import {Socky} from './socky'
import {parseType} from '@extra-lang/lang/src/formulaParser'
import {GetRuntimeResult} from '@extra-lang/lang/src/formulaParser/types'

function resolveWorkspacePath(filepath: string) {
  let projectRoot = process.cwd()
  while (!existsSync(resolve(projectRoot, '.git'))) {
    projectRoot = resolve(projectRoot, '..')
    if (projectRoot === '/') {
      throw new Error("Could not find project root (no '.git/' folder found)")
    }
  }

  return resolve(projectRoot, filepath)
}

const STATE_FILE = resolveWorkspacePath('apps/repl/.state.json')
const REPL_TESTS_FILE = resolveWorkspacePath('packages/lang/src/formulaParser/tests/repl.json')

const REPL_TESTS_JSON = (() => {
  if (existsSync(REPL_TESTS_FILE)) {
    return JSON.parse(readFileSync(REPL_TESTS_FILE).toString('utf8'))
  } else {
    return {tests: []}
  }
})()

interface State {
  version: number
  desc: string
  module: string
  formula: string
  vars: {name: string; type: string; value: string}[]
  only: boolean
  skip: boolean
}

type Calc =
  | {type: 'error'; text: string}
  | {type: 'args-only'; text: string}
  | {type: 'formula-error'; text: string; code: string; variables: [string, string][]}
  | {
      type: 'success'
      text: string
      code: string
      typeStr: string
      valueStr: string
      variables: readonly [string, string][]
    }

type ExtraInput = {name: string; type: string; value: string}

function useToggle(initial: boolean) {
  return useReducer(state => !state, initial)
}

function App() {
  let warning = useMemo(() => {
    if (!existsSync(REPL_TESTS_FILE)) {
      return `No saved state found at ${REPL_TESTS_FILE}`
    }

    return ''
  }, [])

  const appState: State = useMemo(() => {
    return (
      attempt(() => {
        const stateContents = readFileSync(STATE_FILE).toString('utf8')
        const json = parseJSON(
          stateContents,
          decide(field('version', int.optional), version => {
            if (version === 2) {
              return object([
                ['version', int],
                ['desc', succeed('')],
                ['module', string],
                ['formula', string],
                [
                  'vars',
                  array(
                    object([
                      ['name', string],
                      ['type', string],
                      ['value', string],
                    ]),
                  ),
                ],
                ['only', boolean],
                ['skip', boolean],
              ])
            }

            if (version === 1) {
              return object([
                ['version', int],
                ['desc', succeed('')],
                ['module', succeed('')],
                ['formula', string],
                [
                  'vars',
                  array(
                    object([
                      ['name', string],
                      ['type', string],
                      ['value', string],
                    ]),
                  ),
                ],
                ['only', boolean],
                ['skip', boolean],
              ])
            }

            return object([
              ['version', succeed(() => 1)],
              ['desc', succeed('')],
              ['module', succeed('')],
              ['formula', string],
              [
                'vars',
                array(
                  map(
                    ({name, value}) => ({
                      name,
                      type: '',
                      value,
                    }),
                    [
                      object([
                        ['name', string],
                        ['value', string],
                      ]),
                    ],
                  ),
                ),
              ],
              ['only', boolean],
              ['skip', boolean],
            ])
          }),
        )

        if (json.isErr()) {
          console.info(json.error)
        }

        return json
      }).getOr() ?? {
        version: 2,
        desc: '',
        formula: '',
        module: '',
        vars: [],
        only: false,
        skip: false,
      }
    )
  }, [])

  return <Repl state={appState} warning={warning} />
}

function Repl({state, warning: initialWarning}: {state: State; warning: string}) {
  const [warning, setWarning] = useState(initialWarning)
  const [module_, setModule] = useState(state.module)
  const [formula, setFormula] = useState(state.formula)
  const [mainText, setMainText] = useState('')
  const [descError, setDescError] = useState('')
  const [saveDesc, setSaveDesc] = useState(state.desc)
  const [inputs, setInputs] = useState<ExtraInput[]>(state.vars)
  const [only, setOnly] = useToggle(false)
  const [skip, setSkip] = useToggle(false)

  useEffect(() => {
    setWarning('')

    const {text} = calc()

    setMainText(text)

    writeFileSync(
      STATE_FILE,
      JSON.stringify(
        {
          version: 2,
          desc: saveDesc,
          only,
          skip,
          module: module_,
          formula,
          vars: inputs.map(({name, type, value}) => ({
            name: name.trim(),
            type: type.trim(),
            value: value.trim(),
          })),
        },
        null,
        2,
      ),
      {encoding: 'utf8'},
    )
  }, [module_, formula, inputs, saveDesc, only, skip])

  function updateInputName(inputIndex: number, name: string) {
    setInputs(
      inputs.map((input, index) => {
        if (index !== inputIndex) {
          return input
        }
        return {...input, name}
      }),
    )
  }

  function updateInputType(inputIndex: number, type: string) {
    setInputs(
      inputs.map((input, index) => {
        if (index !== inputIndex) {
          return input
        }
        return {...input, type}
      }),
    )
  }

  function updateInputValue(inputIndex: number, value: string) {
    setInputs(
      inputs.map((input, index) => {
        if (index !== inputIndex) {
          return input
        }
        return {...input, value}
      }),
    )
  }

  function addVar() {
    setInputs(inputs => inputs.concat([{name: '', type: '', value: ''}]))
  }

  function calc(): Calc {
    const typeRuntime = new Runtime.MutableTypeRuntime()
    const valueRuntime = new Runtime.MutableValueRuntime()

    let hadVariables = false
    let successText = ''
    const duplicateVars = new Set<string>()
    const varExpressions: [string, Expressions.Expression][] = []
    const typeExpressions: Map<string, Expressions.Expression> = new Map()
    for (const {name: _name, type, value: _value} of inputs) {
      const name = _name.trim()
      const value = _value.trim()
      if (!(name && value)) {
        continue
      }

      if (duplicateVars.has(name)) {
        successText += red(`Duplicate variable name: \`${name}\`\n`)
        continue
      }
      duplicateVars.add(name)

      const formulaExpr = parse(value)
      if (formulaExpr.isErr()) {
        return {
          type: 'error',
          text: red(`Error parsing \`${name}\`\n\n${formulaExpr.error}`),
        }
      }

      varExpressions.push([name, formulaExpr.value])

      if (type.trim()) {
        const typeExpr = parseType(type)
        if (typeExpr.isErr()) {
          return {
            type: 'error',
            text: red(`Error parsing type of \`${type}\`: ${typeExpr.error}`),
          }
        }

        typeExpressions.set(name, typeExpr.value)
      }
    }

    const expressionsSorted: GetRuntimeResult<[string, Expressions.Expression][]> = dependencySort(
      varExpressions,
      () => false,
      [],
    )
    if (expressionsSorted.isErr()) {
      return {
        type: 'error',
        text: red(`Error sorting expressions: ${expressionsSorted.error.toString()}`),
      }
    }

    for (const [name, formulaExpr] of expressionsSorted.value) {
      hadVariables = true
      const formulaType = formulaExpr.getType(typeRuntime)
      if (formulaType.isErr()) {
        successText += red(`Error resolving '${name}': ${formulaType.error.toString()}\n`)
        continue
      }

      const typeExpr = typeExpressions.get(name)
      if (typeExpr) {
        const typeResolved = typeExpr.getAsTypeExpression(typeRuntime)
        if (typeResolved.isErr()) {
          successText += red(
            `Error resolving type of '${name}': ${typeResolved.error.toString()}\n`,
          )
          continue
        }

        typeRuntime.addLocalType(name, typeResolved.value.fromTypeConstructor())
      } else {
        typeRuntime.addLocalType(name, formulaType.value)
      }

      const formulaValue = formulaExpr.eval(valueRuntime)
      if (formulaValue.isErr()) {
        successText += red(formulaValue.error.toString()) + '\n'
        continue
      }

      valueRuntime.addLocalValue(name, formulaValue.value)
      successText += `${name}: ${formulaType.value.toCode()} = ${formulaValue.value.toCode()}\n`
    }

    if (!formula.trim()) {
      return {type: 'args-only', text: successText}
    }

    parseModule(module_)
      .map(parsedModule => {
        parsedModule
          .getType(typeRuntime)
          .map(moduleType => {
            for (const [name, type] of moduleType.definitions) {
              hadVariables = true
              successText += `${type.toCode()}\n`
              typeRuntime.addLocalType(name, type)
            }
          })
          .mapError(error => {
            successText += red(error.toString())
          })

        parsedModule
          .eval(valueRuntime)
          .map(moduleValue => {
            for (const [name, value] of moduleValue.definitions) {
              valueRuntime.addLocalValue(name, value)
            }
          })
          .mapError(error => {
            successText += red(error.toString())
          })
      })
      .mapError(error => {
        successText += red(error.toString())
      })

    if (hadVariables) {
      if (!successText.endsWith('\n')) {
        successText += '\n'
      }
      successText += '──╼━━━━╾──\n'
    }

    const parsed = parse(formula)
    if (parsed.isErr()) {
      successText += red(parsed.error.toString())
      return {type: 'error', text: successText}
    }

    const variables = expressionsSorted.value.map(
      ([name, expr]) => [name, expr.toCode()] as [string, string],
    )
    const code = parsed.value.toCode()
    successText += code

    const type = parsed.value.getType(typeRuntime)
    if (type.isErr()) {
      successText += '-\n' + red(type.error.toString())
      return {type: 'formula-error', text: successText, code, variables}
    }
    const typeText = type.value.toCode()
    successText += ': ' + typeText + '\n'

    const value = parsed.value.eval(valueRuntime)
    if (value.isErr()) {
      successText += red(value.error.toString())
      return {type: 'formula-error', text: successText, code, variables}
    }

    successText += ` = ${value.value.toCode()}`
    return {
      type: 'success',
      text: successText,
      code,
      typeStr: typeText,
      valueStr: value.value.toCode(),
      variables,
    }
  }

  function save() {
    if (!saveDesc) {
      setDescError('Description is required. ')
      return
    }

    if (!formula) {
      setDescError('Formula is required. ')
      return
    }

    const result = calc()
    if (result.type === 'args-only') {
      setDescError('Formula is required. ')
      return
    }

    if (result.type === 'error') {
      setDescError('Invalid formula')
      return
    }

    REPL_TESTS_JSON.tests = REPL_TESTS_JSON.tests.filter(
      ({desc: otherDesc}: {desc: string}) => saveDesc !== otherDesc,
    )

    if (result.type === 'formula-error') {
      setDescError(`Invalid formula - Saved '${saveDesc}' with unknown expected value`)

      REPL_TESTS_JSON.tests.push({
        desc: saveDesc,
        preamble: module_,
        formula,
        only,
        skip,
        expectedCode: result.code,
        expectedType: '<unknown>',
        expectedValue: '<unknown>',
        variables: result.variables,
      })
      writeFileSync(REPL_TESTS_FILE, JSON.stringify(REPL_TESTS_JSON, null, 2), {encoding: 'utf8'})

      return
    }

    setDescError(`Saved '${saveDesc}'`)
    REPL_TESTS_JSON.tests.push({
      desc: saveDesc,
      preamble: module_,
      formula,
      only,
      skip,
      expectedCode: result.code,
      expectedType: result.typeStr,
      expectedValue: result.valueStr,
      variables: result.variables,
    })
    writeFileSync(REPL_TESTS_FILE, JSON.stringify(REPL_TESTS_JSON, null, 2), {encoding: 'utf8'})
  }

  return (
    <Stack.down>
      <Box>
        <Input value={module_} wrap multiline placeholder="Module" onChange={setModule} />
      </Box>
      <Box>
        <Input value={formula} wrap multiline placeholder="Formula" onChange={setFormula} />
      </Box>
      <Stack.right flex={1}>
        <Box width="fill" flex={2}>
          <Scrollable>
            <Text wrap>{mainText}</Text>
          </Scrollable>
        </Box>
        <Box width="fill" flex={1}>
          <Stack.down flex={1}>
            {inputs.map(({name, type, value}, index) => (
              <Stack.right key={index}>
                <Input
                  value={name}
                  placeholder={`variable #${index + 1}`}
                  onChange={name => updateInputName(index, name)}
                />
                {': '}
                <Input
                  value={type}
                  placeholder={`type`}
                  onChange={type => updateInputType(index, type)}
                />
                {' = '}
                <Input
                  value={value}
                  placeholder="formula"
                  wrap={true}
                  multiline={true}
                  flex={1}
                  onChange={value => updateInputValue(index, value)}
                />
              </Stack.right>
            ))}
            <Button title="Add" hotKey={{char: 'd', ctrl: true}} onClick={addVar} />
          </Stack.down>
        </Box>
      </Stack.right>
      <Stack.right>
        <Button
          title="⌃Q to quit – ⇥ to change fields "
          hotKey={{char: 'q', ctrl: true}}
          onClick={exit}
        />
        <Space flex={1} minWidth={1} />
        <Text padding={{right: 1}}>
          <Style foreground="red">
            {descError}
            {descError && warning ? ' ' : ''}
            {warning}
          </Style>
        </Text>
        <Space width={1} />
        <Input value={saveDesc} placeholder="Test Description" onChange={setSaveDesc} />
        <Space flex={1} />
        <Checkbox value={only} title="Only" onChange={setOnly} />
        <Space width={1} />
        <Checkbox value={skip} title="Skip" onChange={setSkip} />
        <Space width={1} />
        <Button title="Save" hotKey={{char: 's', ctrl: true}} onClick={save} />
      </Stack.right>
    </Stack.down>
  )
}

const exit = () => {
  doExit()
}
let doExit = () => {}

;(async function () {
  if (process.argv.includes('--wait')) {
    console.info('Listening to port 8080...')
    const socky = new Socky(8080)
    socky.start()
    await socky.firstConnection()
  } else {
    interceptConsoleLog()
  }

  const [screen] = await run(<App />)
  doExit = () => {
    screen.exit()
  }

  if (process.argv.includes('--exit')) {
    screen.exit()
  }
})()
