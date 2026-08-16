import { Leaf, type Mark, type Node, type Plot, Schema } from "../../src/doc";
import { basicSchemaElements, Emphasis, Paragraph, Strong } from "../../src/schema-basic";

export const schema = Schema.define(basicSchemaElements);
export { Emphasis, Paragraph, Strong };

/** テスト用のドキュメント組み立て */
export function doc(...blocks: Node[]): Plot {
  return schema.doc(blocks);
}

export function p(...content: (string | Node)[]): Plot {
  return Paragraph.create(content.map((c) => (typeof c === "string" ? Leaf.text(c) : c)));
}

export function strong(text: string): Node {
  return Leaf.text(text, Strong.addToSet(Leaf.text("").marks));
}

export function em(text: string): Node {
  return Leaf.text(text, Emphasis.addToSet([] as Mark.Set));
}

/** doc 直下のブロックのテキスト */
export function blockTexts(node: Plot): string[] {
  return node.content.map((block) => block.textContent);
}
