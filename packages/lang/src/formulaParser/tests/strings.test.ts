import {cases, c} from '@extra-lang/cases'
import {type Expression} from '../expressions'
import {parse} from '../'

describe('strings', () => {
  cases<[string, string] | [string, string, string]>(
    c(["''", "''"]),
    c(['""', "''", "''"]),
    c(['``', "''", "''"]),
    c(['tag``', 'tag``', 'tag``']),
    c(['tag```a```', 'tag`a`', 'tag`a`']),
    c(['tag`${a}!`', "(++ a '!')", 'tag`${a}!`']),
    c(['tag```\n${a}!\n```', "(++ a '!\\n')", 'tag```\n${a}!\n\n```']),
    c(["'testing'", "'testing'"]),
    c([`'unicode ♥'`, "'unicode ♥'"]),
    c(['"escape \\x412"', "'escape A2'", "'escape A2'"]),
    c(["'escape \\u00412'", "'escape A2'", "'escape A2'"]),
    c(["'escape \\u2665'", "'escape ♥'", "'escape ♥'"]),
    c([
      `'''
1what a
world'''`,
      "'1what a\\nworld'",
      "'''\n1what a\nworld'''",
    ]),
    c([
      `'''2what a
world'''`,
      "'2what a\\nworld'",
      "'''\n2what a\nworld'''",
    ]),
    c([
      `'''3what a
world
'''`,
      "'3what a\\nworld\\n'",
      "'''\n3what a\nworld\n'''",
    ]),
    c([
      `'''
  4what a
  world
  '''`,
      "'4what a\\nworld\\n'",
      "'''\n4what a\nworld\n'''",
    ]),
    c([
      `\
  '''
  \t5what a
  world
  '''`,
      "'\\t5what a\\nworld\\n'",
      "'''\n\t5what a\nworld\n'''",
    ]),
    c([
      `\
  '''
  🙂
   6what a
  world
  '''`,
      "'🙂\\n 6what a\\nworld\\n'",
      "'''\n🙂\n 6what a\nworld\n'''",
    ]),
    c(['"""this ${is} a good "test"."""', "(++ 'this ' is ' a good \"test\".')"]),
    c(["'''this ${is} ok.'''", "'this ${is} ok.'", "'this ${is} ok.'"]),
    c([
      '"""this $is another fine \'test\'."""',
      "(++ 'this ' is ' another fine \\'test\\'.')",
      '"""this ${is} another fine \'test\'."""',
    ]),
    c([
      '"""this \\$is one more "test"."""',
      '\'this $is one more "test".\'',
      '\'this $is one more "test".\'',
    ]),
    c([
      '"""this is \\$an alternative "test"."""',
      '\'this is $an alternative "test".\'',
      '\'this is $an alternative "test".\'',
    ]),
    c(['"""this ${.is} a good "test"."""', `(++ 'this ' (. is) ' a good "test".')`]),
    c(['```this ${@is} a `good` "test".```', `(++ 'this ' @is ' a \`good\` "test".')`]),
    c([
      "'this ${.is} a good \\'test\\''",
      `'this \${.is} a good \\'test\\''`,
      `"this \${.is} a good 'test'"`,
    ]),
    c(['`not ${this.one}, it\'s just "ok"`', "(++ 'not ' (. `this` one) ', it\\'s just \"ok\"')"]),
  ).run(([formula, expectedLisp, expectedCode], {only, skip}) =>
    (only ? it.only : skip ? it.skip : it)(`should parse string template '${formula}'`, () => {
      expectedCode = expectedCode ?? formula
      let expression: Expression
      expect(() => (expression = parse(formula).get())).not.toThrow()

      expect(expression!.toLisp()).toEqual(expectedLisp)
      expect(expression!.toCode()).toEqual(expectedCode)
    }),
  )
})

describe('invalid', () => {
  cases<[string, string]>(
    c([
      `
    '''
  line
    '''
`,
      'Invalid indent in string literal',
    ]),
  ).run(([formula, message], {only, skip}) =>
    (only ? it.only : skip ? it.skip : it)(`should not parse ${formula}`, () => {
      expect(() => {
        parse(formula).get()
      }).toThrow(message)
    }),
  )
})
