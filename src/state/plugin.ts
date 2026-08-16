// 型の上でだけ view に依存する (ProseMirror が prosemirror-state から
// prosemirror-view の EditorProps を型参照しているのと同じ関係)。
import type { DecorationSet } from "../view/decoration";
import type { EditorView } from "../view/view";
import type { EditorState } from "./state";
import type { Transaction } from "./transaction";

export class PluginKey<T = unknown> {
  constructor(readonly name: string) {}

  getState(state: EditorState): T | undefined {
    return state.pluginState(this) as T | undefined;
  }
}

export interface PluginStateSpec<T> {
  init(state: EditorState): T;
  apply(tr: Transaction, value: T, oldState: EditorState, newState: EditorState): T;
}

export interface PluginProps {
  decorations?(state: EditorState): DecorationSet | null;
  handleKeyDown?(view: EditorView, event: KeyboardEvent): boolean;
  handleBeforeInput?(view: EditorView, event: InputEvent): boolean;
}

export interface PluginSpec<T> {
  key?: PluginKey<T>;
  state?: PluginStateSpec<T>;
  props?: PluginProps;
}

export class Plugin<T = unknown> {
  readonly key: PluginKey<T> | undefined;
  readonly props: PluginProps;

  constructor(readonly spec: PluginSpec<T>) {
    this.key = spec.key;
    this.props = spec.props ?? {};
    if (spec.state && !spec.key) {
      throw new Error("状態を持つプラグインには key が必要");
    }
  }
}
