// ブロックごとに EditContext を張ると、ブラウザの選択描画は編集ホストの境界で丸められる。
// そこでネイティブの選択は透明にし、model の選択を CSS Custom Highlight で塗る。
// Highlight はブロックを跨いでも塗られる。

import { type Plot, Pos } from "../doc";
import { blockPosRange } from "./dom-point";
import type { EditorView } from "./view";

export const SELECTION_HIGHLIGHT_NAME = "tf-selection";

/**
 * キャレットがインラインブロック (ルビの rb / rt) の中にいることを示す塗り。
 * 意味が選択とは違うので、`::highlight()` を別に書けるよう名前を分けてある。
 */
export const INLINE_ACTIVE_HIGHLIGHT_NAME = "tf-inline-active";

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

/** 名前ごとにページに 1 つ。複数のエディタが同じ Highlight に range を出し入れする */
const shared = new Map<string, HighlightLike>();

function ensureHighlight(name: string): HighlightLike | null {
  const found = shared.get(name);
  if (found) return found;
  const store = registry();
  const Ctor = highlightConstructor();
  if (!store || !Ctor) return null;
  const highlight = new Ctor();
  shared.set(name, highlight);
  store.set(name, highlight);
  return highlight;
}

export class SelectionHighlighter {
  /** 名前ごとに、自分が足した range。他のエディタの分を消さないため */
  private readonly ranges = new Map<string, Range[]>();

  update(view: EditorView): void {
    this.clearAll();
    const { from, to } = view.state.selection;

    if (from === to) {
      // インラインブロックの内側と外側の端は画面上の同じ点なので、キャレットの位置だけでは
      // 中にいることが見えない。囲んでいるブロックを丸ごと塗って見せる
      this.add(view, INLINE_ACTIVE_HIGHLIGHT_NAME, inlineBlockContentRange(view.state.doc, from));
      return;
    }

    for (const block of view.textblocks) {
      this.add(view, SELECTION_HIGHLIGHT_NAME, {
        from: Math.max(from, block.contentFrom),
        to: Math.min(to, block.contentTo),
      });
    }
  }

  destroy(): void {
    this.clearAll();
  }

  private add(view: EditorView, name: string, range: { from: number; to: number } | null): void {
    if (!range || range.from >= range.to) return;
    const block = view.textblockAt(range.from);
    if (!block) return;
    const highlight = ensureHighlight(name);
    if (!highlight) return;
    const dom = blockPosRange(block, range.from, range.to);
    const list = this.ranges.get(name);
    if (list) list.push(dom);
    else this.ranges.set(name, [dom]);
    highlight.add(dom);
  }

  private clearAll(): void {
    for (const [name, list] of this.ranges) {
      const highlight = shared.get(name);
      if (highlight) for (const range of list) highlight.delete(range);
    }
    this.ranges.clear();
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
