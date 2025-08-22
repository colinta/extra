import {err, mapAll, ok, type Result} from '@extra-lang/result'
import {RuntimeError} from './formulaParser/expressions'
import {splitter} from './graphemes'
import * as Types from './types'

// I hate having the Node class here. It's only here because of renderFormula
// needing to return a Node instance...

export type Send = (message: MessageValue) => void

export interface DOM<T> {
  createElement(tag: NamedViewValue, attrs: Map<string, Value>, send: Send): T
  createTextNode(text: Value): T
  updateTextNode(node: T, text: Value): void
  appendElement(container: T, child: T): T
  removeElement(container: T, child: T): T
}

export abstract class Node {
  parentNode: Node | undefined
  parentAttrNode: Node | undefined
  firstRender: any

  #dependencies: Map<Value, Node[]> | undefined

  constructor(
    readonly deps: Set<Value>,
    readonly children: Node[],
  ) {
    const renderInto: any = this.renderInto.bind(this)
    this.renderInto = (dom: DOM<unknown>, element: unknown, send: Send) => {
      if (this.firstRender) {
        return this.firstRender
      }
      const render = renderInto(dom, element, send)
      this.firstRender = render
      return render
    }

    Object.defineProperty(this, 'renderInto', {enumerable: false})
    Object.defineProperty(this, 'expression', {enumerable: false})
    Object.defineProperty(this, 'deps', {enumerable: false})
    Object.defineProperty(this, 'children', {enumerable: false})
    Object.defineProperty(this, 'parentNode', {enumerable: false})
    Object.defineProperty(this, 'parentAttrNode', {enumerable: false})
  }

  abstract get value(): Value
  abstract renderInto<T>(dom: DOM<T>, element: T, send: Send): T
  receive<T>(_dom: DOM<T>, _message: MessageValue) {}

  dependencies(): Map<Value, Node[]> {
    if (!this.#dependencies) {
      this.#dependencies = this._dependencies(new Map<Value, Node[]>())
    }
    return this.#dependencies
  }

  private _dependencies(deps: Map<Value, Node[]>): Map<Value, Node[]> {
    for (const dep of this.deps) {
      const list = deps.get(dep) ?? []
      list.push(this)
      deps.set(dep, list)
    }
    for (const child of this.children) {
      child._dependencies(deps)
    }
    return deps
  }
}

export function nullValue(): typeof NullValue {
  return NullValue
}

export function booleanValue(value: boolean): BooleanValue {
  return value ? TrueValue : FalseValue
}

export function float(value: number) {
  return new FloatValue(value)
}

export function int(value: number, magnitude: number, base: IntBase): IntValue
export function int(value: number): IntValue
export function int(value: number, magnitude = 0, base: IntBase = 'decimal') {
  return new IntValue(value, magnitude, base)
}

export function range(
  start: [FloatValue, boolean] | undefined,
  stop: [FloatValue, boolean] | undefined,
) {
  return new RangeValue(start, stop)
}

// short strings (<16 chars) are memoized
const stringMemo = new Map<string, StringValue>()
type IntBase = 'decimal' | 'binary' | 'octal' | 'hexadecimal'

export function string(literal: string) {
  const graphemes = splitter.splitGraphemes(literal)
  if (graphemes.length !== literal.length) {
    return new UnicodeStringValue(graphemes)
  }

  const value = stringMemo.get(literal) ?? new StringValue(literal)
  if (literal.length < 16) {
    stringMemo.set(literal, value)
  }

  return value
}

export function regex(source: string, flags: string) {
  return new RegexValue(new RegExp(source, flags))
}

export function value(value: boolean | number | string, isFloat?: 'float') {
  return BasicValue.from(value, isFloat)
}

export function array(values: Value[]) {
  return new ArrayValue(values)
}

export function dict(values: Map<Types.Key, Value>) {
  return new DictValue(values)
}

export function tuple(values: Value[]) {
  return new ObjectValue(values, new Map())
}

export function object(namedValues: Map<string, Value>, tupleValues: Value[] = []) {
  return new ObjectValue(tupleValues, namedValues)
}

export function set(values: Value[]) {
  return new SetValue(values)
}

export function formula(fn: (_: FormulaArgs) => Result<Value, string | RuntimeError>) {
  return new FormulaValue(fn, undefined)
}

export function namedFormula(
  name: string,
  fn: (_: FormulaArgs) => Result<Value, string | RuntimeError>,
) {
  return new NamedFormulaValue(name, fn, undefined)
}

export function classDefinition({
  name,
  constructor,
  parent,
  props: staticProps,
  formulas: staticFormulas,
}: {
  name: string
  constructor: (_: ClassDefinitionValue) => NamedFormulaValue
  parent?: ClassDefinitionValue
  props?: Map<string, Value>
  formulas?: Map<string, NamedFormulaValue>
}) {
  return new ClassDefinitionValue(
    name,
    constructor,
    parent,
    staticProps ?? new Map(),
    staticFormulas ?? new Map(),
  )
}

export function classInstance({
  class: klass,
  props,
  formulas,
}: {
  class: ClassDefinitionValue
  props?: Map<string, Value>
  formulas?: Map<string, NamedFormulaValue>
}) {
  return new ClassInstanceValue(klass, props ?? new Map(), formulas ?? new Map())
}

export abstract class Value {
  abstract getType(): Types.Type
  abstract isEqual(value: Value): boolean
  abstract isTruthy(): boolean
  abstract toCode(): string
  abstract propValue(prop: string): Value | undefined

  toLisp() {
    return this.toCode()
  }

  isOptional() {
    return this.getType().isOptional()
  }

  isNull(): this is typeof NullValue {
    return this.getType().isNull()
  }

  isBoolean(): this is BooleanValue {
    return this.getType().isBoolean()
  }

  isFloat(): this is FloatValue {
    return this.getType().isFloat()
  }

  isInt(): this is IntValue {
    return this.getType().isInt()
  }

