import type { TextblockView } from "../view/block-view";
import { blockOffsetRange, caretRectAt, characterRects } from "../view/coords";

/** IME の候補ウィンドウの基準になる */
export function controlBoundsFor(block: TextblockView): DOMRect {
  return block.dom.getBoundingClientRect();
}

export function selectionBoundsFor(block: TextblockView, start: number, end: number): DOMRect {
  if (start === end) return caretRectAt(block.contentDOM, start);
  const rect = blockOffsetRange(block.contentDOM, start, end).getBoundingClientRect();
  return rect.width || rect.height ? rect : caretRectAt(block.contentDOM, start);
}

/** characterboundsupdate に返す */
export function characterBoundsFor(block: TextblockView, from: number, to: number): DOMRect[] {
  return characterRects(block.contentDOM, from, to);
}
