import type { Extension } from "../state/facet";
import { Field } from "../state/facet";
import { Annotation } from "../state/transaction";
import { DecorationSet, type InlineDecoration } from "../view/decoration";
import { decorations } from "../view/extension";

export interface CompositionState {
  decorations: DecorationSet;
}

export type CompositionEvent =
  | { type: "format"; decorations: InlineDecoration[] }
  | { type: "start" }
  | { type: "end" };

/** IME 変換の状況を伝える注釈 */
export const compositionEvent: Annotation.Type<CompositionEvent> =
  Annotation.define<CompositionEvent>();

/**
 * IME 変換中の見た目を持つフィールド。
 *
 * 変換文字列そのものは doc に入っていて、下線だけをここで decoration として重ねる。
 * 変換範囲は textformatupdate が教えてくれるので、それを注釈で受け取って装飾に写す。
 */
export const compositionField: Field<CompositionState> = Field.define<CompositionState>({
  create: () => ({ decorations: DecorationSet.empty }),
  update: (value, tr) => {
    const event = tr.annotation(compositionEvent);
    if (event?.type === "format") {
      return { decorations: DecorationSet.create(event.decorations) };
    }
    if (event?.type === "end") {
      return { decorations: DecorationSet.empty };
    }
    if (tr.docChanged && value.decorations.decorations.length) {
      return { decorations: value.decorations.map(tr.mapping) };
    }
    return value;
  },
  provide: (field) => decorations.from(field, (value) => value.decorations),
});

export function composition(): Extension {
  return compositionField;
}
