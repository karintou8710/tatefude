import { Selection, TextSelection } from "../state/selection";
import type { TextblockView } from "../view/block-view";
import { caretPointFromCoords, writingModeOf } from "../view/coords";
import { domPointToBlockPos } from "../view/dom-point";
import type { EditorView } from "../view/view";

/**
 * ポインタによる選択を全部持つ。ブラウザには一切作らせない (mousedown を preventDefault)。
 *
 * ブラウザに任せると、編集ホストの境界で選択が丸められる (docs/editcontext.md #1) ので
 * ブロックを跨ぐドラッグが受け取れず、ブロックの外を押したときは選択が作られずフォーカスも
 * 落ちる。場合分けで拾い分けるより、最初から全部こちらで作るほうが単純になる。
 */
export class PointerSelection {
  /** ドラッグの起点。伸ばす向きが変わっても動かさない */
  private anchor: number | null = null;

  constructor(private readonly view: EditorView) {}

  handleMouseDown(event: MouseEvent): void {
    if (event.button !== 0) return;
    const pos = posAtCoords(this.view, event.clientX, event.clientY);
    if (pos == null) return;

    // ここで止めないとブラウザが選択とフォーカスを別に動かし、model と競合する
    event.preventDefault();

    if (event.detail >= 3) {
      this.selectBlock(pos);
    } else if (event.detail === 2) {
      this.selectWord(pos);
    } else if (event.shiftKey) {
      // 伸ばす。起点は今の選択の anchor
      this.anchor = this.view.state.selection.anchor;
      this.select(this.anchor, pos);
    } else {
      this.anchor = pos;
      this.select(pos, pos);
    }
    // 選択が変わらなかったときは render が走らないので、フォーカスは自分で取る
    this.view.focus();

    window.addEventListener("mousemove", this.onMouseMove);
    window.addEventListener("mouseup", this.onMouseUp);
  }

  destroy(): void {
    this.stop();
  }

  private onMouseMove = (event: MouseEvent): void => {
    if (this.anchor == null) return;
    const head = posAtCoords(this.view, event.clientX, event.clientY);
    if (head != null) this.select(this.anchor, head);
  };

  /** 語やブロックが取れなくてもドラッグは続く。押した位置を起点にして選択だけ空にする */
  private selectRange(pos: number, range: { from: number; to: number } | null): void {
    const { from, to } = range ?? { from: pos, to: pos };
    // 続けてドラッグしたら範囲の先頭から伸ばす
    this.anchor = from;
    this.select(from, to);
  }

  private selectWord(pos: number): void {
    this.selectRange(pos, wordRangeAt(this.view, pos));
  }

  private selectBlock(pos: number): void {
    const block = this.view.textblockAt(pos);
    this.selectRange(pos, block && { from: block.contentFrom, to: block.contentTo });
  }

  private select(anchor: number, head: number): void {
    const doc = this.view.state.doc;
    // キャレットは置ける位置に寄せる。範囲は端をそのまま使う (行全体の選択で先頭が漏れる)
    const selection =
      anchor === head ? Selection.near(doc, anchor) : TextSelection.create(doc, anchor, head);
    if (selection.eq(this.view.state.selection)) return;
    this.view.dispatch({ selection, userEvent: "select.pointer" });
  }

  private onMouseUp = (): void => {
    this.stop();
  };

  private stop(): void {
    window.removeEventListener("mousemove", this.onMouseMove);
    window.removeEventListener("mouseup", this.onMouseUp);
    this.anchor = null;
  }
}

/** ブロックの外を指していたら一番近いブロックの箱に寄せてから当て直す */
export function posAtCoords(view: EditorView, x: number, y: number): number | null {
  const inEmptyBox = posInEmptyInlineBlock(view, x, y);
  if (inEmptyBox != null) return inEmptyBox;

  const direct = posAtPoint(view, x, y);
  if (direct != null) return direct;

  const nearest = nearestBlock(view, x, y);
  if (!nearest) return null;
  const box = nearest.dom.getBoundingClientRect();

  // 箱の中へ押し込んでから当て直す。こうするとパディングを押したときに**その行の端**が返る。
  // ブロック方向だけで手前か奥かを決めると、左のパディングが行末になってしまう
  const clamped = posAtPoint(
    view,
    Math.min(Math.max(x, box.left + 1), box.right - 1),
    Math.min(Math.max(y, box.top + 1), box.bottom - 1),
  );
  if (clamped != null) return clamped;

  // 当て直しても取れないとき (空ブロックなど) だけ、ブロック方向で手前か奥かを見る
  const { vertical, blockForwardIsPositive } = writingModeOf(nearest.dom);
  const beforeStart = vertical ? x < box.left : y < box.top;
  const atBlockStart = blockForwardIsPositive ? beforeStart : !beforeStart;
  return atBlockStart ? nearest.contentFrom : nearest.contentTo;
}

/**
 * 中身が空のインラインブロック (読みを入れていない rt など) を指していたら、その中の位置。
 *
 * 空の箱には**当たり判定が無い**。箱を持っているのは代役の生成内容のおかげで、生成内容には
 * 対応する DOM 位置が無いので、caretPositionFromPoint は中を返さず外のテキストへ逃げる
 * (`user-select` の指定とは無関係)。実際に指している要素から拾い直す。
 */
function posInEmptyInlineBlock(view: EditorView, x: number, y: number): number | null {
  const box = document.elementFromPoint(x, y)?.closest("[data-tf-inline]");
  if (!box || box.hasChildNodes()) return null;
  const block = view.textblockForDOM(box);
  return block ? domPointToBlockPos(block, box, 0) : null;
}

/** その点がテキストブロックの中を指していれば doc 位置。外なら null */
function posAtPoint(view: EditorView, x: number, y: number): number | null {
  const point = caretPointFromCoords(x, y);
  if (!point) return null;
  const block = view.textblockForDOM(point.node);
  return block ? domPointToBlockPos(block, point.node, point.offset) : null;
}

const words = new Intl.Segmenter(undefined, { granularity: "word" });

/** その位置を含む語の範囲。語の上でなければ null */
export function wordRangeAt(view: EditorView, pos: number): { from: number; to: number } | null {
  const block = view.textblockAt(pos);
  if (!block) return null;
  const offset = block.text.posToOffset(pos);
  for (const segment of words.segment(block.text.text)) {
    if (!segment.isWordLike) continue;
    const from = segment.index;
    const to = from + segment.segment.length;
    if (offset >= from && offset <= to) {
      return { from: block.text.offsetToPos(from), to: block.text.offsetToPos(to) };
    }
  }
  return null;
}

/** ブロックは書字方向に積まれるので、距離もその軸で測る */
function nearestBlock(view: EditorView, x: number, y: number): TextblockView | null {
  let found: TextblockView | null = null;
  let best = Number.POSITIVE_INFINITY;
  for (const block of view.textblocks) {
    const box = block.dom.getBoundingClientRect();
    const vertical = writingModeOf(block.dom).vertical;
    const coord = vertical ? x : y;
    const start = vertical ? box.left : box.top;
    const end = vertical ? box.right : box.bottom;
    const distance = coord < start ? start - coord : coord > end ? coord - end : 0;
    if (distance < best) {
      best = distance;
      found = block;
    }
  }
  return found;
}
