import { Facet } from "../state/facet";
import type { EditorState } from "../state/state";
import type { Transaction } from "../state/transaction";
import type { EditorView } from "./view";

/** 機能はこれらに値を供給する extension として足す */

/** true を返すと preventDefault される */
export const handleKeyDown: Facet<(view: EditorView, event: KeyboardEvent) => boolean> =
  Facet.define<(view: EditorView, event: KeyboardEvent) => boolean>();

/** true を返すと preventDefault される */
export const handleBeforeInput: Facet<(view: EditorView, event: InputEvent) => boolean> =
  Facet.define<(view: EditorView, event: InputEvent) => boolean>();

export interface ViewUpdate {
  view: EditorView;
  state: EditorState;
  prevState: EditorState;
  /** dispatch 経由なら元のトランザクション。`updateState` 直呼びでは null */
  tr: Transaction | null;
  docChanged: boolean;
  selectionChanged: boolean;
}

/**
 * state が押し出された後に呼ばれる。`dispatchTransaction` は 1 つしか無いので、
 * 購読はこちらでやる (アダプタが利用側から唯一の口を奪わないため)。
 */
export const updateListener: Facet<(update: ViewUpdate) => void> =
  Facet.define<(update: ViewUpdate) => void>();
