import { describe, expect, it } from "vitest";
import { buildTextblockMap } from "../../src/doc";
import { doc, p, strong } from "./doc";

function firstBlock(node: ReturnType<typeof doc>, index = 0) {
  const block = node.child(index);
  if (!block.isPlot) throw new Error("plot ではない");
  return block;
}

describe("TextblockMap", () => {
  it("ブロックのフラット文字列を作る", () => {
    const d = doc(p("ab", strong("cd")));
    const map = buildTextblockMap(firstBlock(d), 0);
    expect(map.text).toBe("abcd");
    expect(map.contentStart).toBe(1);
  });

  it("doc 位置とオフセットを往復できる", () => {
    const d = doc(p("ab", strong("cd")));
    const map = buildTextblockMap(firstBlock(d), 0);
    expect(map.posToOffset(1)).toBe(0);
    expect(map.posToOffset(3)).toBe(2);
    expect(map.posToOffset(5)).toBe(4);
    expect(map.offsetToPos(0)).toBe(1);
    expect(map.offsetToPos(2)).toBe(3);
    expect(map.offsetToPos(4)).toBe(5);
  });

  it("2 つ目のブロックでも位置がずれない", () => {
    const d = doc(p("abc"), p("de"));
    const map = buildTextblockMap(firstBlock(d, 1), 5);
    expect(map.text).toBe("de");
    expect(map.contentStart).toBe(6);
    expect(map.offsetToPos(0)).toBe(6);
    expect(map.offsetToPos(2)).toBe(8);
    expect(map.posToOffset(7)).toBe(1);
  });

  it("空ブロックは空文字列", () => {
    const d = doc(p());
    const map = buildTextblockMap(firstBlock(d), 0);
    expect(map.text).toBe("");
    expect(map.offsetToPos(0)).toBe(1);
    expect(map.posToOffset(1)).toBe(0);
  });
});
