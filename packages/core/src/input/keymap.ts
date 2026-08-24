import {
  type Command,
  chainCommands,
  deleteAcrossBlocks,
  joinBackward,
  joinForward,
  liftEmptyBlock,
  selectAll,
  splitBlock,
} from "../commands/base";
import { Facet } from "../state/facet";
import type { EditorView } from "../view/view";
import { handleArrow } from "./arrow";

export interface KeyBinding {
  /**
   * `"Mod-b"` `"Mod-Shift-z"` `"Tab"` `"Enter"`。
   * `Mod` は mac なら Meta、他は Ctrl。`Ctrl` はどの OS でも物理の Ctrl (mac の Ctrl-H など)。
   */
  key: string;
  run: Command;
}

/**
 * 拡張が持ち込むキー割り当て。`baseKeymap` より先に試される。
 * コマンドが false を返せば次へ落ちるので、同じキーに条件違いを重ねられる。
 */
export const keymap: Facet<readonly KeyBinding[]> = Facet.define<readonly KeyBinding[]>();

const isMac = typeof navigator !== "undefined" && /Mac|iP(hone|ad|od)/.test(navigator.userAgent);

/** 構成に何も足さなくても効く割り当て。history が無い構成では undo が false を返すだけ */
const baseKeymap: readonly KeyBinding[] = [
  // ブラウザに任せるとフォーカス中のブロックだけになるので取り上げる
  { key: "Mod-a", run: selectAll },
  // 空のブロックなら親から出る。出られなければいつも通り割る
  { key: "Enter", run: chainCommands(liftEmptyBlock, splitBlock) },
  // 削除は**ブロックの境界だけ**引き受ける。当てはまらなければ false を返して落ちるので、
  // preventDefault されず、ブロックの中の削除はこれまで通り EditContext が処理する。
  // 語や行の単位で消すキーも、境界に立っていれば結合になるのは同じなので同じコマンドでよい
  ...deleteBindings("Backspace", chainCommands(deleteAcrossBlocks, joinBackward)),
  ...deleteBindings("Delete", chainCommands(deleteAcrossBlocks, joinForward)),
];

/**
 * 削除 1 つぶんの割り当て。OS ごとに単位を変えるキーがあるので、素のキーと修飾つきを並べる。
 * mac の Ctrl-H / Ctrl-D は他の OS では削除ではないので、mac のときだけ足す。
 */
function deleteBindings(key: string, run: Command): KeyBinding[] {
  const emacs = key === "Backspace" ? "Ctrl-h" : "Ctrl-d";
  return [
    { key, run },
    { key: `Mod-${key}`, run },
    { key: `Alt-${key}`, run },
    ...(isMac ? [{ key: emacs, run }] : []),
  ];
}

function matches(binding: string, event: KeyboardEvent): boolean {
  const parts = binding.split("-");
  const key = parts.pop() ?? "";
  let mod = false;
  let ctrl = false;
  let shift = false;
  let alt = false;
  for (const part of parts) {
    if (part === "Mod") mod = true;
    else if (part === "Ctrl") ctrl = true;
    else if (part === "Shift") shift = true;
    else if (part === "Alt") alt = true;
    else return false;
  }
  // Mod は mac なら Meta、他は Ctrl。Ctrl はどの OS でも物理の Ctrl。
  // 書いていない修飾が押されていたら横取りしない
  if (event.metaKey !== (isMac && mod)) return false;
  if (event.ctrlKey !== (isMac ? ctrl : mod || ctrl)) return false;
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
