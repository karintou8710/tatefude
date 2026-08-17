import {
  type Command,
  chainCommands,
  liftEmptyBlock,
  selectAll,
  splitBlock,
  toggleMark,
} from "../commands/base";
import { Facet } from "../state/facet";
import { redo, undo } from "../state/history";
import type { EditorView } from "../view/view";
import { handleArrow } from "./arrow";

export interface KeyBinding {
  /** `"Mod-b"` `"Mod-Shift-z"` `"Tab"` `"Enter"`。Mod は mac なら Meta、他は Ctrl */
  key: string;
  run: Command;
}

/**
 * 拡張が持ち込むキー割り当て。`baseKeymap` より**先に**試されるので、既定を上書きできる。
 *
 * コマンドが false を返せば次の割り当てへ落ちるので、同じキーに条件違いの割り当てを
 * 重ねられる (`keymap.of([{ key: "Tab", run: setLine }])` を地の文のときだけ効かせる等)。
 */
export const keymap: Facet<readonly KeyBinding[]> = Facet.define<readonly KeyBinding[]>();

const isMac = typeof navigator !== "undefined" && /Mac|iP(hone|ad|od)/.test(navigator.userAgent);

/** 構成に何も足さなくても効く割り当て。history が無い構成では undo が false を返すだけ */
const baseKeymap: readonly KeyBinding[] = [
  // Mark.define に渡した型名。要素名ではない
  { key: "Mod-b", run: toggleMark("Strong") },
  { key: "Mod-i", run: toggleMark("Emphasis") },
  // ブラウザに任せるとフォーカス中のブロックだけになるので取り上げる
  { key: "Mod-a", run: selectAll },
  { key: "Mod-z", run: undo },
  // Mod-Shift-Z は mac、Mod-Y は Windows の流儀
  { key: "Mod-Shift-z", run: redo },
  { key: "Mod-y", run: redo },
  // 空のブロックなら親から出る。出られなければいつも通り割る。
  // Shift-Enter は hard break の意図なので、ここでは拾わず beforeinput へ流す
  { key: "Enter", run: chainCommands(liftEmptyBlock, splitBlock) },
];

function matches(binding: string, event: KeyboardEvent): boolean {
  const parts = binding.split("-");
  const key = parts.pop() ?? "";
  let mod = false;
  let shift = false;
  let alt = false;
  for (const part of parts) {
    if (part === "Mod") mod = true;
    else if (part === "Shift") shift = true;
    else if (part === "Alt") alt = true;
    else return false;
  }
  // mac の Ctrl / それ以外の Meta は Mod ではない。押されていたら横取りしない
  if (isMac ? event.ctrlKey : event.metaKey) return false;
  if (mod !== (isMac ? event.metaKey : event.ctrlKey)) return false;
  if (shift !== event.shiftKey) return false;
  if (alt !== event.altKey) return false;
  return event.key.toLowerCase() === key.toLowerCase();
}

/**
 * keydown は EditContext と無関係にすべてのキーで飛ぶ。true を返すと preventDefault され、
 * beforeinput も EditContext も止まるので、扱うキーは絞る。特に Backspace / Delete は
 * 入れない — ブロックの内側の削除まで EditContext から奪ってしまう。
 */
export function handleKeyDown(view: EditorView, event: KeyboardEvent): boolean {
  // 変換中のキーは IME のもの。EditContext 経路では event.isComposing が当てにならないので、
  // EditContext から受けた compositionstart / compositionend を見る (ime/manager.ts)
  if (view.ime.composing) return false;
  // 変換を確定させた Enter がここまで届くことがある。改行の意図ではないので捨てる
  if (event.key === "Enter" && !event.shiftKey && view.ime.endedCompositionRecently(event)) {
    return true;
  }

  for (const bindings of [...view.state.facet(keymap), baseKeymap]) {
    for (const binding of bindings) {
      if (matches(binding.key, event) && view.run(binding.run)) return true;
    }
  }
  return handleArrow(view, event);
}
