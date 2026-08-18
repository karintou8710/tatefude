import type { EditorState } from "tatefude";
import { Tcy, wrapInTcy } from "tatefude";
import type { ToolbarItem } from "../components/Toolbar";

/** 縦書きのエディタで共通に使う道具。横書きでは意味が無いので分けてある */
export const tcyItem: ToolbarItem = {
  label: "縦中横",
  command: wrapInTcy,
  isActive: (state: EditorState) =>
    state.selection.$from.parent.type === Tcy.type || state.selection.$to.parent.type === Tcy.type,
};
