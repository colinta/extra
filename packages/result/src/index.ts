export abstract class ResultClass<OK, ERR> {
  abstract type: 'ok' | 'err'
  abstract value: OK | undefined
  abstract error: ERR | undefined

  abstract isOk(): this is Ok<OK, ERR>
  abstract isErr(): this is Failure<OK, ERR>

  abstract get(): OK
  abstract getError(): ERR | undefined

  safeGet(): OK | undefined {
    if (this.isOk()) {
      return this.get()
    }

    return undefined
  }

  map<TOK>(
    fn: (t: OK) => TOK | Result<TOK, ERR>,
    errorClass?: (value: unknown) => value is ERR,
  ): Result<TOK, ERR> {
    if (this.isOk()) {
      try {
        const res = fn(this.value)
        if (res instanceof Ok || res instanceof Failure) {
          return res
        }

        return ok(res)
      } catch (e) {
        if (errorClass) {
          if (errorClass(e)) {
            return err(e as ERR)
          }
          throw e
        }
        return err(e as ERR)
      }
    }
    return err((this as Failure<OK, ERR>).error)
  }

  mapResult<TOK, TERR>(fn: (t: Result<OK, ERR>) => Result<TOK, TERR>): Result<TOK, TERR> {
    return fn(this as Failure<OK, ERR>)
  }

  static create<T, Err>(fn: () => T): Result<T, Err> {
    try {
      return ok(fn())
    } catch (e) {
      return err(e as Err)
    }
  }
}

class Ok<OK, ERR> extends ResultClass<OK, ERR> {
  type: 'ok'
  value: OK
  error: undefined

  constructor(value: OK) {
    super()
    this.type = 'ok'
    this.value = value
    this.error = undefined
  }

  isOk(): this is Ok<OK, ERR> {
    return true
  }
  isErr(): this is Failure<OK, ERR> {
    return false
  }
  get(): OK {
    return this.value
  }
  getError(): undefined {
    return undefined
  }
}

class Failure<OK, ERR> extends ResultClass<OK, ERR> {
  type: 'err'
  value: undefined
  error: ERR

  constructor(error: ERR) {
    super()
    this.type = 'err'
    this.value = undefined
    this.error = error
  }

  isOk(): this is Ok<OK, ERR> {
    return false
  }
  isErr(): this is Failure<OK, any> {
    return true
  }
  get(): OK {
    // console.trace(this.error)
    throw this.error
  }
  getError(): ERR {
    return this.error
  }
}

export type Result<OK, ERR> = Ok<OK, ERR> | Failure<OK, ERR>

export function ok(): Result<void, any>
export function ok<OK>(value: OK): Result<OK, any>

export function ok<OK>(value?: OK): Result<OK, any> {
  return new Ok(value as OK)
}

export function err<ERR>(error: ERR): Result<any, ERR> {
  return new Failure(error)
}

export function attempt<OK, ERR>(
  fn: () => OK | Result<OK, ERR>,
  errorClass?: (value: unknown) => boolean,
): Result<OK, ERR> {
  try {
    const res = fn()
    if (res instanceof Ok || res instanceof Failure) {
      return res
    }

    return ok(res)
  } catch (e) {
    if (errorClass) {
      if (errorClass(e)) {
        return err(e as ERR)
      }
      throw e
    }
    return err(e as ERR)
  }
}

export function mapAll<OK, ERR>(items: Result<OK, ERR>[]): Result<OK[], ERR> {
  const mapped: OK[] = []
  for (const item of items) {
    if (item.isOk()) {
      mapped.push(item.get())
    } else {
      return err(item.error)
    }
  }
  return ok(mapped)
}
