import { toggleMark } from "../../commands/base";
import { Mark } from "../../doc";
import { keymap } from "../../input/keymap";
import type { Extension } from "../../state/facet";
import { schemaElement } from "../../state/state";

export const Strong = Mark.define("Strong", {
  rank: 60,
  shape: { element: "strong" },
});

/** 型とキー割り当てをひとまとめに。構成に足さなければ Mod-b も効かない */
export const strongExtension: Extension = [
  schemaElement.of(Strong),
  keymap.of([{ key: "Mod-b", run: toggleMark(Strong.name) }]),
];
