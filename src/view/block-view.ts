import { buildTextblockMap, type Plot, type TextblockMap } from "../doc";
import type { InlineDecoration } from "./decoration";
import { createBlockDOM, renderBlockContent } from "./render";

/**
 * ブロック 1 つ分の描画状態。EditContext はこの dom に 1 つずつ張り付く。
 *
 * ViewDesc のような木は持たない。ブロックの中の DOM 位置とオフセットの対応は
 * Range.toString() で計算する (view/coords.ts)。
 */
export class BlockView {
  /** EditContext を張る外側の要素 */
  readonly dom: HTMLElement;
  /** 中身が入る要素。Shape に穴が無ければ dom と同じ。 */
  readonly contentDOM: HTMLElement;
  node: Plot;
  from: number;
  text: TextblockMap;
  private decoKey = "";

  constructor(node: Plot, from: number, decorations: readonly InlineDecoration[]) {
    const rendered = createBlockDOM(node);
    this.dom = rendered.dom;
    this.contentDOM = rendered.contentDOM;
    this.node = node;
    this.from = from;
    this.text = buildTextblockMap(node, from);
    this.decoKey = decoKeyOf(decorations);
    renderBlockContent(this.contentDOM, node, from, decorations);
  }

  /** 再描画が起きたら true */
  update(node: Plot, from: number, decorations: readonly InlineDecoration[]): boolean {
    const decoKey = decoKeyOf(decorations);
    const needsRender = this.node !== node || this.decoKey !== decoKey;
    const moved = this.from !== from;
    if (!needsRender && !moved) return false;

    this.node = node;
    this.from = from;
    this.decoKey = decoKey;
    // 位置がずれただけでも doc 位置との対応表は作り直す
    this.text = buildTextblockMap(node, from);
    if (needsRender) renderBlockContent(this.contentDOM, node, from, decorations);
    return needsRender;
  }

  /** ブロックの中身の doc 位置の範囲 */
  get contentFrom(): number {
    return this.from + 1;
  }
  get contentTo(): number {
    return this.from + 1 + this.node.contentLength;
  }

  contains(pos: number): boolean {
    return pos >= this.contentFrom && pos <= this.contentTo;
  }

  destroy(): void {
    this.dom.remove();
  }
}

function decoKeyOf(decorations: readonly InlineDecoration[]): string {
  return decorations.map((d) => `${d.from}-${d.to}:${d.class ?? ""}:${d.style ?? ""}`).join("|");
}
