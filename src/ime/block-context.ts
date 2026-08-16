import type { TextblockMap } from "../doc";
import {
  attachEditContext,
  type CharacterBoundsUpdateEventLike,
  createEditContext,
  type EditContextLike,
  type TextFormatLike,
  type TextFormatUpdateEventLike,
  type TextUpdateEventLike,
} from "./edit-context-api";

export interface BlockEditContextHandlers {
  onTextUpdate(target: BlockEditContext, event: TextUpdateEventLike): void;
  onTextFormatUpdate(target: BlockEditContext, formats: TextFormatLike[]): void;
  onCharacterBoundsUpdate(target: BlockEditContext, rangeStart: number, rangeEnd: number): void;
  onCompositionStart(target: BlockEditContext): void;
  onCompositionEnd(target: BlockEditContext): void;
}

export class BlockEditContext {
  readonly ec: EditContextLike;
  composing = false;

  constructor(
    readonly dom: HTMLElement,
    text: TextblockMap,
    private readonly handlers: BlockEditContextHandlers,
  ) {
    this.ec = createEditContext({
      text: text.text,
      selectionStart: 0,
      selectionEnd: 0,
    });
    this.ec.addEventListener("textupdate", this.onTextUpdate);
    this.ec.addEventListener("textformatupdate", this.onTextFormatUpdate);
    this.ec.addEventListener("characterboundsupdate", this.onCharacterBoundsUpdate);
    this.ec.addEventListener("compositionstart", this.onCompositionStart);
    this.ec.addEventListener("compositionend", this.onCompositionEnd);
    attachEditContext(dom, this.ec);
  }

  /**
   * 比較の相手は EditContext が実際に持っている文字列 (最後に押し込んだ文字列ではない)。
   * EditContext 自身が書き換えた直後は差分ゼロになり、変換中の IME を邪魔しない。
   */
  sync(next: TextblockMap, selection: { start: number; end: number } | null): void {
    const current = this.ec.text;
    const wanted = next.text;
    if (current !== wanted) {
      let start = 0;
      const max = Math.min(current.length, wanted.length);
      while (start < max && current[start] === wanted[start]) start++;
      let endCurrent = current.length;
      let endWanted = wanted.length;
      while (
        endCurrent > start &&
        endWanted > start &&
        current[endCurrent - 1] === wanted[endWanted - 1]
      ) {
        endCurrent--;
        endWanted--;
      }
      this.ec.updateText(start, endCurrent, wanted.slice(start, endWanted));
    }
    if (
      selection &&
      (selection.start !== this.ec.selectionStart || selection.end !== this.ec.selectionEnd)
    ) {
      this.ec.updateSelection(selection.start, selection.end);
    }
  }

  updateBounds(controlBounds: DOMRect, selectionBounds: DOMRect): void {
    this.ec.updateControlBounds(controlBounds);
    this.ec.updateSelectionBounds(selectionBounds);
  }

  updateCharacterBounds(rangeStart: number, bounds: DOMRect[]): void {
    this.ec.updateCharacterBounds(rangeStart, bounds);
  }

  destroy(): void {
    this.ec.removeEventListener("textupdate", this.onTextUpdate);
    this.ec.removeEventListener("textformatupdate", this.onTextFormatUpdate);
    this.ec.removeEventListener("characterboundsupdate", this.onCharacterBoundsUpdate);
    this.ec.removeEventListener("compositionstart", this.onCompositionStart);
    this.ec.removeEventListener("compositionend", this.onCompositionEnd);
    attachEditContext(this.dom, null);
  }

  private onTextUpdate = (event: Event): void => {
    this.handlers.onTextUpdate(this, event as TextUpdateEventLike);
  };

  private onTextFormatUpdate = (event: Event): void => {
    this.handlers.onTextFormatUpdate(this, (event as TextFormatUpdateEventLike).getTextFormats());
  };

  private onCharacterBoundsUpdate = (event: Event): void => {
    const e = event as CharacterBoundsUpdateEventLike;
    this.handlers.onCharacterBoundsUpdate(this, e.rangeStart, e.rangeEnd);
  };

  private onCompositionStart = (): void => {
    this.composing = true;
    this.handlers.onCompositionStart(this);
  };

  private onCompositionEnd = (): void => {
    this.composing = false;
    this.handlers.onCompositionEnd(this);
  };
}