  isString(): this is StringValue {
    return this.getType().isString()
  }

  isRegex(): this is RegexValue {
    return this.getType().isRegex()
  }

  isRange(): this is RangeValue {
    return this.getType().isRange()
  }

  validKey(): Types.Key | undefined {
    return undefined
  }

  isObject(): this is ObjectValue {
    return this.getType().isObject()
  }

  toString() {
    return this.toCode()
  }

  /**
   * Returns a "human readable" string. Roughly speaking it's JSON, but not
   * formally. `Set` and `Dict` include the constructor name, for example.
   */
  abstract printable(): string

  /**
   * Returns the string as it should appear in a view. `null` => '', [] => '',
   * false => '' (but true => 'true').
   */
  viewPrintable(): string {
    return this.printable()
  }
}

class MetaNullValue extends Value {
  readonly is = 'null'
  readonly value = null

  getType(): Types.Type {
    return Types.NullType
  }

  isEqual(value: Value): boolean {
    return value === this
  }

  isTruthy() {
    return false
  }

  validKey() {
    return null
  }

  toLisp() {
    return '`null`'
  }

  toCode() {
    return 'null'
  }

  printable() {
    return 'null'
  }

  viewPrintable() {
    return ''
  }

  propValue(_propName: string): Value | undefined {
    return undefined
  }
}
export const NullValue = new MetaNullValue()

export abstract class BasicValue extends Value {
  abstract value: boolean | number | string | RegExp

  static from(value: boolean | number | string, isFloat?: 'float'): Value {
    switch (typeof value) {
      case 'boolean':
        return booleanValue(value)
      case 'string':
        return new StringValue(value)
      case 'number':
        if (Number.isInteger(value) && isFloat !== 'float') {
          return new IntValue(value, 0, 'decimal')
        } else {
          return new FloatValue(value)
        }
    }
  }
}

export abstract class BooleanValue extends BasicValue {
  abstract is: 'true' | 'false'

  constructor(readonly value: boolean) {
    super()
  }

  isEqual(value: Value): boolean {
    if (value === this) {
      return true
    }

    if (value instanceof BasicValue) {
      return value.value === this.value
    }

    if (!(value instanceof BooleanValue)) {
      return false
    }

    return value.value === this.value
  }

  isTruthy() {
    return this.value
  }

  validKey() {
    return this.value
  }

  toLisp() {
    return `\`${this.is}\``
  }

  toCode() {
    return this.is
  }

  printable() {
    return this.is
  }

  viewPrintable(): string {
    return this.value ? 'true' : ''
  }

  // static _props: Map<string, (value: BooleanValue) => Value> = new Map([])

  // propValue(propName: string): Value | undefined {
  //   const prop = BooleanValue._props.get(propName)
  //   return prop?.(this)
  // }
  propValue(_propName: string): Value | undefined {
    return undefined
  }
}

export class FloatValue extends BasicValue {
  readonly is: 'float' | 'int' = 'float'

  constructor(readonly value: number) {
    super()
  }

  isEqual(value: Value): boolean {
    if (value === this) {
      return true
    }

    if (value instanceof BasicValue) {
      return value.value === this.value
    }

    if (!(value instanceof FloatValue)) {
      return false
    }

    return value.value === this.value
  }

  isTruthy() {
    return this.value !== 0
  }

  validKey() {
    return this.value
  }

  toCode() {
    const code = this.value.toString(10)
    if (!code.includes('.')) {
      return code + '.0'
    }

    return code
  }

  printable() {
    return this.value.toString(10)
  }

  toLocale(locale: string) {
    const intlLocale = new Intl.Locale(locale)
    // TS types are wrong, Intl.Locale is accepted here
    const number = Intl.NumberFormat(intlLocale as any)
    return number.format(this.value)
  }

  getType(): Types.Type {
    return new Types.LiteralFloatType(this.value)
  }

  // static _floatProps: Map<string, (value: FloatValue) => Value> = new Map([])

  // propValue(propName: string): Value | undefined {
  //   const prop = FloatValue._floatProps.get(propName)
  //   return prop?.(this)
  // }
  propValue(_propName: string): Value | undefined {
    return undefined
  }
}

export class IntValue extends FloatValue {
  readonly is = 'int'

  constructor(
    value: number,
    readonly magnitude = 0,
    readonly base: IntBase,
  ) {
    super(Math.floor(value))
  }

  getType(): Types.Type {
    return new Types.LiteralIntType(this.value, this.magnitude)
  }

  // static _intProps: Map<string, (value: IntValue) => Value> = new Map([])

  // propValue(propName: string): Value | undefined {
  //   const prop = IntValue._intProps.get(propName)
  //   return prop?.(this)
  // }
  propValue(_propName: string): Value | undefined {
    return undefined
  }

  toCode() {
    let str: string
    let prefix = this.value < 0 ? '-' : ''
    let length: number
    let value = Math.abs(this.value)
    if (this.base === 'decimal') {
      str = value.toString()
      length = 3
    } else {
      let base: number
      switch (this.base) {
        case 'binary':
          base = 2
          prefix += '0b'
          break
        case 'octal':
          base = 8
          prefix += '0o'
          break
        case 'hexadecimal':
          base = 16
          prefix += '0x'
          break
      }

      str = value.toString(base)
      length = 8
    }

    if (str.length > length) {
      const parts = []
      for (let i = str.length; i > 0; i -= length) {
        const part =
          (length > 3 && i - length < 0 ? '0'.repeat(length - i) : '') +
          str.slice(Math.max(i - length, 0), i)
        parts.unshift(part)
      }
      return prefix + parts.join('_')
    } else if (length > 3) {
      prefix += '0'.repeat(length - str.length)
    }

    return prefix + str
  }
}

class MetaNaNValue extends Value {
  readonly is = 'nan'

  getType(): Types.Type {
    return Types.FloatType
  }

