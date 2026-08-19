import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildTextblockMap, Leaf, type Node, type Plot } from "../../doc";
import { Paragraph, Ruby, RubyBase, RubyText } from "../../extensions";
import type { BlockMapping } from "../dom-point";
import { blockPosToDOMPoint, caretRectFor, domPointToBlockPos } from "../dom-point";
import { createTextblockDOM, renderBlockContent } from "../render";

/**
 * dom-point の単体テスト。`EditorView` は立てず、DOM と doc の部分木だけ差す。
 *
 * 位置 ↔ DOM 点の写像は**レイアウトに依存しない** (木を数えるだけ) ので、
 * フォントも CSS も関係なく確かめられる。矩形を返す caretRectFor だけが実測に依る。
 */

let place: HTMLElement;

beforeEach(() => {
  place = document.createElement("div");
  place.style.fontSize = "16px";
  document.body.appendChild(place);
});

afterEach(() => place.remove());

/** ブロック 1 つを描いて、dom-point が要るものだけ揃える */
function mount(block: Plot, from = 0): BlockMapping {
  const { dom, contentDOM } = createTextblockDOM(block);
  renderBlockContent(contentDOM, block, from, []);
  place.appendChild(dom);
  return { contentDOM, node: block, contentFrom: from + 1, text: buildTextblockMap(block, from) };
}

const p = (...content: Node[]) => Paragraph.create(content);
const t = (s: string) => Leaf.text(s);
const ruby = (base: string, reading: string) =>
  Ruby.create([RubyBase.create([t(base)]), RubyText.create([t(reading)])]);

/** キャレットが留まれる位置を素朴に列挙する (テキストの中と、箱の内側の端) */
function caretPositions(block: Plot, contentFrom: number): number[] {
  const stops: number[] = [];
  const walk = (plot: Plot, start: number, inside: boolean): void => {
    let pos = start;
    if (inside) stops.push(pos);
    for (const child of plot.content) {
      if (child.isLeaf && child.isText) {
        for (let i = 1; i <= child.length; i++) stops.push(pos + i);
      } else if (child.isPlot) {
        walk(child, pos + 1, child.type.cursorInsideBounds);
      }
      pos += child.length;
    }
  };
  walk(block, contentFrom, true);
  return [...new Set(stops)].sort((a, b) => a - b);
}

describe("位置 → DOM 点", () => {
  it("テキストの中はそのテキストノードを指す", () => {
    // Paragraph("あいう") — 中身は 1..4
    const block = mount(p(t("あいう")));
    const point = blockPosToDOMPoint(block, 3);
    expect(point.node.nodeType).toBe(3);
    expect((point.node as Text).data).toBe("あいう");
    expect(point.offset).toBe(2);
  });

  it("インラインブロックの内側は、その箱の中のテキストを指す", () => {
    // Paragraph( Ruby 1..9 ( RubyBase 2..5 ("漢" 3..4), RubyText 5..8 ("か" 6..7) ) )
    const block = mount(p(ruby("漢", "か")));
    const inBase = blockPosToDOMPoint(block, 3);
    const inText = blockPosToDOMPoint(block, 6);
    expect((inBase.node as Text).data).toBe("漢");
    expect((inText.node as Text).data).toBe("か");
  });

  it("箱の直後は、要素の境目を指す (中のテキストではない)", () => {
    // Ruby は 1..9、その直後が 9
    const block = mount(p(ruby("漢", "か")));
    const point = blockPosToDOMPoint(block, 9);
    // 要素ノード + 子の index。テキストノードに落ちると rt の末尾と区別できなくなる
    expect(point.node.nodeType).toBe(1);
    expect((point.node as Element).tagName).toBe("P");
    expect(point.offset).toBe(1);
  });
});

describe("DOM 点 → 位置", () => {
  it("箱の中のテキストは箱の中の位置に戻る", () => {
    const block = mount(p(ruby("漢", "か")));
    const rt = block.contentDOM.querySelector("rt") as HTMLElement;
    // rt の中身は 6 から。畳んで戻すと rb の末尾 (4) に吸い込まれる
    expect(domPointToBlockPos(block, rt.firstChild as Text, 0)).toBe(6);
  });

  it("箱の外の点は箱の外の位置に戻る", () => {
    const block = mount(p(t("あ"), ruby("漢", "か"), t("い")));
    const text = block.contentDOM.lastChild as Text;
    expect(text.data).toBe("い");
    expect(domPointToBlockPos(block, text, 0)).toBe(10);
  });
});

describe("往復", () => {
  // **オフセットに畳むと壊れる形**を並べる。箱の内側の端と外側の端が同じ番号になる
  const cases: Array<[string, Plot]> = [
    ["文字だけ", p(t("あいうえ"))],
    ["ルビだけ", p(ruby("漢字", "かんじ"))],
    ["文字 + ルビ + 文字", p(t("あ"), ruby("漢", "か"), t("い"))],
    ["ルビが 2 つ隣り合う", p(ruby("春", "はる"), ruby("夏", "なつ"))],
  ];

  for (const [name, block] of cases) {
    it(`${name}: すべての位置で pos → 点 → pos が戻る`, () => {
      const mapping = mount(block);
      for (const pos of caretPositions(block, mapping.contentFrom)) {
        const point = blockPosToDOMPoint(mapping, pos);
        expect(domPointToBlockPos(mapping, point.node, point.offset), `pos=${pos}`).toBe(pos);
      }
    });
  }
});

describe("caretRectFor", () => {
  it("文字の上では Range から取る", () => {
    const block = mount(p(t("あいう")));
    const rect = caretRectFor(block, 2);
    // 横書きなので幅 0・高さはフォントぶん
    expect(rect.width).toBe(0);
    expect(rect.height).toBeGreaterThan(8);
  });

  it("箱の直後は箱の外側の端に立つ", () => {
    const block = mount(p(ruby("漢", "か")));
    const rubyBox = block.contentDOM.querySelector("ruby") as HTMLElement;
    const rect = caretRectFor(block, 9);
    expect(rect.left).toBeGreaterThanOrEqual(rubyBox.getBoundingClientRect().right - 1);
  });

  it("中身が空の箱でも矩形が取れる", () => {
    // 読みが空だと collapsed な Range は矩形を返さない。代役の生成内容で箱はある
    const block = mount(p(Ruby.create([RubyBase.create([t("漢")]), RubyText.create([])])));
    const rt = block.contentDOM.querySelector("rt") as HTMLElement;
    expect(rt.textContent).toBe("");
    // RubyText 5..7 の内側 = 6。ここは Range が矩形を返さない
    const rect = caretRectFor(block, 6);
    expect(rect.height).toBeGreaterThan(0);
    expect(rect.left).toBeGreaterThanOrEqual(rt.getBoundingClientRect().left - 1);
  });

  it("太さは箱ではなくフォントから測る", () => {
    // 箱を行送りぶんに膨らませても、キャレットは文字の高さのまま
    const style = document.createElement("style");
    style.textContent = "rt { display: inline-flex; min-block-size: 4em; }";
    document.head.appendChild(style);
    const block = mount(p(ruby("漢", "か"), t("い")));
    const rt = block.contentDOM.querySelector("rt") as HTMLElement;
    const afterBox = caretRectFor(block, 9);
    const onText = caretRectFor(block, 10);
    const boxHeight = rt.getBoundingClientRect().height;
    style.remove();

    expect(boxHeight).toBeGreaterThan(afterBox.height * 1.5);
    expect(afterBox.height).toBeCloseTo(onText.height, 0);
  });
});
