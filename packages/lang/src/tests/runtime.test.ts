import * as Types from '~/types'
import * as Values from '~/values'
import {
  type TypeRuntime,
  type ValueRuntime,
  MutableTypeRuntime,
  MutableValueRuntime,
} from '~/runtime'

describe('relationshipsThatReference', () => {
  it('a == b', () => {
    const runtime = new MutableTypeRuntime()
    runtime.addLocalType('a', Types.int())
    runtime.addLocalType('b', Types.int())
    const aId = runtime.refId('a')!
    const bId = runtime.refId('b')!
    runtime.addRelationship('b', '==', {type: 'reference', name: 'a', id: aId})
    expect(runtime.relationshipsThatReference(aId)).toEqual([
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
    expect(runtime.relationshipsThatReference(bId)).toEqual([
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
