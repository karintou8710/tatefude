import {
  deleteSelection,
  joinBackward,
  joinForward,
  splitBlock,
  toggleMark,
} from "../commands/base";
import type { EditorView } from "../view/view";

/**
 * EditContext が面倒を見てくれない入力をここで拾う。
 *
 * - Enter / Tab / 装飾は beforeinput しか来ない (EditContext は何もしない)
 * - 削除はブロックの内側なら EditContext が textupdate を投げるので、そのまま通す。
 *   ブロックの端と、ブロックを跨ぐ選択のときだけ自前で処理する。
 *
 * true を返すと呼び出し側が preventDefault し、EditContext 側の処理も止まる。
 */
export function handleBeforeInput(view: EditorView, event: InputEvent): boolean {
  const { state, dispatch } = view;
  switch (event.inputType) {
    case "insertParagraph":
      return splitBlock(state, dispatch);
    case "insertLineBreak":
      // 雛形には hard break が無いので握りつぶす (M1)
      return true;
    case "deleteContentBackward":
    case "deleteWordBackward":
      if (crossesBlocks(view)) return deleteSelection(state, dispatch);
      return joinBackward(state, dispatch);
    case "deleteContentForward":
    case "deleteWordForward":
      if (crossesBlocks(view)) return deleteSelection(state, dispatch);
      return joinForward(state, dispatch);
    case "formatBold":
      return toggleMark("strong")(state, dispatch);
    case "formatItalic":
      return toggleMark("em")(state, dispatch);
    default:
      return false;
  }
}

/** 選択が複数ブロックに跨っているか (跨いでいたら EditContext には任せられない) */
function crossesBlocks(view: EditorView): boolean {
  const { from, to, empty } = view.state.selection;
  if (empty) return false;
  const fromBlock = view.blockAt(from);
  const toBlock = view.blockAt(to);
  return !fromBlock || !toBlock || fromBlock !== toBlock;
}
