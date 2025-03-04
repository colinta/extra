import {c, cases} from '@extra-lang/cases'
import * as Types from '../types'

describe('canBeAssignedTo', () => {
  const human = Types.klass(new Map([['name', Types.string()]]))
  const student = Types.klass(new Map([['grade', Types.int()]]), human)
  const college = Types.klass(new Map([['debt', Types.int()]]), student)
  const worker = Types.klass(new Map([['job', Types.string()]]), human)
  const animal = Types.klass(new Map([['legs', Types.int()]]))
  const dog = Types.klass(new Map([['name', Types.string()]]), animal)

  const simpleRequiredFormula = Types.formula(
    args({name: '#age', type: Types.int()}),
    Types.string(),
  )
  const simpleRequiredNamedFormula = Types.formula(
    args({name: 'age', type: Types.int()}),
    Types.string(),
  )
  const multipleArgsFormula = Types.formula(
    args(
      {name: '#age', type: Types.int()},
      {name: '#name', type: Types.optional(Types.string())},
      {name: 'isFoo', type: Types.booleanType(), isRequired: false},
      {name: 'args', type: Types.oneOf([Types.literal(1), Types.literal(2), Types.nullType()])},
    ),
    Types.array(Types.int()),
  )

  cases<[Types.Type, Types.Type, boolean]>(
    c([Types.literal(1), Types.never(), false]),
    c([Types.never(), Types.literal(1), false]),
    c([Types.never(), Types.never(), false]),
    c([Types.any(), Types.literal(1), false]),
    c([Types.literal(1), Types.any(), true]),
    c([Types.literal(1), Types.literal(1), true]),
    c([Types.literal(1), Types.literal(2), false]),
    c([Types.literal(1), Types.int(), true]),
    c([Types.literal(1.1), Types.int(), false]),
    c([Types.literal('test'), Types.literal('test'), true]),
    c([Types.string(), Types.literal('test'), false]),
    c([Types.literal('test'), Types.string(), true]),
    c([Types.int(), Types.float(), true]),
    c([Types.int(), Types.generic('T'), true]),
    c([Types.int(), Types.generic('T', Types.int()), true]),
    c([Types.int(), Types.generic('T', Types.float()), true]),
    c([Types.int(), Types.generic('T', Types.string()), false]),
    c([Types.float(), Types.int(), false]),
    c([Types.array(Types.string()), Types.array(Types.string()), true]),
    c([Types.array(Types.int()), Types.array(Types.float()), true]),
    c([Types.array(Types.float()), Types.array(Types.int()), false]),
    c([Types.array(Types.string()), Types.array(Types.int()), false]),
    c([Types.dict(Types.string()), Types.dict(Types.string()), true]),
    c([Types.dict(Types.literal('foo')), Types.dict(Types.string()), true]),
    c([Types.oneOf([Types.literal(1), Types.literal(2)]), Types.int(), true]),
    c([
      Types.oneOf([Types.literal(1), Types.literal(2)]),
      Types.oneOf([Types.literal(1), Types.literal(2)]),
      true,
    ]),
    c([Types.oneOf([Types.string(), Types.nullType()]), Types.int(), false]),
    c([human, human, true]),
    c([human, animal, false]),
    c([student, human, true]),
    c([college, human, true]),
    c([college, student, true]),
    c([student, college, false]),
    c([college, worker, false]),
    c([worker, human, true]),
    c([human, worker, false]),
    // I may change my mind later, but 'dog' here contains all the properties of human,
    // so it kinda makes sense that you could assign a human as a dog
    c([dog, human, true]),
    // however, human doesn't have a legs count, and so can't be assigned a dog
    c([human, dog, false]),
    // formulas
    c([
      Types.formula(
        // identical
        args({name: '#age', type: Types.int()}),
        Types.string(),
      ),
      simpleRequiredFormula,
      true,
    ]),
    c([
      Types.formula(
        // indifferent to positional vs named
        args({name: 'age', type: Types.int()}),
        Types.string(),
      ),
      simpleRequiredFormula,
      true,
    ]),
    c([
      Types.formula(
        args({name: '#how-old', type: Types.int()}), // indifferent to positional argument name
        Types.string(),
      ),
      simpleRequiredFormula,
      true,
    ]),
    c([
      Types.formula(
        args({name: '#age', type: Types.float()}), // indifferent to compatible argument type
        Types.string(),
      ),
      simpleRequiredFormula,
      true,
    ]),
    c([
      Types.formula(
        args({name: '#age', type: Types.float()}), // indifferent to compatible return type
        Types.literal('test'),
      ),
      simpleRequiredFormula,
      true,
    ]),
    c([
      Types.formula(
        args({name: '#age', type: Types.optional(Types.float())}), // indifferent to optionality
        Types.string(),
      ),
      simpleRequiredFormula,
      true,
    ]),
    c([
      Types.formula(
        args({name: '#name', type: Types.string()}), // X incompatible argument type
        Types.string(),
      ),
      simpleRequiredFormula,
      false,
    ]),
    c([
      Types.formula(
        args({name: '#age', type: Types.int()}), // X incompatible return type
        Types.float(),
      ),
      simpleRequiredFormula,
      false,
    ]),
    c([
      Types.formula(
        args({name: '#name', type: Types.optional(Types.string())}), // X optional wrong argument type
        Types.string(),
      ),
      simpleRequiredFormula,
      false,
    ]),
    c([
      Types.formula(
        // identical
        args({name: 'age', type: Types.int()}),
        Types.string(),
      ),
      simpleRequiredNamedFormula,
      true,
    ]),
    c([
      Types.formula(
        args({alias: 'age', name: 'how-old', type: Types.int()}), // indifferent to aliased name
        Types.string(),
      ),
      simpleRequiredNamedFormula,
      true,
    ]),
    c([
      Types.formula(
        args({name: 'age', type: Types.float()}), // indifferent to compatible argument type
        Types.string(),
      ),
      simpleRequiredNamedFormula,
      true,
    ]),
    c([
      Types.formula(
        args({name: 'age', type: Types.float()}), // indifferent to compatible return type
        Types.literal('test'),
      ),
      simpleRequiredNamedFormula,
      true,
    ]),
    c([
      Types.formula(
        args({name: 'age', type: Types.optional(Types.float())}), // indifferent to optionality
        Types.string(),
      ),
      simpleRequiredNamedFormula,
      true,
    ]),
    c([
      Types.formula(
        // named arguments can't be called positionally
        args({name: '#age', type: Types.int()}),
        Types.string(),
      ),
      simpleRequiredNamedFormula,
      false,
    ]),
    c([
      Types.formula(
        args({name: 'age', type: Types.string()}), // X incompatible argument type
        Types.string(),
      ),
      simpleRequiredNamedFormula,
      false,
    ]),
    c([
      Types.formula(
        args({name: 'age', type: Types.int()}), // X incompatible return type
        Types.float(),
      ),
      simpleRequiredNamedFormula,
      false,
    ]),
    c([
      Types.formula(
        args({name: 'ages', type: Types.int()}), // X incompatible argument name
        Types.float(),
      ),
      simpleRequiredNamedFormula,
      false,
    ]),
    c([
      Types.formula(
        args({name: 'age', type: Types.optional(Types.string())}), // X optional wrong argument type
        Types.string(),
      ),
      simpleRequiredNamedFormula,
      false,
    ]),
    /*
fn(#age: int, #name?: string, isFoo?: boolean, args: 1 | 2): int[]
     */
    c([
      Types.formula(
        args(
          {name: '#age', type: Types.int()},
          {name: '#name', type: Types.optional(Types.string())},
          {name: 'isFoo', type: Types.booleanType(), isRequired: false},
          {name: 'args', type: Types.oneOf([Types.literal(1), Types.literal(2), Types.nullType()])},
        ),
        Types.array(Types.int()),
      ),
      multipleArgsFormula,
      true,
    ]),
    c([
      Types.formula(
        args(
          {name: '#age', type: Types.int()},
          // X require argument instead of optional
          {name: '#name', type: Types.optional(Types.string()), isRequired: false},
          {name: 'isFoo', type: Types.booleanType()},
          {name: 'args', type: Types.oneOf([Types.literal(1), Types.literal(2), Types.nullType()])},
        ),
        Types.array(Types.int()),
      ),
      multipleArgsFormula,
      false,
    ]),
    c([
      Types.formula(
        args(
          {name: '#age', type: Types.int()},
          {name: '#name', type: Types.optional(Types.string())},
          // missing optional argument
          {name: 'args', type: Types.oneOf([Types.literal(1), Types.literal(2), Types.nullType()])},
        ),
        Types.array(Types.int()),
      ),
      multipleArgsFormula,
      true,
    ]),
    c([
      Types.formula(
        args(
          {name: '#age', type: Types.int()},
          // any type
          {name: '#name', type: Types.any()},
          {name: 'isFoo', type: Types.booleanType(), isRequired: false},
          {name: 'args', type: Types.oneOf([Types.literal(1), Types.literal(2), Types.nullType()])},
        ),
        Types.array(Types.int()),
      ),
      multipleArgsFormula,
      true,
    ]),
    c([
      Types.formula(
        args(
          {name: '#age', type: Types.int()},
          {name: '#name', type: Types.optional(Types.string())},
          // missing optional named argument
          {name: 'args', type: Types.oneOf([Types.literal(1), Types.literal(2), Types.nullType()])},
        ),
        Types.array(Types.int()),
      ),
      multipleArgsFormula,
      true,
    ]),
    c([
      Types.formula(
        args(
          {name: '#age', type: Types.int()},
          // missing multiple arguments
        ),
        Types.array(Types.int()),
      ),
      multipleArgsFormula,
      true,
    ]),
    c([
      Types.formula(
        args(
          {name: '#age', type: Types.int()},
          {name: '#name', type: Types.optional(Types.string())},
        ),
        Types.array(Types.literal(1)), // compatible return type
      ),
      multipleArgsFormula,
      true,
    ]),
  ).run(([lhs, rhs, expected], {only, skip}) =>
    (only ? it.only : skip ? it.skip : it)(
      `canBeAssignedTo(${lhs}, ${rhs}) should be ${expected}`,
      () => {
        const successful = Types.canBeAssignedTo(lhs, rhs)
        expect(successful).toEqual(expected)
      },
    ),
  )
})

function args(
  ...args: {name: string; alias?: string; type: Types.Type; isRequired?: boolean}[]
): Types.Argument[] {
  return args.map(({name, type, alias, isRequired}) => {
    if (name[0] === '#') {
      return Types.positionalArgument({name: name.slice(1), type, isRequired: isRequired ?? true})
    } else {
      alias = alias ?? name

      return Types.namedArgument({name, alias, type, isRequired: isRequired ?? true})
    }
  })
}
