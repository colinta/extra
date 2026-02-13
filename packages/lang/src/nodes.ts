import {type Type} from './types'
import {type Comment} from './formulaParser/types'
import * as Types from './types'
import {STATE_START} from './formulaParser/grammars'

export type Source = {
  start: number
  stop: number
  precedingComments: Comment[]
  followingComments: Comment[]
}

export abstract class Node {
  constructor(
    readonly source: Source,
    readonly type: Type,
  ) {}

  propAccessNode(name: string): Node | undefined {
    return undefined
  }

  arrayAccessNode(name: string): Node | undefined {
    return undefined
  }
}

/**
 * A node that represents a type expression.
 */
abstract class TypeNode extends Node {}

export class Namespace extends TypeNode {
  constructor(
    readonly source: Source,
    readonly type: Types.Type,
    readonly lhs: Namespace | string,
    readonly rhs: string,
  ) {
    super(source, type)
  }
}

export class BooleanType extends TypeNode {
  constructor(readonly source: Source) {
    super(source, Types.BooleanType)
  }
}

export class FloatType extends TypeNode {
  constructor(
    readonly source: Source,
    readonly type: Types.Type,
  ) {
    super(source, type)
  }
}

export class IntType extends TypeNode {
  constructor(
    readonly source: Source,
    readonly type: Types.Type,
  ) {
    super(source, type)
  }
}

export class StringType extends TypeNode {
  constructor(
    readonly source: Source,
    readonly type: Types.Type,
  ) {
    super(source, type)
  }
}

export class OneOfType extends TypeNode {}
export class CombineType extends TypeNode {}
export class ObjectType extends TypeNode {}
export class ArrayType extends TypeNode {}
export class DictType extends TypeNode {}
export class SetType extends TypeNode {}
export class TypeConstructor extends TypeNode {}

export class Literal extends Node {}

export class LiteralNull extends Literal {
  constructor(readonly source: Source) {
    super(source, Types.NullType)
  }
}

export class LiteralTrue extends Literal {
  constructor(readonly source: Source) {
    super(source, Types.LiteralTrueType)
  }
}

export class LiteralFalse extends Literal {
  constructor(readonly source: Source) {
    super(source, Types.LiteralFalseType)
  }
}

export class LiteralFloat extends Literal {
  constructor(
    readonly source: Source,
    readonly value: number,
  ) {
    super(source, Types.literal(value, 'float'))
  }
}

export class LiteralInt extends Literal {
  constructor(
    readonly source: Source,
    readonly value: number,
    readonly base: 'decimal' | 'binary' | 'octal' | 'hexadecimal',
  ) {
    super(source, Types.literal(value))
  }
}

export class LiteralRegex extends Literal {
  constructor(
    readonly source: Source,
    readonly pattern: string,
    readonly flags: string,
    readonly groups: Map<string, string>,
  ) {
    const regex = new RegExp(pattern, flags)
    super(source, Types.literal(regex))
  }
}

export class LiteralString extends Literal {
  readonly length: number

  constructor(
    readonly source: Source,
    readonly string: string,
    readonly chars: string[],
  ) {
    super(source, Types.literal(string))
    this.length = chars.length
  }
}

export class StringTemplate extends Node {
  constructor(
    readonly source: Source,
    readonly args: Node[],
    readonly type: Types.Type,
  ) {
    super(source, type)
  }
}

export class Reference extends Node {
  constructor(
    readonly source: Source,
    readonly type: Types.Type,
    readonly name: string,
  ) {
    super(source, type)
  }
}

export class StateReference extends Reference {
  constructor(
    readonly source: Source,
    readonly type: Types.Type,
    readonly name: string,
  ) {
    super(source, type, name)
  }

  get stateName() {
    return STATE_START + this.name
  }
}

/**
 * The right-hand side of a property-access operation:
 *
 *     object.property-name
 *            ^^^^^^^^^^^^^
 *
 *  The property-name doesn't have an intrinsic type - the property access
 *  operation has a type, but not the rhs expression.
 */
export class PropertyName extends Reference {
  constructor(
    readonly source: Source,
    readonly name: string,
  ) {
    super(source, Types.AlwaysType, name)
  }

  get stateName() {
    return STATE_START + this.name
  }
}

export class This extends Reference {
  constructor(
    readonly source: Source,
    readonly type: Types.Type,
  ) {
    super(source, type, 'this')
  }
}

export class Pipe extends Reference {
  constructor(
    readonly source: Source,
    readonly type: Types.Type,
  ) {
    super(source, type, '#pipe')
  }
}

export const Ignored = new (class Ignored extends Node {
  constructor() {
    super(
      {
        start: 0,
        stop: 0,
        precedingComments: [],
        followingComments: [],
      },
      // AlwaysType is a good choice because when merged with other types, the
      // AlwaysType will be ignored and the other type will be returned.
      Types.AlwaysType,
    )
  }
})()

