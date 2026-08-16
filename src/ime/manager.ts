import { insertText } from "../commands/base";
import { buildTextblockMap } from "../doc";
import { type CompositionEvent, compositionEvent } from "../plugins/composition";
import { TextSelection } from "../state/selection";
import type { EditorState } from "../state/state";
import type { TextblockView } from "../view/block-view";
import type { InlineDecoration } from "../view/decoration";
import type { EditorView } from "../view/view";
import { BlockEditContext } from "./block-context";
import { characterBoundsFor, controlBoundsFor, selectionBoundsFor } from "./bounds";
import type { TextFormatLike, TextUpdateEventLike } from "./edit-context-api";
import { isEditContextSupported } from "./edit-context-api";

/** compositionend から keydown までの猶予。確定の Enter はこの中に収まる */
const COMPOSITION_END_SLACK = 200;
/** 十分に昔。差を取ると必ず猶予を超える */
const NEVER = Number.NEGATIVE_INFINITY;

/**
 * doc が唯一の真実で、各 EditContext のバッファはその射影。state 更新のたびに全ブロック分を
 * 合わせ直す (フォーカス中のブロックだけではない)。
 *
 * EditContext のインスタンスを持つのは {@link TextblockView} の側。ここは張り方と、
 * イベントを doc に反映する経路だけを持つ。
 */
export class EditContextManager {
  debug: ((type: string, detail: unknown) => void) | null = null;
  private compositionEndedAt = NEVER;

  constructor(private readonly view: EditorView) {}

  get supported(): boolean {
    return isEditContextSupported();
  }

  get active(): BlockEditContext | null {
    return this.all.find((c) => c.dom === document.activeElement) ?? null;
  }

  get all(): readonly BlockEditContext[] {
    const contexts: BlockEditContext[] = [];
    for (const block of this.view.textblocks) if (block.ec) contexts.push(block.ec);
    return contexts;
  }

  /**
   * 変換中か。**`KeyboardEvent.isComposing` は使えない** — EditContext が付いていると
   * IME の入力は `WebInputMethodControllerImpl::SetComposition` から EditContext 側へ
   * 直行し、`InputMethodController` には composition が立たない。`isComposing` はその
   * `HasComposition()` を見ている (`events/keyboard_event.cc:71`) ので常に false になる。
   */
  get composing(): boolean {
    return this.all.some((context) => context.composing);
  }

  /**
   * 変換を確定させた keydown か。確定の Enter は変換を閉じるためのもので、改行の意図では
   * ないので捨てる。ただし捨てるのは確定直後の 1 回だけ — 2 回目の Enter は改行にする。
   */
  endedCompositionRecently(event: KeyboardEvent): boolean {
    if (event.timeStamp - this.compositionEndedAt > COMPOSITION_END_SLACK) return false;
    this.compositionEndedAt = NEVER;
    return true;
  }

  /**
   * テキストブロックの view から呼ばれる。ハンドラがその view を捕まえた状態で作るので、
   * イベントから view への逆引きが要らない。
   */
  createFor(block: TextblockView): BlockEditContext | null {
    if (!this.supported) return null;
    return new BlockEditContext(block.dom, block.text, {
      onTextUpdate: (context, event) => this.handleTextUpdate(block, context, event),
      onTextFormatUpdate: (_, formats) => this.handleTextFormatUpdate(block, formats),
      onCharacterBoundsUpdate: (context, start, end) =>
        this.handleCharacterBoundsUpdate(block, context, start, end),
      onCompositionStart: () => {
        this.debug?.("compositionstart", {});
        this.dispatchComposition({ type: "start" });
      },
      onCompositionEnd: () => {
        this.debug?.("compositionend", {});
        this.compositionEndedAt = performance.now();
        this.dispatchComposition({ type: "end" });
      },
    });
  }

  syncFromState(state: EditorState): void {
    const selection = state.selection;
    for (const block of this.view.textblocks) {
      const context = block.ec;
      if (!context) continue;

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
  }

  /** オフセットはブロックローカルなので、写像もブロックの中で閉じている */
  private handleTextUpdate(
    block: TextblockView,
    context: BlockEditContext,
    event: TextUpdateEventLike,
  ): void {
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
      // EditContext が言う選択は変更後のオフセットなので、新しい doc から解き直す
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

  private handleTextFormatUpdate(block: TextblockView, formats: TextFormatLike[]): void {
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
    block: TextblockView,
    context: BlockEditContext,
    rangeStart: number,
    rangeEnd: number,
  ): void {
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
