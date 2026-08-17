import type { Node as DocNode, Plot } from "../doc";
import type { TextblockView } from "./block-view";
import { caretRectAt, domPointToBlockOffset, lineStartRect, writingModeOf } from "./coords";

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
  return pointInElement(found.element, found.offset, found.passedBoxes);
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

  if (point.node.nodeType === 1) {
    const element = point.node as Element;
    const { vertical } = writingModeOf(block.contentDOM);

    // 要素の子の境目を指しているとき (インラインブロックの直後など)。collapsed な Range は
    // ここで箱の中の矩形を返してくるので、直前の要素の端から自分で作る
    const before = point.offset > 0 ? element.childNodes[point.offset - 1] : null;
    if (before?.nodeType === 1) {
      const rect = (before as Element).getBoundingClientRect();
      return vertical
        ? new DOMRect(rect.left, rect.bottom, rect.width, 0)
        : new DOMRect(rect.right, rect.top, 0, rect.height);
    }

    // 中身が空のインラインブロック。代役の生成内容のぶんだけ箱があるので、その先頭に置く
    if (!element.hasChildNodes()) {
      const rect = element.getBoundingClientRect();
      if (rect.width || rect.height) {
        return vertical
          ? new DOMRect(rect.left, rect.top, rect.width, 0)
          : new DOMRect(rect.left, rect.top, 0, rect.height);
      }
    }
  }

  const range = document.createRange();
  range.setStart(point.node, point.offset);
  range.setEnd(point.node, point.offset);
  // 折り返し位置では矩形が 2 つ返る。行頭のほうを採る (lineStartRect)
  const rect = lineStartRect(range.getClientRects());
  if (rect) return rect;
  // 空ブロックなどでは、これまでどおりオフセット基準の代用に落ちる
  return caretRectAt(block.contentDOM, block.text.posToOffset(pos));
}

/**
 * DOM 点 → doc の位置。{@link blockPosToDOMPoint} の逆で、こちらも**オフセットに畳まない**。
 *
 * 点がインラインブロックの中にあれば、その箱に降りてから数えるので「ルビの読みをクリック
 * したら読みの中」になる。畳んでから戻すと必ず箱の外に出てしまう。
 */
export function domPointToBlockPos(block: TextblockView, node: Node, offset: number): number {
  // 点を包んでいるインラインブロックを、外側から順に
  const boxes: Element[] = [];
  let element = node.nodeType === 1 ? (node as Element) : node.parentElement;
  while (element && element !== block.contentDOM) {
    if (element.hasAttribute("data-tf-inline")) boxes.unshift(element);
    element = element.parentElement;
  }
  if (!element) return block.contentFrom;

  // doc 側を同じ順で降りる
  let plot = block.node;
  let contentStart = block.contentFrom;
  let target = block.contentDOM;
  for (const box of boxes) {
    const found = nthInlinePlot(plot, contentStart, inlineIndexOf(target, box));
    if (!found) break;
    plot = found.node;
    contentStart = found.from + 1;
    target = box as HTMLElement;
  }

  return posInPlot(plot, contentStart, domPointToBlockOffset(target, node, offset));
}

/** その箱の中の平らなオフセットを doc 位置に戻す */
function posInPlot(plot: Plot, contentStart: number, offset: number): number {
  let pos = contentStart;
  let seen = 0;
  for (const child of plot.content) {
    const length = flatLength(child);
    if (child.isLeaf && child.isText && seen + length >= offset) return pos + (offset - seen);
    // 箱や atom の途中は指せないので、その手前に寄せる
    if (seen + length > offset) return pos;
    seen += length;
    pos += child.length;
  }
  return pos;
}

/** 親の中で何番目のインラインブロックか */
function inlineIndexOf(parent: HTMLElement, box: Element): number {
  let index = 0;
  for (const child of parent.children) {
    if (!child.hasAttribute("data-tf-inline")) continue;
    if (child === box) return index;
    index++;
  }
  return -1;
}

/** doc 側の k 番目のインライン Plot と、その開きトークンの位置 */
function nthInlinePlot(
  plot: Plot,
  contentStart: number,
  index: number,
): { node: Plot; from: number } | null {
  if (index < 0) return null;
  let pos = contentStart;
  let seen = 0;
  for (const child of plot.content) {
    if (child.isPlot && seen++ === index) return { node: child, from: pos };
    pos += child.length;
  }
  return null;
}

interface Located {
  element: HTMLElement;
  /** その要素の中だけで数えた平らなオフセット */
  offset: number;
  /**
   * ここまでに通り過ぎたインラインブロックの数。
   *
   * **空の箱は 0 文字**なので、その手前と後ろが同じオフセットになる。オフセットだけ渡すと
   * {@link pointInElement} が必ず手前を選んでしまうので、構造で解けるこの数も渡す。
   */
  passedBoxes: number;
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
    if (pos <= from) return { element: target, offset, passedBoxes: inlineIndex };

    if (child.isPlot) {
      const element = inlineChildAt(target, inlineIndex);
      // 開きと閉じの内側なら、その箱に降りてから数え直す
      if (element && pos < to) return locate(element, child, from + 1, pos);
      inlineIndex++;
      offset += flatLength(child);
    } else if (child.isLeaf && child.isText) {
      if (pos <= to)
        return { element: target, offset: offset + (pos - from), passedBoxes: inlineIndex };
      offset += child.length;
    } else {
      offset += 1;
    }
  }
  return { element: target, offset, passedBoxes: inlineIndex };
}

/**
 * その要素の中だけを平らに数えて N 文字目の DOM 点を返す。
 *
 * **入れ子のインラインブロックには入らない**。中の位置なら {@link locate} が先に降りている
 * ので、ここに来た時点で「箱の外の位置」だと分かっている。中まで数えると、ruby の直後が
 * rt の末尾と同じ数になって吸い込まれる。
 */
function pointInElement(
  element: HTMLElement,
  offset: number,
  passedBoxes = 0,
): { node: Node; offset: number } {
  let seen = 0;
  let boxes = 0;
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
        if (el.hasAttribute("data-tf-inline")) {
          // 箱の手前ちょうどならここで確定する。飛ばすと後ろのテキストで負のオフセットになる。
          // ただし locate が既に通り過ぎた箱なら手前ではない (空の箱は 0 文字なので、
          // オフセットが同じままここへ来る)
          if (seen >= offset && boxes >= passedBoxes) return { node: parent, offset: i };
          boxes++;
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
    if (!child.hasAttribute("data-tf-inline")) continue;
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
