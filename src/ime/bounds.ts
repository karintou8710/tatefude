import type { BlockView } from "../view/block-view";
import { blockOffsetRange, caretRectAt, characterRects } from "../view/coords";

/** IME の候補ウィンドウの基準になる、編集領域の矩形 */
export function controlBoundsFor(block: BlockView): DOMRect {
  return block.dom.getBoundingClientRect();
}

/** キャレット / 選択の矩形 */
export function selectionBoundsFor(block: BlockView, start: number, end: number): DOMRect {
  if (start === end) return caretRectAt(block.contentDOM, start);
  const rect = blockOffsetRange(block.contentDOM, start, end).getBoundingClientRect();
  return rect.width || rect.height ? rect : caretRectAt(block.contentDOM, start);
}

/** characterboundsupdate に返す 1 文字ずつの矩形 */
export function characterBoundsFor(block: BlockView, from: number, to: number): DOMRect[] {
  return characterRects(block.contentDOM, from, to);
}
