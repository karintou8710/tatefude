import type { EditorState } from "tatefude";
import { RubyBase, RubyText, wrapInRuby } from "tatefude";
import type { ToolbarItem } from "../components/Toolbar";

// どのエディタでも使う道具。縦書き専用のものは vertical.ts

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
