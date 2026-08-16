import { Mark, Node, Plot, type Schema } from "./doc";
import type { Extension } from "./state/facet";
import { schemaElement } from "./state/state";

const G = Node.Group;

export const Doc = Plot.define("Doc", {
  doc: true,
  blockContent: G.Content,
  shape: { element: "div" },
});

export const Paragraph = Plot.define("Paragraph", {
  inlineContent: true,
  group: G.Content,
  defaultBlock: true,
  shape: { element: "p" },
});

/** ブロックを中身に持つ Plot。EditContext は張らず、中のテキストブロックが持つ */
export const Blockquote = Plot.define("Blockquote", {
  blockContent: G.Content,
  group: G.Content,
  shape: { element: "blockquote" },
});

export const Emphasis = Mark.define("Emphasis", {
  rank: 50,
  shape: { element: "em" },
});

export const Strong = Mark.define("Strong", {
  rank: 60,
  shape: { element: "strong" },
});

/** 要素ではなくスタイルで表すマーク。縦書きでは自動的に文字の右側に付く */
export const EmphasisDots = Mark.define("EmphasisDots", {
  rank: 43,
  spanning: true,
  shape: { attribute: "style/text-emphasis", value: "filled sesame" },
});

export const basicSchemaElements: readonly Schema.Element[] = [
  Doc,
  Paragraph,
  Blockquote,
  Strong,
  Emphasis,
  EmphasisDots,
];

/** `config: [basicSchema()]` のように使う */
export function basicSchema(): Extension {
  return basicSchemaElements.map((element) => schemaElement.of(element));
}
