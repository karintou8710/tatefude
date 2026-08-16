import { TextSelection } from "../state/selection";
import type { BlockView } from "../view/block-view";
import {
  caretPointFromCoords,
  caretRectAt,
  domPointToBlockOffset,
  isOnEdgeLine,
  writingModeOf,
} from "../view/coords";
import type { EditorView } from "../view/view";

type ArrowKey = "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown";

/** 矢印キーが論理的にどちらの軸のどちら向きか。書字方向で入れ替わる。 */
interface ArrowIntent {
  /** 行の中を進むか (inline)、行を跨ぐか (block) */
  axis: "inline" | "block";
  backward: boolean;
}

function intentOf(key: ArrowKey, dom: HTMLElement): ArrowIntent {
  const { vertical, blockForwardIsPositive } = writingModeOf(dom);
  if (vertical) {
    // 縦書き: 上下が行の中、左右が行の跨ぎ (vertical-rl は左が「次」)
    if (key === "ArrowUp") return { axis: "inline", backward: true };
    if (key === "ArrowDown") return { axis: "inline", backward: false };
    const rightIsForward = blockForwardIsPositive;
    return { axis: "block", backward: key === "ArrowRight" ? !rightIsForward : rightIsForward };
  }
  if (key === "ArrowLeft") return { axis: "inline", backward: true };
  if (key === "ArrowRight") return { axis: "inline", backward: false };
  return { axis: "block", backward: key === "ArrowUp" };
}

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
  const { axis, backward } = intentOf(key, block.contentDOM);

  const atEdge =
    axis === "block"
      ? isOnEdgeLine(block.contentDOM, offset, backward ? -1 : 1)
      : backward
        ? offset === 0
        : offset === block.text.length;
  if (!atEdge) return false;

  const target = view.blocks[backward ? index - 1 : index + 1];
  if (!target) return false;

  // 行を跨ぐ移動では、インライン方向の位置をなるべく保つ
  const along = axis === "block" ? alongOf(block, offset) : null;
  const head = positionInBlock(target, backward, along);
  const anchor = event.shiftKey ? selection.anchor : head;
  view.dispatch({
    selection: TextSelection.create(view.state.doc, anchor, head),
    userEvent: "select.key",
  });
  return true;
}

/** キャレットのインライン方向の座標 (横書きなら x、縦書きなら y) */
function alongOf(block: BlockView, offset: number): number {
  const caret = caretRectAt(block.contentDOM, offset);
  return writingModeOf(block.contentDOM).vertical ? caret.top : caret.left;
}

/**
 * 移動先ブロックの中の位置を決める。
 * `backward` が true なら移動先の末尾側 (ブロック方向の終わり) に入る。
 */
function positionInBlock(target: BlockView, backward: boolean, along: number | null): number {
  const fallback = backward ? target.contentTo : target.contentFrom;
  if (along == null) return fallback;

  const { vertical, blockForwardIsPositive } = writingModeOf(target.contentDOM);
  const box = target.dom.getBoundingClientRect();
  // 入っていく側の物理的な端。backward なら移動先のブロック方向の終わり側。
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