  isEqual(value: Value): boolean {
    return value === this
  }

  isTruthy() {
    return false
  }

  toCode() {
    return 'NaN'
  }

  printable() {
    return 'NaN'
  }

  viewPrintable() {
    return ''
  }

  propValue() {
    return undefined
  }
}
export const NaNValue = new MetaNaNValue()

class MetaTrueValue extends BooleanValue {
  readonly is = 'true'

  constructor() {
    super(true)
  }

  getType(): Types.Type {
    return Types.LiteralTrueType
  }
}

class MetaFalseValue extends BooleanValue {
  readonly is = 'false'

  constructor() {
    super(false)
  }

  getType(): Types.Type {
    return Types.LiteralFalseType
  }
}

export const TrueValue = new MetaTrueValue()
export const FalseValue = new MetaFalseValue()

export class StringValue extends BasicValue {
  readonly is: 'string' | 'unicode' = 'string'
  readonly length: number

  constructor(readonly value: string) {
    super()
    this.length = value.length
  }

  removeIndent(indent: string, firstLineIsNewline: boolean): StringValue | undefined {
    const lines = this.value.split('\n')
    const replaced: string[] = []
    for (const line of lines) {
      // blank lines don't need to match the final indent, they get skipped
      // (preserving the newline)
      if (line.length < indent.length && line.trim() === '') {
        replaced.push('')
      } else if (!line.startsWith(indent)) {
        if (replaced.length === 0 && !firstLineIsNewline) {
          replaced.push(line)
        } else {
          return undefined
        }
      } else {
        replaced.push(line.slice(indent.length))
      }
    }

    return new StringValue(replaced.join('\n'))
  }

  isEqual(value: Value): boolean {
    if (value === this) {
      return true
    }

    if (value instanceof BasicValue) {
      return value.value === this.value
    }

    if (value instanceof StringValue) {
      return value.value === this.value
    }

    return false
  }

  isTruthy() {
    return this.value !== ''
  }

  validKey() {
    return this.value
  }

  getType(): Types.Type {
    return new Types.LiteralStringType(this.value)
  }

  toLisp() {
    return `'${this.value.replaceAll("'", "\\'").replaceAll('\n', '\\n').replaceAll('\t', '\\t')}'`
  }

  toCode() {
    const value = this.value
    if (value.includes('\n')) {
      if (value.includes("'") && !value.includes('"')) {
        return `"""\n${value}"""`
      }

      return `'''\n${value.replaceAll("'''", "\\'''")}'''`
    }

    if (value.includes("'") && !value.includes('"')) {
      return `"${value}"`
    }

    return `'${value.replaceAll("'", "\\'")}'`
  }

  printable() {
    return this.value
  }

  static _stringProps = new Map<string, (value: StringValue) => Value>([
    ['length', (value: StringValue) => int(value.value.length)],
    [
      'mapChars',
      value =>
        namedFormula('mapChars', (args: FormulaArgs) =>
          args.at(0, FormulaValue).map(mapFn => mapFn.call(new FormulaArgs([[undefined, value]]))),
        ),
    ],
    [
      'repeat',
      value =>
        namedFormula('repeat', (args: FormulaArgs) =>
          args.at(0, IntValue).map(times => string(value.value.repeat(times.value))),
        ),
    ],
  ])

  /**
   * Fetching value via `array[prop]` access operator
   */
  arrayAccessValue(index: Types.Key): Value | undefined {
    if (typeof index !== 'number') {
      return
    }

    const char = this.value[index]
    if (char) {
      return new StringValue(char)
    }
  }

  propValue(propName: string): Value | undefined {
    const prop = StringValue._stringProps.get(propName)
    return prop?.(this)
  }
}

export class UnicodeStringValue extends StringValue {
  readonly is = 'unicode'
  readonly _chars: string[]
  readonly length: number

  constructor(chars: string[]) {
    super(chars.join(''))

    this.length = chars.length
    this._chars = chars
    Object.defineProperty(this, '_chars', {enumerable: false})
  }

  removeIndent(indent: string, firstLineIsNewline: boolean): UnicodeStringValue | undefined {
    let isMatchingIndent = firstLineIsNewline
    let indentIndex = 0
    const replaced: string[] = []
    for (const char of this._chars) {
      if (char === '\n') {
        isMatchingIndent = true
        indentIndex = 0
        replaced.push('\n')
      } else if (isMatchingIndent) {
        if (char !== indent[indentIndex++]) {
          return undefined
        }

        isMatchingIndent = indentIndex < indent.length
      } else {
        replaced.push(char)
      }
    }

    return new UnicodeStringValue(replaced)
  }

  isTruthy() {
    return this.value !== ''
  }

  getType(): Types.Type {
    return new Types.LiteralStringType(this.value)
  }

  static _unicodeProps = new Map<string, (value: UnicodeStringValue) => Value>([
    ['length', (value: UnicodeStringValue) => int(value.length)],
  ])

  /**
   * Fetching value via `array[prop]` access operator
   */
  arrayAccessValue(index: Types.Key): Value | undefined {
    if (typeof index !== 'number') {
      return
    }

    const char = this._chars[index]
    if (char) {
      return new UnicodeStringValue([char])
    }
  }

  propValue(propName: string): Value | undefined {
    const prop = UnicodeStringValue._unicodeProps.get(propName)
    return prop?.(this) ?? super.propValue(propName)
  }
}

export class RegexValue extends BasicValue {
  readonly is = 'regex'

  constructor(readonly value: RegExp) {
    super()
  }

  isEqual(value: Value): boolean {
    if (value === this) {
      return true
    }

    if (value instanceof BasicValue) {
      return value.value === this.value
    }

    if (value instanceof RegexValue) {
      return value.value === this.value
    }

    return false
  }

  isTruthy() {
    return true
  }

  getType(): Types.Type {
    return new Types.LiteralRegexType(this.value)
  }

