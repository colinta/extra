import {ok, err} from '@extra-lang/result'

import * as Nodes from '@/nodes'
import * as Types from '@/types'
import * as Values from '@/values'
import {type Comment, type GetTypeResult} from '@/formulaParser/types'
import {type TypeRuntime, type ValueRuntime} from '@/runtime'

import {Expression, RuntimeError, toSource, type Range} from './expressions'

export class MacroExpression extends Expression {
  constructor(
    range: Range,
    precedingComments: Comment[],
    readonly macro: '#line' | '#column' | '#fn',
    readonly input: string,
  ) {
    super(range, precedingComments)
  }

  toLisp() {
    return '`' + this.macro + '`'
  }

  toCode() {
    return this.macro
  }

  private lineAndColumn() {
    let line = 1
    let column = 1
    for (let index = 0; index < this.range[0]; index += 1) {
      if (this.input[index] === '\n') {
        line += 1
        column = 1
      } else {
        column += 1
      }
    }
    return {line, column}
  }

  getType(runtime: TypeRuntime): GetTypeResult {
    switch (this.macro) {
      case '#line':
        return ok(Values.int(this.lineAndColumn().line).getType())
      case '#column':
        return ok(Values.int(this.lineAndColumn().column).getType())
      case '#fn': {
        const fnType = runtime.getLocalType('#fn')
        if (fnType) {
          return ok(fnType)
        }
        return err(new RuntimeError(this, "'#fn' accessed outside of a named function"))
      }
    }
  }

  eval(runtime: ValueRuntime) {
    switch (this.macro) {
      case '#line':
        return ok(Values.int(this.lineAndColumn().line))
      case '#column':
        return ok(Values.int(this.lineAndColumn().column))
      case '#fn': {
        const fnValue = runtime.getLocalValue('#fn')
        if (fnValue) {
          return ok(fnValue)
        }
        return err(new RuntimeError(this, "'#fn' accessed outside of a named function"))
      }
    }
  }

  compile(runtime: TypeRuntime) {
    switch (this.macro) {
      case '#line': {
        const value = this.lineAndColumn().line
        return ok(new Nodes.LiteralInt(toSource(this), value, 'decimal'))
      }
      case '#column': {
        const value = this.lineAndColumn().column
        return ok(new Nodes.LiteralInt(toSource(this), value, 'decimal'))
      }
      case '#fn': {
        const fnType = runtime.getLocalType('#fn')
        if (fnType instanceof Types.LiteralStringType) {
          return ok(new Nodes.LiteralString(toSource(this), fnType.value, Array.from(fnType.value)))
        }
        return err(new RuntimeError(this, "'#fn' accessed outside of a named function"))
      }
    }
  }
}
