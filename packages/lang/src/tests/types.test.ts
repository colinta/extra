import {c, cases} from '@extra-lang/cases'
import * as Types from '../types'

function privateOneOf(...types: Types.Type[]) {
  return Types._privateOneOf(types)
}

describe('toCode', () => {
  cases<[Types.Type, string]>(
    c([Types.nullType(), 'null']),
    c([Types.booleanType(), 'Boolean']),
    c([Types.int(), 'Int']),
    c([Types.float(), 'Float']),
    c([Types.string(), 'String']),
    c([Types.literal(true), 'true']),
    c([Types.literal(false), 'false']),
    c([Types.literal(1), '1']),
    c([Types.literal(1.1), '1.1']),
    c([Types.literal('foo'), '"foo"']),
    c([Types.array(Types.string()), 'Array(String)']),
    c([Types.array(Types.array(Types.string())), 'Array(Array(String))']),
    c([Types.array(Types.literal(true)), 'Array(true)']),
    c([Types.array(Types.oneOf([Types.int(), Types.string()])), 'Array(Int | String)']),
    c([
      Types.array(Types.array(Types.oneOf([Types.int(), Types.string()]))),
      'Array(Array(Int | String))',
    ]),
    c([
      Types.formula(
        args(
          {name: 'name', type: Types.string()},
          {name: 'age', type: Types.optional(Types.int())},
        ),
        Types.object([
          Types.namedProp('name', Types.string()),
          Types.namedProp('age', Types.int()),
        ]),
      ),
      'fn(name: String, age: Int?): {name: String, age: Int}',
    ]),
    c([Types.dict(Types.string()), 'Dict(String)']),
    c([Types.dict(Types.string(), {min: 1, max: undefined}), 'Dict(String, length: >=1)']),
    c([Types.dict(Types.oneOf([Types.int(), Types.string()])), 'Dict(Int | String)']),
    c([Types.set(Types.string()), 'Set(String)']),
    c([Types.set(Types.string(), {min: 1, max: undefined}), 'Set(String, length: >=1)']),
    c([Types.set(Types.oneOf([Types.int(), Types.string()])), 'Set(Int | String)']),
    c([Types.object([Types.namedProp('foo', Types.string())]), '{foo: String}']),
    c([
      Types.klass(new Map([['bar', Types.int()]]), Types.klass(new Map([['foo', Types.string()]]))),
      '{bar: Int, foo: String}',
    ]),
    c([Types.namedClass('mario', new Map([['foo', Types.string()]])), 'mario']),
    c([
      Types.namedClass(
        'mario',
        new Map([['bar', Types.int()]]),
        Types.namedClass('plumber', new Map([['foo', Types.string()]])),
      ),
      'mario',
    ]),
    c([Types.optional(Types.int()), 'Int?']),
    c([Types.optional(Types.nullType()), 'null']),
    c([Types.oneOf([Types.int(), Types.string()]), 'Int | String']),
    c([Types.oneOf([Types.int(), Types.string(), Types.nullType()]), 'Int | String | null']),
    c([Types.oneOf([Types.int(), Types.nullType()]), 'Int?']),
    c([Types.oneOf([Types.int()]), 'Int']),
    c([
      Types.formula(
        args(
          {name: 'name', type: Types.optional(Types.string())},
          {
            name: 'age',
            type: Types.optional(Types.int()),
            isRequired: false,
          },
        ),
        Types.object([
          Types.namedProp('name', Types.string()),
          Types.namedProp('isGreat', Types.booleanType()),
          Types.namedProp('age', Types.int()),
        ]),
      ),
      'fn(name: String?, age: Int?): {name: String, isGreat: Boolean, age: Int}',
    ]),
    c([
      Types.formula(
        args(
          {name: '#name', type: Types.optional(Types.string())},
          {
            name: '#age',
            type: Types.optional(Types.int()),
          },
        ),
        Types.object([
          Types.namedProp('name', Types.string()),
          Types.namedProp('age', Types.int()),
        ]),
      ),
      'fn(#name: String?, #age: Int?): {name: String, age: Int}',
    ]),
    c([
      Types.formula(
        args(
          {name: '#name', type: Types.string()},
          {name: 'age', type: Types.optional(Types.int())},
        ),
        Types.object([
          Types.namedProp('name', Types.string()),
          Types.namedProp('age', Types.int()),
        ]),
      ),
      'fn(#name: String, age: Int?): {name: String, age: Int}',
    ]),
  ).run(([type, expected], {only, skip}) =>
    (only ? it.only : skip ? it.skip : it)(
      `toCode of ${type.toCode()} should be ${expected}`,
      () => {
        expect(type.toCode()).toEqual(expected)
      },
    ),
  )

  it('oneOf is smart', () => {
    const human = Types.namedClass('human', new Map([['name', Types.string()]]))
    const student = Types.namedClass('student', new Map([['grade', Types.int()]]), human)
    const college = Types.namedClass('college', new Map([['debt', Types.int()]]), student)
    const worker = Types.namedClass('worker', new Map([['job', Types.string()]]), human)
    const animal = Types.namedClass('animal', new Map([['legs', Types.int()]]))
    const dog = Types.namedClass('dog', new Map([['name', Types.string()]]), animal)

    expect(Types.oneOf([])).toBe(Types.never())
    expect(Types.oneOf([Types.int()])).toBe(Types.int())
    expect(Types.oneOf([Types.int(), Types.nullType()])).toEqual(
      Types.OptionalType._privateOptional(Types.int()),
    )
    expect(Types.oneOf([Types.int(), Types.string()])).toEqual(
      privateOneOf(Types.int(), Types.string()),
    )
    expect(Types.oneOf([Types.int(), Types.string(), Types.nullType()])).toEqual(
      privateOneOf(Types.int(), Types.string(), Types.nullType()),
    )
    expect(Types.oneOf([human, student])).toEqual(human)
    expect(Types.oneOf([human, worker])).toEqual(human)
    expect(Types.oneOf([human, worker, student])).toEqual(human)
    expect(Types.oneOf([human, worker, student, animal])).toEqual(privateOneOf(human, animal))
    expect(Types.oneOf([human, worker, student, animal, dog])).toEqual(privateOneOf(human, animal))
    expect(Types.oneOf([worker, student])).toEqual(privateOneOf(worker, student))
    expect(Types.oneOf([worker, student, college])).toEqual(privateOneOf(worker, student))
    expect(Types.oneOf([worker, college, student])).toEqual(privateOneOf(worker, student))
  })
})

