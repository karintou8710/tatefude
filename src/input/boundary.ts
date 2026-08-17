import type { TextblockView } from "../view/block-view";
import {
  caretPointFromCoords,
  caretRectAt,
  domPointToBlockOffset,
  writingModeOf,
} from "../view/coords";
import type { EditorView } from "../view/view";

/**
 * 隣のブロックに入るならどこに着地するか。隣が無ければ null。
 *
 * ブロックごとに EditContext を張ると 1 つずつが独立した編集領域になるので、境界を越える
 * 移動はブラウザがやってくれない。`along` はインライン方向の目標座標で、行を跨ぐ移動の
 * ときだけ渡す。
 */
export function crossToAdjacentBlock(
  view: EditorView,
  index: number,
  backward: boolean,
  along: number | null,
): number | null {
  const target = view.textblocks[backward ? index - 1 : index + 1];
  if (!target) return null;
  return positionInBlock(target, backward, along);
}

/** インライン方向の座標 (横書きなら x、縦書きなら y) */
export function alongOf(block: TextblockView, offset: number): number {
  const caret = caretRectAt(block.contentDOM, offset);
  return writingModeOf(block.contentDOM).vertical ? caret.top : caret.left;
}

/** `backward` が true なら移動先の末尾側 (ブロック方向の終わり) に入る */
function positionInBlock(target: TextblockView, backward: boolean, along: number | null): number {
  const fallback = backward ? target.contentTo : target.contentFrom;
  if (along == null) return fallback;

  const { vertical, blockForwardIsPositive } = writingModeOf(target.contentDOM);
  const box = target.dom.getBoundingClientRect();
  const atBlockEnd = backward;
  const wantPositiveEdge = blockForwardIsPositive ? atBlockEnd : !atBlockEnd;
  const blockCoord = vertical
    ? wantPositiveEdge
      ? box.right - 2
      : box.left + 2
    : wantPositiveEdge
      ? box.bottom - 2
      : box.top + 2;

  const x = vertical ? blockCoord : along;
  const y = vertical ? along : blockCoord;
  const offset = offsetAtPoint(target.contentDOM, x, y);
  return offset == null ? fallback : target.text.offsetToPos(offset);
}

function offsetAtPoint(blockDOM: HTMLElement, x: number, y: number): number | null {
  const point = caretPointFromCoords(x, y);
  if (!point || !blockDOM.contains(point.node)) return null;
  return domPointToBlockOffset(blockDOM, point.node, point.offset);
}
