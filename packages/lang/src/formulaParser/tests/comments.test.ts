import {c, cases} from '@extra-lang/cases'
import {parse, testScan} from '../'
import * as Expressions from '../../expressions'
import {scanImportStatement} from '../scan/module'

describe('comments', () => {
  describe('skipping comments', () => {
    cases<[string[], string, string]>(
      c([
        [
          " -- start with an array\n[-1, 2, 3] |> join(', ')",
          "[ -- start with an array\n-1, 2, 3] |>\n  join(', ')",
          "[-1 -- start with an array\n, 2, 3] |>\n  join(', ')",
          "[-1, -- start with an array\n2, 3] |>\n  join(', ')",
          "[-1, 2 -- start with an array\n, 3] |>\n  join(', ')",
          "[-1, 2, 3]-- start with an array\n |>\n  join(', ')",
          "[-1, 2, 3] |> -- start with an array\n\n  join(', ')",
          "[-1, 2, 3] |>\n -- start with an array\n  join(', ')",
          // this doesn't work! `join` is a valid expression, we stop
          // scanning at the end of the line
          // "[-1, 2, 3] |>\n  join -- start with an array\n(', ')",
          "[-1, 2, 3] |>\n  join( -- start with an array\n', ')",
          "[-1, 2, 3] |>\n  join(', ' -- start with an array\n)",
          "[-1, 2, 3] |>\n  join(', ') -- start with an array\n",
        ],
        "(|> [-1 2 3] (fn join (', ')))",
        "[-1, 2, 3] |> join(', ')",
      ]),
      c([['a <-- <=> b'], 'a', 'a']),
      c([['a {- <=> b -}'], 'a', 'a']),
      c([
        [
          '{--}[-1, 2, 3] |> filter(2)',
          '[{--}-1, 2, 3] |> filter(2)',
          '[-1{--}, 2, 3] |> filter(2)',
          '[-1,{--} 2, 3] |> filter(2)',
          '[-1, 2{--}, 3] |> filter(2)',
          '[-1, 2,{--} 3] |> filter(2)',
          '[-1, 2, {--}3] |> filter(2)',
          '[-1, 2, 3{--}] |> filter(2)',
          '[-1, 2, 3]{--} |> filter(2)',
          '[-1, 2, 3] |> {-|>-}filter(2)',
          '[-1, 2, 3] |> filter{--}(2)',
          '[-1, 2, 3] |> filter {--} (2)',
          '[-1, 2, 3] |> filter({--}2)',
          '[-1, 2, 3] |> filter(2{--})',
          '[-1, 2, 3] |> filter(2){--}',
          '[-1, 2, 3] |> filter(2) {--}',
          `[-1, 2, 3]
{- skip this next step
 |> join(', ')  {- maybe add back later -}
-}
 |> filter(2)`,
          `[-1, 2, 3]
{- skip this next step
 |> join(', ')  -- maybe add back later
-} |> filter(2)`,
        ],
        '(|> [-1 2 3] (fn filter (2)))',
        '[-1, 2, 3] |> filter(2)',
      ]),
      c([
        Array(0x2580 - 0x2500)
          .fill(0)
          .map((_, index) => String.fromCharCode(index + 0x2500))
          .map(comment => `a + ${comment} box character\nb`),
        '(+ a b)',
        'a + b',
      ]),
      c([Array('→', '←').map(comment => `a + ${comment} box character\nb`), '(+ a b)', 'a + b']),
    ).run(([formulas, expectedLisp, expectedCode], {only, skip}) => {
      formulas.forEach(formula =>
        (only ? it.only : skip ? it.skip : it)(
          `should parse comments '${formula.replaceAll('\n', ' ')}'`,
          () => {
            let expression: Expressions.Expression = parse(formula).get()

            expect(expression!.toCode()).toEqual(expectedCode)
            expect(expression!.toLisp()).toEqual(expectedLisp)
          },
        ),
      )
    })
  })

  describe('attaching comments to expressions', () => {
    it('attaches comments to lhs + rhs', () => {
      const formula = `\
--comment0
lhs --comment1
--comment2
+  --comment3
--comment4
rhs --comment5
--comment6`
      let addOperator: Expressions.Expression = parse(formula).get()

      if (!(addOperator! instanceof Expressions.Operation)) {
        expect(addOperator!).toBeInstanceOf(Expressions.Operation)
        return
      }

      // Destructure the operation's arguments (left-hand side and right-hand side)
      const [lhs, rhs] = addOperator.args

      // Test comments preceding and following the left-hand side operand
      expect(lhs.precedingComments).toEqual([{delim: '--', comment: 'comment0', type: 'line'}])
      expect(lhs.followingComments).toEqual([{delim: '--', comment: 'comment1', type: 'line'}])

      // Test comments preceding the operator and immediately following the operator
      expect(addOperator.precedingComments).toEqual([
        {delim: '--', comment: 'comment2', type: 'line'},
      ])
      expect(addOperator.followingOperatorComments).toEqual([
        {delim: '--', comment: 'comment3', type: 'line'},
      ])

      // Test comments preceding and following the right-hand side operand
      expect(rhs.precedingComments).toEqual([{delim: '--', comment: 'comment4', type: 'line'}])
      expect(rhs.followingComments).toEqual([{delim: '--', comment: 'comment5', type: 'line'}])

      // Test comments following the entire operation
      expect(addOperator.followingComments).toEqual([
        {delim: '--', comment: 'comment6', type: 'line'},
      ])
    })

    it('attaches comments to empty array items', () => {
      const formula = `\
--comment0
[ --comment1
] --comment2`
      let arrayExpr: Expressions.Expression = parse(formula).get()

      if (!(arrayExpr! instanceof Expressions.ArrayExpression)) {
        expect(arrayExpr!).toBeInstanceOf(Expressions.ArrayExpression)
        return
      }

      // Verify that the array is empty
      expect(arrayExpr.values).toEqual([])

      // Test comments preceding the array expression
      expect(arrayExpr.precedingComments).toEqual([
        {delim: '--', comment: 'comment0', type: 'line'},
      ])

      // Test comments inside the array (after opening bracket but before closing bracket)
      expect(arrayExpr.lastComments).toEqual([{delim: '--', comment: 'comment1', type: 'line'}])

      // Test comments following the array expression
      expect(arrayExpr.followingComments).toEqual([
        {delim: '--', comment: 'comment2', type: 'line'},
      ])
    })

    it('attaches comments to single array items', () => {
      const formula = `\
--comment0
[ --comment1
  item1 --comment2
  --comment3
] --comment4`
      let arrayExpr: Expressions.Expression = parse(formula).get()

      if (!(arrayExpr! instanceof Expressions.ArrayExpression)) {
        expect(arrayExpr!).toBeInstanceOf(Expressions.ArrayExpression)
        return
      }

      // Destructure the array's single item
      const [item1] = arrayExpr.values

      // Test comments preceding the array expression
      expect(arrayExpr.precedingComments).toEqual([
        {delim: '--', comment: 'comment0', type: 'line'},
      ])

      // Test comments preceding the array item (after opening bracket but before the item)
      expect(item1.precedingComments).toEqual([{delim: '--', comment: 'comment1', type: 'line'}])

      // Test comments following the array item
      expect(item1.followingComments).toEqual([{delim: '--', comment: 'comment2', type: 'line'}])

      // Test comments at the end of the array (after the item but before closing bracket)
      expect(arrayExpr.lastComments).toEqual([{delim: '--', comment: 'comment3', type: 'line'}])

      // Test comments following the array expression (after closing bracket)
      expect(arrayExpr.followingComments).toEqual([
        {delim: '--', comment: 'comment4', type: 'line'},
      ])
    })

    it('attaches comments to array items', () => {
      const formula = `\
--comment0
[ --comment1
item0 --comment2
--comment3
item1 --comment4
--comment5
] --comment6`
      let arrayExpr: Expressions.Expression = parse(formula).get()

      if (!(arrayExpr! instanceof Expressions.ArrayExpression)) {
        expect(arrayExpr!).toBeInstanceOf(Expressions.ArrayExpression)
        return
      }

      // Destructure the array's items
      const [item0, item1] = arrayExpr.values

      // Test comments preceding the array expression
      expect(arrayExpr.precedingComments).toEqual([
        {delim: '--', comment: 'comment0', type: 'line'},
      ])

      // Test comments preceding and following the first array item
      expect(item0.precedingComments).toEqual([{delim: '--', comment: 'comment1', type: 'line'}])
      expect(item0.followingComments).toEqual([{delim: '--', comment: 'comment2', type: 'line'}])

      // Test comments preceding and following the second array item
      expect(item1.precedingComments).toEqual([{delim: '--', comment: 'comment3', type: 'line'}])
      expect(item1.followingComments).toEqual([{delim: '--', comment: 'comment4', type: 'line'}])

      // Test comments at the end of the array (after all items but before closing bracket)
      expect(arrayExpr.lastComments).toEqual([{delim: '--', comment: 'comment5', type: 'line'}])

      // Test comments following the array expression (after closing bracket)
      expect(arrayExpr.followingComments).toEqual([
        {delim: '--', comment: 'comment6', type: 'line'},
      ])
    })

    it('attaches comments to empty object items', () => {
      const formula = `\
--comment0
{ --comment1
} --comment2`
      let objectExpr: Expressions.Expression = parse(formula).get()

      if (!(objectExpr! instanceof Expressions.ObjectExpression)) {
        expect(objectExpr!).toBeInstanceOf(Expressions.ObjectExpression)
        return
      }

      // Test comments preceding the object expression
      expect(objectExpr.precedingComments).toEqual([
        {delim: '--', comment: 'comment0', type: 'line'},
      ])

      // Test comments inside the empty object (after opening brace but before closing brace)
      expect(objectExpr.lastComments).toEqual([{delim: '--', comment: 'comment1', type: 'line'}])

      // Test comments following the object expression (after closing brace)
      expect(objectExpr.followingComments).toEqual([
        {delim: '--', comment: 'comment2', type: 'line'},
      ])
    })

    it('attaches comments to object items', () => {
      const formula = `\
--comment0
{ --comment1
item0: {-c1-} '' --comment2
--comment3
item1: --comment4
--comment5
item2  --comment6
--comment7
...item3  --comment8
--comment9
} --comment10`
      let objectExpr: Expressions.Expression = parse(formula).get()

      if (!(objectExpr! instanceof Expressions.ObjectExpression)) {
        expect(objectExpr!).toBeInstanceOf(Expressions.ObjectExpression)
        return
      }

      // Destructure the object's items/properties
      const [item0, item1, item2, item3] = objectExpr.values

      // Cast first item as a named argument to access its properties
      const namedArg0 = item0 as Expressions.NamedArgument
      const value0 = namedArg0.value

      // Test comments preceding the object expression
      expect(objectExpr.precedingComments).toEqual([
        {delim: '--', comment: 'comment0', type: 'line'},
      ])

      // Test comments preceding the first item (after opening brace)
      expect(namedArg0.precedingComments).toEqual([
        {delim: '--', comment: 'comment1', type: 'line'},
      ])

      // Test comments on the first item's value (block comment and line comment)
      expect(value0.precedingComments).toEqual([{delim: '{-', comment: 'c1', type: 'block'}])
      expect(value0.followingComments).toEqual([{delim: '--', comment: 'comment2', type: 'line'}])

      // Test comments preceding and following the second item
      expect(item1.precedingComments).toEqual([{delim: '--', comment: 'comment3', type: 'line'}])
      expect(item1.followingComments).toEqual([{delim: '--', comment: 'comment4', type: 'line'}])

      // Test comments preceding and following the third item
      expect(item2.precedingComments).toEqual([{delim: '--', comment: 'comment5', type: 'line'}])
      expect(item2.followingComments).toEqual([{delim: '--', comment: 'comment6', type: 'line'}])

      // Test comments preceding and following the fourth item (spread operator)
      expect(item3.precedingComments).toEqual([{delim: '--', comment: 'comment7', type: 'line'}])
      expect(item3.followingComments).toEqual([{delim: '--', comment: 'comment8', type: 'line'}])

      // Test comments at the end of the object (after all items but before closing brace)
      expect(objectExpr.lastComments).toEqual([{delim: '--', comment: 'comment9', type: 'line'}])

      // Test comments following the object expression (after closing brace)
      expect(objectExpr.followingComments).toEqual([
        {delim: '--', comment: 'comment10', type: 'line'},
      ])
    })

    it('attaches comments to dict items', () => {
      const formula = `\
--comment0
Dict( --comment1
  item1: --comment2
  --comment3
  ...item2  --comment4
  --comment5
) --comment6`
      let dictExpr: Expressions.Expression = parse(formula).get()

      if (!(dictExpr! instanceof Expressions.DictExpression)) {
        expect(dictExpr!).toBeInstanceOf(Expressions.DictExpression)
        return
      }

      // Destructure the dict's items
      const [item1, item2] = dictExpr.values

      // Test comments preceding the dict expression
      expect(dictExpr.precedingComments).toEqual([{delim: '--', comment: 'comment0', type: 'line'}])

      // Test comments preceding and following the first item (after opening parenthesis)
      expect(item1.precedingComments).toEqual([{delim: '--', comment: 'comment1', type: 'line'}])
      expect(item1.followingComments).toEqual([{delim: '--', comment: 'comment2', type: 'line'}])

      // Test comments preceding and following the second item (spread operator)
      expect(item2.precedingComments).toEqual([{delim: '--', comment: 'comment3', type: 'line'}])
      expect(item2.followingComments).toEqual([{delim: '--', comment: 'comment4', type: 'line'}])

      // Test comments at the end of the dict (after all items but before closing parenthesis)
      expect(dictExpr.lastComments).toEqual([{delim: '--', comment: 'comment5', type: 'line'}])

      // Test comments following the dict expression (after closing parenthesis)
      expect(dictExpr.followingComments).toEqual([{delim: '--', comment: 'comment6', type: 'line'}])
    })

    it('attaches comments to set items', () => {
      const formula = `\
--comment0
Set( --comment1
  item1 --comment2
  --comment3
  ...item2  --comment4
  --comment5
) --comment6`
      let setExpr: Expressions.Expression = parse(formula).get()

      if (!(setExpr! instanceof Expressions.SetExpression)) {
        expect(setExpr!).toBeInstanceOf(Expressions.SetExpression)
        return
      }

      // Destructure the set's items
      const [item1, item2] = setExpr.values

      // Test comments preceding the set expression
      expect(setExpr.precedingComments).toEqual([{delim: '--', comment: 'comment0', type: 'line'}])

      // Test comments preceding and following the first item (after opening parenthesis)
      expect(item1.precedingComments).toEqual([{delim: '--', comment: 'comment1', type: 'line'}])
      expect(item1.followingComments).toEqual([{delim: '--', comment: 'comment2', type: 'line'}])

      // Test comments preceding and following the second item (spread operator)
      expect(item2.precedingComments).toEqual([{delim: '--', comment: 'comment3', type: 'line'}])
      expect(item2.followingComments).toEqual([{delim: '--', comment: 'comment4', type: 'line'}])

      // Test comments at the end of the set (after all items but before closing parenthesis)
      expect(setExpr.lastComments).toEqual([{delim: '--', comment: 'comment5', type: 'line'}])

      // Test comments following the set expression (after closing parenthesis)
      expect(setExpr.followingComments).toEqual([{delim: '--', comment: 'comment6', type: 'line'}])
    })

    it('attaches comments to misc formula', () => {
      const formula = `\
--comment0
  let --comment1
    a --comment2
      = --comment3
        1 --comment4
    --comment5
    x = 2 --comment6

    b = x --comment7
      --comment8
      |> --comment9
      --comment10
      #pipe --comment11
      --comment12
      + --comment13
      --comment14
      a --comment15
  --comment16
  in --comment17
    --comment18
    [ --comment19
      a --comment20
      --comment21
      b --comment22
      --comment23
    ] --comment24
    --comment25
`
      let letExpr: Expressions.Expression = parse(formula).get()

      if (!(letExpr! instanceof Expressions.LetExpression)) {
        expect(letExpr!).toBeInstanceOf(Expressions.LetExpression)
        return
      }

      // Test bindings
      const bindings = letExpr.bindings
      // Test binding for 'a'
      const [aName, aBinding] = bindings[0]

      if (!(aBinding instanceof Expressions.NamedArgument)) {
        expect(aBinding).toBeInstanceOf(Expressions.NamedArgument)
        return
      }

      // Test a's value
      const aValue = aBinding.value
      // Test binding for 'x'
      const [xName, xBinding] = bindings[1]
      if (!(xBinding instanceof Expressions.NamedArgument)) {
        expect(xBinding).toBeInstanceOf(Expressions.NamedArgument)
        return
      }

      // Test binding for 'b'
      const [bName, bBinding] = bindings[2]
      if (!(bBinding instanceof Expressions.NamedArgument)) {
        expect(bBinding).toBeInstanceOf(Expressions.NamedArgument)
        return
      }

      // Test b's value (pipe operator)
      const pipeOp = bBinding.value as Expressions.Operation
      // Test pipe operator's arguments
      const [pipeArg1, pipeArg2] = pipeOp.args
      // First pipe argument (reference to x)
      const pipeXArg = pipeArg1 as Expressions.Reference
      // Second pipe argument (addition operator)
      const pipeOpArg2 = pipeArg2 as Expressions.Operation
      // Test addition operator's arguments
      const [addArg1, addArg2] = pipeOpArg2.args
      // Test body (array expression)
      const bodyArray = letExpr.body as Expressions.ArrayExpression
      // Test array values
      const [arrayItem1, arrayItem2] = bodyArray.values
      // Test let expression comments

      expect(letExpr.precedingComments).toEqual([{delim: '--', comment: 'comment0', type: 'line'}])

      expect(bindings.length).toBe(3)

      expect(aName).toBe('a')
      expect(aBinding.precedingComments).toEqual([{delim: '--', comment: 'comment1', type: 'line'}])
      expect(aBinding.followingAliasComments).toEqual([
        {delim: '--', comment: 'comment2', type: 'line'},
      ])

      expect(aValue.precedingComments).toEqual([{delim: '--', comment: 'comment3', type: 'line'}])
      expect(aValue.followingComments).toEqual([{delim: '--', comment: 'comment4', type: 'line'}])

      expect(xName).toBe('x')
      expect(xBinding.precedingComments).toEqual([{delim: '--', comment: 'comment5', type: 'line'}])
      expect(xBinding.value.followingComments).toEqual([
        {delim: '--', comment: 'comment6', type: 'line'},
      ])

      expect(bName).toBe('b')

      expect(pipeOp.precedingComments).toEqual([{delim: '--', comment: 'comment8', type: 'line'}])
      expect(pipeOp.followingOperatorComments).toEqual([
        {delim: '--', comment: 'comment9', type: 'line'},
      ])

      expect(pipeXArg.name).toBe('x')
      expect(pipeArg1.followingComments).toEqual([{delim: '--', comment: 'comment7', type: 'line'}])

      expect(pipeOpArg2.precedingComments).toEqual([
        {delim: '--', comment: 'comment12', type: 'line'},
      ])
      expect(pipeOpArg2.followingOperatorComments).toEqual([
        {delim: '--', comment: 'comment13', type: 'line'},
      ])

      // First add argument (pipe placeholder)
      expect(addArg1.precedingComments).toEqual([{delim: '--', comment: 'comment10', type: 'line'}])
      expect(addArg1.followingComments).toEqual([{delim: '--', comment: 'comment11', type: 'line'}])

      // Second add argument (reference to a)
      expect(addArg2.precedingComments).toEqual([{delim: '--', comment: 'comment14', type: 'line'}])
      expect(addArg2.followingComments).toEqual([{delim: '--', comment: 'comment15', type: 'line'}])

      // back to letExpression, comments before 'in'
      expect(letExpr.precedingInBodyComments).toEqual([
        {delim: '--', comment: 'comment16', type: 'line'},
      ])

      expect(bodyArray.precedingComments).toEqual([
        {delim: '--', comment: 'comment17', type: 'line'},
        {delim: '--', comment: 'comment18', type: 'line'},
      ])

      // First array item (reference to a)
      expect(arrayItem1.precedingComments).toEqual([
        {delim: '--', comment: 'comment19', type: 'line'},
      ])
      expect(arrayItem1.followingComments).toEqual([
        {delim: '--', comment: 'comment20', type: 'line'},
      ])

      // Second array item (reference to b)
      expect(arrayItem2.precedingComments).toEqual([
        {delim: '--', comment: 'comment21', type: 'line'},
      ])
      expect(arrayItem2.followingComments).toEqual([
        {delim: '--', comment: 'comment22', type: 'line'},
      ])

      // last comments in array
      expect(bodyArray.lastComments).toEqual([{delim: '--', comment: 'comment23', type: 'line'}])
      expect(bodyArray.followingComments).toEqual([
        {delim: '--', comment: 'comment24', type: 'line'},
        {delim: '--', comment: 'comment25', type: 'line'},
      ])
    })

    it('attaches comments to function literals correctly', () => {
      const formula = `\
--comment0
fn
  --comment1
  (
    --comment2
    a --comment3
      :
        --comment4
        Int --comment5
          =
            --comment6
            0 --comment7
        --comment8
    --comment9
    bAlias --comment10
    --comment11
    bName  --comment12
      :
        --comment13
        Int --comment14
    --comment15
  ) --comment16
    :
      --comment17
      Int --comment18
        --comment19
        =>
          --comment20
          (a+b)`

      let formulaExpr: Expressions.Expression = parse(formula).get()

      if (!(formulaExpr! instanceof Expressions.FormulaExpression)) {
        expect(formulaExpr!).toBeInstanceOf(Expressions.FormulaExpression)
        return
      }

      // Extract function definition components for testing
      const argDefinitions = formulaExpr.argDefinitions
      const [arg0, arg1] = argDefinitions

      // Extract properties of the first argument
      const {nameRef: name0, argType: type0, defaultValue: defaultValue0} = arg0

      // Extract properties of the second argument (with alias)
      const {nameRef: name1, aliasRef: alias1, argType: type1} = arg1

      // Get function return type and body
      const returnType = formulaExpr.returnType
      const body = formulaExpr.body as Expressions.Operation
      const [ref0] = body.args as Expressions.Reference[]

      // Ensure the default value exists before continuing with tests
      expect(defaultValue0).toBeTruthy()
      if (!defaultValue0) {
        return
      }

      // Test comments preceding the function expression
      expect(formulaExpr.precedingComments).toEqual([
        {delim: '--', comment: 'comment0', type: 'line'},
      ])

      // Test comments preceding the argument definitions (after 'fn' but before opening parenthesis)
      expect(formulaExpr.precedingArgumentsComments).toEqual([
        {delim: '--', comment: 'comment1', type: 'line'},
      ])

      // Test comments preceding and following the first argument name
      expect(name0.precedingComments).toEqual([{delim: '--', comment: 'comment2', type: 'line'}])
      expect(name0.followingComments).toEqual([{delim: '--', comment: 'comment3', type: 'line'}])

      // Test comments preceding and following the first argument type
      expect(type0.precedingComments).toEqual([{delim: '--', comment: 'comment4', type: 'line'}])
      expect(type0.followingComments).toEqual([{delim: '--', comment: 'comment5', type: 'line'}])

      // Test comments preceding and following the first argument default value
      expect(defaultValue0.precedingComments).toEqual([
        {delim: '--', comment: 'comment6', type: 'line'},
      ])
      expect(defaultValue0.followingComments).toEqual([
        {delim: '--', comment: 'comment7', type: 'line'},
      ])

      // Test comments preceding and following the second argument alias
      expect(alias1.precedingComments).toEqual([
        {delim: '--', comment: 'comment8', type: 'line'},
        {delim: '--', comment: 'comment9', type: 'line'},
      ])
      expect(alias1.followingComments).toEqual([{delim: '--', comment: 'comment10', type: 'line'}])

      // Test comments preceding and following the second argument name
      expect(name1.precedingComments).toEqual([{delim: '--', comment: 'comment11', type: 'line'}])
      expect(name1.followingComments).toEqual([{delim: '--', comment: 'comment12', type: 'line'}])

      // Test comments preceding and following the second argument type
      expect(type1.precedingComments).toEqual([{delim: '--', comment: 'comment13', type: 'line'}])
      expect(type1.followingComments).toEqual([{delim: '--', comment: 'comment14', type: 'line'}])

      // Test comments following the second argument
      expect(arg1.followingComments).toEqual([{delim: '--', comment: 'comment15', type: 'line'}])

      // Test comments following the argument list (after closing parenthesis)
      expect(formulaExpr.followingArgumentsComments).toEqual([
        {delim: '--', comment: 'comment16', type: 'line'},
      ])

      // Test comments preceding and following the return type
      expect(returnType.precedingComments).toEqual([
        {delim: '--', comment: 'comment17', type: 'line'},
      ])
      expect(returnType.followingComments).toEqual([
        {delim: '--', comment: 'comment18', type: 'line'},
      ])

      // Test comments preceding the return arrow
      expect(formulaExpr.precedingReturnTypeComments).toEqual([
        {delim: '--', comment: 'comment19', type: 'line'},
      ])

      // Test comments preceding the function body
      expect(ref0.precedingComments).toEqual([{delim: '--', comment: 'comment20', type: 'line'}])
    })

    it('attaches comments to function invocation', () => {
      const formula = `\
--comment0
foo --comment1
--comment2
( --comment3
  item0 --comment4
  --comment5
  arg:
    --comment6
    item1 --comment7
--comment8
) --comment9
--comment10
`
      let fnExpr: Expressions.Expression = parse(formula).get()

      if (!(fnExpr! instanceof Expressions.Operation)) {
        expect(fnExpr!).toBeInstanceOf(Expressions.Operation)
        return
      }

      // Destructure the array's items
      const [fooRef, argsList] = fnExpr.args

      if (!(argsList! instanceof Expressions.ArgumentsList)) {
        expect(argsList!).toBeInstanceOf(Expressions.ArgumentsList)
        return
      }

      const [item0, item1] = argsList.allArgs

      // Test comments preceding the array expression
      expect(fooRef.precedingComments).toEqual([{delim: '--', comment: 'comment0', type: 'line'}])
      expect(fooRef.followingComments).toEqual([{delim: '--', comment: 'comment1', type: 'line'}])

      expect(fnExpr.precedingComments).toEqual([{delim: '--', comment: 'comment2', type: 'line'}])

      // Test comments preceding and following item0
      expect(item0.value.precedingComments).toEqual([
        {delim: '--', comment: 'comment3', type: 'line'},
      ])
      expect(item0.value.followingComments).toEqual([
        {delim: '--', comment: 'comment4', type: 'line'},
      ])

      // Test comments preceding and following the second argument item
      expect(item1.precedingComments).toEqual([{delim: '--', comment: 'comment5', type: 'line'}])
      expect(item1.value.precedingComments).toEqual([
        {delim: '--', comment: 'comment6', type: 'line'},
      ])
      expect(item1.value.followingComments).toEqual([
        {delim: '--', comment: 'comment7', type: 'line'},
      ])

      // Test comments following the array expression (after closing bracket)
      expect(argsList.followingComments).toEqual([{delim: '--', comment: 'comment9', type: 'line'}])
      expect(fnExpr.followingComments).toEqual([{delim: '--', comment: 'comment10', type: 'line'}])
    })

    it('attaches comments to function invocation with single block argument', () => {
      const formula = `\
--comment0
foo --comment1
--comment2
( --comment3
  item0 --comment4
  --comment5
  arg:
    --comment6
    item1 --comment7
--comment8
) --comment9
: --comment10
  item2 --comment11
--comment12
`
      let fnExpr: Expressions.Expression = parse(formula).get()

      if (!(fnExpr! instanceof Expressions.Operation)) {
        expect(fnExpr!).toBeInstanceOf(Expressions.Operation)
        return
      }

      // Destructure the array's items
      const [fooRef, argsList] = fnExpr.args

      if (!(argsList! instanceof Expressions.ArgumentsList)) {
        expect(argsList!).toBeInstanceOf(Expressions.ArgumentsList)
        return
      }

      const [item0, item1, item2] = argsList.allArgs

      // Test comments preceding the array expression
      expect(fooRef.precedingComments).toEqual([{delim: '--', comment: 'comment0', type: 'line'}])
      expect(fooRef.followingComments).toEqual([{delim: '--', comment: 'comment1', type: 'line'}])

      expect(fnExpr.precedingComments).toEqual([{delim: '--', comment: 'comment2', type: 'line'}])

      // Test comments preceding and following item0
      expect(item0.value.precedingComments).toEqual([
        {delim: '--', comment: 'comment3', type: 'line'},
      ])
      expect(item0.value.followingComments).toEqual([
        {delim: '--', comment: 'comment4', type: 'line'},
      ])

      // Test comments preceding and following the second argument item
      expect(item1.precedingComments).toEqual([{delim: '--', comment: 'comment5', type: 'line'}])
      expect(item1.value.precedingComments).toEqual([
        {delim: '--', comment: 'comment6', type: 'line'},
      ])
      expect(item1.value.followingComments).toEqual([
        {delim: '--', comment: 'comment7', type: 'line'},
      ])

      expect(argsList.lastParensComments).toEqual([
        {delim: '--', comment: 'comment8', type: 'line'},
      ])
      expect(argsList.betweenComments).toEqual([{delim: '--', comment: 'comment9', type: 'line'}])

      expect(item2.value.precedingComments).toEqual([
        {delim: '--', comment: 'comment10', type: 'line'},
      ])
      expect(item2.value.followingComments).toEqual([
        {delim: '--', comment: 'comment11', type: 'line'},
      ])

      expect(fnExpr.followingComments).toEqual([{delim: '--', comment: 'comment12', type: 'line'}])
    })

    it('attaches comments to function invocation with block arguments', () => {
      const formula = `\
--comment0
foo --comment1
--comment2
( --comment3
  item0 --comment4
  --comment5
  arg:
    --comment6
    item1 --comment7
--comment8
) --comment9
--comment10
{
  --comment11
  item2 --comment12
  --comment13
  then: --comment14
    --comment15
    item3 --comment16
  --comment17
} --comment18
`
      let fnExpr: Expressions.Expression = parse(formula).get()

      if (!(fnExpr! instanceof Expressions.Operation)) {
        expect(fnExpr!).toBeInstanceOf(Expressions.Operation)
        return
      }

      // Destructure the array's items
      const [fooRef, argsList] = fnExpr.args

      if (!(argsList! instanceof Expressions.ArgumentsList)) {
        expect(argsList!).toBeInstanceOf(Expressions.ArgumentsList)
        return
      }

      const [item0, item1, item2, item3] = argsList.allArgs

      // Test comments preceding the array expression
      expect(fooRef.precedingComments).toEqual([{delim: '--', comment: 'comment0', type: 'line'}])
      expect(fooRef.followingComments).toEqual([{delim: '--', comment: 'comment1', type: 'line'}])

      expect(fnExpr.precedingComments).toEqual([{delim: '--', comment: 'comment2', type: 'line'}])

      // Test comments preceding and following item0
      expect(item0.value.precedingComments).toEqual([
        {delim: '--', comment: 'comment3', type: 'line'},
      ])
      expect(item0.value.followingComments).toEqual([
        {delim: '--', comment: 'comment4', type: 'line'},
      ])

      // Test comments preceding and following the second argument item
      expect(item1.precedingComments).toEqual([{delim: '--', comment: 'comment5', type: 'line'}])
      expect(item1.value.precedingComments).toEqual([
        {delim: '--', comment: 'comment6', type: 'line'},
      ])
      expect(item1.value.followingComments).toEqual([
        {delim: '--', comment: 'comment7', type: 'line'},
      ])

      expect(argsList.lastParensComments).toEqual([
        {delim: '--', comment: 'comment8', type: 'line'},
      ])
      expect(argsList.betweenComments).toEqual([
        {delim: '--', comment: 'comment9', type: 'line'},
        {delim: '--', comment: 'comment10', type: 'line'},
      ])

      expect(fnExpr.followingComments).toEqual([])
      expect(item2.value.precedingComments).toEqual([
        {delim: '--', comment: 'comment11', type: 'line'},
      ])
      expect(item2.value.followingComments).toEqual([
        {delim: '--', comment: 'comment12', type: 'line'},
      ])
      expect(item3.precedingComments).toEqual([{delim: '--', comment: 'comment13', type: 'line'}])
      expect(item3.value.precedingComments).toEqual([
        {delim: '--', comment: 'comment14', type: 'line'},
        {delim: '--', comment: 'comment15', type: 'line'},
      ])
      expect(item3.value.followingComments).toEqual([
        {delim: '--', comment: 'comment16', type: 'line'},
      ])
      expect(argsList.lastBlockComments).toEqual([
        {delim: '--', comment: 'comment17', type: 'line'},
      ])

      // Test comments following the array expression (after closing bracket)
      expect(argsList.followingComments).toEqual([
        {delim: '--', comment: 'comment18', type: 'line'},
      ])
    })

    it('attaches comments to imports 1', () => {
      const formula = `\
--comment0
import
  --comment1
  Foo  --comment2
    --comment3
    as --comment4
      --comment5
      FooBar --comment6
      --comment7
      only --comment8
        --comment9
        { --comment10
          bar --comment11
          --comment12
          bux --comment13
            --comment14
            as --comment15
              --comment16
              buxx --comment17
        --comment18
        } --comment19
`

      const importExpr = testScan(formula, scanImportStatement).get()

      if (!(importExpr! instanceof Expressions.ImportStatement)) {
        expect(importExpr!).toBeInstanceOf(Expressions.ImportStatement)
        return
      }

      // Assertions to add to the import comments test
      // Extract components of the import statement
      const importSource = importExpr.source // "Foo"
      const asName = importExpr.alias! // "FooBar"
      const importSpecifiers = importExpr.importSpecifiers

      // Test comments preceding the import statement
      expect(importExpr.precedingComments).toEqual([
        {delim: '--', comment: 'comment0', type: 'line'},
      ])

      // Test comments after 'import' keyword but before the module name
      expect(importSource.precedingComments).toEqual([
        {delim: '--', comment: 'comment1', type: 'line'},
      ])

      // Test comments following the module name
      expect(importSource.followingComments).toEqual([
        {delim: '--', comment: 'comment2', type: 'line'},
        {delim: '--', comment: 'comment3', type: 'line'},
      ])

      // Test comments following the alias name
      expect(asName.precedingComments).toEqual([
        {delim: '--', comment: 'comment4', type: 'line'},
        {delim: '--', comment: 'comment5', type: 'line'},
      ])
      expect(asName.followingComments).toEqual([
        {delim: '--', comment: 'comment6', type: 'line'},
        {delim: '--', comment: 'comment7', type: 'line'},
      ])

      // Test comments after ':' but before the opening brace
      expect(importExpr.precedingSpecifierComments).toEqual([
        {delim: '--', comment: 'comment8', type: 'line'},
        {delim: '--', comment: 'comment9', type: 'line'},
      ])

      // Test specifiers in the import statement
      expect(importSpecifiers.length).toBe(2)

      // First specifier - "bar"
      const [bar, bux] = importSpecifiers
      expect(bar.name.name).toBe('bar')
      expect(bar.name.precedingComments).toEqual([
        {delim: '--', comment: 'comment10', type: 'line'},
      ])
      expect(bar.name.followingComments).toEqual([
        {delim: '--', comment: 'comment11', type: 'line'},
      ])

      // Second specifier - "bux as buxx"
      expect(bux.name.name).toBe('bux')
      expect(bux.name.precedingComments).toEqual([
        {delim: '--', comment: 'comment12', type: 'line'},
      ])
      expect(bux.name.followingComments).toEqual([
        {delim: '--', comment: 'comment13', type: 'line'},
        {delim: '--', comment: 'comment14', type: 'line'},
      ])

      // Alias of second specifier
      expect(bux.alias?.name).toBe('buxx')
      expect(bux.alias?.precedingComments).toEqual([
        {delim: '--', comment: 'comment15', type: 'line'},
        {delim: '--', comment: 'comment16', type: 'line'},
      ])
      expect(bux.alias?.followingComments).toEqual([
        {delim: '--', comment: 'comment17', type: 'line'},
      ])
      expect(bux.followingComments).toEqual([{delim: '--', comment: 'comment18', type: 'line'}])

      // Test comments after closing brace
      expect(importExpr.followingComments).toEqual([
        {delim: '--', comment: 'comment19', type: 'line'},
      ])
    })

    it('attaches comments to imports 2', () => {
      const formula = `\
--comment0
import
  --comment1
  Foo  --comment2
    --comment3
    only --comment4
      --comment5
      { --comment6
        bar --comment7
        --comment8
      } --comment9
`

      const importExpr = testScan(formula, scanImportStatement).get()

      if (!(importExpr! instanceof Expressions.ImportStatement)) {
        expect(importExpr!).toBeInstanceOf(Expressions.ImportStatement)
        return
      }

      // Assertions to add to the import comments test
      // Extract components of the import statement
      const importSource = importExpr.source // "Foo"
      const importSpecifiers = importExpr.importSpecifiers

      // Test comments preceding the import statement
      expect(importExpr.precedingComments).toEqual([
        {delim: '--', comment: 'comment0', type: 'line'},
      ])

      // Test comments after 'import' keyword but before the module name
      expect(importSource.precedingComments).toEqual([
        {delim: '--', comment: 'comment1', type: 'line'},
      ])

      // Test comments following the module name
      expect(importSource.followingComments).toEqual([
        {delim: '--', comment: 'comment2', type: 'line'},
        {delim: '--', comment: 'comment3', type: 'line'},
      ])

      // Test comments after ':' but before the opening brace
      expect(importExpr.precedingSpecifierComments).toEqual([
        {delim: '--', comment: 'comment4', type: 'line'},
        {delim: '--', comment: 'comment5', type: 'line'},
      ])

      // Test specifiers in the import statement
      expect(importSpecifiers.length).toBe(1)

      // First specifier - "bar"
      const [bar] = importSpecifiers
      expect(bar.name.name).toBe('bar')
      expect(bar.name.precedingComments).toEqual([{delim: '--', comment: 'comment6', type: 'line'}])
      expect(bar.name.followingComments).toEqual([{delim: '--', comment: 'comment7', type: 'line'}])
      expect(bar.followingComments).toEqual([{delim: '--', comment: 'comment8', type: 'line'}])

      // Test comments after closing brace
      expect(importExpr.followingComments).toEqual([
        {delim: '--', comment: 'comment9', type: 'line'},
      ])
    })
  })
})
