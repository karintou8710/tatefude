import { describe, expect, it } from "vitest";
import { Mark, Pos, ValidationError } from "../../src/doc";
import { Transform } from "../../src/transform/transform";
import { blockTexts, doc, p, Strong, schema, strong } from "./doc";

function tr(...blocks: Parameters<typeof doc>) {
  return new Transform(schema, doc(...blocks));
}

describe("Transform", () => {
  it("ブロック内の置換", () => {
    const t = tr(p("abc"));
    t.replaceWithText(2, 3, "X");
    expect(blockTexts(t.doc)).toEqual(["aXc"]);
  });

  it("挿入した位置より後ろの位置が写像される", () => {
    const t = tr(p("abc"));
    t.replaceWithText(2, 2, "XY");
    expect(t.changes.mapPos(4, 1)).toBe(6);
    expect(t.changes.mapPos(1, 1)).toBe(1);
  });

  it("ブロックを割る", () => {
    const t = tr(p("abcd"));
    t.splitBlock(3);
    expect(blockTexts(t.doc)).toEqual(["ab", "cd"]);
    // 分割後、新しいブロックの中身は元の位置 + 2 から始まる
    expect(Pos.resolve(t.doc, 5).parent.textContent).toBe("cd");
  });

  it("ブロックを結合する", () => {
    const t = tr(p("ab"), p("cd"));
    t.joinBlocks(4);
    expect(blockTexts(t.doc)).toEqual(["abcd"]);
  });

  it("ブロックを跨いだ削除が結合になる", () => {
    const t = tr(p("abc"), p("de"), p("fgh"));
    t.deleteRange(2, 11);
    expect(blockTexts(t.doc)).toEqual(["agh"]);
  });

  it("隣り合うブロックを跨いだ削除", () => {
    const t = tr(p("abc"), p("def"));
    t.deleteRange(3, 7);
    expect(blockTexts(t.doc)).toEqual(["abef"]);
  });

  it("改行入りのテキストはブロックに割れる", () => {
    const t = tr(p("ad"));
    t.replaceWithText(2, 2, "b\nc");
    expect(blockTexts(t.doc)).toEqual(["ab", "cd"]);
  });

  it("マークを付けて外す", () => {
    const t = tr(p("abcd"));
    t.addMark(2, 4, Strong);
    const marked = t.doc.child(0);
    if (!marked.isPlot) throw new Error("plot ではない");
    expect(marked.childCount).toBe(3);
    expect(marked.child(1).marks[0].name).toBe("Strong");
    t.removeMark(2, 4, Strong);
    const cleaned = t.doc.child(0);
    if (!cleaned.isPlot) throw new Error("plot ではない");
    expect(cleaned.childCount).toBe(1);
  });

  it("ステップごとにスキーマの検査が走る", () => {
    const Outside = Mark.define("Outside", { shape: { element: "u" } });
    const t = tr(p("abc"));
    // スキーマに無いマークを付けようとすると、ステップを積んだ時点で弾かれる
    expect(() => t.addMark(1, 3, Outside)).toThrow(ValidationError);
    expect(blockTexts(t.doc)).toEqual(["abc"]);
  });

  it("マークを跨いだ削除でマークが保たれる", () => {
    const t = tr(p("ab", strong("cd")));
    t.replaceWithText(2, 4, "");
    const block = t.doc.child(0);
    if (!block.isPlot) throw new Error("plot ではない");
    expect(block.childCount).toBe(2);
    expect(block.textContent).toBe("ad");
    expect(block.child(1).marks[0].name).toBe("Strong");
  });
});
