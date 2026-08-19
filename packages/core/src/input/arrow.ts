import type { Plot, Pos } from "../doc";
import { resolveNear, Selection, TextSelection } from "../state/selection";
import type { TextblockView } from "../view/block-view";
import { caretPointFromCoords, lineAdvanceOf, writingModeOf } from "../view/coords";
import { caretRectFor, domPointToBlockPos } from "../view/dom-point";
import type { EditorView } from "../view/view";
import { alongOf, crossToAdjacentBlock, snapToAlong } from "./boundary";

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
  const motion = arrowMotion(event.key, block.contentDOM);

  // 縦中横のように行の向きが直交するインラインブロックの中では、軸の意味が入れ替わる
  const turned = turnedBoxAt(view.state.selection.$head);
  if (turned) return moveInTurnedBox(view, event.key, motion, turned, event.shiftKey);

  return moveByArrow(view, motion, event.shiftKey);
}

/** キャレットを囲む、行の向きが直交するインラインブロックの外側の範囲。囲まれていなければ null */
function turnedBoxAt($head: Pos): { from: number; to: number } | null {
  for (let depth = $head.depth; depth > 0; depth--) {
    if ($head.node(depth).type.cursorAxisTurns) {
      return { from: $head.before(depth), to: $head.after(depth) };
    }
  }
  return null;
}

/**
 * 親の軸を読み替える。親の行方向 = インラインブロックを出る、親のブロック方向 = その中を進む。
 * 横に並んだ文字を上下キーで 1 つずつ辿らせても意味がないため。
 */
function moveInTurnedBox(
  view: EditorView,
  key: ArrowKey,
  motion: ArrowMotion,
  box: { from: number; to: number },
  extend: boolean,
): boolean {
  if (motion.axis === "inline") return setHead(view, motion.backward ? box.from : box.to, extend);
  // インラインブロックの中は横組み左→右で固定 (text-combine が作る組み方)。物理キーがそのまま前後になる
  return moveByUnit(view, key === "ArrowLeft", extend);
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
 * (`<ruby>` 自身のように、中に直接キャレットが要らないインラインブロックがあるため)。
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

  // 端が固定のインラインブロックで埋まる型では、その外側は内側の端と同じ点に描かれる余りなので外す
  const type = block.type;
  if (!type.cursorAtContentStart || !type.cursorAtContentEnd) {
    const contentTo = contentFrom + block.contentLength;
    return stops.filter(
      (stop) =>
        (type.cursorAtContentStart || stop !== contentFrom) &&
        (type.cursorAtContentEnd || stop !== contentTo),
    );
  }
  return stops;
}

/** 行を跨いで 1 つ進む。インライン方向の位置は目標座標として持ち越す */
function moveByLine(view: EditorView, backward: boolean, extend: boolean): boolean {
  const selection = view.state.selection;
  const index = view.textblockIndexAt(selection.head);
  if (index < 0) return false;
  const block = view.textblocks[index];

  // 短い行を通ると位置が痩せるので、直前の行移動の目標をそのまま使う
  const goal = view.verticalGoal;
  const along = goal?.head === selection.head ? goal.along : alongOf(block, selection.head);

  // 端の行かどうかも描画から決まる。隣の行が引けなければブロックを跨ぐ
  const next = posOnNextLine(view.state.doc, block, selection.head, backward, along);
  // 段を跨ぐと目標座標もそのぶんずれる。持ち越すのは動いた後の値
  if (next) return setHead(view, next.pos, extend, next.along);

  const head = crossToAdjacentBlock(view, index, backward, along);
  if (head != null) return setHead(view, head, extend, along);

  // doc の端。行が無いので端まで寄せる
  const doc = view.state.doc;
  const edge = backward ? Selection.atStart(doc) : Selection.atEnd(doc);
  return edge.head === selection.head ? true : setHead(view, edge.head, extend);
}

function setHead(view: EditorView, head: number, extend: boolean, along?: number): true {
  const { anchor, head: current } = view.state.selection;
  // ブロックを跨ぐ移動と行移動は着地点を座標から引くので、潰した端 (cursorAtContentStart)
  // に降りることがある。進む向きに寄せ直す
  const target = resolveNear(view.state.doc, head, head < current ? -1 : 1).pos;
  view.dispatch({
    selection: TextSelection.create(view.state.doc, extend ? anchor : target, target),
    userEvent: "select.key",
  });
  view.verticalGoal = along == null ? null : { head: target, along };
  return true;
}

