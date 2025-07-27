import * as Types from '../types'
import {MutableTypeRuntime} from '../runtime'

describe('relationshipsThatReference', () => {
  it('a == b', () => {
    const runtime = new MutableTypeRuntime()
    runtime.addLocalType('a', Types.int())
    runtime.addLocalType('b', Types.int())
    const aId = runtime.refId('a')!
    const bId = runtime.refId('b')!
    runtime.addRelationshipFormula({type: 'reference', name: 'b', id: bId}, '==', {
      type: 'reference',
      name: 'a',
      id: aId,
    })
    expect(runtime.getRelationships(aId)).toEqual([
      {
        formula: {
          id: aId,
          name: 'a',
          type: 'reference',
        },
        comparison: {
          type: '==',
          rhs: {
            id: bId,
            name: 'b',
            type: 'reference',
          },
        },
      },
    ])
    expect(runtime.getRelationships(bId)).toEqual([
      {
        formula: {
          id: bId,
          name: 'b',
          type: 'reference',
        },
        comparison: {
          type: '==',
          rhs: {
            id: aId,
            name: 'a',
            type: 'reference',
          },
        },
      },
    ])
  })
})
