import { describe, expect, it } from "vitest";
import { Leaf, Mark, Pos } from "../../src/doc";
import { doc, Emphasis, p, Strong, strong } from "./doc";

describe("ノードの長さと位置", () => {
  it("plot は開き + 中身 + 閉じ", () => {
    expect(p("abc").length).toBe(5);
    expect(p().length).toBe(2);
  });

  it("テキスト leaf の長さは文字数", () => {
    expect(Leaf.text("abc").length).toBe(3);
    expect(Leaf.text("abc").isText).toBe(true);
  });

  it("doc の長さは子の合計", () => {
    expect(doc(p("abc"), p("de")).contentLength).toBe(5 + 4);
  });

  it("Pos が親と深さを返す", () => {
    const d = doc(p("abc"), p("de"));
    const $pos = Pos.resolve(d, 2);
    expect($pos.depth).toBe(1);
    expect($pos.parent.name).toBe("Paragraph");
    expect($pos.start()).toBe(1);
    expect($pos.end()).toBe(4);
    expect($pos.index(0)).toBe(0);

    const $second = Pos.resolve(d, 7);
    expect($second.index(0)).toBe(1);
    expect($second.start()).toBe(6);
  });

  it("ブロックの境界では depth 0 になる", () => {
    const $boundary = Pos.resolve(doc(p("abc"), p("de")), 5);
    expect($boundary.depth).toBe(0);
    expect($boundary.index(0)).toBe(1);
  });

  it("nodeAt はその位置から始まるノードを返す", () => {
    const d = doc(p("abc"), p("de"));
    expect(d.nodeAt(0)?.name).toBe("Paragraph");
    expect(d.nodeAt(5)?.textContent).toBe("de");
  });

  it("隣り合う同じマークのテキストは結合される", () => {
    const block = p("ab", "cd");
    expect(block.childCount).toBe(1);
    expect(block.textContent).toBe("abcd");
  });

  it("マークが違えば結合されない", () => {
    const block = p("ab", strong("cd"));
    expect(block.childCount).toBe(2);
  });

  it("marks() は直前のインラインのマークを引き継ぐ", () => {
    const d = doc(p("ab", strong("cd")));
    expect(Pos.resolve(d, 3).marks().length).toBe(0);
    expect(Pos.resolve(d, 5).marks()[0]?.name).toBe("Strong");
  });

  it("マークの集合は rank の順に並ぶ", () => {
    // Emphasis(50) < Strong(60) なので、足した順に関わらず並びは同じになる
    const a = Strong.addToSet(Emphasis.addToSet(Mark.none));
    const b = Emphasis.addToSet(Strong.addToSet(Mark.none));
    expect(a.map((mark) => mark.name)).toEqual(["Emphasis", "Strong"]);
    expect(Mark.sameSet(a, b)).toBe(true);
  });
});
