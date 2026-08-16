import type { Mark, Plot, Schema } from "../doc";
import type { Plugin, PluginKey } from "./plugin";
import { type Selection, TextSelection } from "./selection";
import { Transaction } from "./transaction";

export interface EditorStateConfig {
  schema: Schema;
  doc: Plot;
  selection?: Selection;
  plugins?: readonly Plugin<unknown>[];
}

export class EditorState {
  private constructor(
    readonly schema: Schema,
    readonly doc: Plot,
    readonly selection: Selection,
    readonly storedMarks: Mark.Set | null,
    readonly plugins: readonly Plugin<unknown>[],
    private readonly fields: ReadonlyMap<string, unknown>,
  ) {}

  get tr(): Transaction {
    return new Transaction(this);
  }

  pluginState(key: PluginKey<unknown>): unknown {
    return this.fields.get(key.name);
  }

  static create(config: EditorStateConfig): EditorState {
    const plugins = config.plugins ?? [];
    const selection = config.selection ?? TextSelection.atStart(config.doc);
    const base = new EditorState(config.schema, config.doc, selection, null, plugins, new Map());
    const fields = new Map<string, unknown>();
    for (const plugin of plugins) {
      if (plugin.spec.state && plugin.key) {
        fields.set(plugin.key.name, plugin.spec.state.init(base));
      }
    }
    return new EditorState(config.schema, config.doc, selection, null, plugins, fields);
  }

  apply(tr: Transaction): EditorState {
    const next = new EditorState(
      this.schema,
      tr.doc,
      tr.selection,
      tr.storedMarks,
      this.plugins,
      this.fields,
    );
    if (!this.plugins.length) return next;
    const fields = new Map(this.fields);
    for (const plugin of this.plugins) {
      if (plugin.spec.state && plugin.key) {
        const value = this.fields.get(plugin.key.name);
        fields.set(plugin.key.name, plugin.spec.state.apply(tr, value, this, next));
      }
    }
    return new EditorState(this.schema, tr.doc, tr.selection, tr.storedMarks, this.plugins, fields);
  }
}
