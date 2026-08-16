import { Facet } from "../state/facet";
import type { DecorationSet } from "./decoration";
import type { EditorView } from "./view";

/** 機能はこれらに値を供給する extension として足す */

export const decorations: Facet<DecorationSet> = Facet.define<DecorationSet>();

/** true を返すと preventDefault される */
export const handleKeyDown: Facet<(view: EditorView, event: KeyboardEvent) => boolean> =
  Facet.define<(view: EditorView, event: KeyboardEvent) => boolean>();

/** true を返すと preventDefault される */
export const handleBeforeInput: Facet<(view: EditorView, event: InputEvent) => boolean> =
  Facet.define<(view: EditorView, event: InputEvent) => boolean>();
