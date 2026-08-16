import { ChangeSet, type ChangeSpec, fitChange, type Node, type Plot, Schema } from "../doc";
import { Configuration, type Extension, Facet, type Field } from "./facet";
import { Selection } from "./selection";
import { Transaction, type TransactionSpec } from "./transaction";

/**
 * スキーマの部品を供給する facet。スキーマ自体を渡すのではなく、
 * ノード型・マーク型を extension として並べると、構成側でスキーマが組み上がる。
 */
export const schemaElement: Facet<Schema.Element, Schema | null> = Facet.define<
  Schema.Element,
  Schema | null
>({
  combine: (elements) => (elements.length ? Schema.define(elements) : null),
  static: true,
});

export type DocSource = Plot | Node.JSON | ((schema: Schema) => Plot);

export interface EditorStateSpec {
  /** ドキュメント。JSON か、スキーマを受け取る関数でもよい */
  doc?: DocSource;
  selection?: Selection;
  /** extension の並び */
  config?: Extension;
}

export class EditorState {
  private readonly facetCache = new Map<number, unknown>();

  private constructor(
    readonly config: Configuration,
    readonly doc: Plot,
    readonly selection: Selection,
    private readonly fieldValues: ReadonlyMap<number, unknown>,
  ) {}

  get schema(): Schema {
    const schema = this.config.staticFacet(schemaElement);
    if (!schema) throw new Error("構成にスキーマの部品が無い");
    return schema;
  }

  /** facet の値を読む。static でなければ、この状態で計算してメモ化する。 */
  // biome-ignore lint/suspicious/noExplicitAny: 入力型は供給側で閉じている
  facet<Output>(facet: Facet<any, Output>): Output {
    if (facet.isStatic) return this.config.staticFacet(facet);
    const cached = this.facetCache.get(facet.id);
    if (cached !== undefined) return cached as Output;
    const values: unknown[] = [];
    for (const provider of this.config.providersFor(facet)) values.push(...provider.get(this));
    const output = facet.combine(values);
    this.facetCache.set(facet.id, output);
    return output;
  }

  field<Value>(field: Field<Value>): Value {
    if (!this.fieldValues.has(field.id)) {
      throw new RangeError("そのフィールドは構成に含まれていない");
    }
    return this.fieldValues.get(field.id) as Value;
  }

  static create(spec: EditorStateSpec = {}): EditorState {
    const config = Configuration.resolve(spec.config ?? []);
    const schema = config.staticFacet(schemaElement);
    if (!schema) throw new Error("構成にスキーマの部品が無い (schemaElement を供給すること)");
    const doc = readDoc(schema, spec.doc);
    const selection = spec.selection ?? Selection.atStart(doc);

    // フィールドは並び順に作る。後のフィールドは前のフィールドを読める。
    const values = new Map<number, unknown>();
    let state = new EditorState(config, doc, selection, values);
    for (const field of config.fields) {
      values.set(field.id, field.spec.create(state));
      state = new EditorState(config, doc, selection, values);
    }
    return state;
  }

  /**
   * 更新の指定から {@link Transaction} を作る。適用した状態は `tr.state`。
   *
   * `Transaction.extender` を通すので、{@link correction} などの追記もここで入る。
   */
  update(spec: TransactionSpec): Transaction {
    let changes = resolveChanges(this.schema, this.doc, this.doc, spec.changes);
    const annotations = [...asArray(spec.annotations)];
    const effects = [...asArray(spec.effects)];
    if (spec.userEvent) annotations.push(Transaction.userEvent.of(spec.userEvent));
    let selectionSpec = spec.selection;

    // 追記の仕組み。返ってきた spec の位置は、その時点の doc の座標。
    for (const extend of this.facet(Transaction.extender)) {
      const preliminary = this.buildTransaction(changes, annotations, effects, selectionSpec);
      const extra = extend(preliminary);
      if (!extra) continue;
      const base = changes.apply(this.doc);
      const added = resolveChanges(this.schema, base, base, extra.changes);
      changes = changes.compose(added);
      annotations.push(...asArray(extra.annotations));
      effects.push(...asArray(extra.effects));
      if (extra.userEvent) annotations.push(Transaction.userEvent.of(extra.userEvent));
      if (extra.selection) selectionSpec = extra.selection;
    }

    return this.buildTransaction(changes, annotations, effects, selectionSpec);
  }

  private buildTransaction(
    changes: ChangeSet,
    // biome-ignore lint/suspicious/noExplicitAny: 注釈と効果は型ごとに値が違う
    annotations: readonly any[],
    // biome-ignore lint/suspicious/noExplicitAny: 同上
    effects: readonly any[],
    selectionSpec: TransactionSpec["selection"],
  ): Transaction {
    const newDoc = changes.apply(this.doc);
    this.schema.validate(newDoc);
    const selection =
      (typeof selectionSpec === "function"
        ? selectionSpec(newDoc, changes)
        : (selectionSpec ?? null)) ?? this.selection.map(newDoc, changes);
    return new Transaction(this, changes, newDoc, selection, annotations, effects);
  }

  /** @internal `tr.state` から呼ばれる */
  applyTransaction(tr: Transaction): EditorState {
    const values = new Map<number, unknown>();
    const next = new EditorState(this.config, tr.newDoc, tr.selection, values);
    for (const field of this.config.fields) {
      values.set(field.id, field.spec.update(this.fieldValues.get(field.id), tr));
    }
    return next;
  }
}

function asArray<T>(value: T | readonly T[] | undefined): readonly T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? (value as readonly T[]) : [value as T];
}

/**
 * 変更の指定を ChangeSet にする。
 * `fit` が立っている指定は、木として成立する形に直してから使う。
 */
function resolveChanges(
  schema: Schema,
  doc: Plot,
  current: Plot,
  spec: ChangeSpec | readonly ChangeSpec[] | undefined,
): ChangeSet {
  if (!spec) return ChangeSet.empty(doc.contentLength);
  const list = (Array.isArray(spec) ? spec : [spec]) as readonly ChangeSpec[];
  let changes = ChangeSet.empty(doc.contentLength);
  let base = current;
  for (const one of list) {
    const from = changes.mapPos(one.from, -1);
    const to = changes.mapPos(one.to ?? one.from, 1);
    const mapped = { ...one, from, to };
    const next = one.fit
      ? fitChange(schema, base, mapped)
      : ChangeSet.of(mapped, base.contentLength);
    changes = changes.compose(next);
    base = next.apply(base);
  }
  return changes;
}

function readDoc(schema: Schema, source: DocSource | undefined): Plot {
  if (!source) return schema.doc([schema.defaultBlock.create([])]);
  if (typeof source === "function") return source(schema);
  if (typeof (source as Plot).isPlot === "boolean") {
    const doc = source as Plot;
    schema.validate(doc);
    return doc;
  }
  return schema.docFromJSON(source as Node.JSON);
}
