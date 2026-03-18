import * as Types from '../types'
import * as Values from '../values'
import {type EnumCaseArgsCriteria, MutableTypeRuntime} from '../runtime'

class MockTypeRuntime extends MutableTypeRuntime {
  constructor(readonly runtimeTypes: {[K in string]: [Types.Type, Values.Value]}) {
    super()
    Object.defineProperty(this, 'runtimeTypes', {enumerable: false})
  }

  refId(name: string): string | undefined {
    if (!super.refId(name) && this.runtimeTypes[name]) {
      this.addLocalType(name, this.runtimeTypes[name][0])
    }
    return super.refId(name)
  }

  has(name: string) {
    if (this.runtimeTypes[name]) {
      return true
    }
    return super.has(name)
  }

  getTypeById(id: string) {
    const sup = super.getLocalType(id)
    const name = super.refName(id)
    if (!sup && name) {
      const type = this.runtimeTypes[name]?.[0]
      return type
    }
    return sup
  }

  getLocalType(name: string) {
    if (this.runtimeTypes[name] && !super.getLocalType(name)) {
      this.addLocalType(name, this.runtimeTypes[name][0])
    }

    return super.getLocalType(name)
  }

  findEnumCaseTypes(caseName: string, argsCriteria?: EnumCaseArgsCriteria): Types.Type[] {
    // Ensure all runtimeTypes are registered before searching
    for (const [name, [type]] of Object.entries(this.runtimeTypes)) {
      if (!super.getLocalType(name)) {
        this.addLocalType(name, type)
      }
    }
    return super.findEnumCaseTypes(caseName, argsCriteria)
  }
}

export function mockTypeRuntime(runtimeTypes: {[K in string]: [Types.Type, Values.Value]}) {
  const runtime = new MockTypeRuntime(runtimeTypes)
  return runtime
}
