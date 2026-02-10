/**
 * Holds the scope name and that's it - we need object identity not string
 * identity when comparing scopes.
 */
export class Scope {
  constructor(readonly name: string) {}
}
