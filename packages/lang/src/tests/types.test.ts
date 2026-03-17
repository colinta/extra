import {c, cases} from '@extra-lang/cases'
import * as Types from '../types'
import * as Values from '../values'
import {parse} from '../formulaParser'
import {privateOneOf} from './privateOneOf'
import {generateConstraints, solveConstraints, type Constraint} from '../constraints'
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
    c([Types.array(Types.string()), '[String]']),
    c([Types.array(Types.array(Types.string())), '[[String]]']),
    c([Types.array(Types.literal(true)), '[true]']),
    c([Types.array(Types.oneOf([Types.int(), Types.string()])), '[Int | String]']),
    c([Types.array(Types.array(Types.oneOf([Types.int(), Types.string()]))), '[[Int | String]]']),
    c([
      Types.oneOf([
        Types.array(Types.int(), {max: 3}),
        Types.array(Types.string(), {min: 7, max: 10}),
      ]),
      '[Int, length: <=3] | [String, length: 7...10]',
    ]),
    c([
      Types.oneOf([
        Types.array(Types.oneOf([Types.string(), Types.int()]), {min: 3}),
        Types.array(Types.booleanType(), {min: 3}),
      ]),
      '[Boolean, length: >=3] | [Int | String, length: >=3]',
    ]),
    c([
      Types.oneOf([
        Types.array(Types.int(), {max: 5}),
        Types.array(Types.string(), {min: 7, max: 10}),
      ]),
      '[Int, length: <=5] | [String, length: 7...10]',
    ]),
    c([
      Types.oneOf([
        Types.array(Types.oneOf([Types.int(), Types.string()]), {max: 15}),
        Types.array(Types.string(), {min: 7, max: 10}),
      ]),
      '[Int | String, length: <=15]',
    ]),
    c([
      Types.oneOf([
        Types.array(Types.int(), {max: 3}),
        Types.array(Types.int(), {min: 7, max: 10}),
      ]),
      '[Int, length: <=3] | [Int, length: 7...10]',
    ]),
    c([
      Types.oneOf([Types.array(Types.string(), {max: 1}), Types.array(Types.string(), {min: 2})]),
      '[String]',
    ]),
    c([
      Types.oneOf([Types.array(Types.string(), {max: 1}), Types.array(Types.string(), {min: 3})]),
      '[String, length: <=1] | [String, length: >=3]',
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
    c([Types.classType({name: 'Mario', props: new Map([['foo', Types.string()]])}), 'Mario']),
    c([
      Types.classType({
        name: 'Mario',
        props: new Map([['bar', Types.int()]]),
        parent: Types.classType({name: 'Plumber', props: new Map([['foo', Types.string()]])}),
      }),
      'Mario',
    ]),
    c([Types.optional(Types.int()), 'Int?']),
    c([Types.optional(Types.nullType()), 'null']),
    c([Types.oneOf([Types.int(), Types.string()]), 'Int | String']),
    c([Types.oneOf([Types.int(), Types.string(), Types.nullType()]), 'Int | String | null']),
    c([Types.oneOf([Types.int(), Types.nullType()]), 'Int?']),
    c([Types.oneOf([Types.int()]), 'Int']),
    c([
      Types.oneOf([Types.float({min: 1, max: [2]}), Types.float({min: [4], max: 7})]),
      'Float(1..<2) | Float(4<..7)',
    ]),
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

  describe('oneOf is smart', () => {
    const human = Types.classType({name: 'Human', props: new Map([['name', Types.string()]])})
    const student = Types.classType({
      name: 'Student',
      props: new Map([['grade', Types.int()]]),
      parent: human,
    })
    const college = Types.classType({
      name: 'College',
      props: new Map([['debt', Types.int()]]),
      parent: student,
    })
    const worker = Types.classType({
      name: 'Worker',
      props: new Map([['job', Types.string()]]),
      parent: human,
    })
    const animal = Types.classType({name: 'Animal', props: new Map([['legs', Types.int()]])})
    const dog = Types.classType({
      name: 'Dog',
      props: new Map([['name', Types.string()]]),
      parent: animal,
    })

    cases<[Types.Type, Types.Type]>(
      c([Types.oneOf([]), Types.never()]),
      c([Types.oneOf([Types.int()]), Types.int()]),
      c([
        Types.oneOf([Types.int(), Types.nullType()]),
        Types.OptionalType._privateOptional(Types.int()),
      ]),
      c([Types.oneOf([Types.int(), Types.string()]), privateOneOf(Types.int(), Types.string())]),
      c([
        Types.oneOf([Types.int(), Types.string(), Types.nullType()]),
        privateOneOf(Types.int(), Types.string(), Types.nullType()),
      ]),
      c([
        Types.oneOf([Types.oneOf([Types.int(), Types.string()])]),
        privateOneOf(Types.int(), Types.string()),
      ]),

      c([
        Types.oneOf([
          Types.oneOf([Types.int(), Types.string()]),
          Types.oneOf([Types.int(), Types.booleanType()]),
        ]),
        privateOneOf(Types.int(), Types.string(), Types.booleanType()),
      ]),
      c([Types.oneOf([human, student]), human]),
      c([Types.oneOf([human, worker]), human]),
      c([Types.oneOf([human, worker, student]), human]),
      c([Types.oneOf([human, worker, student, animal]), privateOneOf(human, animal)]),
      c([Types.oneOf([human, worker, student, animal, dog]), privateOneOf(human, animal)]),
      c([Types.oneOf([worker, student]), privateOneOf(worker, student)]),
      c([Types.oneOf([worker, student, college]), privateOneOf(worker, student)]),
      c([Types.oneOf([worker, college, student]), privateOneOf(worker, student)]),
    ).run(([type, expected], {only, skip}) =>
      (only ? it.only : skip ? it.skip : it)(
        `toCode of ${type.toCode()} should be ${expected}`,
        () => {
          expect(type).toEqual(expected)
        },
      ),
    )
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
    (only ? it.only : skip ? it.skip : it)(
      `indexing items: Array(Int, length: 1..<5) with type ${code} should be ${expected}`,
      () => {
        const currentExpression = parse(code).get()
        const resolvedType = currentExpression.getType(typeRuntime).get()
        expect(resolvedType).toEqual(expected)
      },
    ),
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
      ).run(([argTypes, expected], {only, skip}) => {
        ;(only ? it.only : skip ? it.skip : it)(`successfully derives ${expected.toCode()}`, () => {
          // Validate arguments
          const errorMessage = Types.checkFormulaArguments(
            formula,
            argTypes.length,
            [],
            position => argTypes[position],
            _name => [],
            [],
            new Map(),
            [],
          )
          expect(errorMessage).toBeUndefined()

          // Collect and solve constraints
          const generics = new Set(formula.genericTypes)
          const constraints: Constraint[] = []
          for (let i = 0; i < formula.args.length; i++) {
            const provided = argTypes[i]
            if (provided) {
              constraints.push(...generateConstraints(provided, formula.args[i].type, generics))
            }
          }
          const solved = solveConstraints(constraints, formula.genericTypes)
          expect(solved.isOk()).toBe(true)
          expect(solved.get().get(genericTypeT)).toEqual(expected)
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
          'fn<T, U>(# callback: fn(# input: T): U, # values: [T]): [U]',
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
      ).run(([argTypes, expected], {only, skip}) => {
        let desc: string
        if (typeof expected === 'string') {
          desc = `correctly fails on [${argTypes.map(arg => arg.toString()).join(',')}]`
        } else {
          const [expectedT, expectedU] = expected
          desc = `successfully derives T: ${expectedT.toCode()} and U: ${expectedU.toCode()}`
        }

        ;(only ? it.only : skip ? it.skip : it)(desc, () => {
          const errorMessage = Types.checkFormulaArguments(
            mapFormula,
            argTypes.length,
            [],
            position => argTypes[position],
            _name => [],
            [],
            new Map(),
            [],
          )

          if (typeof expected === 'string') {
            expect(errorMessage).toContain(expected)
          } else {
            const [expectedT, expectedU] = expected
            expect(errorMessage).toBeUndefined()

            // Collect and solve constraints
            const generics = new Set(mapFormula.genericTypes)
            const constraints: Constraint[] = []
            for (let i = 0; i < mapFormula.args.length; i++) {
              const provided = argTypes[i]
              if (provided) {
                constraints.push(
                  ...generateConstraints(provided, mapFormula.args[i].type, generics),
                )
              }
            }
            const solved = solveConstraints(constraints, mapFormula.genericTypes)
            expect(solved.isOk()).toBe(true)
            expect(solved.get().get(genericTypeT)).toEqual(expectedT)
            expect(solved.get().get(genericTypeU)).toEqual(expectedU)
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
          'fn<T, U>(# callback: fn(# input: T): U?, # values: [T]): [U]',
        )
      })

      const [expectedT, expectedU] = [Types.int(), Types.string()]

      it(`successfully derives T: ${expectedT.toCode()} and U: ${expectedU.toCode()}`, () => {
        const argTypes: Types.Type[] = [
          Types.formula(
            [Types.positionalArgument({name: 'value', type: Types.int(), isRequired: true})],
            Types.optional(Types.string()),
          ),
          Types.array(Types.int()),
        ]

        const errorMessage = Types.checkFormulaArguments(
          compactMapFormula,
          argTypes.length,
          [],
          position => argTypes[position],
          _name => [],
          [],
          new Map(),
          [],
        )
        expect(errorMessage).toBeUndefined()

        // Collect and solve constraints
        const generics = new Set(compactMapFormula.genericTypes)
        const constraints: Constraint[] = []
        for (let i = 0; i < compactMapFormula.args.length; i++) {
          const provided = argTypes[i]
          if (provided) {
            constraints.push(
              ...generateConstraints(provided, compactMapFormula.args[i].type, generics),
            )
          }
        }
        const solved = solveConstraints(constraints, compactMapFormula.genericTypes)
        expect(solved.isOk()).toBe(true)
        expect(solved.get().get(genericTypeT)).toEqual(expectedT)
        expect(solved.get().get(genericTypeU)).toEqual(expectedU)
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
