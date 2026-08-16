import { EditContextManager } from "../ime/manager";
import { handleBeforeInput } from "../input/beforeinput";
import { handleKeyDown } from "../input/keymap";
import { PointerSelection } from "../input/pointer";
import type { EditorState } from "../state/state";
import type { Transaction } from "../state/transaction";
import { BlockView } from "./block-view";
import type { InlineDecoration } from "./decoration";
import { readDOMSelection, writeDOMSelection } from "./dom-selection";
import { SelectionHighlighter } from "./selection-highlight";

export interface EditorViewProps {
  state: EditorState;
  dispatchTransaction?(this: EditorView, tr: Transaction): void;
}

export class EditorView {
  readonly dom: HTMLElement;
  state: EditorState;
  readonly blocks: BlockView[] = [];
  readonly ime: EditContextManager;
  /** 自分で DOM の選択を書いている間は selectionchange を無視する */
  updatingSelection = false;
  /**
   * ブロックを跨ぐ選択を自分で進めている間は、DOM の選択との同期を止める。
   * ブラウザ側の選択は編集ホストの境界で丸まってしまうため。
   */
  suppressSelectionSync = false;
  private readonly highlighter = new SelectionHighlighter();
  private readonly pointer: PointerSelection;
  private destroyed = false;

  constructor(
    place: HTMLElement,
    private readonly props: EditorViewProps,
  ) {
    this.state = props.state;
    this.dom = document.createElement("div");
    this.dom.className = "ecw-editor";
    this.dom.setAttribute("data-ecw-editor", "");
    place.appendChild(this.dom);

    this.ime = new EditContextManager(this);
    this.pointer = new PointerSelection(this);
    this.dom.addEventListener("keydown", this.onKeyDown);
    this.dom.addEventListener("beforeinput", this.onBeforeInput as EventListener);
    this.dom.addEventListener("mousedown", this.onMouseDown);
    document.addEventListener("selectionchange", this.onSelectionChange);

    this.render();
  }

  get decorations(): readonly InlineDecoration[] {
    const result: InlineDecoration[] = [];
    for (const plugin of this.state.plugins) {
      const set = plugin.props.decorations?.(this.state);
      if (set) result.push(...set.decorations);
    }
    return result;
  }

  dispatch = (tr: Transaction): void => {
    if (this.destroyed) return;
    if (this.props.dispatchTransaction) {
      this.props.dispatchTransaction.call(this, tr);
    } else {
      this.updateState(this.state.apply(tr));
    }
  };

  updateState(state: EditorState): void {
    this.state = state;
    this.render();
  }

  /** doc → DOM → 選択 → EditContext の順に押し出す */
  private render(): void {
    const decorations = this.decorations;
    const doc = this.state.doc;
    let pos = 0;
    for (let i = 0; i < doc.childCount; i++) {
      const node = doc.child(i);
      // 雛形の doc 直下はブロックだけ
      if (!node.isPlot) continue;
      const contentFrom = pos + 1;
      const contentTo = contentFrom + node.contentLength;
      const blockDecos = decorations.filter((d) => d.from < contentTo && d.to > contentFrom);
      const existing = this.blocks[i];
      if (existing) {
        existing.update(node, pos, blockDecos);
      } else {
        const block = new BlockView(node, pos, blockDecos);
        this.blocks[i] = block;
        this.dom.appendChild(block.dom);
      }
      pos += node.length;
    }
    while (this.blocks.length > doc.childCount) {
      this.blocks.pop()?.destroy();
    }

    writeDOMSelection(this);
    // 選択の見た目はネイティブではなく Highlight が描く
    this.highlighter.update(this);
    this.ime.syncFromState(this.state);
  }

  blockAt(pos: number): BlockView | null {
    return this.blocks.find((block) => block.contains(pos)) ?? null;
  }

  blockIndexAt(pos: number): number {
    return this.blocks.findIndex((block) => block.contains(pos));
  }

  blockForDOM(node: globalThis.Node | null): BlockView | null {
    if (!node) return null;
    const element =
      node.nodeType === 1 ? (node as Element) : (node.parentElement as Element | null);
    const blockDOM = element?.closest("[data-ecw-block]") ?? null;
    if (!blockDOM) return null;
    return this.blocks.find((block) => block.dom === blockDOM) ?? null;
  }

  focus(): void {
    const block = this.blockAt(this.state.selection.head) ?? this.blocks[0];
    block?.dom.focus({ preventScroll: true });
    writeDOMSelection(this);
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    for (const plugin of this.state.plugins) {
      if (plugin.props.handleKeyDown?.(this, event)) {
        event.preventDefault();
        return;
      }
    }
    if (handleKeyDown(this, event)) event.preventDefault();
  };

  private onBeforeInput = (event: InputEvent): void => {
    for (const plugin of this.state.plugins) {
      if (plugin.props.handleBeforeInput?.(this, event)) {
        event.preventDefault();
        return;
      }
    }
    if (handleBeforeInput(this, event)) event.preventDefault();
  };

  private onMouseDown = (event: MouseEvent): void => {
    this.pointer.handleMouseDown(event);
  };

  private onSelectionChange = (): void => {
    if (this.updatingSelection || this.suppressSelectionSync || this.destroyed) return;
    if (!this.dom.contains(document.activeElement)) return;
    const selection = readDOMSelection(this);
    if (!selection || selection.eq(this.state.selection)) return;
    this.dispatch(this.state.tr.setSelection(selection));
  };

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.dom.removeEventListener("keydown", this.onKeyDown);
    this.dom.removeEventListener("beforeinput", this.onBeforeInput as EventListener);
    this.dom.removeEventListener("mousedown", this.onMouseDown);
    document.removeEventListener("selectionchange", this.onSelectionChange);
    this.pointer.destroy();
    this.highlighter.destroy();
    this.ime.destroy();
    for (const block of this.blocks) block.destroy();
    this.blocks.length = 0;
    this.dom.remove();
  }
}