//     {
//       a
//     }
//     [
//       a
//     ]
type PositionalValue = {
  is: 'positional-value'
  node: Node
}

//     {
//       a: b
//     }
//     #{       dict(
//       a: b     a: b
//     }        )
type KeyValuePair = {
  is: 'key-value-pair'
  key: Node
  node: Node
}

//     {
//       ...a
//     }
type SpreadObject = {
  is: 'spread-object'
  node: Node
}

export type ObjectEntry = PositionalValue | KeyValuePair | SpreadObject

export class ObjectLiteral extends Node {
  constructor(
    readonly source: Source,
    readonly type: Types.Type,
    readonly nodes: ObjectEntry[],
  ) {
    super(source, type)
  }
}

//     [
//       ...a
//     ]
type SpreadArray = {
  is: 'spread-array'
  node: Node
}

//     [
//       a onlyif b
//     ]
type InclusionArray = {
  is: 'inclusion-array'
  node: PositionalValue | KeyValuePair | SpreadArray
  condition: Node
}

export type ArrayEntry = PositionalValue | SpreadArray | InclusionArray

export class ArrayLiteral extends Node {
  constructor(
    readonly source: Source,
    readonly type: Types.Type,
    readonly values: ArrayEntry[],
  ) {
    super(source, type)
  }
}

type SpreadDict = {
  is: 'spread-dict'
  node: Node
}

type InclusionDict = {
  is: 'inclusion-dict'
  node: PositionalValue | KeyValuePair | SpreadDict
  condition: Node
}

export type DictEntry = PositionalValue | SpreadDict | InclusionDict

export class DictLiteral extends Node {
  constructor(
    readonly source: Source,
    readonly type: Types.Type,
    readonly values: DictEntry[],
  ) {
    super(source, type)
  }
}

type SpreadSet = {
  is: 'spread-set'
  node: Node
}

type InclusionSet = {
  is: 'inclusion-set'
  node: PositionalValue | KeyValuePair | SpreadSet
  condition: Node
}

export type SetEntry = PositionalValue | SpreadSet | InclusionSet

export class SetLiteral extends Node {
  constructor(
    readonly source: Source,
    readonly type: Types.Type,
    readonly values: SetEntry[],
  ) {
    super(source, type)
  }
}

export type LetEntry = {
  is: 'let-assign'
  name: string
  type: Node | undefined
  node: Node
}

export class Let extends Node {
  constructor(
    readonly source: Source,
    readonly body: Node,
    readonly assigns: LetEntry[],
  ) {
    super(source, body.type)
  }
}

export abstract class Argument extends Node {
  constructor(
    readonly source: Source,
    readonly type: Types.Type,
    readonly name: string,
  ) {
    super(source, type)
  }

  abstract toArgumentType(): Types.Argument
}

export class PositionalArgument extends Argument {
  constructor(
    readonly source: Source,
    readonly type: Types.Type,
    readonly name: string,
    readonly isRequired: boolean,
  ) {
    super(source, type, name)
  }

  toArgumentType() {
    return Types.positionalArgument({
      name: this.name,
      type: this.type,
      isRequired: this.isRequired,
    })
  }
}

export class NamedArgument extends Argument {
  constructor(
    readonly source: Source,
    readonly type: Types.Type,
    readonly name: string,
    readonly alias: string,
    readonly isRequired: boolean,
  ) {
    super(source, type, name)
  }

  toArgumentType() {
    return Types.namedArgument({
      name: this.name,
      alias: this.alias,
      type: this.type,
      isRequired: this.isRequired,
    })
  }
}

export class SpreadPositionalArgument extends Argument {
  constructor(
    readonly source: Source,
    readonly type: Types.ArrayType,
    readonly name: string,
  ) {
    super(source, type, name)
  }

  toArgumentType() {
    return Types.spreadPositionalArgument({
      name: this.name,
      type: this.type,
    })
  }
}

export class RepeatedNamedArgument extends Argument {
  constructor(
    readonly source: Source,
    readonly type: Types.ArrayType,
    readonly name: string,
    readonly alias: string,
  ) {
    super(source, type, name)
  }

  toArgumentType() {
    return Types.repeatedNamedArgument({
      name: this.name,
      type: this.type,
    })
  }
}

export class KwargsListArgument extends Argument {
  constructor(
    readonly source: Source,
    readonly type: Types.DictType,
    readonly name: string,
  ) {
    super(source, type, name)
  }

  toArgumentType() {
    return Types.kwargListArgument({
      name: this.name,
      type: this.type,
    })
  }
}

export class Generic extends Node {
  readonly name: string

  constructor(
    readonly source: Source,
    readonly type: Types.GenericType,
  ) {
    super(source, type)
    this.name = type.name
  }
}

export class AnonymousFunction extends Node {
  constructor(
    readonly source: Source,
    readonly type: Types.FormulaType,
    readonly generics: Generic[],
    readonly args: Argument[],
    readonly returnType: Node | undefined,
    readonly body: Node,
  ) {
    super(source, type)
  }
}

export class NamedFunction extends AnonymousFunction {
  constructor(
    readonly source: Source,
    readonly type: Types.NamedFormulaType,
    readonly name: string,
    readonly generics: Generic[],
    readonly args: Argument[],
    readonly returnType: Node | undefined,
    readonly body: Node,
  ) {
    super(source, type, generics, args, returnType, body)
  }
}

export class InstanceFunction extends NamedFunction {}
export class StaticFunction extends NamedFunction {}
export class ViewFunction extends NamedFunction {}

export abstract class ClassProperty extends Node {
  constructor(
    readonly source: Source,
    readonly type: Types.Type,
    readonly name: string,
    readonly defaultNode: Node | undefined,
  ) {
    super(source, type)
  }
}

export class ClassStateProperty extends ClassProperty {}
export class ClassStaticProperty extends ClassProperty {}

/**
 *                        ↓ generics
 *     [export] class Foo<T> [extends Bar] {
 *                    ↑ name          ^ parent class
 *
 *       ↓ static properties
 *       static a = 'a'
 *       static fn b() => a
 *
 *       ↓ state properties
 *       @first-name = ''
 *       @last-name = ''
 *
 *       ↓ formula properties
 *       fn full-name() =>
 *         @first-name .. @last-name
 *     }
 */
export class ClassDefinition extends Node {
  constructor(
    readonly source: Source,
    readonly name: string,
    readonly parentClass: ClassDefinition | undefined,
    readonly type: Types.ClassDefinitionType,
    /**
     * OrderedMap of static properties. Ordering is determined by dependencies
     * and then source.
     */
    readonly staticProperties: Map<string, Node>,
    readonly stateProperties: Map<string, Node>,
    readonly formulaProperties: Map<string, Node>,
    readonly generics: Generic[],
    readonly isExport: boolean,
  ) {
    super(source, type)
  }
}

export class ViewClassDefinition extends ClassDefinition {
  constructor(
    readonly source: Source,
    readonly name: string,
    readonly parentClass: ViewClassDefinition | undefined,
    readonly type: Types.ViewClassDefinitionType,
    /**
     * OrderedMap of static properties. Ordering is determined by dependencies
     * and then source.
     */
    readonly staticProperties: Map<string, Node>,
    readonly stateProperties: Map<string, Node>,
    readonly formulaProperties: Map<string, Node>,
    readonly generics: Generic[],
    readonly isExport: boolean,
  ) {
    super(
      source,
      name,
      parentClass,
      type,
      staticProperties,
      stateProperties,
      formulaProperties,
      generics,
      isExport,
    )
  }
}

export class ClassInstance extends Node {
  constructor(
    readonly source: Source,
    readonly name: string,
    readonly parentClass: ClassInstance | undefined,
    readonly type: Types.ClassInstanceType,
  ) {
    super(source, type)
  }
}

/**
 * The case inside an enum definition. Each case has the type of the containing
 * enum definition, and so that information is not important for this Node.
 */
export class EnumMember extends Node {
  constructor(
    readonly source: Source,
    readonly name: string,
    readonly args: Argument[],
  ) {
    super(source, Types.NeverType)
  }
}

/**
 * Either a NamedEnumDefinition or AnonymousEnumDefinition
 *
 * NamedEnumDefinition some in common with ClassDefinition, without a
 * parent-class concept. AnonymousEnumDefinition do not have any static
 * properties.
 */
export abstract class EnumDefinition extends Node {
  constructor(
    readonly source: Source,
    readonly type: Types.AnonymousEnumDefinitionType | Types.NamedEnumDefinitionType,
    readonly members: EnumMember[],
  ) {
    super(source, type)
  }
}

/**
 *       -- ↓generics
 * enum Foo<T> {
 *   -- ↑name
 *   case A
 *   case B(Int)
 *   -- ↑members
 *
 *   static default-int = 5
 *   static calc(input: Int) => input + default-int
 *   -- ↑staticProperties
 *
 *   fn value() =>
 *     switch (this) {
 *       case .A: 0
 *       case .B(val): val
 *     }
 *   -- ↑memberFunctions
 *
 *   -- unlike classes, state/instance properties are not allowed
 * }
 */
