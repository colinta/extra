import * as Types from '../types'
import {MutableTypeRuntime} from '../runtime'

describe('relationshipsThatReference', () => {
  it('a == b', () => {
    const runtime = new MutableTypeRuntime()
    runtime.addLocalType('a', Types.int())
    runtime.addLocalType('b', Types.int())
    const aId = runtime.refId('a')!
    const bId = runtime.refId('b')!
    runtime.addRelationship('b', '==', {type: 'reference', name: 'a', id: aId})
    expect(runtime.getRelationships(aId)).toEqual([
      {
        formula: {
          id: aId,
          name: 'a',
          type: 'reference',
        },
        type: '==',
        right: {
          id: bId,
          name: 'b',
          type: 'reference',
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
        type: '==',
        right: {
          id: aId,
          name: 'a',
          type: 'reference',
        },
      },
    ])
  })
})
