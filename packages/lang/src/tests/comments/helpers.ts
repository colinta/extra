import {expect} from 'bun:test'

import {type Comment} from '../../formulaParser/types'
import {testScan} from '../../formulaParser'
import * as Expressions from '../../expressions'
import {scanImportStatement} from '../../formulaParser/scan/module'

export function lineComments(...comments: string[]): Comment[] {
  return comments.map(comment => ({delim: '--', comment, type: 'line'}))
}

export function expectComments(actual: Comment[] | undefined, ...comments: string[]) {
  expect(actual).toEqual(lineComments(...comments))
}

export function expectNoComments(actual: Comment[] | undefined) {
  expect(actual).toEqual([])
}

export function scanImport(formula: string) {
  const importExpr = testScan(formula, scanImportStatement).get()

  if (!(importExpr instanceof Expressions.ImportStatement)) {
    expect(importExpr).toBeInstanceOf(Expressions.ImportStatement)
    throw new Error('Expected ImportStatement')
  }

  return importExpr
}
