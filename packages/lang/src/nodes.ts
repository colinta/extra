import {type Type} from './types'

export abstract class Node {
  constructor(readonly type: Type) {}
}