/** ブロックの断片 (段組みで割れた 1 つぶん)。block 軸とインライン軸に読み替えたもの */
interface Fragment {
  blockStart: number;
  blockEnd: number;
  inlineStart: number;
  inlineEnd: number;
}

/**
 * 隣の行の位置と、そこでのインライン方向の目標。無ければ null。
 *
 * ふつうは block 軸に 1 行送りぶんずらして引くだけ。ただし**ずらした先が断片の外なら
 * 引いてはいけない** — caretPositionFromPoint は近くの別の段に吸着するので、
 * 段を行き来するだけになる。断片の外に出たら次の断片の入口へ回す。
 *
 * ページは書字方向によらず縦に積まれるので、断片が変わるとインライン方向もそのぶんずれる。
 * 目標座標を持ち越すのは呼び出し側なので、ずらした後の値を返す。
 */
function posOnNextLine(
  doc: Plot,
  block: TextblockView,
  pos: number,
  backward: boolean,
  along: number,
): { pos: number; along: number } | null {
  const { vertical, blockForwardIsPositive } = writingModeOf(block.contentDOM);
  const caret = caretRectFor(block, pos);
  // キャレットの太さでずらすと行の中の余りに落ちて同じ行へ戻るので、行送りで刻む
  const lineSize = lineAdvanceOf(block.contentDOM, vertical ? caret.width : caret.height);
  const towardNegative = blockForwardIsPositive ? backward : !backward;
  const center = vertical ? (caret.left + caret.right) / 2 : (caret.top + caret.bottom) / 2;
  const stepped = center + (towardNegative ? -lineSize : lineSize);

  const fragments = fragmentsOf(block.contentDOM, vertical);
  const index = fragments.findIndex((f) => holds(f, center, along));
  const here = fragments[index];

  // 同じ断片の中で収まるなら、そのままずらすだけ。ただし**引けた結果も確かめる** —
  // 断片の縁では caretPositionFromPoint が隣の段の行に吸着する
  if (here && stepped >= here.blockStart && stepped <= here.blockEnd) {
    const found = posAtCoords(doc, block, vertical, stepped, along);
    if (found != null && sits(block, found, vertical, here)) return { pos: found, along };
  }

  const next = fragments[index + (backward ? -1 : 1)];
  if (!here || !next) return null;

  // 断片の入口は進む向きの手前側。座標が減る向きに進むなら大きい側から入る
  const half = lineSize / 2;
  const entry = towardNegative ? next.blockEnd - half : next.blockStart + half;
  const shifted = along - here.inlineStart + next.inlineStart;
  const found = posAtCoords(doc, block, vertical, entry, shifted);
  return found == null ? null : { pos: found, along: shifted };
}

/** block 軸とインライン軸の座標から doc 位置を引く。ブロックの外を指していたら null */
function posAtCoords(
  doc: Plot,
  block: TextblockView,
  vertical: boolean,
  blockCoord: number,
  along: number,
): number | null {
  const point = caretPointFromCoords(vertical ? blockCoord : along, vertical ? along : blockCoord);
  if (!point || !block.contentDOM.contains(point.node)) return null;
  return snapToAlong(doc, block, domPointToBlockPos(block, point.node, point.offset), along);
}

/** ブロックの矩形は断片ごとに返る。段組みで割れていなければ 1 つ */
function fragmentsOf(blockDOM: HTMLElement, vertical: boolean): Fragment[] {
  return [...blockDOM.getClientRects()].map((rect) =>
    vertical
      ? {
          blockStart: rect.left,
          blockEnd: rect.right,
          inlineStart: rect.top,
          inlineEnd: rect.bottom,
        }
      : {
          blockStart: rect.top,
          blockEnd: rect.bottom,
          inlineStart: rect.left,
          inlineEnd: rect.right,
        },
  );
}

/** その位置のキャレットがこの断片の中に立つか */
function sits(block: TextblockView, pos: number, vertical: boolean, fragment: Fragment): boolean {
  const rect = caretRectFor(block, pos);
  const blockCoord = vertical ? (rect.left + rect.right) / 2 : (rect.top + rect.bottom) / 2;
  return holds(fragment, blockCoord, vertical ? rect.top : rect.left);
}

/** その点がこの断片の中か。端ちょうどを落とさないよう 1px 緩める */
function holds(fragment: Fragment, block: number, inline: number): boolean {
  return (
    block >= fragment.blockStart - 1 &&
    block <= fragment.blockEnd + 1 &&
    inline >= fragment.inlineStart - 1 &&
    inline <= fragment.inlineEnd + 1
  );
}

const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });
