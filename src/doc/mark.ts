import { SchemaError } from "./error";
import { compareDeep, eqArray, none } from "./helper";
import type { Node } from "./node";
import type { Shape } from "./shape";

class MarkType<Value = unknown> {
  readonly rank: number;
  readonly default: Mark<Value> | null;
  readonly inclusive: boolean;
  readonly spanning: boolean;
  readonly keepOnSplit: boolean;
  /** どのノードに付けられるか。省略時はインライン全部。 */
  readonly target: Node.Query | undefined;

  // biome-ignore lint/suspicious/noExplicitAny: 型の分散をそろえるため (node.ts と同じ理由)
  readonly spec: Mark.Spec<any>;

  private constructor(
    readonly name: string,
    spec: Mark.Spec<Value>,
    isFlag: boolean,
  ) {
    this.spec = spec;
    this.rank = Math.max(0, Math.min(spec.rank ?? 100, 100));
    this.inclusive = spec.inclusive !== false;
    this.keepOnSplit = spec.keepOnSplit !== false;
    this.target = spec.target;
    this.default =
      isFlag || "defaultValue" in spec
        ? Mark.create(this, isFlag ? (null as Value) : (spec.defaultValue as Value))
        : null;
    // 要素で描くマークは既定でまたがれる。属性で描くマークは明示したときだけ。
    this.spanning = this.isElement ? spec.spanning !== false : !!spec.spanning;
  }

  static define<Value>(name: string, spec: Mark.Spec<Value>, isFlag = false): MarkType<Value> {
    return new MarkType(name, spec, isFlag);
  }

  of(value: Value): Mark<Value> {
    return Mark.create(this, value);
  }

  /** rank が小さいほど内側。同 rank は名前で決める */
  compareRank(other: MarkType): number {
    return this.rank - other.rank || (other.name < this.name ? 1 : -1);
  }

  isInSet(set: Mark.Set): Mark<Value> | null {
    return (set.find((mark) => mark.type === this) as Mark<Value> | undefined) ?? null;
  }

  removeFromSet(set: Mark.Set): Mark.Set {
    const index = set.findIndex((mark) => mark.type === this);
    return index < 0 ? set : set.filter((_, i) => i !== index);
  }

  get isElement(): boolean {
    return "element" in this.spec.shape;
  }
}

/**
 * 値を持たないマーク (強調など) は型ごとに 1 つの実体を使い回す。集合は rank の昇順なので、
 * 同じ組み合わせなら常に同じ並びになる。
 */
export class Mark<Value = unknown> {
  static readonly none: Mark.Set = none;
  static readonly Type = MarkType;

  private constructor(
    readonly type: MarkType<Value>,
    readonly value: Value,
  ) {}

  /** @internal */
  static create<Value>(type: MarkType<Value>, value: Value): Mark<Value> {
    return new Mark(type, value);
  }

  get name(): string {
    return this.type.name;
  }
  get rank(): number {
    return this.type.rank;
  }

  // biome-ignore lint/suspicious/noExplicitAny: Mark<Value> 同士を比べられるようにするため
  eq(other: Mark<any>): boolean {
    return this.type === other.type && compareDeep(this.value, other.value);
  }

  /** 同じ型のマークは置き換える */
  addToSet(set: Mark.Set): Mark.Set {
    let placed = false;
    const result: Mark[] = [];
    for (const other of set) {
      if (this.eq(other)) return set;
      if (other.type === this.type) continue;
      if (!placed && this.type.compareRank(other.type) < 0) {
        result.push(this);
        placed = true;
      }
      result.push(other);
    }
    if (!placed) result.push(this);
    return result;
  }

  removeFromSet(set: Mark.Set): Mark.Set {
    const index = set.findIndex((mark) => mark.eq(this));
    return index < 0 ? set : set.filter((_, i) => i !== index);
  }

  isInSet(set: Mark.Set): Mark<Value> | null {
    return (set.find((mark) => mark.eq(this)) as Mark<Value> | undefined) ?? null;
  }

  toJSON(): { name: string; value: unknown } {
    return { name: this.name, value: this.value };
  }

  toString(): string {
    return this.value == null ? this.name : `${this.name}=${JSON.stringify(this.value)}`;
  }

  static sameSet(a: Mark.Set, b: Mark.Set): boolean {
    return eqArray(a, b);
  }

  static define(name: string, spec: Mark.Spec<null>): Mark<null> {
    const type = MarkType.define<null>(name, spec, true);
    if (!type.default) throw new SchemaError(`Mark ${name} has no default value`);
    return type.default;
  }
}

export namespace Mark {
  export type Set = readonly Mark[];

  export type Type<Value = unknown> = MarkType<Value>;

  export interface Spec<Value> {
    /** 小さいほど内側 */
    rank?: number;
    /** 付けられるノードの範囲。省略時はインライン全部。 */
    target?: Node.Query;
    /** 端にキャレットがあるとき、このマークを引き継ぐか */
    inclusive?: boolean;
    /** 複数ノードにまたがって 1 要素で描いてよいか */
    spanning?: boolean;
    /** ブロックを分割したとき、後ろのブロックにも残すか */
    keepOnSplit?: boolean;
    defaultValue?: Value;
    shape: Shape.Mark<Value>;
    validate?: (value: Value) => void;
  }
}
