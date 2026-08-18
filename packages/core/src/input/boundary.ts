import { type Plot, Pos } from "../doc";
import type { TextblockView } from "../view/block-view";
import { caretPointFromCoords, writingModeOf } from "../view/coords";
import { caretRectFor, domPointToBlockPos } from "../view/dom-point";
import type { EditorView } from "../view/view";

/**
 * 隣のブロックに入るならどこに着地するか。隣が無ければ null。
 * ブロックごとに EditContext を張ると独立した編集領域になり、境界越えは自前になる。
 * `along` は行を跨ぐ移動のときだけ渡すインライン方向の目標座標。
 */
export function crossToAdjacentBlock(
  view: EditorView,
  index: number,
  backward: boolean,
  along: number | null,
): number | null {
  const target = view.textblocks[backward ? index - 1 : index + 1];
  if (!target) return null;
  return positionInBlock(view.state.doc, target, backward, along);
}

/**
 * インライン方向の座標。位置で受けるのは、オフセットに畳むと「インラインブロックの中身の末尾」と
 * 「インラインブロックの外」が同じ番号になり、目標座標が中に寄るため。
 */
export function alongOf(block: TextblockView, pos: number): number {
  const caret = caretRectFor(block, pos);
  return writingModeOf(block.contentDOM).vertical ? caret.top : caret.left;
}

/**
 * 着地点をインライン方向の目標に寄せ直す。インラインブロックが中身より広いと (人物名の枠は 8em)、
 * 余白の当たり判定がインラインブロックの中なので着地が中身の末尾まで戻ってしまう。
 */
export function snapToAlong(doc: Plot, block: TextblockView, pos: number, along: number): number {
  const $pos = Pos.resolve(doc, pos);
  const depth = $pos.textblockDepth();
  if (depth == null || $pos.depth <= depth) return pos;
  // いちばん外側のインラインブロックまで出る。内側だけ出ても、キャレットの立たない位置に着く
  // ことがある (ruby は cursorInsideBounds を持たないので rb と rt の間には止まれない)
  const outside = $pos.after(depth + 1);
  const vertical = writingModeOf(block.contentDOM).vertical;
  const at = (target: number): number => {
    const rect = caretRectFor(block, target);
    return vertical ? rect.top : rect.left;
  };
  return Math.abs(at(outside) - along) < Math.abs(at(pos) - along) ? outside : pos;
}

/** `backward` が true なら移動先の末尾側 (ブロック方向の終わり) に入る */
function positionInBlock(
  doc: Plot,
  target: TextblockView,
  backward: boolean,
  along: number | null,
): number {
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

  const point = caretPointFromCoords(vertical ? blockCoord : along, vertical ? along : blockCoord);
  if (!point || !target.contentDOM.contains(point.node)) return fallback;
  return snapToAlong(doc, target, domPointToBlockPos(target, point.node, point.offset), along);
}
