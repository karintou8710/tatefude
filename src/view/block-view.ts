import { buildTextblockMap, type Plot, type TextblockMap } from "../doc";
import type { BlockEditContext } from "../ime/block-context";
import type { InlineDecoration } from "./decoration";
import { createContainerDOM, createTextblockDOM, renderBlockContent } from "./render";

/**
 * render がブロックの木を降りる間、持ち回るもの。
 *
 * `textblocks` は文書順に集まる (render の副産物)。木そのものを消費者に配ると、
 * ネストの知識が view 層の外まで漏れる。
 */
export interface BlockViewContext {
  readonly decorations: readonly InlineDecoration[];
  readonly textblocks: TextblockView[];
  /** EditContext を張る。IME が使えない環境では null */
  createEditContext(block: TextblockView): BlockEditContext | null;
}

/**
 * ブロック 1 つ分の描画状態。
 *
 * 木を持つのはブロックの構造だけで、インラインの中には降りない。ブロックの中の DOM 位置と
 * オフセットの対応は Range.toString() で計算する (view/coords.ts)。
 */
export abstract class BlockNodeView {
  /** 外側の要素。textblock ならここに EditContext が張られる */
  abstract readonly dom: HTMLElement;
  /** 中身が入る要素。Shape に穴が無ければ dom と同じ。 */
  abstract readonly contentDOM: HTMLElement;
  node: Plot;
  /** 開きトークンの位置 */
  from: number;

  protected constructor(node: Plot, from: number) {
    this.node = node;
    this.from = from;
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

  abstract update(node: Plot, from: number, ctx: BlockViewContext): void;

  destroy(): void {
    this.dom.remove();
  }
}

/** インラインを中身に持つ Plot。EditContext を張る唯一の単位 */
export class TextblockView extends BlockNodeView {
  readonly dom: HTMLElement;
  readonly contentDOM: HTMLElement;
  text: TextblockMap;
  /** 寿命が view と 1 対 1 になるように、EditContext はここが持つ */
  ec: BlockEditContext | null = null;
  private decoKey = "";

  constructor(node: Plot, from: number, ctx: BlockViewContext) {
    super(node, from);
    const rendered = createTextblockDOM(node);
    this.dom = rendered.dom;
    this.contentDOM = rendered.contentDOM;
    this.text = buildTextblockMap(node, from);
    const decorations = decorationsFor(ctx.decorations, node, from);
    this.decoKey = decoKeyOf(decorations);
    renderBlockContent(this.contentDOM, node, from, decorations);
    this.ec = ctx.createEditContext(this);
  }

  /** 再描画が起きたら true */
  update(node: Plot, from: number, ctx: BlockViewContext): boolean {
    const decorations = decorationsFor(ctx.decorations, node, from);
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

  destroy(): void {
    this.ec?.destroy();
    this.ec = null;
    super.destroy();
  }
}

/** ブロックを中身に持つ Plot (blockquote など)。EditContext も tabIndex も持たない */
export class ContainerView extends BlockNodeView {
  readonly dom: HTMLElement;
  readonly contentDOM: HTMLElement;
  readonly children: BlockNodeView[] = [];

  constructor(node: Plot, from: number, ctx: BlockViewContext) {
    super(node, from);
    const rendered = createContainerDOM(node);
    this.dom = rendered.dom;
    this.contentDOM = rendered.contentDOM;
    syncBlockChildren(this.contentDOM, node, this.contentFrom, this.children, ctx);
  }

  update(node: Plot, from: number, ctx: BlockViewContext): void {
    this.node = node;
    this.from = from;
    // 中身が同じでも降りる。textblocks を集め直すのと、位置のずれを伝えるため
    syncBlockChildren(this.contentDOM, node, this.contentFrom, this.children, ctx);
  }

  destroy(): void {
    for (const child of this.children) child.destroy();
    this.children.length = 0;
    super.destroy();
  }
}

/**
 * plot の子ブロックと view の列を突き合わせる。
 *
 * 型が変わったら外枠から作り直す。逆に同じ型なら必ず使い回す — 作り直すと EditContext が
 * 張り替わり、変換中の未確定文字列が飛ぶ。
 */
export function syncBlockChildren(
  parentDOM: HTMLElement,
  plot: Plot,
  contentFrom: number,
  views: BlockNodeView[],
  ctx: BlockViewContext,
): void {
  let pos = contentFrom;
  let index = 0;
  for (const child of plot.content) {
    if (child.isPlot) {
      const existing = views[index];
      if (existing && existing.node.type === child.type) {
        existing.update(child, pos, ctx);
      } else {
        existing?.destroy();
        const created = child.isTextblock
          ? new TextblockView(child, pos, ctx)
          : new ContainerView(child, pos, ctx);
        views[index] = created;
        parentDOM.insertBefore(created.dom, parentDOM.childNodes[index] ?? null);
      }
      const view = views[index];
      if (view instanceof TextblockView) ctx.textblocks.push(view);
      index++;
    }
    pos += child.length;
  }
  while (views.length > index) views.pop()?.destroy();
}

function decorationsFor(
  decorations: readonly InlineDecoration[],
  node: Plot,
  from: number,
): InlineDecoration[] {
  const contentFrom = from + 1;
  const contentTo = contentFrom + node.contentLength;
  return decorations.filter((d) => d.from < contentTo && d.to > contentFrom);
}

function decoKeyOf(decorations: readonly InlineDecoration[]): string {
  return decorations.map((d) => `${d.from}-${d.to}:${d.class ?? ""}:${d.style ?? ""}`).join("|");
}
