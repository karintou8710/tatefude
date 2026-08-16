import { TextSelection } from "../state/selection";
import type { BlockView } from "../view/block-view";
import {
  caretPointFromCoords,
  caretRectAt,
  domPointToBlockOffset,
  isOnEdgeLine,
} from "../view/coords";
import type { EditorView } from "../view/view";

type ArrowKey = "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown";

/**
 * ブロックを跨ぐキャレット移動。
 *
 * ブロックごとに EditContext を張ると、ブロック 1 つ 1 つが独立した編集領域になるので、
 * 端から先へ出る移動はブラウザがやってくれない。ここで隣のブロックへフォーカスごと移す。
 */
export function handleBoundaryArrow(view: EditorView, event: KeyboardEvent): boolean {
  if (event.altKey || event.ctrlKey || event.metaKey) return false;
  const key = event.key as ArrowKey;
  if (key !== "ArrowLeft" && key !== "ArrowRight" && key !== "ArrowUp" && key !== "ArrowDown") {
    return false;
  }

  const selection = view.state.selection;
  const index = view.blockIndexAt(selection.head);
  if (index < 0) return false;
  const block = view.blocks[index];
  const offset = block.text.posToOffset(selection.head);

  const vertical = key === "ArrowUp" || key === "ArrowDown";
  const backward = key === "ArrowLeft" || key === "ArrowUp";
  const atEdge = vertical
    ? isOnEdgeLine(block.contentDOM, offset, backward ? -1 : 1)
    : backward
      ? offset === 0
      : offset === block.text.length;
  if (!atEdge) return false;

  const target = view.blocks[backward ? index - 1 : index + 1];
  if (!target) return false;

  // 上下移動のときは横位置をなるべく保つ
  const x = vertical ? caretRectAt(block.contentDOM, offset).left : null;
  const head = positionInBlock(target, backward ? "end" : "start", x);
  const anchor = event.shiftKey ? selection.anchor : head;
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, anchor, head)));
  return true;
}

function positionInBlock(target: BlockView, edge: "start" | "end", x: number | null): number {
  const fallback = edge === "start" ? target.contentFrom : target.contentTo;
  if (x == null) return fallback;
  const box = target.dom.getBoundingClientRect();
  const y = edge === "start" ? box.top + 2 : box.bottom - 2;
  const offset = offsetAtPoint(target.contentDOM, x, y);
  return offset == null ? fallback : target.text.offsetToPos(offset);
}

function offsetAtPoint(blockDOM: HTMLElement, x: number, y: number): number | null {
  const point = caretPointFromCoords(x, y);
  if (!point || !blockDOM.contains(point.node)) return null;
  return domPointToBlockOffset(blockDOM, point.node, point.offset);
}
