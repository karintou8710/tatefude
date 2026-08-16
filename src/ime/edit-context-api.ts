// EditContext がまだ lib.dom.d.ts に無い環境があるので、必要な面だけ自前で持つ。
// グローバルを書き換えないので既存の型定義と衝突しない。

export interface TextUpdateEventLike extends Event {
  readonly updateRangeStart: number;
  readonly updateRangeEnd: number;
  readonly text: string;
  readonly selectionStart: number;
  readonly selectionEnd: number;
}

export type UnderlineStyle = "none" | "solid" | "dotted" | "dashed" | "wavy";
export type UnderlineThickness = "none" | "thin" | "thick";

export interface TextFormatLike {
  readonly rangeStart: number;
  readonly rangeEnd: number;
  readonly underlineStyle: UnderlineStyle;
  readonly underlineThickness: UnderlineThickness;
}

export interface TextFormatUpdateEventLike extends Event {
  getTextFormats(): TextFormatLike[];
}

export interface CharacterBoundsUpdateEventLike extends Event {
  readonly rangeStart: number;
  readonly rangeEnd: number;
}

export interface EditContextLike extends EventTarget {
  readonly text: string;
  readonly selectionStart: number;
  readonly selectionEnd: number;
  readonly characterBoundsRangeStart: number;
  characterBounds(): DOMRect[];
  attachedElements(): HTMLElement[];
  updateText(start: number, end: number, newText: string): void;
  updateSelection(start: number, end: number): void;
  updateControlBounds(bounds: DOMRect): void;
  updateSelectionBounds(bounds: DOMRect): void;
  updateCharacterBounds(rangeStart: number, characterBounds: DOMRect[]): void;
}

export interface EditContextInitLike {
  text?: string;
  selectionStart?: number;
  selectionEnd?: number;
}

type EditContextConstructor = new (init?: EditContextInitLike) => EditContextLike;

export function getEditContextConstructor(): EditContextConstructor | null {
  const ctor = (globalThis as { EditContext?: EditContextConstructor }).EditContext;
  return ctor ?? null;
}

export function isEditContextSupported(): boolean {
  return getEditContextConstructor() !== null;
}

export function createEditContext(init?: EditContextInitLike): EditContextLike {
  const ctor = getEditContextConstructor();
  if (!ctor) {
    throw new Error(
      "EditContext がこのブラウザに無い (Chromium 121+ が必要。Safari / Firefox は未実装)",
    );
  }
  return new ctor(init);
}

/** 型定義が無い環境でも通るようにここへ閉じ込める */
export function attachEditContext(el: HTMLElement, editContext: EditContextLike | null): void {
  (el as unknown as { editContext: EditContextLike | null }).editContext = editContext;
}
