import type { Mark } from "../doc";
import { Mapping } from "../transform/mapping";
import type { Step } from "../transform/step";
import { Transform } from "../transform/transform";
import type { PluginKey } from "./plugin";
import type { Selection } from "./selection";
import type { EditorState } from "./state";

/** ドキュメントの変更 + 選択・マーク・メタ情報をまとめた 1 回分の更新 */
export class Transaction extends Transform {
  private curSelection: Selection;
  /** curSelection がどこまでのステップを反映しているか */
  private curSelectionFor = 0;
  private selectionExplicit = false;
  private readonly metaMap = new Map<string, unknown>();

  storedMarks: Mark.Set | null;

  constructor(state: EditorState) {
    super(state.schema, state.doc);
    this.curSelection = state.selection;
    this.storedMarks = state.storedMarks;
  }

  /** ステップの分だけ写像した選択 */
  get selection(): Selection {
    if (this.curSelectionFor < this.steps.length) {
      const rest = new Mapping(this.mapping.maps.slice(this.curSelectionFor));
      this.curSelection = this.curSelection.map(this.doc, rest);
      this.curSelectionFor = this.steps.length;
    }
    return this.curSelection;
  }

  get selectionSet(): boolean {
    return this.selectionExplicit;
  }

  setSelection(selection: Selection): this {
    this.curSelection = selection;
    this.curSelectionFor = this.steps.length;
    this.selectionExplicit = true;
    this.storedMarks = null;
    return this;
  }

  setStoredMarks(marks: Mark.Set | null): this {
    this.storedMarks = marks;
    return this;
  }

  override step(step: Step): this {
    // selection ゲッターが写像し直せるように、ステップを積むだけ
    return super.step(step);
  }

  setMeta(key: string | PluginKey<unknown>, value: unknown): this {
    this.metaMap.set(typeof key === "string" ? key : key.name, value);
    return this;
  }

  getMeta(key: string | PluginKey<unknown>): unknown {
    return this.metaMap.get(typeof key === "string" ? key : key.name);
  }

  /** 現在の選択を text で置き換える */
  insertTextAtSelection(text: string): this {
    const { from, to } = this.selection;
    const marks = this.storedMarks ?? this.selection.$from.marks();
    return this.replaceWithText(from, to, text, marks);
  }
}
