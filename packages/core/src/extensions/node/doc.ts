import { Node, Plot } from "../../doc";
import type { Extension } from "../../state/facet";
import { schemaElement } from "../../state/state";

export const Doc = Plot.define("Doc", {
  doc: true,
  blockContent: Node.Group.Content,
  shape: { element: "div" },
});

export const docExtension: Extension = schemaElement.of(Doc);
