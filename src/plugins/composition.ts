import { Plugin, PluginKey } from "../state/plugin";
import { DecorationSet, type InlineDecoration } from "../view/decoration";

export interface CompositionState {
  decorations: DecorationSet;
}

export type CompositionMeta =
  | { type: "format"; decorations: InlineDecoration[] }
  | { type: "start" }
  | { type: "end" };

export const compositionKey = new PluginKey<CompositionState>("composition");

/**
 * IME 変換中の見た目を持つプラグイン。
 *
 * 変換文字列そのものは doc に入っていて、下線だけをここで decoration として重ねる。
 * 変換範囲は textformatupdate が教えてくれるので、それをそのまま装飾に写す。
 */
export function composition(): Plugin<CompositionState> {
  return new Plugin<CompositionState>({
    key: compositionKey,
    state: {
      init: () => ({ decorations: DecorationSet.empty }),
      apply: (tr, value) => {
        const meta = tr.getMeta(compositionKey) as CompositionMeta | undefined;
        if (meta?.type === "format") {
          return { decorations: DecorationSet.create(meta.decorations) };
        }
        if (meta?.type === "end") {
          return { decorations: DecorationSet.empty };
        }
        if (tr.docChanged && value.decorations.decorations.length) {
          return { decorations: value.decorations.map(tr.mapping) };
        }
        return value;
      },
    },
    props: {
      decorations: (state) => compositionKey.getState(state)?.decorations ?? null,
    },
  });
}
