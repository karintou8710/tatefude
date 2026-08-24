import { Pos } from "../doc";
import type { EditorState } from "./state";

// state を読むだけの問い合わせ。コマンドの入口に置く条件はだいたいここに集まる。
// Command と同じく state しか受けないので、描画を持たない場所からも使える。

/** キャレットのいる親がテキストブロックか。インラインを置ける場所かの判定 */
export function inTextblock(state: EditorState): boolean {
  return state.selection.$from.parent.isTextblock;
}

/** 空のキャレットがテキストブロックの先頭にあるか。手前と繋げる操作の前提 */
export function atTextblockStart(state: EditorState): boolean {
  const { empty, from, $from } = state.selection;
  return empty && $from.parent.isTextblock && from === $from.start($from.depth);
}

/** 空のキャレットがテキストブロックの末尾にあるか。後ろと繋げる操作の前提 */
export function atTextblockEnd(state: EditorState): boolean {
  const { empty, from, $from } = state.selection;
  return empty && $from.parent.isTextblock && from === $from.end($from.depth);
}

/**
 * 選択が 2 つ以上のテキストブロックに跨るか。
 * EditContext のバッファはブロックの中で閉じているので、跨ぐ範囲はそこでは表せない。
 */
export function crossesTextblocks(state: EditorState): boolean {
  const { from, to, empty } = state.selection;
  if (empty) return false;
  const start = Pos.resolve(state.doc, from).textblockStart();
  return start == null || start !== Pos.resolve(state.doc, to).textblockStart();
}
