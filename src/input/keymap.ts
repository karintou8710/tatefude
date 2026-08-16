import { toggleMark } from "../commands/base";
import type { EditorView } from "../view/view";
import { handleBoundaryArrow } from "./boundary";

const isMac = typeof navigator !== "undefined" && /Mac|iP(hone|ad|od)/.test(navigator.userAgent);

/**
 * keydown で拾うもの。
 *
 * 文字入力・IME・ブロック内の削除は EditContext が処理するので、ここには来ない前提。
 * true を返すと preventDefault する。
 */
export function handleKeyDown(view: EditorView, event: KeyboardEvent): boolean {
  const mod = isMac ? event.metaKey : event.ctrlKey;
  if (mod && !event.altKey) {
    const key = event.key.toLowerCase();
    if (key === "b") return toggleMark("strong")(view.state, view.dispatch);
    if (key === "i") return toggleMark("em")(view.state, view.dispatch);
  }
  return handleBoundaryArrow(view, event);
}
