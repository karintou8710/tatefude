import type { Plot } from "../doc";
import { Selection, TextSelection } from "../state/selection";
import type { TextblockView } from "../view/block-view";
import {
  caretPointFromCoords,
  caretRectAt,
  domPointToBlockOffset,
  isOnEdgeLine,
  writingModeOf,
} from "../view/coords";
import type { EditorView } from "../view/view";
import { alongOf, crossToAdjacentBlock } from "./boundary";

export type ArrowKey = "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown";

const arrowKeys: readonly string[] = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"];

export function isArrowKey(key: string): key is ArrowKey {
  return arrowKeys.includes(key);
}

/**
 * 矢印キーの意味。物理キーと軸の対応は書字方向で入れ替わるので、ここで論理方向に直して
 * 以降はこの形だけで扱う。
 */
export interface ArrowMotion {
  /** inline = 行の中を進む / block = 行や段落を跨ぐ */
  axis: "inline" | "block";
  /** 文書順の手前へ向かうか */
  backward: boolean;
}

/**
 * 物理キー → 論理方向。書字方向はキャレットのいるブロックの computed style から読む。
 *
 * RTL は非スコープなので inline 軸も論理方向まで畳んでいる。対応するなら left / right を
 * 残したまま渡し、受け手が bidi を解く形になる (wordgard の arrowAxis がそうしている)。
 */
export function arrowMotion(key: ArrowKey, dom: HTMLElement): ArrowMotion {
  const { vertical, blockForwardIsPositive } = writingModeOf(dom);
  if (!vertical) {
    if (key === "ArrowLeft") return { axis: "inline", backward: true };
    if (key === "ArrowRight") return { axis: "inline", backward: false };
    return { axis: "block", backward: key === "ArrowUp" };
  }
  // 縦書きは軸が入れ替わる
  if (key === "ArrowUp") return { axis: "inline", backward: true };
  if (key === "ArrowDown") return { axis: "inline", backward: false };
  // vertical-rl は行が左へ積まれるので、左が「次」になる
  const rightIsForward = blockForwardIsPositive;
  return { axis: "block", backward: key === "ArrowRight" ? !rightIsForward : rightIsForward };
}

/**
 * 矢印キーの受け口。修飾キー付き (単語単位・行頭行末・ページ) はまだ持っていないので
 * ブラウザに渡す。
 */
export function handleArrow(view: EditorView, event: KeyboardEvent): boolean {
  if (event.altKey || event.ctrlKey || event.metaKey) return false;
  if (!isArrowKey(event.key)) return false;
  // 書字方向はキャレットのいるブロックのもので決める
  const block = view.textblockAt(view.state.selection.head);
  if (!block) return false;
  return moveByArrow(view, arrowMotion(event.key, block.contentDOM), event.shiftKey);
}

/** 論理方向で受ける。矢印キーである限り、動けなくても消費する (true) */
export function moveByArrow(view: EditorView, motion: ArrowMotion, extend: boolean): boolean {
  return motion.axis === "inline"
    ? moveByUnit(view, motion.backward, extend)
    : moveByLine(view, motion.backward, extend);
}

/**
 * 行の中を 1 つ進む。単位は grapheme cluster (サロゲートペアや結合文字を割らない)。
 *
 * バッファのオフセットではなく **doc の位置**で刻む。インラインブロックの内側の端は
 * 外側の端と同じオフセットに写るので、オフセットで刻むと区別できないため。
 */
function moveByUnit(view: EditorView, backward: boolean, extend: boolean): boolean {
  const selection = view.state.selection;
  // 範囲があるときの矢印は「1 つ動く」ではなく「端に畳む」
  if (!selection.empty && !extend) {
    return setHead(view, backward ? selection.from : selection.to, false);
  }

  const index = view.textblockIndexAt(selection.head);
  if (index < 0) return false;
  const block = view.textblocks[index];
  const stops = caretStops(block.node, block.contentFrom);
  const head = selection.head;
  let next: number | undefined;
  if (backward) {
    for (const stop of stops) {
      if (stop >= head) break;
      next = stop;
    }
  } else {
    next = stops.find((stop) => stop > head);
  }
  if (next != null) return setHead(view, next, extend);

  // ブロックの端。隣のブロックへ出る
  const crossed = crossToAdjacentBlock(view, index, backward, null);
  return crossed == null ? true : setHead(view, crossed, extend);
}