describe('checkFormulaArguments (argument checking and generics resolution)', () => {
  // fn<T>(#arg: T): T
  const genericTypeT = Types.generic('T')
  const genericTypeU = Types.generic('U')

  const formula = Types.formula(
    [Types.positionalArgument({name: 'arg', type: genericTypeT, isRequired: true})],
    genericTypeT,
  )
  describe(formula.toCode(), () => {
    cases<[Types.Type[], Types.Type]>(
      // fn(int): int
      c([[Types.int()], Types.int()]),
      // fn(1): 1
      c([[Types.literal(1)], Types.literal(1)]),
    ).run(([args, expected], {only, skip}) => {
      const genericResolution = new Map([[genericTypeT, Types.generic('T')]])
      const errorMessage = Types.checkFormulaArguments(
        args.length,
        new Set(),
        formula,
        position => args[position],
        position => undefined,
        () => true,
        genericResolution,
      )
      it(`successfully derives ${expected.toCode()}`, () => {
        expect(errorMessage).toBeUndefined()
        expect(genericResolution.get(genericTypeT)!.resolvedType).toEqual(expected)
      })
    })
  })

  // fn<T, U>(#callback: fn(#input: T): U, #values: T[]): U[]
  const mapFormula = Types.formula(
    [
      Types.positionalArgument({
        name: 'callback',
        type: Types.formula(
          [Types.positionalArgument({name: 'input', type: genericTypeT, isRequired: true})],
          genericTypeU,
        ),
        isRequired: true,
      }),
      Types.positionalArgument({name: 'values', type: Types.array(genericTypeT), isRequired: true}),
    ],
    Types.array(genericTypeU),
  )
  describe(mapFormula.toCode(), () => {
    it(`toCode`, () => {
      expect(mapFormula.toCode()).toEqual(
        'fn<T, U>(#callback: fn<T, U>(#input: T): U, #values: Array(T)): Array(U)',
      )
    })

    cases<[Types.Type[], [Types.Type, Types.Type] | string]>(
      c([
        // fn( fn(int): string, [Int]): [String]
        // T: int, U: string
        [
          Types.formula(
            [Types.positionalArgument({name: 'callback', type: Types.int(), isRequired: true})],
            Types.string(),
          ),
          Types.array(Types.int()),
        ],
        [Types.int(), Types.string()],
      ]),
      c([
        // fn( fn(int): string, float[]): string[]
        // T: int, U: string
        [
          Types.formula(
            [Types.positionalArgument({name: 'callback', type: Types.int(), isRequired: true})],
            Types.string(),
          ),
          Types.array(Types.float()),
        ],
        [Types.float(), Types.string()],
      ]),
    ).run(([args, expected], {only, skip}) => {
      const genericResolution = new Map([
        [genericTypeT, Types.generic('T')],
        [genericTypeU, Types.generic('U')],
      ])
      const errorMessage = Types.checkFormulaArguments(
        args.length,
        new Set(),
        mapFormula,
        position => args[position],
        position => undefined,
        () => true,
        genericResolution,
      )
      if (typeof expected === 'string') {
        it(`correctly fails on [${args.map(arg => arg.toString()).join(',')}]`, () => {
          expect(errorMessage).toContain(expected)
        })
      } else {
        const [expectedT, expectedU] = expected
        it(`successfully derives T: ${expectedT.toCode()} and U: ${expectedU.toCode()}`, () => {
          expect(errorMessage).toBeUndefined()
          expect(genericResolution.get(genericTypeT)!.resolvedType).toEqual(expectedT)
          expect(genericResolution.get(genericTypeU)!.resolvedType).toEqual(expectedU)
        })
      }
    })
  })

  // fn<T, U>(#callback: fn(#input: T): U | null, #values: T[]): U[]
  const compactMapFormula = Types.formula(
    [
      Types.positionalArgument({
        name: 'callback',
        type: Types.formula(
          [Types.positionalArgument({name: 'input', type: genericTypeT, isRequired: true})],
          Types.oneOf([genericTypeU, Types.nullType()]),
        ),
        isRequired: true,
      }),
      Types.positionalArgument({name: 'values', type: Types.array(genericTypeT), isRequired: true}),
    ],
    Types.array(genericTypeU),
  )
  describe(compactMapFormula.toCode(), () => {
    it(`toCode`, () => {
      expect(compactMapFormula.toCode()).toEqual(
        'fn<T, U>(#callback: fn<T, U>(#input: T): U?, #values: Array(T)): Array(U)',
      )
    })

    // fn( fn(int): string | null, int[]): string[]
    // T: int, U: string
    const args: Types.Type[] = [
      Types.formula(
        [Types.positionalArgument({name: 'callback', type: Types.int(), isRequired: true})],
        Types.optional(Types.string()),
      ),
      Types.array(Types.int()),
    ]
    const expected: [Types.Type, Types.Type] = [Types.int(), Types.string()]

    const genericResolution = new Map([
      [genericTypeT, Types.generic('T')],
      [genericTypeU, Types.generic('U')],
    ])
    const errorMessage = Types.checkFormulaArguments(
      args.length,
      new Set(),
      compactMapFormula,
      position => args[position],
      position => undefined,
      () => true,
      genericResolution,
    )
    if (typeof expected === 'string') {
      it(`correctly fails on [${args.map(arg => arg.toString()).join(',')}]`, () => {
        expect(errorMessage).toContain(expected)
      })
    } else {
      const [expectedT, expectedU] = expected
      it(`successfully derives T: ${expectedT.toCode()} and U: ${expectedU.toCode()}`, () => {
        expect(errorMessage).toBeUndefined()
        expect(genericResolution.get(genericTypeT)!.resolvedType).toEqual(expectedT)
        expect(genericResolution.get(genericTypeU)!.resolvedType).toEqual(expectedU)
      })
    }
  })
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
