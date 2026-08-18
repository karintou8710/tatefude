import type { EditorState } from "tatefude";
import { RubyBase, RubyText, Tcy, wrapInRuby, wrapInTcy } from "tatefude";
import type { ToolbarItem } from "../components/Toolbar";

// エディタ間で使い回すツールバーの項目。どのエディタに載せるかは各 index.ts が決める

function insideRuby(state: EditorState): boolean {
  return [state.selection.$from, state.selection.$to].some(
    ($pos) => $pos.parent.type === RubyBase.type || $pos.parent.type === RubyText.type,
  );
}

/** 親文字を選んでから押す。読みは空で作られ、キャレットがその中に入る */
export const rubyItem: ToolbarItem = {
  label: "ルビ",
  command: wrapInRuby,
  isActive: insideRuby,
};

/** 縦中横。横書きでは意味が無いので、縦書きのエディタにだけ載せる */
export const tcyItem: ToolbarItem = {
  label: "縦中横",
  command: wrapInTcy,
  isActive: (state: EditorState) =>
    state.selection.$from.parent.type === Tcy.type || state.selection.$to.parent.type === Tcy.type,
};
