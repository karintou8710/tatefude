import { Leaf, type Mark, type Node, type Plot, Schema } from "../../src/doc";
import {
  Bouten,
  basicSchemaElements,
  Paragraph,
  Ruby,
  RubyBase,
  RubyText,
  Strong,
} from "../../src/extensions";

export const schema = Schema.define(basicSchemaElements);
export { Bouten, Paragraph, Strong };

/** ルビ = インラインブロックのテスト用の組み立て */
export function ruby(base: string, reading: string): Node {
  return Ruby.create([RubyBase.create([Leaf.text(base)]), RubyText.create([Leaf.text(reading)])]);
}

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

export function bouten(text: string): Node {
  return Leaf.text(text, Bouten.addToSet([] as Mark.Set));
}

/** doc 直下のブロックのテキスト */
export function blockTexts(node: Plot): string[] {
  return node.content.map((block) => block.textContent);
}
