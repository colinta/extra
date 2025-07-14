export const INDENT = '  '
export const NEWLINE_INDENT = '\n  '
export const SMALL_LEN = 20
export const MAX_LEN = 100
export const MAX_INNER_LEN = 80

export function wrapStrings(lhs: string, strings: string[], rhs: string) {
  const wrap = {totalLength: 0, hasNewline: false}
  const values = strings.map(code => {
    wrap.hasNewline = wrap.hasNewline || code.length > MAX_INNER_LEN || code.includes('\n')
    wrap.totalLength += code.length + 2
    return code
  })

  if (wrap.hasNewline || wrap.totalLength > MAX_LEN) {
    if (!lhs && !rhs) {
      return values.join('\n')
    }

    const indented = values.map(code => indent(code)).join('\n')
    return `${lhs}\n${indented}\n${rhs}`
  } else {
    return `${lhs}${values.join(', ')}${rhs}`
  }
}

export function indent(code: string) {
  const lines = code.split('\n').map(line => (line === '' ? '' : INDENT + line))
  return lines.join('\n')
}
