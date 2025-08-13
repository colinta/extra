import React, {useEffect, useMemo, useReducer, useRef, useState} from 'react'
import {existsSync, readFileSync, writeFileSync} from 'node:fs'
import {resolve, basename} from 'node:path'

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

import {Runtime, parse, Expressions, dependencySort} from '@extra-lang/lang'
import {attempt, ok, err, type Result} from '@extra-lang/result'
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

false ? ({attempt, ok, err} as unknown as Result<any, any>) : null

const STATE_FILE = (() => {
  // start at process.cwd() and work up until repl exists, use that as "projectRoot"
  let replRoot = process.cwd()
  if (existsSync(resolve(replRoot, '.git'))) {
    replRoot = resolve(replRoot, 'apps/repl')
  }

  while (basename(replRoot) !== 'repl') {
    replRoot = resolve(replRoot, '..')
    if (replRoot === '/') {
      throw new Error("Could not find project root (no 'repl/' folder found)")
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
      throw new Error("Could not find project root (no '.git/' folder found)")
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
  version: number
  desc: string
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
            if (version === 1) {
              return object([
                ['version', int],
                ['desc', succeed('')],
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
              ['desc', string],
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
      }).safeGet() ?? {
        version: 1,
        desc: '',
        formula: '',
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
  const [formula, setFormula] = useState(state.formula)
  const [mainText, setMainText] = useState('')
  const [descError, setDescError] = useState('')
  const [saveDesc, setSaveDesc] = useState(state.desc)
  const [inputs, setInputs] = useState<ExtraInput[]>(state.vars)
  const [only, setOnly] = useToggle(false)
  const [skip, setSkip] = useToggle(false)
  const timer = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    const prevId = timer.current
    timer.current = setTimeout(() => {
      setWarning('')
      const {text, type: _type} = calc()

      setMainText(text)
      writeFileSync(
        STATE_FILE,
        JSON.stringify(
          {
            version: 1,
            desc: saveDesc,
            only,
            skip,
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
    }, 250)
    return () => {
      clearTimeout(prevId)
    }
  }, [formula, inputs, saveDesc, only, skip])

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

    let successText = ''
    const varExpressions: [string, Expressions.Expression][] = []
    const typeExpressions: Map<string, Expressions.Expression> = new Map()
    for (const {name, type, value} of inputs) {
      if (!(name.trim() && value.trim())) {
        continue
      }

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

    const expressionsSorted = dependencySort(varExpressions, () => false)
    if (expressionsSorted.isErr()) {
      return {
        type: 'error',
        text: red(`Error sorting expressions: ${expressionsSorted.error.toString()}`),
      }
    }

    for (const [name, formulaExpr] of expressionsSorted.value) {
      const formulaType = formulaExpr.getType(typeRuntime)
      if (formulaType.isErr()) {
        successText += red(`Error resolving '${name}': ${formulaType.error.toString()}`)
        continue
      }

      const typeExpr = typeExpressions.get(name)
      if (typeExpr) {
        const typeResolved = typeExpr.getType(typeRuntime)
        if (typeResolved.isErr()) {
          successText += red(`Error resolving type of '${name}': ${typeResolved.error.toString()}`)
          continue
        }

        typeRuntime.addLocalType(name, typeResolved.value.fromTypeConstructor())
      } else {
        typeRuntime.addLocalType(name, formulaType.value)
      }

      const formulaValue = formulaExpr.eval(valueRuntime)
      if (formulaValue.isErr()) {
        successText += red(formulaValue.error.toString())
        continue
      }

      valueRuntime.addLocalValue(name, formulaValue.value)
      successText += `${name}: ${formulaType.value.toCode()} = ${formulaValue.value.toCode()} (${formulaValue.value
        .getType()
        .toCode()})\n`
    }

    if (!formula.trim()) {
      return {type: 'args-only', text: successText}
    }

    if (expressionsSorted.value.length) {
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
    const parsedText = parsed.value.toCode()
    successText += parsedText

    const type = parsed.value.getType(typeRuntime)
    if (type.isErr()) {
      successText += '\n' + red(type.error.toString())
      return {type: 'formula-error', text: successText, code, variables}
    }
    const typeText = type.value.toCode()
    successText += ': ' + typeText + '\n'

    const value = parsed.value.eval(valueRuntime)
    if (value.isErr()) {
      successText += red(value.error.toString())
      return {type: 'formula-error', text: successText, code, variables}
    }

    successText += ` = ${value.value.toCode()} (${value.value.getType().toCode()})`
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
      expectedType: result.typeStr,
      expectedValue: result.valueStr,
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
})()
