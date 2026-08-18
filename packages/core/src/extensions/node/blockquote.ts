// Blockquote の定義は Wordgard (MIT) から派生。
// 著作権表示は LICENSE の "Third-party code" を参照。

import { Node, Plot } from "../../doc";
import type { Extension } from "../../state/facet";
import { schemaElement } from "../../state/state";

/** ブロックを中身に持つ Plot。EditContext は張らず、中のテキストブロックが持つ */
export const Blockquote = Plot.define("Blockquote", {
  blockContent: Node.Group.Content,
  group: Node.Group.Content,
  shape: { element: "blockquote" },
});

export const blockquoteExtension: Extension = schemaElement.of(Blockquote);
