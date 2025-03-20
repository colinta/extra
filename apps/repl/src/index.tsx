import React, {useEffect, useMemo, useReducer, useState} from 'react'
import {existsSync, readFileSync, writeFileSync} from 'node:fs'
import {resolve, basename} from 'node:path'

import {MutableValueRuntime, parse, type Expression, dependencySort} from '@extra-lang/lang'
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

const STATE_FILE = (() => {
  // start at process.cwd() and work up until repl exists, use that as "projectRoot"
  let replRoot = process.cwd()
  if (existsSync(resolve(replRoot, '.git'))) {
    replRoot = resolve(replRoot, 'apps/repl')
  }

  while (basename(replRoot) !== 'repl') {
    replRoot = resolve(replRoot, '..')
    if (replRoot === '/') {
      throw new Error('Could not find project root (no .git folder found)')
    }
  }

  return resolve(replRoot, 'state.json')
})()

const REPL_TESTS_FILE = (() => {
  // start at process.cwd() and work up until .git exists, use that as "projectRoot"
  let projectRoot = process.cwd()
  while (!existsSync(resolve(projectRoot, '.git'))) {
    projectRoot = resolve(projectRoot, '..')
    if (projectRoot === '/') {
      throw new Error('Could not find project root (no .git folder found)')
    }
  }

  return resolve(projectRoot, 'packages/lang/src/formulaParser/tests/repl.json')
})()

const REPL_TESTS_JSON = (() => {
  if (existsSync(REPL_TESTS_FILE)) {
    return JSON.parse(readFileSync(REPL_TESTS_FILE).toString('utf8'))
  } else {
    return {tests: []}
  }
})()

interface State {
  desc: string
  formula: string
  vars: {name: string; value: string}[]
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
      result: string
      variables: readonly [string, string][]
    }

type ExtraInput = {name: string; value: string}

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

  const appState = useMemo(() => {
    if (existsSync(STATE_FILE)) {
      return JSON.parse(readFileSync(STATE_FILE).toString('utf8'))
    } else {
      return {
        desc: '',
        formula: '',
        vars: [],
        only: false,
        skip: false,
      }
    }
  }, [])

  return <Repl state={appState} warning={warning} />
}

function Repl({state, warning: initialWarning}: {state: State; warning: string}) {
  const [warning, setWarning] = useState(initialWarning)
  const [formula, setFormula] = useState(state.formula)
  const [mainText, setMainText] = useState('')
  const [descError, setDescError] = useState('')
  const [saveDesc, setSaveDesc] = useState(state.desc)
  const [inputs, setInputs] = useState<ExtraInput[]>(state.vars)
  const [only, setOnly] = useToggle(false)
  const [skip, setSkip] = useToggle(false)

  useEffect(() => {
    setWarning('')
    const {text, type} = calc()

    setMainText(text)
    if (type === 'success' || type === 'formula-error') {
      writeFileSync(
        STATE_FILE,
        JSON.stringify(
          {
            desc: saveDesc,
            only,
            skip,
            formula,
            vars: inputs.map(({name, value}) => ({
              name: name.trim(),
              value: value.trim(),
            })),
          },
          null,
          2,
        ),
        {encoding: 'utf8'},
      )
    }
  }, [formula, inputs])

  function updateInputName(inputIndex: number, name: string) {
    setInputs(
      inputs.map((input, index) => {
        if (index !== inputIndex) {
          return input
        }
        return {name, value: input.value}
      }),
    )
  }

  function updateInputValue(inputIndex: number, value: string) {
    setInputs(
      inputs.map((input, index) => {
        if (index !== inputIndex) {
          return input
        }
        return {name: input.name, value}
      }),
    )
  }

  function addVar() {
    setInputs(inputs => inputs.concat([{name: '', value: ''}]))
  }

  function calc(): Calc {
    const runtime = new MutableValueRuntime({})

    let successText = ''
    const expressions: [string, Expression][] = []
    for (const {name, value} of inputs) {
      if (!(name.trim() && value.trim())) {
        continue
      }

      const formulaExpr = parse(value)
      if (formulaExpr.isErr()) {
        return {
          type: 'error',
          text: red(`Error while trying to parse \`${name}\`\n\n${formulaExpr.error}`),
        }
      }

      expressions.push([name, formulaExpr.value])
    }

    const results = dependencySort(expressions, new Set())
    if (results.isErr()) {
      return {type: 'error', text: red(results.error.toString())}
    }

    for (const [name, formulaExpr] of results.value) {
      const formulaType = formulaExpr.getType(runtime)
      if (formulaType.isErr()) {
        successText += red(formulaType.error.toString())
        continue
      }
      runtime.addLocalType(name, formulaType.value)

      const formulaValue = formulaExpr.eval(runtime)
      if (formulaValue.isErr()) {
        successText += red(formulaValue.error.toString())
        continue
      }

      runtime.addLocalValue(name, formulaValue.value)
      successText += `${name}: ${formulaType.value.toCode()} = ${formulaValue.value.toCode()} (${formulaValue.value
        .getType()
        .toCode()})\n`
    }

    if (!formula.trim()) {
      return {type: 'args-only', text: successText}
    }

    if (results.value.length) {
      successText += '──╼━━━━╾──\n'
    }

    const parsed = parse(formula)
    if (parsed.isErr()) {
      successText += red(parsed.error.toString())
      return {type: 'error', text: successText}
    }
    const variables = results.value.map(([name, expr]) => [name, expr.toCode()] as [string, string])
    const code = parsed.value.toCode()
    const parsedText = parsed.value.toCode()
    successText += parsedText

    const type = parsed.value.getType(runtime)
    if (type.isErr()) {
      successText += '\n' + red(type.error.toString())
      return {type: 'formula-error', text: successText, code, variables}
    }
    const typeText = type.value.toCode()
    successText += ': ' + typeText + '\n'

    const value = parsed.value.eval(runtime)
    if (value.isErr()) {
      successText += red(value.error.toString())
      return {type: 'formula-error', text: successText, code, variables}
    }

    successText += ` = ${value.value.toCode()} (${value.value.getType().toCode()})`
    return {
      type: 'success',
      text: successText,
      code,
      result: value.value.toCode(),
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
        formula,
        only,
        skip,
        expectedCode: result.code,
        expectedValue: '<unknown>',
        variables: result.variables,
      })
      writeFileSync(REPL_TESTS_FILE, JSON.stringify(REPL_TESTS_JSON, null, 2), {encoding: 'utf8'})

      return
    }

    setDescError(`Saved '${saveDesc}'`)
    REPL_TESTS_JSON.tests.push({
      desc: saveDesc,
      formula,
      only,
      skip,
      expectedCode: result.code,
      expectedValue: result.result,
      variables: result.variables,
    })
    writeFileSync(REPL_TESTS_FILE, JSON.stringify(REPL_TESTS_JSON, null, 2), {encoding: 'utf8'})
  }

  return (
    <Stack.down>
      <Box>
        <Input value={formula} wrap multiline placeholder="Formula" onChange={setFormula} />
      </Box>
      <Stack.right flex={1}>
        <Box width="fill" flex={2}>
          <Scrollable>
            <Text>{mainText}</Text>
          </Scrollable>
        </Box>
        <Box width="fill" flex={1}>
          <Stack.down flex={1}>
            {inputs.map(({name, value}, index) => (
              <Stack.right key={index}>
                <Input
                  value={name}
                  placeholder={`variable #${index + 1}`}
                  onChange={name => updateInputName(index, name)}
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
        ⌃Q to quit – ⇥ to change fields
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

interceptConsoleLog()

run(<App />)
