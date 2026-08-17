// ブロックごとに EditContext を張ると、ブラウザの選択描画は編集ホストの境界で丸められる。
// そこでネイティブの選択は透明にし、model の選択を CSS Custom Highlight で塗る。
// Highlight はブロックを跨いでも塗られる。

import { type Plot, Pos } from "../doc";
import { blockPosRange } from "./dom-point";
import type { EditorView } from "./view";

export const SELECTION_HIGHLIGHT_NAME = "ecw-selection";

const STYLE_ID = "ecw-selection-style";

interface HighlightLike {
  add(range: Range): void;
  delete(range: Range): void;
  clear(): void;
}

interface HighlightRegistryLike {
  set(name: string, highlight: HighlightLike): void;
  get(name: string): HighlightLike | undefined;
  delete(name: string): void;
}

type HighlightConstructor = new (...ranges: Range[]) => HighlightLike;

function registry(): HighlightRegistryLike | null {
  const css = (globalThis as { CSS?: { highlights?: HighlightRegistryLike } }).CSS;
  return css?.highlights ?? null;
}

function highlightConstructor(): HighlightConstructor | null {
  return (globalThis as { Highlight?: HighlightConstructor }).Highlight ?? null;
}

export function isHighlightSupported(): boolean {
  return registry() !== null && highlightConstructor() !== null;
}

/** ページに 1 つ。複数のエディタが同じ Highlight に range を出し入れする */
let shared: HighlightLike | null = null;

function ensureHighlight(): HighlightLike | null {
  if (shared) return shared;
  const store = registry();
  const Ctor = highlightConstructor();
  if (!store || !Ctor) return null;
  shared = new Ctor();
  store.set(SELECTION_HIGHLIGHT_NAME, shared);
  injectDefaultStyle();
  return shared;
}

/** 後から書いた CSS で上書きできる */
function injectDefaultStyle(): void {
  if (typeof document === "undefined" || document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = [
    "[data-ecw-editor]::selection, [data-ecw-editor] ::selection { background-color: transparent; }",
    `::highlight(${SELECTION_HIGHLIGHT_NAME}) { background-color: Highlight; color: HighlightText; }`,
  ].join("\n");
  document.head.appendChild(style);
}

export class SelectionHighlighter {
  private ranges: Range[] = [];

  update(view: EditorView): void {
    const highlight = ensureHighlight();
    if (!highlight) return;
    this.clear(highlight);

    const { from, to } = view.state.selection;
    if (from === to) {
      // インラインブロックの内側と外側の端は画面上の同じ点なので、キャレットの位置だけでは
      // 中にいることが見えない。囲んでいるブロックを丸ごと塗って見せる
      this.addRange(view, highlight, inlineBlockContentRange(view.state.doc, from));
      return;
    }

    for (const block of view.textblocks) {
      const start = Math.max(from, block.contentFrom);
      const end = Math.min(to, block.contentTo);
      if (start >= end) continue;
      const range = blockPosRange(block, start, end);
      this.ranges.push(range);
      highlight.add(range);
    }
  }

  destroy(): void {
    const highlight = registry()?.get(SELECTION_HIGHLIGHT_NAME);
    if (highlight) this.clear(highlight);
  }

  private addRange(
    view: EditorView,
    highlight: HighlightLike,
    range: { from: number; to: number } | null,
  ): void {
    if (!range || range.from >= range.to) return;
    const block = view.textblockAt(range.from);
    if (!block) return;
    const dom = blockPosRange(block, range.from, range.to);
    this.ranges.push(dom);
    highlight.add(dom);
  }

  private clear(highlight: HighlightLike): void {
    for (const range of this.ranges) highlight.delete(range);
    this.ranges = [];
  }
}

/** その位置を囲む、一番内側のインラインブロックの中身の範囲。囲まれていなければ null */
function inlineBlockContentRange(doc: Plot, pos: number): { from: number; to: number } | null {
  if (pos < 0 || pos > doc.contentLength) return null;
  const $pos = Pos.resolve(doc, pos);
  for (let depth = $pos.depth; depth > 0; depth--) {
    if ($pos.node(depth).type.cursorInsideBounds) {
      return { from: $pos.start(depth), to: $pos.end(depth) };
    }
  }
  return null;
}
