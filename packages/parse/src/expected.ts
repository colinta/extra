import {ReasonError} from './types'

export type BuiltinTypeNames = 'boolean' | 'float' | 'int' | 'null' | 'string' | 'regex'
export type Expected =
  | {type: BuiltinTypeNames}
  | {type: 'undefined'}
  | {type: 'literal'; of: BuiltinTypeNames}
  | {type: 'array' | 'dict' | 'optional'; of: Expected}
  | {type: 'tuple' | 'oneOf' | 'all'; of: Expected[]}
  | {type: 'object'; of: [string, Expected][]}
  | {type: 'instanceof'; of: new () => any}
  | {type: 'field'; name: string; of: Expected}
  | {type: 'unknown'}

export class Unexpected {
  type = 'unexpected'

  constructor(
    public expected: Expected,
    public found: Expected['type'],
    public reason: ReasonError,
  ) {}
}

export function expected({
  expected,
  found: value,
  reason,
}: {
  expected: Expected
  found: any
  reason: ReasonError
}): Unexpected {
  return new Unexpected(expected, found(value), reason)
}

function found(value: any): Expected['type'] {
  let found: Expected['type']

  if (Array.isArray(value)) {
    found = 'array'
    // or tuple
  } else if (typeof value === 'boolean') {
    found = 'boolean'
  } else if (Number.isInteger(value)) {
    found = 'int'
  } else if (typeof value === 'number') {
    found = 'float'
  } else if (value === null || value === undefined) {
    found = 'null'
  } else if (typeof value === 'string' || value instanceof String) {
    found = 'string'
  } else if (typeof value === 'object') {
    found = 'object'
    // or dict
  } else {
    found = 'unknown'
  }

  return found
}
