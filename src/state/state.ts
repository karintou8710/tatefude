import { type Mark, type Node, type Plot, Schema } from "../doc";
import { Configuration, type Extension, Facet, type Field } from "./facet";
import { Selection } from "./selection";
import { Transaction } from "./transaction";

/**
 * スキーマの部品を供給する facet。スキーマ自体を渡すのではなく、
 * ノード型・マーク型を extension として並べると、構成側でスキーマが組み上がる。
 *
 * ```ts
 * EditorState.create({ config: [basicSchema(), composition()] })
 * ```
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
    readonly storedMarks: Mark.Set | null,
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

  get tr(): Transaction {
    return new Transaction(this);
  }

  static create(spec: EditorStateSpec = {}): EditorState {
    const config = Configuration.resolve(spec.config ?? []);
    const schema = config.staticFacet(schemaElement);
    if (!schema) throw new Error("構成にスキーマの部品が無い (schemaElement を供給すること)");
    const doc = readDoc(schema, spec.doc);
    const selection = spec.selection ?? Selection.atStart(doc);

    // フィールドは並び順に作る。後のフィールドは前のフィールドを読める。
    const values = new Map<number, unknown>();
    let state = new EditorState(config, doc, selection, null, values);
    for (const field of config.fields) {
      values.set(field.id, field.spec.create(state));
      state = new EditorState(config, doc, selection, null, values);
    }
    return state;
  }

  apply(tr: Transaction): EditorState {
    // 追記の仕組み。Correction もここを通る。
    for (const extend of this.facet(Transaction.extender)) extend(tr);

    const values = new Map<number, unknown>();
    for (const field of this.config.fields) {
      values.set(field.id, field.spec.update(this.fieldValues.get(field.id), tr));
    }
    return new EditorState(this.config, tr.doc, tr.selection, tr.storedMarks, values);
  }
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