  toCode() {
    return `/${this.value.source}/${this.value.flags}`
  }

  printable() {
    return this.toCode()
  }

  static _props: Map<string, (value: RegExp) => Value> = new Map([])

  propValue(propName: string): Value | undefined {
    const prop = RegexValue._props.get(propName)
    return prop?.(this.value)
  }
}

export class RangeValue extends Value {
  readonly is = 'range'

  constructor(
    // value (could be IntValue, because IntValue is a subclass of FloatValue) and
    // whether it's exclusive. [__, true] => exclusive range
    readonly start: [FloatValue, boolean] | undefined,
    readonly stop: [FloatValue, boolean] | undefined,
  ) {
    super()
  }

  isEqual(value: Value): boolean {
    if (value === this) {
      return true
    }

    if (!(value instanceof RangeValue)) {
      return false
    }

    if (this.start !== undefined && value.start !== undefined) {
      const [thisStartValue, thisExclusiveStart] = this.start
      const [valueStartValue, valueExclusiveStart] = value.start
      if (!thisStartValue.isEqual(valueStartValue) || thisExclusiveStart !== valueExclusiveStart) {
        return false
      }
    } else if (this.start !== value.start) {
      return false
    }

    if (this.stop !== undefined && value.stop !== undefined) {
      const [thisStopValue, thisExclusiveStop] = this.stop
      const [valueStopValue, valueExclusiveStop] = value.stop
      if (!thisStopValue.isEqual(valueStopValue) || thisExclusiveStop !== valueExclusiveStop) {
        return false
      }
    } else if (this.stop !== value.stop) {
      return false
    }

    return true
  }

  toLisp() {
    return `(${this.toCode()})`
  }

  toCode() {
    if (this.start && this.stop) {
      const [thisStartValue, thisExclusiveStart] = this.start
      const [thisStopValue, thisExclusiveStop] = this.stop

      const lhs = thisStartValue.toCode()
      const rhs = thisStopValue.toCode()

      if (thisExclusiveStart && thisExclusiveStop) {
        return `${lhs}<.<${rhs}`
      } else if (thisExclusiveStart) {
        return `${lhs}<..${rhs}`
      } else if (thisExclusiveStop) {
        return `${lhs}..<${rhs}`
      } else {
        if (lhs === rhs) {
          return '=${lhs}'
        }
        return `${lhs}...${rhs}`
      }
    } else if (this.start) {
      const [thisStartValue, thisExclusiveStart] = this.start

      const lhs = thisStartValue.toCode()

      if (thisExclusiveStart) {
        return `>${lhs}`
      } else {
        return `>=${lhs}`
      }
    } else if (this.stop) {
      const [thisStopValue, thisExclusiveStop] = this.stop

      const lhs = thisStopValue.toCode()

      if (thisExclusiveStop) {
        return `<${lhs}`
      } else {
        return `<=${lhs}`
      }
    } else {
      return '∅'
    }
  }

  printable() {
    return this.toCode()
  }

  isTruthy() {
    if (this.start === undefined || this.stop === undefined) {
      return false
    }

    // if both start and stop are exclusive, either we have a null set or a range,
    // either way it's false
    if (this.start[1] && this.stop[1]) {
      return false
    }

    return this.start[0].value !== this.stop[0].value
  }

  getType(): Types.Type {
    // determine int vs float range, and convert to narrowed types
    //     number | [number] | undefined
    if (
      (this.start === undefined || this.start[0] instanceof IntValue) &&
      (this.stop === undefined || this.stop[0] instanceof IntValue)
    ) {
      let min: number | undefined
      if (this.start) {
        min = this.start[0].value
        if (this.start[1]) {
          min += 1
        }
      }

      let max: number | undefined
      if (this.stop) {
        max = this.stop[0].value
        if (this.stop[1]) {
          max -= 1
        }
      }

      return Types.intRange({min, max})
    }

    let min: number | [number] | undefined
    if (this.start) {
      if (this.start[1]) {
        min = [this.start[0].value]
      } else {
        min = this.start[0].value
      }
    }

    let max: number | [number] | undefined
    if (this.stop) {
      if (this.stop[1]) {
        max = [this.stop[0].value]
      } else {
        max = this.stop[0].value
      }
    }

    // float in there somewhere
    return Types.floatRange({min, max})
  }

  static _props: Map<string, (value: RangeValue) => Value> = new Map([])

  propValue(propName: string): Value | undefined {
    const prop = RangeValue._props.get(propName)
    return prop?.(this)
  }
}

export class ObjectValue extends Value {
  readonly is = 'object'
  private _runtimeType: Types.ObjectType

  constructor(
    readonly tupleValues: Value[],
    readonly namedValues: Map<string, Value>,
  ) {
    super()

    const props: Types.ObjectProp[] = []
    for (const value of this.tupleValues) {
      const type = value.getType()
      props.push({is: 'positional', type})
    }
    for (const [name, value] of this.namedValues) {
      const type = value.getType()
      props.push({is: 'named', name, type})
    }

    this._runtimeType = new Types.ObjectType(props)
  }

  isEqual(value: Value): boolean {
    if (value === this) {
      return true
    }

    if (!(value instanceof ObjectValue)) {
      return false
    }

    if (
      value.tupleValues.length !== this.tupleValues.length ||
      value.namedValues.size !== this.namedValues.size
    ) {
      return false
    }

    for (const [index, lhs] of this.tupleValues.entries()) {
      const rhs = value.tupleValues[index]
      if (!lhs.isEqual(rhs)) {
        return false
      }
    }

    for (const [name, lhs] of this.namedValues) {
      const rhs = value.namedValues.get(name)
      if (rhs === undefined || !lhs.isEqual(rhs)) {
        return false
      }
    }

    // same types, same size, and all the keys have the same value
    return true
  }

  isTruthy() {
    return this.tupleValues.length > 0 || this.namedValues.size > 0
  }

  getType(): Types.Type {
    return this._runtimeType
  }

  toLisp() {
    const tupleEntries = this.tupleValues
    const namedEntries = Array.from(this.namedValues)
    const tupleCode = tupleEntries.map(value => value.toLisp()).join(' ')
    const namedCode = namedEntries.map(([name, value]) => `(${name}: ${value.toLisp()})`).join(' ')
    return `{${tupleCode}${tupleCode && namedCode ? ' ' : ''}${namedCode}}`
  }

  toCode() {
    const tupleEntries = this.tupleValues
    const namedEntries = Array.from(this.namedValues)
    const tupleCode = tupleEntries.map(value => value.toCode()).join(', ')
    const namedCode = namedEntries.map(([name, value]) => `${name}: ${value.toCode()}`).join(', ')
    return `{${tupleCode}${tupleCode && namedCode ? ', ' : ''}${namedCode}}`
  }

  printable() {
    const tupleEntries = this.tupleValues
    const namedEntries = Array.from(this.namedValues)
    const tupleCode = tupleEntries.map(value => value.printable()).join(', ')
    const namedCode = namedEntries
      .map(([name, value]) => `${name}: ${value.printable()}`)
      .join(', ')
    return `{${tupleCode}${tupleCode && namedCode ? ', ' : ''}${namedCode}}`
  }

  static _props: Map<string, (value: ObjectValue) => Value> = new Map([])

  /**
   * Fetching value via `object[prop]` access operator
   */
  arrayAccessValue(propName: Types.Key): Value | undefined {
    if (typeof propName === 'number') {
      return this.tupleValues[propName]
    }

    if (typeof propName === 'string') {
      return this.namedValues.get(propName)
    }
  }

  propValue(propName: string): Value | undefined {
    const prop = ObjectValue._props.get(propName)
    if (!prop) {
      return this.arrayAccessValue(propName)
    }

    return prop(this)
  }
}

export class ArrayValue extends Value {
  readonly is = 'array'
  readonly runtimeType: Types.Type

  constructor(readonly values: Value[]) {
    super()

    if (this.values.length === 0) {
      this.runtimeType = new Types.ArrayType(Types.always(), {min: 0, max: 0})
    } else {
      const first = this.values[0].getType()
      const valueType: Types.Type = this.values.reduce((memo, rhValue, index) => {
        if (index === 0) {
          return memo
        } else {
          return Types.compatibleWithBothTypes(memo, rhValue.getType())
        }
      }, first)

      this.runtimeType = new Types.ArrayType(valueType, {
        min: this.values.length,
        max: this.values.length,
      })
    }
  }

  *iterate() {
    for (const value of this.values) {
      yield value
    }
  }

  /**
   * Fetching value via `array[prop]` access operator
   */
  arrayAccessValue(index: Types.Key): Value | undefined {
    if (typeof index !== 'number') {
      return
    }

    return this.values.at(index)
  }

  isEqual(value: Value): boolean {
    if (value === this) {
      return true
    }

    if (!(value instanceof ArrayValue)) {
      return false
    }

    if (this.values.length !== value.values.length) {
      return false
    }

    const rhsIter = value.iterate()
    for (const lhs of this.iterate()) {
      const rhs = rhsIter.next().value as Value
      if (!lhs.isEqual(rhs)) {
        return false
      }
    }

    return true
  }

  toLisp() {
    let code = ''
    for (const val of this.iterate()) {
      if (code.length) {
        code += ' '
      }
      code += val.toLisp()
    }
    return `[${code}]`
  }

  toCode() {
    let code = ''
    for (const val of this.iterate()) {
      if (code.length) {
        code += ', '
      }
      code += val.toCode()
    }
    return `[${code}]`
  }

  printable() {
    let code = ''
    for (const val of this.iterate()) {
      if (code.length) {
        code += ', '
      }
      code += val.printable()
    }
    return `[${code}]`
  }

  viewPrintable() {
    let code = ''
    for (const val of this.iterate()) {
      code += val.viewPrintable() + '\n'
    }
    return code
  }

  isTruthy() {
    return this.values.length > 0
  }

  getType(): Types.Type {
    return this.runtimeType
  }

  static _props: Map<string, (value: ArrayValue) => Value> = new Map([])

  propValue(propName: string): Value | undefined {
    const prop = ArrayValue._props.get(propName)
    return prop?.(this)
  }
}

export class DictValue extends Value {
  readonly is = 'dict'
  private _runtimeType: Types.Type

  constructor(readonly values: Map<Types.Key, Value>) {
    super()

    if (this.values.size === 0) {
      this._runtimeType = Types.dict(Types.always())
    } else {
      const names = [...this.values.keys()]
      const values = [...this.values.values()]
      const first = values[0].getType()
      const valueType: Types.Type = values.reduce((memo, rhValue, index) => {
        if (index === 0) {
          return memo
        } else {
          return Types.compatibleWithBothTypes(memo, rhValue.getType())
        }
      }, first)

      this._runtimeType = new Types.DictType(
        valueType,
        {min: names.length, max: names.length},
        new Set(names),
      )
    }
  }

  isEqual(value: Value): boolean {
    if (value === this) {
      return true
    }

    if (!(value instanceof DictValue)) {
      return false
    }

    if (this.values.size !== value.values.size) {
      return false
    }

    for (const [name, lhValue] of this.values) {
      const rhValue = value.values.get(name)
      if (rhValue === undefined) {
        return false
      } else if (!lhValue.isEqual(rhValue)) {
        return false
      }
    }

    return true
  }

  isTruthy() {
    return this.values.size > 0
  }

  getType(): Types.Type {
    return this._runtimeType
  }

  toLisp() {
    if (this.values.size === 0) {
      return 'Dict()'
    }

    const values = Array.from(this.values)
      .map(([name, value]) => `(${name}: ${value.toLisp()})`)
      .join(' ')
    return `Dict(${values})`
  }

  toCode() {
    if (this.values.size === 0) {
      return 'Dict()'
    }

    const values = Array.from(this.values)
      .map(([name, value]) => `${name}: ${value}`)
      .join(', ')
    return `Dict(${values})`
  }

  printable() {
    const values = Array.from(this.values)
      .map(([name, value]) => `${name}: ${value.printable()}`)
      .join(', ')
    return `Dict(${values})`
  }

  viewPrintable() {
    return Array.from(this.values)
      .map(([name, value]) => `${name}: ${value.viewPrintable()}`)
      .join('\n')
  }

  static _props: Map<string, (value: DictValue) => Value> = new Map([])

  /**
   * Fetching value via `object[prop]` access operator
   */
  arrayAccessValue(propName: Types.Key): Value | undefined {
    return this.values.get(propName)
  }

  propValue(propName: string): Value | undefined {
    const prop = DictValue._props.get(propName)
    if (!prop) {
      return this.arrayAccessValue(propName)
    }

    return prop(this)
  }
}

export class SetValue extends Value {
  readonly is = 'set'
  readonly runtimeType: Types.Type

  constructor(readonly values: Value[]) {
    super()

    if (this.values.length === 0) {
      this.runtimeType = new Types.SetType(Types.always(), {min: 0, max: 0})
    } else {
      const first = this.values[0].getType()
      const valueType: Types.Type = this.values.reduce((memo, rhValue, index) => {
        if (index === 0) {
          return memo
        } else {
          return Types.compatibleWithBothTypes(memo, rhValue.getType())
        }
      }, first)

      this.runtimeType = new Types.SetType(valueType, {
        min: this.values.length,
        max: this.values.length,
      })
    }
  }

  *iterate() {
    for (const value of this.values) {
      yield value
    }
  }

  isEqual(value: Value): boolean {
    if (value === this) {
      return true
    }

    if (!(value instanceof SetValue)) {
      return false
    }

    if (this.values.length !== value.values.length) {
      return false
    }

    const rhsIter = value.iterate()
    for (const lhs of this.iterate()) {
      const rhs = rhsIter.next().value as Value
      if (!lhs.isEqual(rhs)) {
        return false
      }
    }

    return true
  }

  toLisp() {
    let code = ''
    for (const val of this.iterate()) {
      if (code.length) {
        code += ' '
      }
      code += val.toLisp()
    }
    return `Set(${code})`
  }

  toCode() {
    let code = ''
    for (const val of this.iterate()) {
      if (code.length) {
        code += ', '
      }
      code += val.toCode()
    }
    return `Set(${code})`
  }

  printable() {
    let code = ''
    for (const val of this.iterate()) {
      if (code.length) {
        code += ', '
      }
      code += val.printable()
    }
    return `Set(${code})`
  }

  viewPrintable() {
    let code = ''
    for (const val of this.iterate()) {
      code += val.viewPrintable() + '\n'
    }
    return code
  }

  isTruthy() {
    return this.values.length > 0
  }

  getType(): Types.Type {
    return this.runtimeType
  }

  static _props: Map<string, (value: SetValue) => Value> = new Map([])

  propValue(propName: string): Value | undefined {
    const prop = SetValue._props.get(propName)
    return prop?.(this)
  }
}

/**
 * I dunno, I've gone back and forth on 'Types in Runtime', including a long
 * stint with a 'TypeConstructor' value (abandoned). So for now this is just a
 * kind of placeholder. It's returned from `TypeDefinitionExpression`, but it's
 * not used or expected anywhere. 🤷‍♂️
 */
export class TypeValue extends Value {
  constructor(readonly type: Types.Type) {
    super()
  }

  getType() {
    return this.type
  }

  isTruthy() {
    return true
  }

  isEqual(rhs: Value): boolean {
    return rhs === this
  }

  toCode() {
    return this.type.toCode()
  }

  printable() {
    return this.type.toCode()
  }

  propValue(name: string) {
    const type = this.type.propAccessType(name)
    if (type) {
      return new TypeValue(type)
    }
  }
}

/**
 * When arguments are passed to a function there are plenty of shorthands like
 * `...` and `...name:` and `**kwargs`. These are all flattened and combined (in
 * Expressions.ArgumentsList.evalToArguments()) to create a `FormulaArgs` value.
 */
export class FormulaArgs {
  private _positional: Value[] = []
  private _named: Map<string, Value[]> = new Map()
  readonly length: number
  readonly names: Set<string>

  constructor(readonly args: [string | undefined, Value][]) {
    for (const [alias, arg] of args) {
      if (!alias) {
        this._positional.push(arg)
        continue
      }
      const prevNamed = this._named.get(alias)
      if (prevNamed) {
        prevNamed.push(arg)
      } else {
        this._named.set(alias, [arg])
      }
    }

    this.length = this._positional.length
    this.names = new Set(this._named.keys())
    Object.defineProperty(this, 'length', {enumerable: false})
    Object.defineProperty(this, 'names', {enumerable: false})
    Object.defineProperty(this, '_positional', {enumerable: false})
    Object.defineProperty(this, '_named', {enumerable: false})
  }

  has(index: number | string) {
    if (typeof index === 'string') {
      return this._named.has(index)
    }

    return index < this._positional.length
  }

  safeAt(index: number): Value | undefined {
    return this._positional[index]
  }

  at<V extends Value>(
    index: number,
    type?: new (...args: any[]) => V,
  ): Result<V, string | RuntimeError> {
    const arg = this._positional.at(index)
    if (arg !== undefined) {
      if (type === undefined || arg instanceof type) {
        return ok(arg as V)
      } else {
        return err(
          `Unexpected argument of type ${(arg as Value).constructor}, expected ${type.name}`,
        )
      }
    }

    return err(`No argument at position ${index}`)
  }

  safeNamed(name: string): Value | undefined {
    return this._named.get(name)?.[0]
  }

  named<V extends Value>(
    name: string,
    type?: new (...args: any[]) => V,
  ): Result<V, string | RuntimeError> {
    const arg = this._named.get(name)?.[0]
    if (arg !== undefined) {
      if (type === undefined || arg instanceof type) {
        return ok(arg as V)
      } else {
        return err(
          `Unexpected argument of type ${(arg as Value).constructor}, expected ${type.name}`,
        )
      }
    }

    return err(`No argument named ${name}`)
  }

  safeAllNamed(name: string): Value[] {
    return this._named.get(name) ?? []
  }

  alias(index: number) {
    const [, alias] = this.args[index] ?? []
    return alias
  }
}

export class FormulaValue extends Value {
  readonly is: 'formula' | 'named-formula' = 'formula'
  name: string | undefined = undefined

  constructor(
    readonly fn: (
      _1: FormulaArgs,
      _2: ClassInstanceValue | undefined,
    ) => Result<Value, string | RuntimeError>,
    readonly boundThis: ClassInstanceValue | undefined,
  ) {
    super()
  }

  isEqual(value: Value): boolean {
    return value === this
  }

  isTruthy() {
    return true
  }

  getType(): Types.Type {
    return Types.NullType
  }

  toLisp() {
    return ''
  }

  toCode() {
    return ''
  }

  printable() {
    return ''
  }

  static _props: Map<string, (value: FormulaValue) => Value> = new Map([])

  propValue(propName: string): Value | undefined {
    const prop = FormulaValue._props.get(propName)
    return prop?.(this)
  }

  call(formulaArgs: FormulaArgs): Result<Value, string | RuntimeError> {
    try {
      return this.fn(formulaArgs, this.boundThis)
    } catch (e) {
      const message = typeof e === 'object' && e && 'message' in e ? e.message : `${e}`
      return err(`Error occurred in function: ${message}`)
    }
  }

  bound(boundThis: ClassInstanceValue) {
    return new FormulaValue(this.fn, boundThis)
  }
}

export class NamedFormulaValue extends FormulaValue {
  readonly is = 'named-formula'

  constructor(
    readonly name: string,
    fn: (
      _1: FormulaArgs,
      _2: ClassInstanceValue | undefined,
    ) => Result<Value, string | RuntimeError>,
    boundThis: ClassInstanceValue | undefined,
  ) {
    super(fn, boundThis)
  }

  bound(boundThis: ClassInstanceValue) {
    return new NamedFormulaValue(this.name, this.fn, boundThis)
  }
}

/**
 * Each enum type declaration has a corresponding Enum value (singleton), which
 * is a namespace containing functions that return `EnumValue`-s.
 *
 *     enum UserRole { .admin, .staff, .user, .anon }
 *
 *     let
 *       role = UserRole.admin -- UserRole is retrieved from runtime, returns a
 *                             -- namespace. `.admin` returns the `EnumValue`
 *       foo = UserRole  -- not sure what the intention is here, but returns an
 *                       -- object of type `NamespaceType`
 *       role: UserRole = .admin -- .admin is "decorated" with the namespace during compilation
 *     in …
 */
export class Enum extends Value {
  readonly is = 'enum-value'
  readonly namespaceType: Types.NamespaceType

  constructor(readonly name: string) {
    super()
    this.namespaceType = new Types.NamespaceType(name, new Map())
  }

  isEqual(value: Value): boolean {
    return value === this
  }

  isTruthy() {
    return true
  }

  getType(): Types.Type {
    return this.namespaceType
  }

  toLisp() {
    return this.name
  }

  toCode() {
    return this.name
  }

  printable() {
    return this.name
  }

  static _props: Map<string, (value: EnumValue) => Value> = new Map([])

  propValue(_propName: string): Value | undefined {
    return
  }
}

export class EnumValue extends Value {
  readonly is = 'enum-value'

  constructor(
    readonly namespace: Enum,
    readonly name: string,
    readonly args: Map<string, Value>,
  ) {
    super()
  }

  isEqual(value: Value): boolean {
    if (!(value instanceof EnumValue) || value.namespace !== this.namespace) {
      return false
    }
    if (value.name !== this.name) {
      return false
    }
    for (const [key, thisValue] of this.args) {
      const otherValue = value.args.get(key)
      if (otherValue === undefined || !thisValue.isEqual(otherValue)) {
        return false
      }
    }
    return true
  }

  isTruthy() {
    return true
  }

  getType(): Types.Type {
    return Types.NullType
  }

  toLisp() {
    return ''
  }

  toCode() {
    return `${this.namespace.name}.${this.name}`
  }

  printable() {
    return ''
  }

  static _props: Map<string, (value: EnumValue) => Value> = new Map([])

  propValue(_propName: string): Value | undefined {
    return
  }
}

export class ViewFormulaValue extends NamedFormulaValue {
  constructor(
    name: string,
    fn: (
      _1: FormulaArgs,
      _2: ClassInstanceValue | undefined,
    ) => Result<Value, string | RuntimeError>,
    boundThis: ClassInstanceValue | undefined,
    private renderFormula: (
      _1: FormulaArgs,
      _2: ClassInstanceValue | undefined,
    ) => Result<Node, string | RuntimeError>,
  ) {
    super(name, fn, boundThis)
  }

  bound(boundThis: ClassInstanceValue) {
    return new ViewFormulaValue(this.name, this.fn, boundThis, this.renderFormula)
  }

  render(args: FormulaArgs): Result<Node, string | RuntimeError> {
    try {
      return this.renderFormula(args, this.boundThis)
    } catch (e) {
      const message = typeof e === 'object' && e && 'message' in e ? e.message : `${e}`
      return err(`Error occurred in function: ${message}`)
    }
  }
}

/**
 * Represents a <tag />, <tag>…</tag>
 */
export abstract class ViewValue extends Value {
  isEqual(value: Value): boolean {
    return value === this
  }

  isTruthy() {
    return true
  }