export class NamedEnumDefinition extends EnumDefinition {
  constructor(
    readonly source: Source,
    readonly name: string,
    readonly type: Types.NamedEnumDefinitionType,
    readonly members: EnumMember[],
    readonly instanceType: Types.EnumInstanceType,
    readonly staticProperties: Map<string, Node>,
    readonly memberFunctions: Map<string, Node>,
    readonly generics: Generic[],
    readonly isExport: boolean,
  ) {
    super(source, type, members)
  }
}

/**
 * fn foo(arg: .a | .b | .c(Int))
 *          -- ↑ AnonymousEnumDefinition.members
 */
export class AnonymousEnumDefinition extends EnumDefinition {
  constructor(
    readonly source: Source,
    readonly type: Types.AnonymousEnumDefinitionType,
    readonly members: EnumMember[],
  ) {
    super(source, type, members)
  }
}

export abstract class Operator extends Node {
  constructor(
    readonly source: Source,
    readonly type: Types.Type,
    readonly args: Node[],
  ) {
    super(source, type)
  }
}

//|
//| Unary operators
//|

export class LogicalNotOperator extends Operator {}
export class NegateOperator extends Operator {}
export class BinaryNegateOperator extends Operator {}
export class StringCoercionOperator extends Operator {}
export class UnaryRangeOperator extends Operator {
  constructor(
    readonly source: Source,
    readonly type: Types.Type,
    readonly args: Node[],
    readonly symbol: '=' | '<' | '<=' | '>=' | '>',
  ) {
    super(source, type, args)
  }
}

//|
//| Binary operators
//|

export class PipeOperator extends Operator {}
export class NullCoalescingPipeOperator extends Operator {}
export class NullCoalescingOperator extends Operator {}
export class LogicalOrOperator extends Operator {}
export class LogicalAndOperator extends Operator {}
export class BinaryXorOperator extends Operator {}
export class BinaryOrOperator extends Operator {}
export class BinaryAndOperator extends Operator {}
export class EqualsOperator extends Operator {}
export class NotEqualsOperator extends Operator {}
export class GreaterThanOperator extends Operator {}
export class GreaterOrEqualOperator extends Operator {}
export class LessThanOperator extends Operator {}
export class LessOrEqualOperator extends Operator {}
export class SortOperator extends Operator {}
export class PropertyExistsOperator extends Operator {}
export class PropertyMissingOperator extends Operator {}
export class MatchOperator extends Operator {}
export class BinaryShiftLeftOperator extends Operator {}
export class BinaryShiftRightOperator extends Operator {}
export class AdditionOperator extends Operator {}
export class SubtractionOperator extends Operator {}
export class MultiplicationOperator extends Operator {}
export class DivisionOperator extends Operator {}
export class FloorDivisionOperator extends Operator {}
export class ModuloRemainderOperator extends Operator {}
export class ExponentiationOperator extends Operator {}
export class ArrayConcatenationOperator extends Operator {}
export class ArrayConstructorOperator extends Operator {}
export class StringConcatenationOperator extends Operator {}
export class ObjectMergeOperator extends Operator {}
export class RangeOperator extends Operator {
  constructor(
    readonly source: Source,
    readonly type: Types.Type,
    readonly args: Node[],
    readonly symbol: '...' | '<..' | '..<' | '<.<',
  ) {
    super(source, type, args)
  }
}
export class AssignmentOperator extends Operator {}
/**
 * Internal use.
 *
 * This node stores two types: the "actual" type of the operation, and the
 * "perceived" type of a chained operation. Example, in the expression:
 *
 *     -- a: Optional({ b: { c: Int }})
 *     a?.b.c
 *
 * The null-coalescing property access operator (`a?.b`) has the type
 * `Optional({c:Int})`, but when we evaluate the `.c` property access, it
 * receives the type `{c:Int}` (the "perceived" type).
 *
 * The "perceived" type is the one returned by node.type. This makes the code
 * in operator.ts related to resolving types straightforward.
 */
export class PropertyChainInfo extends Node {
  constructor(
    readonly source: Source,
    readonly actualNode: Node,
    readonly perceivedType: Types.Type,
  ) {
    super(source, perceivedType)
  }
}
export class PropertyAccessOperator extends Operator {}
export class NullCoalescingPropertyAccessOperator extends Operator {}
export class ArrayAccessOperator extends Operator {}
export class NullCoalescingArrayAccessOperator extends Operator {}
export class FunctionInvocationOperator extends Operator {}

export class EnumCase extends Node {
  constructor(
    readonly source: Source,
    readonly name: string,
    readonly args: (PositionalArgument | NamedArgument)[],
  ) {
    super(source, Types.AlwaysType)
  }
}

export class EnumLookup extends Node {
  constructor(
    readonly source: Source,
    readonly name: string,
    readonly type: Types.Type,
  ) {
    super(source, type)
  }
}
