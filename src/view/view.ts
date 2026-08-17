import { Pos } from "../doc";
import { EditContextManager } from "../ime/manager";
import { handleBeforeInput } from "../input/beforeinput";
import { handleKeyDown } from "../input/keymap";
import { PointerSelection } from "../input/pointer";
import { decorations, type InlineDecoration } from "../state/decoration";
import type { Selection } from "../state/selection";
import type { EditorState } from "../state/state";
import { Transaction, type TransactionSpec } from "../state/transaction";
import { type BlockNodeView, syncBlockChildren, type TextblockView } from "./block-view";
import { CaretLayer } from "./caret";
import { readDOMSelection, writeDOMSelection } from "./dom-selection";
import {
  handleBeforeInput as handleBeforeInputFacet,
  handleKeyDown as handleKeyDownFacet,
} from "./extension";
import { SelectionHighlighter } from "./selection-highlight";

export interface EditorViewProps {
  state: EditorState;
  dispatchTransaction?(this: EditorView, tr: Transaction): void;
}

export class EditorView {
  readonly dom: HTMLElement;
  state: EditorState;
  /** doc 直下のブロック。中身はネストしうるので木になる */
  readonly children: BlockNodeView[] = [];
  /**
   * 文書順に並べたテキストブロック。render のたびに作り直す。
   * 編集の単位はこちらで、木を見る必要があるのは render と構造編集だけ。
   */
  textblocks: readonly TextblockView[] = [];
  readonly ime: EditContextManager;
  /** ブラウザの選択は編集ホストの境界で丸まるので、跨ぐ選択を進める間は同期を止める */
  suppressSelectionSync = false;
  /**
   * 行を跨ぐ移動でインライン方向の位置を保つための目標座標。
   * 記録したときの head と一致する間だけ有効で、他の移動が入れば自然に捨てられる。
   */
  verticalGoal: { head: number; along: number } | null = null;
  private readonly highlighter = new SelectionHighlighter();
  private readonly caret: CaretLayer;
  private readonly pointer: PointerSelection;
  private destroyed = false;
  private byFrom = new Map<number, TextblockView>();
  private byDOM = new Map<HTMLElement, TextblockView>();

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
    this.caret = new CaretLayer(this);
    this.pointer = new PointerSelection(this);
    this.dom.addEventListener("keydown", this.onKeyDown);
    this.dom.addEventListener("beforeinput", this.onBeforeInput as EventListener);
    this.dom.addEventListener("mousedown", this.onMouseDown);
    document.addEventListener("selectionchange", this.onSelectionChange);

    this.render();
  }

  get decorations(): readonly InlineDecoration[] {
    const result: InlineDecoration[] = [];
    for (const set of this.state.facet(decorations)) result.push(...set.decorations);
    return result;
  }

  /** 更新の指定でも、組み立て済みのトランザクションでも受ける */
  dispatch = (input: TransactionSpec | Transaction): void => {
    if (this.destroyed) return;
    const tr = input instanceof Transaction ? input : this.state.update(input);
    if (this.props.dispatchTransaction) this.props.dispatchTransaction.call(this, tr);
    else this.updateState(tr.state);
  };

  updateState(state: EditorState): void {
    this.state = state;
    this.render();
  }

  /** doc → DOM → 選択 → EditContext の順に押し出す */
  private render(): void {
    const textblocks: TextblockView[] = [];
    syncBlockChildren(this.dom, this.state.doc, 0, this.children, {
      decorations: this.decorations,
      textblocks,
      createEditContext: (block) => this.ime.createFor(block),
    });
    this.textblocks = textblocks;
    this.byFrom = new Map(textblocks.map((block) => [block.from, block]));
    this.byDOM = new Map(textblocks.map((block) => [block.dom, block]));

    writeDOMSelection(this);
    // 選択もキャレットもネイティブではなく model から描く
    this.highlighter.update(this);
    this.caret.update();
    this.ime.syncFromState(this.state);
  }

  /** 位置を含む一番内側のテキストブロック。木は doc 側に任せて引く */
  textblockAt(pos: number): TextblockView | null {
    const doc = this.state.doc;
    if (pos < 0 || pos > doc.contentLength) return null;
    const $pos = Pos.resolve(doc, pos);
    const depth = $pos.textblockDepth();
    // doc 自身がテキストブロックになることはないので、depth 0 は「どこにも入っていない」
    if (depth == null || depth === 0) return null;
    return this.byFrom.get($pos.before(depth)) ?? null;
  }

  /** 文書順での番号。跨ぎ移動が「前後のテキストブロック」だけで書けるようにする */
  textblockIndexAt(pos: number): number {
    const block = this.textblockAt(pos);
    return block ? this.textblocks.indexOf(block) : -1;
  }

  textblockForDOM(node: globalThis.Node | null): TextblockView | null {
    if (!node) return null;
    const element =
      node.nodeType === 1 ? (node as Element) : (node.parentElement as Element | null);
    const blockDOM = element?.closest("[data-ecw-textblock]") ?? null;
    if (!blockDOM) return null;
    return this.byDOM.get(blockDOM as HTMLElement) ?? null;
  }

  focus(): void {
    const block = this.textblockAt(this.state.selection.head) ?? this.textblocks[0];
    block?.dom.focus({ preventScroll: true });
    writeDOMSelection(this);
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    for (const handler of this.state.facet(handleKeyDownFacet)) {
      if (handler(this, event)) {
        event.preventDefault();
        return;
      }
    }
    if (handleKeyDown(this, event)) event.preventDefault();
  };

  private onBeforeInput = (event: InputEvent): void => {
    for (const handler of this.state.facet(handleBeforeInputFacet)) {
      if (handler(this, event)) {
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
    if (this.suppressSelectionSync || this.destroyed) return;
    if (!this.dom.contains(document.activeElement)) return;
    const selection = readDOMSelection(this);
    if (!selection || selection.eq(this.state.selection)) return;
    // インラインブロックの内側と外側の端は DOM 上の同じ点になる。読み戻したものが
    // 同じ点を指しているだけなら、model が持っている方を残す
    if (this.sameDOMPoints(selection, this.state.selection)) return;
    this.dispatch({ selection, userEvent: "select" });
  };

  private sameDOMPoints(a: Selection, b: Selection): boolean {
    const key = (pos: number): string => {
      const block = this.textblockAt(pos);
      return block ? `${block.from}:${block.text.posToOffset(pos)}` : `?${pos}`;
    };
    return key(a.anchor) === key(b.anchor) && key(a.head) === key(b.head);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.dom.removeEventListener("keydown", this.onKeyDown);
    this.dom.removeEventListener("beforeinput", this.onBeforeInput as EventListener);
    this.dom.removeEventListener("mousedown", this.onMouseDown);
    document.removeEventListener("selectionchange", this.onSelectionChange);
    this.pointer.destroy();
    this.highlighter.destroy();
    this.caret.destroy();
    // EditContext は TextblockView が持っているので、木を畳めば一緒に外れる
    for (const child of this.children) child.destroy();
    this.children.length = 0;
    this.textblocks = [];
    this.byFrom.clear();
    this.byDOM.clear();
    this.dom.remove();
  }
}
