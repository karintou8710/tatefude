import type { EditorState } from "./state";
import type { Transaction } from "./transaction";

// facet = 複数の入力を 1 つの出力に畳む定義、extension = facet に値を供給するもの。
// CodeMirror と違い遅延 + 依存追跡はせず、フィールドは先に作り、facet は必要に
// なったときに計算してメモ化するだけ。雛形にはこれで足りる。

let nextID = 0;

export interface ExtensionHolder {
  extension: Extension;
}

export type Extension = ExtensionValue | ExtensionHolder | readonly Extension[];

/** @internal facet に値を供給するもの */
export class FacetProvider<Input> {
  constructor(
    // biome-ignore lint/suspicious/noExplicitAny: facet の型引数は供給側で閉じている
    readonly facet: Facet<Input, any>,
    readonly get: (state: EditorState) => readonly Input[],
    readonly isStatic: boolean,
  ) {}
}

export interface FacetSpec<Input, Output> {
  /** 省略すると入力の配列そのもの */
  combine?: (values: readonly Input[]) => Output;
  compare?: (a: Output, b: Output) => boolean;
  /** 状態に依存しない値だけを受け付ける (スキーマなど) */
  static?: boolean;
}

export class Facet<Input, Output = readonly Input[]> {
  readonly id = nextID++;
  readonly default: Output;

  private constructor(
    readonly combine: (values: readonly Input[]) => Output,
    readonly compare: (a: Output, b: Output) => boolean,
    readonly isStatic: boolean,
  ) {
    this.default = combine([]);
  }

  static define<Input, Output = readonly Input[]>(
    spec: FacetSpec<Input, Output> = {},
  ): Facet<Input, Output> {
    const combine = spec.combine ?? ((values: readonly Input[]) => values as unknown as Output);
    const compare = spec.compare ?? (spec.combine ? Object.is : sameArray);
    return new Facet<Input, Output>(
      combine,
      compare as (a: Output, b: Output) => boolean,
      !!spec.static,
    );
  }

  of(value: Input): Extension {
    return new FacetProvider<Input>(this, () => [value], true);
  }

  compute(get: (state: EditorState) => Input): Extension {
    if (this.isStatic) throw new Error("static な facet は compute できない");
    return new FacetProvider<Input>(this, (state) => [get(state)], false);
  }

  computeN(get: (state: EditorState) => readonly Input[]): Extension {
    if (this.isStatic) throw new Error("static な facet は compute できない");
    return new FacetProvider<Input>(this, get, false);
  }

  from<Value extends Input>(field: Field<Value>): Extension;
  from<Value>(field: Field<Value>, get: (value: Value) => Input): Extension;
  from<Value>(field: Field<Value>, get?: (value: Value) => Input): Extension {
    const read = get ?? ((value: Value) => value as unknown as Input);
    return this.compute((state) => read(state.field(field)));
  }
}

export interface FieldSpec<Value> {
  create(state: EditorState): Value;
  update(value: Value, tr: Transaction): Value;
  compare?(a: Value, b: Value): boolean;
  provide?(field: Field<Value>): Extension;
}

export class Field<Value> {
  readonly id = nextID++;
  readonly provides: Extension | undefined;

  private constructor(readonly spec: FieldSpec<Value>) {
    this.provides = spec.provide?.(this);
  }

  static define<Value>(spec: FieldSpec<Value>): Field<Value> {
    return new Field(spec);
  }

  compare(a: Value, b: Value): boolean {
    return (this.spec.compare ?? Object.is)(a, b);
  }
}

// biome-ignore lint/suspicious/noExplicitAny: extension の実体はこの 2 つ
type ExtensionValue = FacetProvider<any> | Field<any>;

/** extension の木を畳んで、フィールドと facet の供給元を集めたもの */
export class Configuration {
  private constructor(
    // biome-ignore lint/suspicious/noExplicitAny: id をキーにした寄せ集め
    readonly fields: readonly Field<any>[],
    // biome-ignore lint/suspicious/noExplicitAny: 同上
    private readonly providers: ReadonlyMap<number, FacetProvider<any>[]>,
  ) {}

  static resolve(extension: Extension): Configuration {
    // biome-ignore lint/suspicious/noExplicitAny: 収集用
    const fields: Field<any>[] = [];
    // biome-ignore lint/suspicious/noExplicitAny: 収集用
    const providers = new Map<number, FacetProvider<any>[]>();
    const seen = new Set<unknown>();

    const flatten = (ext: Extension): void => {
      if (Array.isArray(ext)) {
        for (const child of ext as readonly Extension[]) flatten(child);
        return;
      }
      if (seen.has(ext)) return;
      seen.add(ext);
      if (ext instanceof FacetProvider) {
        const list = providers.get(ext.facet.id);
        if (list) list.push(ext);
        else providers.set(ext.facet.id, [ext]);
        return;
      }
      if (ext instanceof Field) {
        fields.push(ext);
        if (ext.provides) flatten(ext.provides);
        return;
      }
      flatten((ext as ExtensionHolder).extension);
    };

    flatten(extension);
    return new Configuration(fields, providers);
  }

  // biome-ignore lint/suspicious/noExplicitAny: facet の入力型は供給元が持っている
  providersFor(facet: Facet<any, any>): readonly FacetProvider<any>[] {
    return this.providers.get(facet.id) ?? [];
  }

  /** 状態を作る前に読めるのは static な facet だけ */
  // biome-ignore lint/suspicious/noExplicitAny: 入力型は供給元が持っている
  staticFacet<Output>(facet: Facet<any, Output>): Output {
    const providers = this.providersFor(facet);
    if (!providers.length) return facet.default;
    const values: unknown[] = [];
    for (const provider of providers) {
      if (!provider.isStatic) throw new Error("static でない値が static facet に供給されている");
      // static な供給元は状態を見ないので、引数は使われない
      values.push(...provider.get(null as unknown as EditorState));
    }
    return facet.combine(values);
  }
}

function sameArray(a: unknown, b: unknown): boolean {
  const x = a as readonly unknown[];
  const y = b as readonly unknown[];
  return x === y || (x.length === y.length && x.every((value, i) => value === y[i]));
}
