import type { Node as DocNode, Plot } from "../doc";
import type { TextblockView } from "./block-view";
import { caretRectAt, writingModeOf } from "./coords";

/**
 * doc の位置から DOM 点を引く。**オフセットではなく位置で受けるのが要点**。
 *
 * インラインブロックの開き / 閉じは 0 文字なので、オフセットに畳むと「rb の末尾」と
 * 「rt の先頭」が同じ番号になり、どちらを指しているか分からなくなる。位置が持っている
 * 「どの箱の中か」を使って DOM を構造で降りれば、その情報を捨てずに済む。
 *
 * 降り方を doc から導けるのは、`renderInlineContent` がインラインブロックを
 * **doc の子の順どおりに直下の要素として**吐いているため。node view のように自分で DOM を
 * 描くノードが入ったら、この関数が view の木を引く形に変わる。呼び出し側は変わらない。
 */
export function blockPosToDOMPoint(
  block: TextblockView,
  pos: number,
): { node: Node; offset: number } {
  const found = locate(block.contentDOM, block.node, block.contentFrom, pos);
  return pointInElement(found.element, found.offset);
}

export function blockPosRange(block: TextblockView, from: number, to: number): Range {
  const start = blockPosToDOMPoint(block, from);
  const end = blockPosToDOMPoint(block, to);
  const range = document.createRange();
  range.setStart(start.node, start.offset);
  range.setEnd(end.node, end.offset);
  return range;
}

export function caretRectFor(block: TextblockView, pos: number): DOMRect {
  const point = blockPosToDOMPoint(block, pos);

  // 要素の子の境目を指しているとき (インラインブロックの直後など)。collapsed な Range は
  // ここで箱の中の矩形を返してくるので、直前の要素の端から自分で作る
  if (point.node.nodeType === 1 && point.offset > 0) {
    const before = point.node.childNodes[point.offset - 1];
    if (before?.nodeType === 1) {
      const rect = (before as Element).getBoundingClientRect();
      return writingModeOf(block.contentDOM).vertical
        ? new DOMRect(rect.left, rect.bottom, rect.width, 0)
        : new DOMRect(rect.right, rect.top, 0, rect.height);
    }
  }

  const range = document.createRange();
  range.setStart(point.node, point.offset);
  range.setEnd(point.node, point.offset);
  const rects = range.getClientRects();
  if (rects.length) return rects[0];
  // 空ブロックや折り返し位置では、これまでどおりオフセット基準の代用に落ちる
  return caretRectAt(block.contentDOM, block.text.posToOffset(pos));
}

interface Located {
  element: HTMLElement;
  /** その要素の中だけで数えた平らなオフセット */
  offset: number;
}

function locate(target: HTMLElement, plot: Plot, contentStart: number, pos: number): Located {
  let docPos = contentStart;
  let offset = 0;
  let inlineIndex = 0;
  for (const child of plot.content) {
    const from = docPos;
    const to = from + child.length;
    docPos = to;

    // この子より手前なら、ここまでの数で確定
    if (pos <= from) return { element: target, offset };

    if (child.isPlot) {
      const element = inlineChildAt(target, inlineIndex++);
      // 開きと閉じの内側なら、その箱に降りてから数え直す
      if (element && pos < to) return locate(element, child, from + 1, pos);
      offset += flatLength(child);
    } else if (child.isLeaf && child.isText) {
      if (pos <= to) return { element: target, offset: offset + (pos - from) };
      offset += child.length;
    } else {
      offset += 1;
    }
  }
  return { element: target, offset };
}

/**
 * その要素の中だけを平らに数えて N 文字目の DOM 点を返す。
 *
 * **入れ子のインラインブロックには入らない**。中の位置なら {@link locate} が先に降りている
 * ので、ここに来た時点で「箱の外の位置」だと分かっている。中まで数えると、ruby の直後が
 * rt の末尾と同じ数になって吸い込まれる。
 */
function pointInElement(element: HTMLElement, offset: number): { node: Node; offset: number } {
  let seen = 0;
  let fallback: { node: Node; offset: number } = { node: element, offset: 0 };

  const scan = (parent: Element): { node: Node; offset: number } | null => {
    const children = parent.childNodes;
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (child.nodeType === 3) {
        const text = child as Text;
        if (seen + text.length >= offset) return { node: text, offset: offset - seen };
        seen += text.length;
        fallback = { node: text, offset: text.length };
      } else if (child.nodeType === 1) {
        const el = child as Element;
        if (el.hasAttribute("data-ecw-inline")) {
          seen += el.textContent?.length ?? 0;
          fallback = { node: parent, offset: i + 1 };
        } else {
          const found = scan(el);
          if (found) return found;
        }
      }
    }
    return null;
  };

  return scan(element) ?? fallback;
}

/**
 * 直下の k 番目のインラインブロック。マークの span は素通りする。
 * Shape の穴が要素そのものである前提 (今のインラインブロックはすべて単一要素)。
 */
function inlineChildAt(target: HTMLElement, index: number): HTMLElement | null {
  let seen = 0;
  for (const child of target.children) {
    if (!child.hasAttribute("data-ecw-inline")) continue;
    if (seen++ === index) return child as HTMLElement;
  }
  return null;
}

/** バッファに乗る文字数。atom は 1 文字、インラインブロックは中身の合計 */
function flatLength(node: DocNode): number {
  if (node.isLeaf) return node.isText ? node.length : 1;
  let total = 0;
  for (const child of node.content) total += flatLength(child);
  return total;
}
