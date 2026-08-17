import { DecorationSet, decorations, type InlineDecoration } from "./decoration";
import { Field } from "./facet";
import { Annotation } from "./transaction";

export interface CompositionState {
  decorations: DecorationSet;
}

export type CompositionEvent =
  | { type: "format"; decorations: InlineDecoration[] }
  | { type: "start" }
  | { type: "end" };

export const compositionEvent: Annotation.Type<CompositionEvent> =
  Annotation.define<CompositionEvent>();

/**
 * 変換文字列そのものは doc に入っていて、ここは下線だけを重ねる。範囲は
 * textformatupdate が教えてくれるので、注釈で受け取って装飾に写す。
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
      return { decorations: value.decorations.map(tr.changes) };
    }
    return value;
  },
  provide: (field) => decorations.from(field, (value) => value.decorations),
});
