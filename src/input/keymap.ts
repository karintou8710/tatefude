import { type Command, toggleMark } from "../commands/base";
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
 * keydown で拾うもの。
 *
 * 文字入力・IME・ブロック内の削除は EditContext が処理するので、ここには来ない前提。
 * true を返すと preventDefault する。
 */
export function handleKeyDown(view: EditorView, event: KeyboardEvent): boolean {
  const mod = isMac ? event.metaKey : event.ctrlKey;
  if (mod && !event.altKey) {
    const key = event.key.toLowerCase();
    if (key === "b") return run(view, toggleMark("strong"));
    if (key === "i") return run(view, toggleMark("em"));
  }
  return handleBoundaryArrow(view, event);
}
