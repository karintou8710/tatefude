import { TextSelection } from "../state/selection";
import type { TextblockView } from "../view/block-view";
import { caretPointFromCoords, domPointToBlockOffset, writingModeOf } from "../view/coords";
import type { EditorView } from "../view/view";

/**
 * ブロックの中で完結するドラッグはブラウザに任せる。跨いだ瞬間だけ主導権を取る —
 * ブラウザは編集ホストの境界で選択を丸めるので、跨ぐ選択は受け取れないため。
 * 跨いでいる間は DOM の選択との同期を止める。見た目は Highlight が描く。
 */
export class PointerSelection {
  private anchor: number | null = null;
  private crossing = false;
  /** ブロックの外から始まったドラッグ。ブラウザが選択を作れないので最後まで自分で持つ */
  private owning = false;

  constructor(private readonly view: EditorView) {}

  handleMouseDown(event: MouseEvent): void {
    if (event.button !== 0) return;
    this.anchor = posAtCoords(this.view, event.clientX, event.clientY);
    this.crossing = false;
    this.owning = false;
    if (this.anchor == null) return;

    // ブロックの外 (エディタの余白や引用の padding) を押すと、ブラウザはキャレットを
    // 置けずに DOM の選択をエディタの外へ飛ばし、フォーカスも落とす。readDOMSelection は
    // それを null として黙るので、自分で拾わないとクリックが丸ごと落ちる
    if (!this.view.textblockForDOM(event.target as globalThis.Node)) {
      event.preventDefault();
      this.owning = true;
      this.select(this.anchor, this.anchor);
      this.view.focus();
    }

    window.addEventListener("mousemove", this.onMouseMove);
    window.addEventListener("mouseup", this.onMouseUp);
  }

  destroy(): void {
    this.stop();
  }

  private onMouseMove = (event: MouseEvent): void => {
    if (this.anchor == null) return;
    const head = posAtCoords(this.view, event.clientX, event.clientY);
    if (head == null) return;

    const anchorBlock = this.view.textblockAt(this.anchor);
    const headBlock = this.view.textblockAt(head);
    const crossing = !!anchorBlock && !!headBlock && anchorBlock !== headBlock;

    // 跨いでいる間だけ DOM の選択との同期を止める。中に戻ったらブラウザに返す
    if (crossing !== this.crossing) {
      this.crossing = crossing;
      this.view.suppressSelectionSync = crossing;
    }
    if (crossing || this.owning) this.select(this.anchor, head);
  };

  private select(anchor: number, head: number): void {
    const selection = TextSelection.create(this.view.state.doc, anchor, head);
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
    // 跨いだまま終えても model の選択は残す。DOM の選択は丸まったままだが Highlight が描く
    this.crossing = false;
    this.owning = false;
    this.view.suppressSelectionSync = false;
  }
}

/** ブロックの外を指していたら一番近いブロックの端に寄せる */
export function posAtCoords(view: EditorView, x: number, y: number): number | null {
  const point = caretPointFromCoords(x, y);
  if (point) {
    const block = view.textblockForDOM(point.node);
    if (block) {
      return block.text.offsetToPos(
        domPointToBlockOffset(block.contentDOM, point.node, point.offset),
      );
    }
  }
  const nearest = nearestBlock(view, x, y);
  if (!nearest) return null;
  // ブロックの外を指しているので、ブロック方向で手前か奥かだけを見る
  const { vertical, blockForwardIsPositive } = writingModeOf(nearest.dom);
  const box = nearest.dom.getBoundingClientRect();
  const beforeStart = vertical ? x < box.left : y < box.top;
  const atBlockStart = blockForwardIsPositive ? beforeStart : !beforeStart;
  return atBlockStart ? nearest.contentFrom : nearest.contentTo;
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
