// このファイルの Node は DOM の Node。ドキュメントモデルのノードは扱わない。

/** Range.toString().length で測るので、テキストノードの分かれ方に依存しない */
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

/** ブラウザによって API 名が違うので吸収する */
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

/** この要素の中だけを平らに数えたときの N 文字目。インラインブロックをまたぐ判断は view/dom-point.ts */
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

/**
 * 矩形が 2 つ返るのはソフトラップの位置。行の先頭 (最後の矩形) を採る。
 * 末尾を採ると行移動が 1 つ前の行から刻み、行を飛ばす / 動かないという形で失敗する。
 */
export function lineStartRect(rects: DOMRectList): DOMRect | null {
  return rects.length ? rects[rects.length - 1] : null;
}

/**
 * 矩形が取れない位置での代用。ブロックの箱は行送りぶんあるので、line-height を広げると
 * キャレットが行いっぱいに伸びる。空ブロックの `<br>` ならフォントの高さで済む。
 */
export function caretRectAt(blockDOM: HTMLElement, offset: number): DOMRect {
  const range = blockOffsetRange(blockDOM, offset, offset);
  const rect = lineStartRect(range.getClientRects());
  if (rect) return rect;
  const { vertical } = writingModeOf(blockDOM);
  // 矩形が取れないときは前後 1 文字から作る。次の文字を優先するのは、折り返しの位置では
  // 次の文字の先頭が行頭になるから。末尾には次の文字が無いので、そこだけ手前から作る
  const text = blockDOM.textContent ?? "";
  if (text.length) {
    const forward = offset < text.length;
    const near = forward
      ? blockOffsetRange(blockDOM, offset, offset + 1)
      : blockOffsetRange(blockDOM, offset - 1, offset);
    const nearRects = near.getClientRects();
    if (nearRects.length) {
      const r = forward ? nearRects[0] : nearRects[nearRects.length - 1];
      if (vertical) {
        const y = forward ? r.top : r.bottom;
        return new DOMRect(r.left, y, r.width, 0);
      }
      const x = forward ? r.left : r.right;
      return new DOMRect(x, r.top, 0, r.height);
    }
  }
  const br = blockDOM.querySelector("br");
  if (br) return br.getBoundingClientRect();

  const box = blockDOM.getBoundingClientRect();
  return vertical
    ? new DOMRect(box.left, box.top, box.width, 0)
    : new DOMRect(box.left, box.top, 0, box.height);
}

/**
 * 文字の上でキャレットが取る太さ。箱の大きさは行送りぶんあるので使えない。
 * 空のインラインブロックは Range から測れないので、同じフォントの要素を編集領域の外に立てて測る。
 */
export function fontCaretExtent(dom: Element): number {
  const style = getComputedStyle(dom);
  const probe = document.createElement("div");
  probe.style.position = "absolute";
  probe.style.visibility = "hidden";
  probe.style.top = "0";
  probe.style.left = "0";
  // 縦書きの中から呼ばれても height が block 軸になるように揃える
  probe.style.writingMode = "horizontal-tb";
  probe.style.fontStyle = style.fontStyle;
  probe.style.fontWeight = style.fontWeight;
  probe.style.fontStretch = style.fontStretch;
  probe.style.fontSize = style.fontSize;
  probe.style.fontFamily = style.fontFamily;
  probe.textContent = "x";
  document.body.appendChild(probe);
  const range = document.createRange();
  range.selectNodeContents(probe);
  const extent = range.getBoundingClientRect().height;
  probe.remove();
  return extent;
}

/** [from, to) の 1 文字ずつ。EditContext の characterBounds に渡す */
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
 * 行送り (block 軸で 1 行ぶん進む量)。
 *
 * キャレットの矩形はどこでも**文字の高さ**にしかならないので、line-height が 1 より
 * 大きいと行送りに足りない。行をずらす量や行の判定にはこちらを使う。
 * `normal` は px にならないので、そのときだけ矩形の太さで代用する。
 */
export function lineAdvanceOf(blockDOM: HTMLElement, fallback: number): number {
  const lineHeight = Number.parseFloat(getComputedStyle(blockDOM).lineHeight);
  return Number.isFinite(lineHeight) && lineHeight > 0 ? lineHeight : fallback;
}

/**
 * block 軸で行が並ぶ範囲。border と padding は行の外なので、ブロックの箱のままでは
 * 罫線を引いただけで「最初の行」に見えなくなる。
 */
function lineFlowExtent(blockDOM: HTMLElement, vertical: boolean): { start: number; end: number } {
  const box = blockDOM.getBoundingClientRect();
  const style = getComputedStyle(blockDOM);
  const inset = (border: string, padding: string): number =>
    Number.parseFloat(border) + Number.parseFloat(padding);
  return vertical
    ? {
        start: box.left + inset(style.borderLeftWidth, style.paddingLeft),
        end: box.right - inset(style.borderRightWidth, style.paddingRight),
      }
    : {
        start: box.top + inset(style.borderTopWidth, style.paddingTop),
        end: box.bottom - inset(style.borderBottomWidth, style.paddingBottom),
      };
}

/**
 * キャレットが視覚的な最初 / 最後の行にいるか。`direction` は論理方向 (-1 = 前の行へ)。
 * 縦書きでは行が横に積まれ vertical-rl では「次」が左なので、物理軸は書字方向から決める。
 */
export function isOnEdgeLine(blockDOM: HTMLElement, offset: number, direction: -1 | 1): boolean {
  const { vertical, blockForwardIsPositive } = writingModeOf(blockDOM);
  const caret = caretRectAt(blockDOM, offset);
  const flow = lineFlowExtent(blockDOM, vertical);

  // ブロック方向 = インライン方向と直交する軸
  const caretStart = vertical ? caret.left : caret.top;
  const caretEnd = vertical ? caret.right : caret.bottom;
  // キャレットは行の中で上下に余り (半 leading) を残して立つので、行送りの半分まで許す。
  // 1 行ぶん離れれば必ず行送りより遠いので、これで隣の行と混ざらない
  const lineSize = lineAdvanceOf(blockDOM, vertical ? caret.width : caret.height);
  const tolerance = Math.max(2, lineSize / 2);

  const physical = blockForwardIsPositive ? direction : -direction;
  return physical < 0 ? caretStart - flow.start <= tolerance : flow.end - caretEnd <= tolerance;
}
