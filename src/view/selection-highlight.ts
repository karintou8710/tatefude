import { blockOffsetRange } from "./coords";
import type { EditorView } from "./view";

/**
 * 選択の描画。
 *
 * ブロックごとに EditContext を張ると、ブラウザが描く選択は編集ホストの境界で
 * 丸められてしまう (docs/editcontext.md 参照)。そこでネイティブの選択描画は消して、
 * model の選択を CSS Custom Highlight API で自分で塗る。
 * Highlight はブロックを跨いでも塗られる。
 */
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

/** ページに 1 つだけ作る。複数のエディタが同じ Highlight に range を出し入れする。 */
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

/**
 * 既定の見た目。
 * - エディタの中ではネイティブの選択を透明にする
 * - 代わりに ::highlight() をシステムの選択色で塗る
 * どちらも後から書いた CSS で上書きできる。
 */
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

  /** model の選択をブロックごとの Range にして塗り直す */
  update(view: EditorView): void {
    const highlight = ensureHighlight();
    if (!highlight) return;
    this.clear(highlight);

    const { from, to } = view.state.selection;
    if (from === to) return;

    for (const block of view.blocks) {
      const start = Math.max(from, block.contentFrom);
      const end = Math.min(to, block.contentTo);
      if (start >= end) continue;
      const range = blockOffsetRange(
        block.contentDOM,
        block.text.posToOffset(start),
        block.text.posToOffset(end),
      );
      this.ranges.push(range);
      highlight.add(range);
    }
  }

  destroy(): void {
    const highlight = registry()?.get(SELECTION_HIGHLIGHT_NAME);
    if (highlight) this.clear(highlight);
  }

  private clear(highlight: HighlightLike): void {
    for (const range of this.ranges) highlight.delete(range);
    this.ranges = [];
  }
}
