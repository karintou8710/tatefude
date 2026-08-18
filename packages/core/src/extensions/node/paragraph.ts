// Paragraph の定義は Wordgard (MIT) から派生。
// 著作権表示は LICENSE の "Third-party code" を参照。

import { Node, Plot } from "../../doc";
import type { Extension } from "../../state/facet";
import { schemaElement } from "../../state/state";

export const Paragraph = Plot.define("Paragraph", {
  inlineContent: true,
  group: Node.Group.Content,
  defaultBlock: true,
  shape: { element: "p" },
});

export const paragraphExtension: Extension = schemaElement.of(Paragraph);
