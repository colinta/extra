import {inspect as nodeInspect} from 'util'

export const inspectable = Symbol('inspectable')

let _debug = true
export function debug(enabled?: boolean) {
  if (enabled !== undefined) {
    _debug = enabled
  }
  return _debug
}

const closer = '\x1b[0m'

export function ansi(code: number, input: string) {
  const opener = '\x1b['.concat(String(code), 'm')
  return opener.concat(input.replace(closer, opener), closer)
}

export function bold(input: string) {
  return ansi(1, input)
}

export function underline(input: string) {
  return ansi(4, input)
}

export function red(input: string) {
  return ansi(31, input)
}

export function green(input: string) {
  return ansi(32, input)
}

export function yellow(input: string) {
  return ansi(33, input)
}

export function blue(input: string) {
  return ansi(34, input)
}

export function magenta(input: string) {
  return ansi(35, input)
}

export function cyan(input: string) {
  return ansi(36, input)
}

export function gray(input: string) {
  return ansi(90, input)
}

export const colorize = {
  format: function (input: any): string {
    switch (typeof input) {
      case 'string':
        return colorize.string(input)
      case 'symbol':
        return colorize.symbol(input)
      case 'number':
        return colorize.number(input)
      case 'undefined':
        return colorize.undefined()
      case 'boolean':
        return colorize.boolean(input)
      default:
        if (input === null) {
          return colorize.null()
        }

        return `${input}`
    }
  },
  number: function (input: any) {
    return yellow(''.concat(input))
  },
  symbol: function (input: any) {
    return magenta(''.concat(input))
  },
  string: function (input: any) {
    let quote: string
    if (input.includes("'")) {
      quote = '"'
      input = input.replaceAll('"', '\\"')
    } else {
      quote = "'"
      input = input.replaceAll("'", "\\'")
    }
    input.replace(/\n/g, '\\n')

    return green(quote.concat(input, quote))
  },
  key: function (input: any) {
    return cyan(input)
  },
  boolean: function (input: any) {
    return yellow(''.concat(input))
  },
  undefined: function () {
    return gray('undefined')
  },
  null: function () {
    return bold(gray('null'))
  },
}

export function inspect(value: any, wrap = true, depth = 0, found = new Set<any>()): string {
  if (found.has(value)) {
    return '<…circular reference…>'
  }

  const nextFound = new Set(found)
  if (value && value instanceof Object) {
    nextFound.add(value)
  }

  if (value instanceof Set) {
    return `new Set(${inspect(Array.from(value.values()), wrap, depth, nextFound)})`
  }

  if (value instanceof Map) {
    return `new Map(${inspect(Array.from(value.entries()), wrap, depth, nextFound)})`
  }

  const tab = '  '.repeat(depth)
  const innerTab = tab + '  '

  if (value instanceof Object && value.constructor !== Object && Object.keys(value).length === 0) {
    return nodeInspect(value).replace('\n', `\n${innerTab}`)
  } else if (typeof value === 'string') {
    return colorize.string(value)
  } else if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'undefined' ||
    value === null
  ) {
    return colorize.format(value)
  } else if (typeof value === 'function') {
    return `function${value.name ? ` ${value.name}` : ''}() {…}`
  } else if (Array.isArray(value)) {
    if (value.length === 0) {
      return '[]'
    }

    const values = value.map(val => inspect(val, wrap, depth + 1, nextFound))
    const count = values.reduce((len, val) => len + val.length, 0)
    const newline = wrap && count > 100
    let inner: string
    if (newline) {
      inner = values.join(`,\n${innerTab}`)
    } else {
      inner = values.join(', ')
    }

    return newline ? `[\n${innerTab}${inner}\n${tab}]` : `[ ${inner} ]`
  }

  let className = ''
  if (value.constructor.name !== 'Object') {
    className = green('// class ' + value.constructor.name.concat(' '))
  }

  if (value[inspectable]) {
    return className ? `${className}\n${value[inspectable]()}` : value[inspectable]()
  }

  const keys = Object.keys(value)
  if (keys.length === 0) {
    return '{}'
  }

  const values = keys.map(
    key => `${colorize.key(key)}: ${inspect(value[key], wrap, depth + 1, nextFound)}`,
  )
  const count = values.reduce((len, val) => len + val.length, 0)
  const newline = className || (wrap && count > 100)
  let inner: string
  if (newline) {
    inner = values.join(`,\n${innerTab}`)
  } else {
    inner = values.join(', ')
  }

  if (className) {
    className = `${innerTab}${className}\n`
  }

  return newline ? `{\n${className}${innerTab}${inner}\n${tab}}` : `{ ${inner} }`
}

for (const logLevel of ['log', 'warn', 'debug', 'info', 'error'] as const) {
  const logFn = console[logLevel]
  console[logLevel] = (...messages: any[]) => {
    if (!debug()) {
      return
    }

    for (const message of messages) {
      if (typeof message === 'string') {
        logFn(message)
      } else {
        logFn(inspect(message, true))
      }
    }
  }
}

export default inspect
