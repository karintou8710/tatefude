import { describe, expect, it } from "vitest";
import { Leaf, Mark, Node, Plot, Schema, SchemaError, ValidationError } from "../../src/doc";
import { basicSchema, Doc, EmphasisDots, Paragraph, Strong } from "../../src/schema-basic";
import { doc, p } from "./doc";

const G = Node.Group;

describe("Schema", () => {
  it("グループで中身を絞る", () => {
    expect(basicSchema.canContain(Doc.type, Paragraph.type)).toBe(true);
    expect(basicSchema.canContain(Paragraph.type, Leaf.Text)).toBe(true);
    // 段落の中に段落は入らない (インライン用のブロックなので)
    expect(basicSchema.canContain(Paragraph.type, Paragraph.type)).toBe(false);
    // doc の中にテキストは直接入らない
    expect(basicSchema.canContain(Doc.type, Leaf.Text)).toBe(false);
  });

  it("組み込みのグループが自動で付く", () => {
    expect(basicSchema.matchNode(Leaf.Text, G.Inline)).toBe(true);
    expect(basicSchema.matchNode(Leaf.Text, G.Leaf)).toBe(true);
    expect(basicSchema.matchNode(Paragraph.type, G.Textblock)).toBe(true);
    expect(basicSchema.matchNode(Paragraph.type, G.Block)).toBe(true);
    expect(basicSchema.matchNode(Paragraph.type, G.Inline)).toBe(false);
  });

  it("和と積の指定", () => {
    expect(basicSchema.matchNode(Leaf.Text, [G.Block, G.Inline])).toBe(true);
    expect(basicSchema.matchNode(Leaf.Text, { and: [G.Inline, G.Leaf] })).toBe(true);
    expect(basicSchema.matchNode(Leaf.Text, { and: [G.Inline, G.Plot] })).toBe(false);
  });

  it("マークの付けられる先を見る", () => {
    expect(basicSchema.markAllowed(Strong.type, Leaf.Text)).toBe(true);
    expect(basicSchema.markAllowed(Strong.type, Paragraph.type)).toBe(false);
  });

  it("doc を作るときに検査する", () => {
    expect(() => doc(p("abc"))).not.toThrow();
    // 段落の中に段落を入れると弾かれる
    expect(() => basicSchema.doc([Paragraph.create([Paragraph.create([])])])).toThrow(
      ValidationError,
    );
  });

  it("スキーマに無いマークは弾かれる", () => {
    const Outside = Mark.define("Outside", { shape: { element: "u" } });
    expect(() => basicSchema.doc([Paragraph.create([Leaf.text("a", [Outside])])])).toThrow(
      ValidationError,
    );
  });

  it("マークを付けられないノードには付けられない", () => {
    // Strong は既定でインライン向けなので、段落タグには載せられない
    const marked = Paragraph.type.of(null, Strong.addToSet(Mark.none)).create([Leaf.text("a")]);
    expect(() => basicSchema.doc([marked])).toThrow(ValidationError);
  });

  it("属性で描くマークも同じように扱える", () => {
    const dotted = Paragraph.create([Leaf.text("傍点", EmphasisDots.addToSet(Mark.none))]);
    expect(() => basicSchema.doc([dotted])).not.toThrow();
    expect(EmphasisDots.type.isElement).toBe(false);
    expect(Strong.type.isElement).toBe(true);
  });

  it("ドキュメント型が無いスキーマは作れない", () => {
    expect(() => Schema.define([Paragraph])).toThrow(SchemaError);
  });

  it("同じ名前のノードが 2 つあると弾かれる", () => {
    const other = Plot.define("Paragraph", { inlineContent: true, shape: { element: "p" } });
    expect(() => Schema.define([Doc, Paragraph, other])).toThrow(SchemaError);
  });

  it("JSON に落として戻せる", () => {
    const original = doc(p("ab"), p("cd"));
    const restored = basicSchema.docFromJSON(original.toJSON());
    expect(restored.eq(original)).toBe(true);
  });
});
