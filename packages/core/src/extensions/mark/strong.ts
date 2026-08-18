import { Mark } from "../../doc";
import type { Extension } from "../../state/facet";
import { schemaElement } from "../../state/state";

export const Strong = Mark.define("Strong", {
  rank: 60,
  shape: { element: "strong" },
});

export const strongExtension: Extension = schemaElement.of(Strong);
