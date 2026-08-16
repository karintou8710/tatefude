// このファイルの Node は DOM の Node。ドキュメントモデルのノードは扱わない。

/**
 * DOM の位置をブロック内のフラットオフセットに写す。
 * Range.toString().length を使うので、テキストノードの持ち方に依存しない。
 */
export function domPointToBlockOffset(blockDOM: HTMLElement, node: Node, offset: number): number {
  if (!blockDOM.contains(node) && node !== blockDOM) return 0;
  const range = document.createRange();
  range.setStart(blockDOM, 0);
  try {
    range.setEnd(node, offset);
  } catch {
    return 0;
  }
  return range.toString().length;
}

interface CaretPositionLike {
  offsetNode: Node;
  offset: number;
}

/** 画面座標から DOM の位置を得る。ブラウザによって API 名が違うので吸収する。 */
export function caretPointFromCoords(x: number, y: number): { node: Node; offset: number } | null {
  const doc = document as Document & {
    caretPositionFromPoint?(x: number, y: number): CaretPositionLike | null;
    caretRangeFromPoint?(x: number, y: number): Range | null;
  };
  const position = doc.caretPositionFromPoint?.(x, y);
  if (position) return { node: position.offsetNode, offset: position.offset };
  const range = doc.caretRangeFromPoint?.(x, y);
  if (range) return { node: range.startContainer, offset: range.startOffset };
  return null;
}

/** ブロック内のフラットオフセットを DOM の位置に戻す */
export function blockOffsetToDOMPoint(
  blockDOM: HTMLElement,
  offset: number,
): { node: Node; offset: number } {
  const walker = document.createTreeWalker(blockDOM, NodeFilter.SHOW_TEXT);
  let seen = 0;
  let last: Text | null = null;
  while (walker.nextNode()) {
    const text = walker.currentNode as Text;
    if (seen + text.length >= offset) return { node: text, offset: offset - seen };
    seen += text.length;
    last = text;
  }
  if (last) return { node: last, offset: last.length };
  return { node: blockDOM, offset: 0 };
}

export function blockOffsetRange(blockDOM: HTMLElement, from: number, to: number): Range {
  const start = blockOffsetToDOMPoint(blockDOM, from);
  const end = blockOffsetToDOMPoint(blockDOM, to);
  const range = document.createRange();
  range.setStart(start.node, start.offset);
  range.setEnd(end.node, end.offset);
  return range;
}

/** キャレット位置の矩形。空ブロックではブロック自身の矩形で代用する。 */
export function caretRectAt(blockDOM: HTMLElement, offset: number): DOMRect {
  const range = blockOffsetRange(blockDOM, offset, offset);
  const rects = range.getClientRects();
  if (rects.length) return rects[0];
  // 折り返し位置などで矩形が取れないときは前後 1 文字から作る
  const text = blockDOM.textContent ?? "";
  if (text.length) {
    const near =
      offset > 0
        ? blockOffsetRange(blockDOM, offset - 1, offset)
        : blockOffsetRange(blockDOM, offset, offset + 1);
    const nearRects = near.getClientRects();
    if (nearRects.length) {
      const r = offset > 0 ? nearRects[nearRects.length - 1] : nearRects[0];
      const x = offset > 0 ? r.right : r.left;
      return new DOMRect(x, r.top, 0, r.height);
    }
  }
  const box = blockDOM.getBoundingClientRect();
  return new DOMRect(box.left, box.top, 0, box.height);
}

/** [from, to) の 1 文字ずつの矩形。EditContext の characterBounds に渡す。 */
export function characterRects(blockDOM: HTMLElement, from: number, to: number): DOMRect[] {
  const rects: DOMRect[] = [];
  for (let offset = from; offset < to; offset++) {
    const range = blockOffsetRange(blockDOM, offset, offset + 1);
    const list = range.getClientRects();
    if (list.length) {
      rects.push(list[0]);
    } else {
      rects.push(caretRectAt(blockDOM, offset));
    }
  }
  return rects;
}

export interface WritingModeInfo {
  /** インライン方向が縦か (vertical-rl / vertical-lr / sideways-*) */
  vertical: boolean;
  /** ブロック方向の「次」が座標の正方向か。vertical-rl だけ負方向 (左へ積む) */
  blockForwardIsPositive: boolean;
}

export function writingModeOf(dom: HTMLElement): WritingModeInfo {
  const mode = getComputedStyle(dom).writingMode;
  const vertical = mode.startsWith("vertical") || mode.startsWith("sideways");
  return {
    vertical,
    blockForwardIsPositive: !(mode === "vertical-rl" || mode === "sideways-rl"),
  };
}

/**
 * キャレットが視覚的な最初 / 最後の行にいるか (行を跨ぐ移動の判定用)。
 *
 * `direction` は論理方向 (-1 = 前の行へ、1 = 次の行へ)。縦書きでは行が横に積まれ、
 * vertical-rl では「次」が画面の左になるので、物理軸と向きを書字方向から決める。
 */
export function isOnEdgeLine(blockDOM: HTMLElement, offset: number, direction: -1 | 1): boolean {
  const { vertical, blockForwardIsPositive } = writingModeOf(blockDOM);
  const caret = caretRectAt(blockDOM, offset);
  const box = blockDOM.getBoundingClientRect();

  // ブロック方向 = インライン方向と直交する軸。キャレットのその軸方向の太さが行の高さ。
  const caretStart = vertical ? caret.left : caret.top;
  const caretEnd = vertical ? caret.right : caret.bottom;
  const boxStart = vertical ? box.left : box.top;
  const boxEnd = vertical ? box.right : box.bottom;
  const lineSize = vertical ? caret.width : caret.height;
  const tolerance = Math.max(2, lineSize / 2);

  const physical = blockForwardIsPositive ? direction : -direction;
  return physical < 0 ? caretStart - boxStart <= tolerance : boxEnd - caretEnd <= tolerance;
}