  toLisp() {
    return `<>TODO?</>`
  }

  toCode() {
    return `<>TODO?</>`
  }

  printable() {
    return '<>TODO?</>'
  }

  propValue() {
    return undefined
  }
}

/**
 * Represents a <tag />, <tag>…</tag>
 */
export class NamedViewValue extends ViewValue {
  constructor(readonly name: string) {
    super()
  }

  getType(): Types.Type {
    return Types.UserViewType
  }
}

/**
 * Represents a fragment <>…</>
 */
export class FragmentViewValue extends ViewValue {
  getType(): Types.Type {
    return Types.FragmentViewType
  }

  isEqual(value: Value): boolean {
    return value === this
  }

  isTruthy() {
    return true
  }

  propValue() {
    return undefined
  }
}

/**
 * The value of a `ClassDefinitionType` is a `ClassDefinitionValue`. This is a
 * combination of a formula (returns an instance of `ClassInstanceValue`) and
 * namespace.
 */
export class ClassDefinitionValue extends Value {
  constructor(
    readonly name: string,
    readonly konstructor: (_: ClassDefinitionValue) => NamedFormulaValue,
    readonly parent: ClassDefinitionValue | undefined,
    readonly staticProps: Map<string, Value>,
    readonly staticFormulas: Map<string, NamedFormulaValue>,
  ) {
    super()
  }

  /**
   * The type of a class is a ClassDefinitionType, the type of a class instance
   * is the ClassInstanceType. I think that's how it works.
   */
  getType() {
    return Types.NeverType
  }

  isEqual(rhs: Value): boolean {
    return rhs === this
  }

  isTruthy() {
    return true
  }

  toCode() {
    return this.name
  }

  printable() {
    return this.toCode()
  }

  propValue(propName: string): Value | undefined {
    return
  }
}

export class ViewClassDefinitionValue extends ClassDefinitionValue {
  constructor(
    name: string,
    konstructor: (_: ViewClassDefinitionValue) => NamedFormulaValue,
    readonly parent: ViewClassDefinitionValue | undefined,
    staticProps: Map<string, Value>,
    staticFormulas: Map<string, NamedFormulaValue>,
  ) {
    super(name, konstructor, parent, staticProps, staticFormulas)
  }
}

export class ClassInstanceValue extends Value {
  readonly formulas: Map<string, FormulaValue>

  constructor(
    readonly metaClass: ClassDefinitionValue,
    readonly props: Map<string, Value>,
    formulas: Map<string, FormulaValue>,
  ) {
    super()
    this.formulas = new Map()
    for (const [name, formula] of formulas) {
      this.formulas.set(name, formula.bound(this))
    }
  }

  /**
   * The type of a class is a ClassDefinitionType, the type of a class instance
   * is the ClassInstanceType. I think that's how it works.
   */
  getType() {
    return Types.NeverType
  }

  isEqual(rhs: Value): boolean {
    return rhs === this
  }

  isTruthy() {
    return true
  }

  toCode() {
    return `${this.metaClass.name}()`
  }

  printable() {
    return this.toCode()
  }

  propValue(propName: string): Value | undefined {
    return this.props.get(propName) ?? this.formulas.get(propName)
  }
}

export class ViewClassInstanceValue extends ClassInstanceValue {
  readonly renderFormula: ViewFormulaValue

  constructor(
    readonly metaClass: ViewClassDefinitionValue,
    renderFormula: ViewFormulaValue,
    props: Map<string, Value>,
    formulas: Map<string, FormulaValue>,
  ) {
    if (formulas.get('render') === renderFormula) {
      formulas = new Map(formulas)
      formulas.delete('render')
    }

    super(metaClass, props, formulas)
    this.renderFormula = renderFormula.bound(this)
  }

  render(args: FormulaArgs): Result<Node, string | RuntimeError> {
    return this.renderFormula.render(args)
  }

  receive<T>(dom: DOM<T>, message: MessageValue, node: Node) {
    if (message.payload.is === 'assignment') {
      this.props.set(message.payload.prop, message.payload.value)
    }
    node.receive(dom, message)
  }
}

export class ModuleValue extends Value {
  constructor(readonly definitions: Map<string, Value>) {
    super()
  }

  getType() {
    return new Types.ModuleType(
      new Map(Array.from(this.definitions).map(([name, value]) => [name, value.getType()])),
    )
  }

  isEqual(rhs: Value): boolean {
    return rhs === this
  }

  isTruthy() {
    return true
  }

  toCode() {
    return "Hello, I'm a Module. Don't output me."
  }

  printable() {
    return Array.from(this.definitions.values())
      .map(d => d.printable())
      .join('\n')
  }

  propValue(propName: string) {
    return this.definitions.get(propName)
  }
}

type MessagePayload = {is: 'assignment'; prop: string; value: Value}

export class MessageValue extends Value {
  constructor(
    readonly subject: Value,
    readonly payload: MessagePayload,
  ) {
    super()
  }

  static assignment(subject: Value, prop: string, value: Value) {
    return new MessageValue(subject, {is: 'assignment', prop, value})
  }

  getType() {
    return new Types.MessageType()
  }

  isEqual(rhs: Value): boolean {
    return rhs === this
  }

  isTruthy() {
    return true
  }

  toCode() {
    return "Hello, I'm a Message. Don't output me."
  }

  printable() {
    return ''
  }

  propValue() {
    return undefined
  }
}

;(function init() {
  ArrayValue._props.set('length', (value: ArrayValue) => int(value.values.length))
  ArrayValue._props.set('map', (array: ArrayValue) =>
    namedFormula('map', args =>
      args.at(0, FormulaValue).map(apply =>
        mapAll(
          array.values.map((val, index) =>
            apply.call(
              new FormulaArgs([
                [undefined, val],
                [undefined, int(index)],
              ]),
            ),
          ),
        ).map(values => new ArrayValue(values)),
      ),
    ),
  )
})()
