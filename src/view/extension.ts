import { Facet } from "../state/facet";
import type { DecorationSet } from "./decoration";
import type { EditorView } from "./view";

/**
 * view が読む facet。機能はこれらに値を供給する extension として足す。
 */

/** 描画に重ねる装飾 */
export const decorations: Facet<DecorationSet> = Facet.define<DecorationSet>();

/** keydown を横取りする。true を返すと preventDefault される。 */
export const handleKeyDown: Facet<(view: EditorView, event: KeyboardEvent) => boolean> =
  Facet.define<(view: EditorView, event: KeyboardEvent) => boolean>();

/** beforeinput を横取りする。true を返すと preventDefault される。 */
export const handleBeforeInput: Facet<(view: EditorView, event: InputEvent) => boolean> =
  Facet.define<(view: EditorView, event: InputEvent) => boolean>();
