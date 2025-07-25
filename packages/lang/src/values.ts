import {err, mapAll, ok, type Result} from '@extra-lang/result'
import {RuntimeError} from './formulaParser/types'
import {splitter} from './graphemes'
import * as Types from './types'

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
  return new FormulaValue(fn)
}

export function namedFormula(
  name: string,
  fn: (_: FormulaArgs) => Result<Value, string | RuntimeError>,
) {
  return new NamedFormulaValue(name, fn)
}

export type JSValue = boolean | number | string | null | {[x: string]: JSValue} | Array<JSValue>

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
   * Returns a "human readable" string readable, e.g. numbers get commas and decimal
   * points added.
   */
  abstract printable(): string
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

  // private static _props: Map<string, (value: BooleanValue) => Value> = new Map([])

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

  // private static _floatProps: Map<string, (value: FloatValue) => Value> = new Map([])

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

  // private static _intProps: Map<string, (value: IntValue) => Value> = new Map([])

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

  private static _stringProps = new Map<string, (value: StringValue) => Value>([
    ['length', (value: StringValue) => int(value.value.length)],
    [
      'mapChars',
      value =>
        namedFormula('mapChars', (args: FormulaArgs) => {
          return args
            .at(0, FormulaValue)
            .map(mapFn => mapFn.fn(new FormulaArgs([[undefined, value]])))
        }),
    ],
    [
      'repeat',
      value =>
        namedFormula('repeat', function repeat(args: FormulaArgs) {
          return args.at(0, IntValue).map(times => string(value.value.repeat(times.value)))
        }),
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

  private static _unicodeProps = new Map<string, (value: UnicodeStringValue) => Value>([
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

  private static _props: Map<string, (value: RegExp) => Value> = new Map([])

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
    if (this.start === undefined && this.stop === undefined) {
      return Types.range(Types.never())
    }

    // both are int
    if (
      this.start &&
      this.stop &&
      this.start[0] instanceof IntValue &&
      this.stop[0] instanceof IntValue
    ) {
      return Types.range(Types.IntType)
    }

    // start is int, no end value
    if (this.start && !this.stop && this.start[0] instanceof IntValue) {
      return Types.range(Types.IntType)
    }

    // stop is int, no start value
    if (!this.start && this.stop && this.stop[0] instanceof IntValue) {
      return Types.range(Types.IntType)
    }

    // float in there somewhere
    return Types.range(Types.FloatType)
  }

  private static _props: Map<string, (value: RangeValue) => Value> = new Map([])

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
    for (const [name, value] of this.namedValues.entries()) {
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

    for (const [name, lhs] of this.namedValues.entries()) {
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
    const namedEntries = Array.from(this.namedValues.entries())
    const tupleCode = tupleEntries.map(value => value.toLisp()).join(' ')
    const namedCode = namedEntries.map(([name, value]) => `(${name}: ${value.toLisp()})`).join(' ')
    return `{${tupleCode}${tupleCode && namedCode ? ' ' : ''}${namedCode}}`
  }

  toCode() {
    const tupleEntries = this.tupleValues
    const namedEntries = Array.from(this.namedValues.entries())
    const tupleCode = tupleEntries.map(value => value.toCode()).join(', ')
    const namedCode = namedEntries.map(([name, value]) => `${name}: ${value.toCode()}`).join(', ')
    return `{${tupleCode}${tupleCode && namedCode ? ', ' : ''}${namedCode}}`
  }

  printable() {
    const tupleEntries = this.tupleValues
    const namedEntries = Array.from(this.namedValues.entries())
    const tupleCode = tupleEntries.map(value => value.printable()).join(', ')
    const namedCode = namedEntries
      .map(([name, value]) => `${name}: ${value.printable()}`)
      .join(', ')
    return `{${tupleCode}${tupleCode && namedCode ? ', ' : ''}${namedCode}}`
  }

  private static _props: Map<string, (value: ObjectValue) => Value> = new Map([])

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

    return this.values[index]
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

  isTruthy() {
    return this.values.length > 0
  }

  getType(): Types.Type {
    return this.runtimeType
  }

  private static _props: Map<string, (value: ArrayValue) => Value> = new Map([])
  static init() {
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
  }

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

    for (const [name, lhValue] of this.values.entries()) {
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
      return 'Set()'
    }

    const values = [...this.values.entries()]
      .map(([name, value]) => `(${name}: ${value.toLisp()})`)
      .join(' ')
    return `Set(${values})`
  }

  toCode() {
    if (this.values.size === 0) {
      return 'Set()'
    }

    const values = [...this.values.entries()].map(([name, value]) => `${name}: ${value}`).join(', ')
    return `Set(${values})`
  }

  printable() {
    const values = [...this.values.entries()]
      .map(([name, value]) => `${name}: ${value.printable()}`)
      .join(', ')
    return `Set(${values})`
  }

  private static _props: Map<string, (value: DictValue) => Value> = new Map([])

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

  isTruthy() {
    return this.values.length > 0
  }

  getType(): Types.Type {
    return this.runtimeType
  }

  private static _props: Map<string, (value: SetValue) => Value> = new Map([])

  propValue(propName: string): Value | undefined {
    const prop = SetValue._props.get(propName)
    return prop?.(this)
  }
}

/**
 * When arguments are passed to a function there are plenty of shorthands like
 * `...` and `...name:` and `*kwargs`. These are all flattened and combined (in
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

  constructor(readonly fn: (_: FormulaArgs) => Result<Value, string | RuntimeError>) {
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

  private static _props: Map<string, (value: FormulaValue) => Value> = new Map([])

  propValue(propName: string): Value | undefined {
    const prop = FormulaValue._props.get(propName)
    return prop?.(this)
  }

  call(formulaArgs: FormulaArgs): Result<Value, string | RuntimeError> {
    try {
      return this.fn(formulaArgs)
    } catch (e) {
      const message = typeof e === 'object' && e && 'message' in e ? e.message : `${e}`
      return err(`Error occurred in function: ${message}`)
    }
  }
}

export class NamedFormulaValue extends FormulaValue {
  readonly is = 'named-formula'

  constructor(
    readonly name: string,
    fn: (_: FormulaArgs) => Result<Value, string | RuntimeError>,
  ) {
    super(fn)
  }
}

export class ViewFormulaValue extends NamedFormulaValue {}
export class FragmentFormulaValue extends FormulaValue {}

export class ViewValue extends Value {
  getType(): Types.Type {
    return Types.UserViewType
  }

  isEqual(value: Value): boolean {
    return value === this
  }

  isTruthy() {
    return true
  }

  toLisp() {
    return `<></>`
  }

  toCode() {
    return `<></>`
  }

  printable() {
    return '<></>'
  }

  propValue() {
    return undefined
  }
}

export class FragmentViewValue extends Value {
  constructor(readonly children: ViewValue[]) {
    super()
  }

  getType(): Types.Type {
    return Types.FragmentViewType
  }

  isEqual(value: Value): boolean {
    return value === this
  }

  isTruthy() {
    return true
  }

  toLisp() {
    return `<>${this.children.map(child => child.toLisp())}</>`
  }

  toCode() {
    return `<>${this.children.map(child => child.toCode())}</>`
  }

  printable() {
    return '<></>'
  }

  propValue() {
    return undefined
  }
}

ArrayValue.init()
