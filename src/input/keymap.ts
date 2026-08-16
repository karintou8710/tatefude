import { type Command, selectAll, splitBlock, toggleMark } from "../commands/base";
import type { EditorView } from "../view/view";
import { handleBoundaryArrow } from "./boundary";

function run(view: EditorView, command: Command): boolean {
  const spec = command(view.state);
  if (!spec) return false;
  view.dispatch(spec);
  return true;
}

const isMac = typeof navigator !== "undefined" && /Mac|iP(hone|ad|od)/.test(navigator.userAgent);

/**
 * keydown は EditContext と無関係にすべてのキーで飛ぶ。true を返すと preventDefault され、
 * beforeinput も EditContext も止まるので、扱うキーは絞る。特に Backspace / Delete は
 * 入れない — ブロックの内側の削除まで EditContext から奪ってしまう。
 */
export function handleKeyDown(view: EditorView, event: KeyboardEvent): boolean {
  // 変換中のキーは IME のもの。EditContext 経路では event.isComposing が当てにならないので、
  // EditContext から受けた compositionstart / compositionend を見る (ime/manager.ts)
  if (view.ime.composing) return false;
  const mod = isMac ? event.metaKey : event.ctrlKey;
  if (mod && !event.altKey) {
    const key = event.key.toLowerCase();
    // Mark.define に渡した型名。要素名ではない
    if (key === "b") return run(view, toggleMark("Strong"));
    if (key === "i") return run(view, toggleMark("Emphasis"));
    // ブラウザに任せるとフォーカス中のブロックだけになるので取り上げる
    if (key === "a") return run(view, selectAll);
  }
  // Shift-Enter は hard break の意図なので beforeinput へ流す
  if (
    event.key === "Enter" &&
    !event.shiftKey &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey
  ) {
    // 変換を確定させた Enter がここまで届くことがある。改行の意図ではないので捨てる
    if (view.ime.endedCompositionRecently(event)) return true;
    return run(view, splitBlock);
  }
  return handleBoundaryArrow(view, event);
}
