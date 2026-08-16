import { insertText } from "../commands/base";
import { buildTextblockMap } from "../doc";
import { type CompositionEvent, compositionEvent } from "../plugins/composition";
import { TextSelection } from "../state/selection";
import type { EditorState } from "../state/state";
import type { BlockView } from "../view/block-view";
import type { InlineDecoration } from "../view/decoration";
import type { EditorView } from "../view/view";
import { BlockEditContext, type BlockEditContextHandlers } from "./block-context";
import { characterBoundsFor, controlBoundsFor, selectionBoundsFor } from "./bounds";
import type { TextFormatLike, TextUpdateEventLike } from "./edit-context-api";
import { isEditContextSupported } from "./edit-context-api";

/**
 * ブロックと EditContext の対応を保つ。
 *
 * doc が唯一の真実で、各 EditContext のバッファはその射影。state が更新されるたびに
 * 全ブロック分のバッファを合わせ直す (フォーカス中のブロックだけではない)。
 */
export class EditContextManager {
  private readonly contexts: BlockEditContext[] = [];
  private readonly handlers: BlockEditContextHandlers;
  /** デバッグ用に IME イベントを覗くためのフック */
  debug: ((type: string, detail: unknown) => void) | null = null;

  constructor(private readonly view: EditorView) {
    this.handlers = {
      onTextUpdate: (target, event) => this.handleTextUpdate(target, event),
      onTextFormatUpdate: (target, formats) => this.handleTextFormatUpdate(target, formats),
      onCharacterBoundsUpdate: (target, start, end) =>
        this.handleCharacterBoundsUpdate(target, start, end),
      onCompositionStart: () => {
        this.debug?.("compositionstart", {});
        this.dispatchComposition({ type: "start" });
      },
      onCompositionEnd: () => {
        this.debug?.("compositionend", {});
        this.dispatchComposition({ type: "end" });
      },
    };
  }

  get supported(): boolean {
    return isEditContextSupported();
  }

  /** フォーカス中のブロックの EditContext (デバッグ表示用) */
  get active(): BlockEditContext | null {
    return this.contexts.find((c) => c.dom === document.activeElement) ?? null;
  }

  get all(): readonly BlockEditContext[] {
    return this.contexts;
  }

  syncFromState(state: EditorState): void {
    if (!this.supported) return;
    const blocks = this.view.blocks;
    const selection = state.selection;

    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];
      let context = this.contexts[i];
      if (!context || context.dom !== block.dom) {
        context?.destroy();
        context = new BlockEditContext(block.dom, block.text, this.handlers);
        this.contexts[i] = context;
      }

      // 選択がこのブロックに掛かっていれば、その部分を EditContext の選択にする
      const overlaps = selection.to >= block.contentFrom && selection.from <= block.contentTo;
      const range = overlaps
        ? {
            start: block.text.posToOffset(Math.max(selection.from, block.contentFrom)),
            end: block.text.posToOffset(Math.min(selection.to, block.contentTo)),
          }
        : null;
      context.sync(block.text, range);

      if (range && block.contains(selection.head)) {
        context.updateBounds(
          controlBoundsFor(block),
          selectionBoundsFor(block, range.start, range.end),
        );
      }
    }

    while (this.contexts.length > blocks.length) {
      this.contexts.pop()?.destroy();
    }
  }

  destroy(): void {
    for (const context of this.contexts) context.destroy();
    this.contexts.length = 0;
  }

  private blockFor(context: BlockEditContext): BlockView | null {
    return this.view.blocks.find((block) => block.dom === context.dom) ?? null;
  }

  /**
   * EditContext のバッファ上の変更を、そのままドキュメントの変更に写す。
   * オフセットはブロックローカルなので、写像もブロックの中で閉じている。
   */
  private handleTextUpdate(context: BlockEditContext, event: TextUpdateEventLike): void {
    const block = this.blockFor(context);
    if (!block) return;
    this.debug?.("textupdate", {
      range: [event.updateRangeStart, event.updateRangeEnd],
      text: event.text,
      selection: [event.selectionStart, event.selectionEnd],
    });
    const view = this.view;
    const before = block.text;
    const from = before.offsetToPos(event.updateRangeStart);
    const to = before.offsetToPos(event.updateRangeEnd);

    view.dispatch({
      ...insertText(
        from,
        to,
        event.text,
        context.composing ? "input.type.compose" : "input.type",
      )(view.state),
      // EditContext が言ってきた選択を、変更後のブロックのオフセットから解く
      selection: (doc) => {
        const blockNode = doc.nodeAt(block.from);
        if (!blockNode?.isPlot) return null;
        const after = buildTextblockMap(blockNode, block.from);
        return TextSelection.create(
          doc,
          after.offsetToPos(event.selectionStart),
          after.offsetToPos(event.selectionEnd),
        );
      },
    });
  }

  private handleTextFormatUpdate(context: BlockEditContext, formats: TextFormatLike[]): void {
    const block = this.blockFor(context);
    if (!block) return;
    this.debug?.(
      "textformatupdate",
      formats.map((f) => [f.rangeStart, f.rangeEnd, f.underlineStyle, f.underlineThickness]),
    );
    const decorations: InlineDecoration[] = [];
    for (const format of formats) {
      if (format.underlineStyle === "none") continue;
      decorations.push({
        from: block.text.offsetToPos(format.rangeStart),
        to: block.text.offsetToPos(format.rangeEnd),
        class: "ecw-composition",
        style: underlineStyle(format),
      });
    }
    this.dispatchComposition({ type: "format", decorations });
  }

  private handleCharacterBoundsUpdate(
    context: BlockEditContext,
    rangeStart: number,
    rangeEnd: number,
  ): void {
    const block = this.blockFor(context);
    if (!block) return;
    this.debug?.("characterboundsupdate", { range: [rangeStart, rangeEnd] });
    context.updateCharacterBounds(rangeStart, characterBoundsFor(block, rangeStart, rangeEnd));
  }

  private dispatchComposition(event: CompositionEvent): void {
    this.view.dispatch({ annotations: compositionEvent.of(event) });
  }
}

function underlineStyle(format: TextFormatLike): string {
  const thickness = format.underlineThickness === "thick" ? "2px" : "1px";
  return [
    "text-decoration-line: underline",
    `text-decoration-style: ${format.underlineStyle}`,
    `text-decoration-thickness: ${thickness}`,
  ].join("; ");
}
