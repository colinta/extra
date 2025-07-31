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
    args({name: '# age', type: Types.int()}),
    Types.string(),
  )
  const simpleRequiredNamedFormula = Types.formula(
    args({name: 'age', type: Types.int()}),
    Types.string(),
  )
  const multipleArgsFormula = Types.formula(
    args(
      {name: '# age', type: Types.int()},
      {name: '# name', type: Types.optional(Types.string())},
      {name: 'isFoo', type: Types.booleanType(), isRequired: false},
      {name: 'args', type: Types.oneOf([Types.literal(1), Types.literal(2), Types.nullType()])},
    ),
    Types.array(Types.int()),
  )

  cases<[Types.Type, Types.Type, boolean] | [Types.Type, Types.Type, boolean, string]>(
    c([Types.literal(1), Types.never(), false]),
    c([Types.never(), Types.literal(1), false]),
    c([Types.never(), Types.never(), false]),
    c([Types.all(), Types.literal(1), false]),
    c([Types.literal(1), Types.all(), true]),
    c([Types.always(), Types.literal(1), true]),
    c([Types.literal(1), Types.always(), false]),
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
        args({name: '# age', type: Types.int()}),
        Types.string(),
      ),
      simpleRequiredFormula,
      true,
    ]),
    c([
      Types.formula(
        // should be indifferent to positional vs named
        // when all-arguments-are-named is passed to
        // a function where all-arguments-are-positional
        args({name: 'age', type: Types.int()}),
        Types.string(),
      ),
      simpleRequiredFormula,
      true,
    ]),
    c([
      Types.formula(
        // indifferent to positional argument name
        args({name: '# how-old', type: Types.int()}),
        Types.string(),
      ),
      simpleRequiredFormula,
      true,
    ]),
    c([
      Types.formula(
        // indifferent to compatible argument type
        args({name: '# age', type: Types.float()}),
        Types.string(),
      ),
      simpleRequiredFormula,
      true,
    ]),
    c([
      Types.formula(
        // indifferent to compatible return type
        args({name: '# age', type: Types.float()}),
        Types.literal('test'),
      ),
      simpleRequiredFormula,
      true,
    ]),
    c([
      Types.formula(
        // indifferent to optionality
        args({name: '# age', type: Types.optional(Types.float())}),
        Types.string(),
      ),
      simpleRequiredFormula,
      true,
    ]),
    c([
      Types.formula(
        // X incompatible argument type
        args({name: '# name', type: Types.string()}),
        Types.string(),
      ),
      simpleRequiredFormula,
      false,
    ]),
    c([
      Types.formula(
        // X incompatible return type
        args({name: '# age', type: Types.int()}),
        Types.float(),
      ),
      simpleRequiredFormula,
      false,
    ]),
    c([
      Types.formula(
        // X optional wrong argument type
        args({name: '# name', type: Types.optional(Types.string())}),
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
        // indifferent to aliased name
        args({alias: 'age', name: 'how-old', type: Types.int()}),
        Types.string(),
      ),
      simpleRequiredNamedFormula,
      true,
    ]),
    c([
      Types.formula(
        // indifferent to compatible argument type
        args({name: 'age', type: Types.float()}),
        Types.string(),
      ),
      simpleRequiredNamedFormula,
      true,
    ]),
    c([
      Types.formula(
        // indifferent to compatible return type
        args({name: 'age', type: Types.float()}),
        Types.literal('test'),
      ),
      simpleRequiredNamedFormula,
      true,
    ]),
    c([
      Types.formula(
        // indifferent to optionality
        args({name: 'age', type: Types.optional(Types.float())}),
        Types.string(),
      ),
      simpleRequiredNamedFormula,
      true,
    ]),
    c([
      Types.formula(
        // named arguments can't be called positionally
        args({name: '# age', type: Types.int()}),
        Types.string(),
      ),
      simpleRequiredNamedFormula,
      false,
    ]),
    c([
      Types.formula(
        // X incompatible argument type
        args({name: 'age', type: Types.string()}),
        Types.string(),
      ),
      simpleRequiredNamedFormula,
      false,
    ]),
    c([
      Types.formula(
        // X incompatible return type
        args({name: 'age', type: Types.int()}),
        Types.float(),
      ),
      simpleRequiredNamedFormula,
      false,
    ]),
    c([
      Types.formula(
        // X incompatible argument name
        args({name: 'ages', type: Types.int()}),
        Types.float(),
      ),
      simpleRequiredNamedFormula,
      false,
    ]),
    c([
      Types.formula(
        // X optional wrong argument type
        args({name: 'age', type: Types.optional(Types.string())}),
        Types.string(),
      ),
      simpleRequiredNamedFormula,
      false,
    ]),
    /*
      fn(# age: int, # name?: string, isFoo?: boolean, args: 1 | 2): int[]
     */
    c([
      // this is a copy of multipleArgsFormula
      Types.formula(
        args(
          {name: '# age', type: Types.int()},
          {name: '# name', type: Types.optional(Types.string())},
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
          {name: '# age', type: Types.int()},
          // X require argument instead of optional
          {name: '# name', type: Types.optional(Types.string()), isRequired: false},
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
          {name: '# age', type: Types.int()},
          {name: '# name', type: Types.optional(Types.string())},
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
          {name: '# age', type: Types.int()},
          // any type
          {name: '# name', type: Types.all()},
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
          {name: '# age', type: Types.int()},
          {name: '# name', type: Types.optional(Types.string())},
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
          {name: '# age', type: Types.int()},
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
          {name: '# age', type: Types.int()},
          {name: '# name', type: Types.optional(Types.string())},
        ),
        Types.array(Types.literal(1)), // compatible return type
      ),
      multipleArgsFormula,
      true,
    ]),
  ).run(([lhs, rhs, expected, name], {only, skip}) =>
    (only ? it.only : skip ? it.skip : it)(
      `canBeAssignedTo(${lhs}, ${rhs}) should be ${expected}${name ? ` (${name})` : ''}`,
      () => {
        const resolved = new Map<Types.GenericType, Types.GenericType>()
        if (rhs instanceof Types.GenericType) {
          resolved.set(rhs, rhs)
        }
        const successful = Types.canBeAssignedTo(lhs, rhs, resolved)
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
