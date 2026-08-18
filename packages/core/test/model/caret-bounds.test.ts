import { describe, expect, it } from "vitest";
import { Leaf, Node, Plot, Schema } from "../../src/doc";
import { Doc } from "../../src/extensions";
import { Selection } from "../../src/state/selection";

// 端が固定のインラインブロックで埋まる型。その外側は内側の端と同じ点に描かれる余りなので落とす。
// ルビと違って親の端そのものなので、指定はインラインブロックではなく**親**が持つ。

const Box = Plot.define("Box", {
  inline: true,
  inlineContent: Leaf.Text,
  cursorInsideBounds: true,
  shape: { element: "span" },
});

const Body = Plot.define("Body", {
  inlineContent: true,
  group: Node.Group.Content,
  shape: { element: "p" },
});

/** 先頭がインラインブロックで固定 (台本のセリフ = 人物名 + 発話) */
const Lead = Plot.define("Lead", {
  inlineContent: true,
  group: Node.Group.Content,
  cursorAtContentStart: false,
  shape: { element: "p" },
});

/** 末尾がインラインブロックで固定 (単位や注記が末尾に付く型) */
const Trail = Plot.define("Trail", {
  inlineContent: true,
  group: Node.Group.Content,
  cursorAtContentEnd: false,
  shape: { element: "p" },
});

const schema = Schema.define([Doc, Box, Body, Lead, Trail]);

const box = (text: string) => Box.create([Leaf.text(text)]);

/** pos に一番近いキャレット位置。bias は探す向き */
function near(blocks: Plot[], pos: number, bias: -1 | 1 = 1): number {
  return Selection.near(schema.doc(blocks), pos, bias).head;
}

describe("cursorAtContentStart", () => {
  // Doc( Body("xy") 0..4, Lead( Box("ab") 5..9, "cd" 9..11 ) 4..12 )
  const blocks = [Body.create([Leaf.text("xy")]), Lead.create([box("ab"), Leaf.text("cd")])];

  it("content の先頭はインラインブロックの内側へ寄る", () => {
    expect(near(blocks, 5)).toBe(6);
  });

  // 最寄りに寄せるので、隣のブロックへ抜けるのではなく内側に入る (抜けるのは矢印側の仕事)
  it("手前へ探しても内側へ寄る", () => {
    expect(near(blocks, 5, -1)).toBe(6);
  });

  it("インラインブロックの内側・発話・content の末尾はそのまま", () => {
    expect(near(blocks, 6)).toBe(6);
    expect(near(blocks, 8)).toBe(8);
    expect(near(blocks, 9)).toBe(9);
    expect(near(blocks, 11)).toBe(11);
  });
});

describe("cursorAtContentEnd", () => {
  // Doc( Trail( "ab" 1..3, Box("cd") 3..7 ) 0..8, Body("xy") 8..12 )
  const blocks = [Trail.create([Leaf.text("ab"), box("cd")]), Body.create([Leaf.text("xy")])];

  it("content の末尾はインラインブロックの内側へ寄る", () => {
    expect(near(blocks, 7, -1)).toBe(6);
  });

  it("先へ探しても内側へ寄る", () => {
    expect(near(blocks, 7)).toBe(6);
  });

  it("content の先頭は落とさない", () => {
    expect(near(blocks, 1)).toBe(1);
  });

  it("インラインブロックの内側はそのまま", () => {
    expect(near(blocks, 4)).toBe(4);
    expect(near(blocks, 6)).toBe(6);
  });
});
