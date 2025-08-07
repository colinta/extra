export interface Case<T> {
  input: T
  only: boolean
  skip: boolean
  description(): string
}

export interface CaseCreate {
  <T>(input: T): Case<T>
  only<T>(input: T): Case<T>
  hold<T>(input: T): Case<T>
  skip<T>(input: T): Case<T>
}

export interface CaseRunner<T> {
  run(fn: (input: T, args: {only: boolean; skip: boolean}) => void | Promise<void>): Promise<void>
}

export function cases<T>(...cases: Case<T>[]): CaseRunner<T> {
  return {
    async run(
      fn: (
        input: T,
        args: {only: boolean; skip: boolean; description: string},
      ) => void | Promise<void>,
    ) {
      for (const {input, only, skip, description} of cases) {
        const p = fn(input, {only, skip, description: description()})
        if (p instanceof Promise) {
          await p
        }
      }
    },
  }
}

function createCase<T>(input: T, only: boolean, skip: boolean) {
  let description = ''
  return {
    input,
    only,
    skip,
    description() {
      return description
    },
    describe(desc: string) {
      description = desc
    },
  } as Case<T>
}

export const c: CaseCreate = Object.assign(
  <T>(input: T) => {
    return createCase(input, false, false)
  },
  {
    only<T>(input: T) {
      return createCase(input, true, false)
    },
    // identical to 'skip', it's just handy having an alias for it
    hold<T>(input: T) {
      return createCase(input, false, true)
    },
    skip<T>(input: T) {
      return createCase(input, false, true)
    },
  },
)