/**
 * ブロックの中で、キャレットが留まれる doc 位置を文書順に並べる。
 *
 * インラインブロックの内側の端は `cursorInsideBounds` を持つものだけに作る
 * (`<ruby>` 自身のように、中に直接キャレットが要らない箱があるため)。
 */
function caretStops(block: Plot, contentFrom: number): number[] {
  const stops: number[] = [contentFrom];

  const collect = (plot: Plot, contentStart: number, inside: boolean): void => {
    let pos = contentStart;
    for (const child of plot.content) {
      if (child.isLeaf && child.isText) {
        for (const { index } of graphemes.segment(child.text)) {
          if (index > 0) stops.push(pos + index);
        }
        if (inside) stops.push(pos + child.length);
      } else if (child.isPlot) {
        const innerOk = child.type.cursorInsideBounds;
        if (innerOk) stops.push(pos + 1);
        collect(child, pos + 1, innerOk);
        if (inside) stops.push(pos + child.length);
      } else if (inside) {
        stops.push(pos + child.length);
      }
      pos += child.length;
    }
  };

  collect(block, contentFrom, true);
  return stops;
}

/** 行を跨いで 1 つ進む。インライン方向の位置は目標座標として持ち越す */
function moveByLine(view: EditorView, backward: boolean, extend: boolean): boolean {
  const selection = view.state.selection;
  const index = view.textblockIndexAt(selection.head);
  if (index < 0) return false;
  const block = view.textblocks[index];
  const offset = block.text.posToOffset(selection.head);

  // 短い行を通ると位置が痩せるので、直前の行移動の目標をそのまま使う
  const goal = view.verticalGoal;
  const along = goal?.head === selection.head ? goal.along : alongOf(block, offset);

  if (!isOnEdgeLine(block.contentDOM, offset, backward ? -1 : 1)) {
    const next = offsetOnNextLine(block, offset, backward, along);
    if (next != null) return setHead(view, block.text.offsetToPos(next), extend, along);
  }

  const head = crossToAdjacentBlock(view, index, backward, along);
  if (head != null) return setHead(view, head, extend, along);

  // doc の端。行が無いので端まで寄せる
  const doc = view.state.doc;
  const edge = backward ? Selection.atStart(doc) : Selection.atEnd(doc);
  return edge.head === selection.head ? true : setHead(view, edge.head, extend);
}

function setHead(view: EditorView, head: number, extend: boolean, along?: number): true {
  const { anchor } = view.state.selection;
  view.dispatch({
    selection: TextSelection.create(view.state.doc, extend ? anchor : head, head),
    userEvent: "select.key",
  });
  view.verticalGoal = along == null ? null : { head, along };
  return true;
}

/** ブロック方向へ 1 行ぶんずらした点を引く。その行がブロックの外なら null */
function offsetOnNextLine(
  block: TextblockView,
  offset: number,
  backward: boolean,
  along: number,
): number | null {
  const { vertical, blockForwardIsPositive } = writingModeOf(block.contentDOM);
  const caret = caretRectAt(block.contentDOM, offset);
  // キャレットのブロック方向の太さが行の高さ
  const lineSize = vertical ? caret.width : caret.height;
  const towardNegative = blockForwardIsPositive ? backward : !backward;
  const center = vertical ? (caret.left + caret.right) / 2 : (caret.top + caret.bottom) / 2;
  const blockCoord = center + (towardNegative ? -lineSize : lineSize);

  const point = caretPointFromCoords(vertical ? blockCoord : along, vertical ? along : blockCoord);
  if (!point || !block.contentDOM.contains(point.node)) return null;
  return domPointToBlockOffset(block.contentDOM, point.node, point.offset);
}

const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });
