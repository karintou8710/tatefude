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
 * **keydown は EditContext と無関係にすべてのキーで飛ぶ**。文字入力も、IME 変換中も
 * (keyCode 229 / `key === "Process"`)、ブロック内の削除も、まずここに来る。
 * それらを EditContext に任せているだけで、来ていないわけではない。
 *
 * true を返すと呼び出し側が preventDefault し、**beforeinput も EditContext の処理も
 * 止まる**。ここは握り潰す力が一番強い場所なので、扱うキーは絞ること。
 */
export function handleKeyDown(view: EditorView, event: KeyboardEvent): boolean {
  // 変換中のキーは IME のもの。ここで止めると変換の操作を奪ってしまう。
  if (event.isComposing) return false;
  const mod = isMac ? event.metaKey : event.ctrlKey;
  if (mod && !event.altKey) {
    const key = event.key.toLowerCase();
    if (key === "b") return run(view, toggleMark("strong"));
    if (key === "i") return run(view, toggleMark("em"));
  }
  return handleBoundaryArrow(view, event);
}
