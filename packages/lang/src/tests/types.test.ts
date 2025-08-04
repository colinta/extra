import {c, cases} from '@extra-lang/cases'
import * as Types from '../types'
import * as Values from '../values'
import {parse} from '../formulaParser'
import {privateOneOf} from './privateOneOf'
import {type TypeRuntime} from '../runtime'
import {mockTypeRuntime} from './mockTypeRuntime'

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
          {name: '# name', type: Types.optional(Types.string())},
          {
            name: '# age',
            type: Types.optional(Types.int()),
          },
        ),
        Types.object([
          Types.namedProp('name', Types.string()),
          Types.namedProp('age', Types.int()),
        ]),
      ),
      'fn(# name: String?, # age: Int?): {name: String, age: Int}',
    ]),
    c([
      Types.formula(
        args(
          {name: '# name', type: Types.string()},
          {name: 'age', type: Types.optional(Types.int())},
        ),
        Types.object([
          Types.namedProp('name', Types.string()),
          Types.namedProp('age', Types.int()),
        ]),
      ),
      'fn(# name: String, age: Int?): {name: String, age: Int}',
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
    expect(Types.oneOf([Types.oneOf([Types.int(), Types.string()])])).toEqual(
      privateOneOf(Types.int(), Types.string()),
    )
    expect(
      Types.oneOf([
        Types.oneOf([Types.int(), Types.string()]),
        Types.oneOf([Types.int(), Types.booleanType()]),
      ]),
    ).toEqual(privateOneOf(Types.int(), Types.string(), Types.booleanType()))
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

describe('arrayAccess', () => {
  let typeRuntime: TypeRuntime
  let runtimeTypes: {[K in string]: [Types.Type, any]}

  beforeEach(() => {
    runtimeTypes = {}
    typeRuntime = mockTypeRuntime(runtimeTypes)

    // items: Array(Int, length: 1..<5)
    runtimeTypes['items'] = [
      Types.array(Types.int(), {min: 5, max: 5}),
      Values.array([Values.int(-1), Values.int(1), Values.int(3)]),
    ]
    // index0: Int(=0)
    runtimeTypes['index0'] = [Types.int({min: 0, max: 0}), Values.int(0)]
    // indexNeg: Int(-1...0)
    runtimeTypes['indexNeg'] = [Types.int({min: -1, max: 0}), Values.int(0)]
    // indexLt5: Int(<5)
    runtimeTypes['indexLt5'] = [Types.int({max: 4}), Values.int(4)]
    // indexMin0: Int(>=0)
    runtimeTypes['indexMin0'] = [Types.int({min: 0}), Values.int(4)]
    // indexSafe: Int(0..<5)
    runtimeTypes['indexSafe'] = [Types.int({min: 0, max: 4}), Values.int(4)]
  })

  cases<[string, Types.Type]>(
    c(['items[0]', Types.int()]),
    c(['items[4]', Types.int()]),
    c(['items[5]', Types.nullType()]),
    c(['items[10]', Types.nullType()]),
    c(['items[index0]', Types.int()]),
    c(['items[indexNeg]', Types.optional(Types.int())]),
    c(['items[indexLt5]', Types.optional(Types.int())]),
    c(['items[indexMin0]', Types.optional(Types.int())]),
    c(['items[indexSafe]', Types.int()]),
  ).run(([code, expected], {only, skip}) =>
    (only ? it.only : skip ? it.skip : it)(`type of ${code} should be ${expected}`, () => {
      const currentExpression = parse(code).get()
      const resolvedType = currentExpression.getType(typeRuntime).get()
      expect(resolvedType).toEqual(expected)
    }),
  )
})

describe('checkFormulaArguments (argument checking and generics resolution)', () => {
  // fn<T>(# arg: T): T
  describe('formula', () => {
    const genericTypeT = Types.generic('T')

    const formula = Types.formula(
      [Types.positionalArgument({name: 'arg', type: genericTypeT, isRequired: true})],
      genericTypeT,
      [genericTypeT],
    )
    describe(formula.toCode(), () => {
      cases<[Types.Type[], Types.Type]>(
        // fn(int): int
        c([[Types.int()], Types.int()]),
        // fn(1): 1
        c([[Types.literal(1)], Types.literal(1)]),
      ).run(([args, expected], {only, skip}) => {
        ;(only ? it.only : skip ? it.skip : it)(`successfully derives ${expected.toCode()}`, () => {
          const genericResolution = new Map([[genericTypeT, Types.generic('T')]])
          const errorMessage = Types.checkFormulaArguments(
            formula,
            args.length,
            [],
            position => args[position],
            position => [],
            // spreadPositionalArguments:
            [],
            // spreadDictArguments:
            new Map(),
            // keywordListArguments:
            [],
            genericResolution,
          )
          expect(errorMessage).toBeUndefined()
          expect(genericResolution.get(genericTypeT)!.resolvedType).toEqual(expected)
        })
      })
    })
  })

  describe('mapFormula', () => {
    const genericTypeT = Types.generic('T')
    const genericTypeU = Types.generic('U')
    // fn<T, U>(# callback: fn(# input: T): U, # values: T[]): U[]
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
        Types.positionalArgument({
          name: 'values',
          type: Types.array(genericTypeT),
          isRequired: true,
        }),
      ],
      Types.array(genericTypeU),
      [genericTypeT, genericTypeU],
    )
    describe(mapFormula.toCode(), () => {
      it(`toCode`, () => {
        expect(mapFormula.toCode()).toEqual(
          'fn<T, U>(# callback: fn(# input: T): U, # values: Array(T)): Array(U)',
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
        let desc: string
        if (typeof expected === 'string') {
          desc = `correctly fails on [${args.map(arg => arg.toString()).join(',')}]`
        } else {
          const [expectedT, expectedU] = expected
          desc = `successfully derives T: ${expectedT.toCode()} and U: ${expectedU.toCode()}`
        }

        ;(only ? it.only : skip ? it.skip : it)(desc, () => {
          const genericResolution = new Map([
            [genericTypeT, Types.generic('T')],
            [genericTypeU, Types.generic('U')],
          ])

          const errorMessage = Types.checkFormulaArguments(
            mapFormula,
            args.length,
            [],
            position => args[position],
            position => [],
            // spreadPositionalArguments:
            [],
            // spreadDictArguments:
            new Map(),
            // keywordListArguments:
            [],
            genericResolution,
          )

          if (typeof expected === 'string') {
            expect(errorMessage).toContain(expected)
          } else {
            const [expectedT, expectedU] = expected
            expect(errorMessage).toBeUndefined()
            expect(genericResolution.get(genericTypeT)!.resolvedType).toEqual(expectedT)
            expect(genericResolution.get(genericTypeU)!.resolvedType).toEqual(expectedU)
          }
        })
      })
    })
  })

  describe('compactMapFormula', () => {
    const genericTypeT = Types.generic('T')
    const genericTypeU = Types.generic('U')
    // fn<T, U>(# callback: fn(# input: T): U | null, # values: T[]): U[]
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
        Types.positionalArgument({
          name: 'values',
          type: Types.array(genericTypeT),
          isRequired: true,
        }),
      ],
      Types.array(genericTypeU),
      [genericTypeT, genericTypeU],
    )
    describe(compactMapFormula.toCode(), () => {
      it('toCode', () => {
        expect(compactMapFormula.toCode()).toEqual(
          'fn<T, U>(# callback: fn(# input: T): U?, # values: Array(T)): Array(U)',
        )
      })

      const [expectedT, expectedU] = [Types.int(), Types.string()]

      it(`successfully derives T: ${expectedT.toCode()} and U: ${expectedU.toCode()}`, () => {
        // fn<T, U>(
        //   # callback: fn(# input: T): U?,
        //   # values: Array(T),
        // ): Array(U)
        //
        // # callback => fn(# value: Int): String?
        // Int => requirement for T (must be Int or "smaller")
        // String? => hint for U?
        // (String => hint for U) (U could be "larger" than String)
        //
        // # values => Array(Int)
        // Array(Int) => hint for Array(T) (T could be "larger" than Int)
        // (Int => hint for T)
        //
        // T => Int,
        // U => String
        const args: Types.Type[] = [
          Types.formula(
            [Types.positionalArgument({name: 'value', type: Types.int(), isRequired: true})],
            Types.optional(Types.string()),
          ),
          Types.array(Types.int()),
        ]

        const genericResolution = new Map([
          [genericTypeT, genericTypeT.copy()],
          [genericTypeU, genericTypeU.copy()],
        ])
        const errorMessage = Types.checkFormulaArguments(
          compactMapFormula,
          args.length,
          [],
          position => args[position],
          _name => [],
          // spreadPositionalArguments:
          [],
          // spreadDictArguments:
          new Map(),
          // keywordListArguments:
          [],
          genericResolution,
        )

        expect(errorMessage).toBeUndefined()
        expect(genericResolution.get(genericTypeT)!.resolvedType).toEqual(expectedT)
        expect(genericResolution.get(genericTypeU)!.resolvedType).toEqual(expectedU)
      })
    })
  })
})

function args(
  ...args: {name: string; alias?: string; type: Types.Type; isRequired?: boolean}[]
): Types.Argument[] {
  return args.map(({name, type, alias, isRequired}) => {
    if (name[0] === '#') {
      return Types.positionalArgument({
        name: name.slice(1).trim(),
        type,
        isRequired: isRequired ?? true,
      })
    } else {
      alias = alias ?? name

      return Types.namedArgument({name, alias, type, isRequired: isRequired ?? true})
    }
  })
}
