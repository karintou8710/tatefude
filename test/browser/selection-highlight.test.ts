import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Leaf, type Plot } from "../../src/doc";
import { basicSchema, Paragraph } from "../../src/schema-basic";
import { TextSelection } from "../../src/state/selection";
import { EditorState } from "../../src/state/state";
import { isHighlightSupported, SELECTION_HIGHLIGHT_NAME } from "../../src/view/selection-highlight";
import { EditorView } from "../../src/view/view";

let place: HTMLElement;
let view: EditorView;

function paragraph(text: string): Plot {
  return Paragraph.create(text ? [Leaf.text(text)] : []);
}

function mount(...texts: string[]): EditorView {
  return new EditorView(place, {
    state: EditorState.create({
      config: [basicSchema()],
      doc: (schema) => schema.doc(texts.map(paragraph)),
    }),
  });
}

function highlightRanges(): Range[] {
  const highlight = (CSS as unknown as { highlights: Map<string, Iterable<Range>> }).highlights.get(
    SELECTION_HIGHLIGHT_NAME,
  );
  return highlight ? [...highlight] : [];
}

function select(anchor: number, head: number): void {
  view.dispatch({ selection: TextSelection.create(view.state.doc, anchor, head) });
}

beforeEach(() => {
  place = document.createElement("div");
  document.body.appendChild(place);
});

afterEach(() => {
  view?.destroy();
  place.remove();
});

describe("CSS Custom Highlight による選択の描画", () => {
  it("この環境で Highlight API が使える", () => {
    expect(isHighlightSupported()).toBe(true);
  });

  it("キャレット (空の選択) では何も塗らない", () => {
    view = mount("abc", "def");
    select(2, 2);
    expect(highlightRanges().length).toBe(0);
  });

  it("ブロック内の選択は 1 つの Range になる", () => {
    view = mount("abc", "def");
    select(2, 4);
    const ranges = highlightRanges();
    expect(ranges.length).toBe(1);
    expect(ranges[0].toString()).toBe("bc");
  });

  it("ブロックを跨ぐ選択はブロックごとの Range になる", () => {
    view = mount("abc", "def", "ghi");
    // p1 の中身は 1..4、p2 は 6..9、p3 は 11..14。"bc" + "def" + "g" を選ぶ
    select(2, 12);
    const ranges = highlightRanges();
    expect(ranges.length).toBe(3);
    expect(ranges.map((r) => r.toString())).toEqual(["bc", "def", "g"]);
    // それぞれの Range が対応するブロックの中に閉じている
    ranges.forEach((range, index) => {
      expect(view.blocks[index].dom.contains(range.startContainer)).toBe(true);
      expect(view.blocks[index].dom.contains(range.endContainer)).toBe(true);
    });
  });

  it("空ブロックを含む跨ぎ選択でも落ちない", () => {
    view = mount("abc", "", "ghi");
    // 真ん中の空ブロックは 0 幅なので Range を作らない
    select(2, 10);
    expect(highlightRanges().map((r) => r.toString())).toEqual(["bc", "gh"]);
  });

  it("選択を畳むと塗りが消える", () => {
    view = mount("abc", "def");
    select(2, 7);
    expect(highlightRanges().length).toBe(2);
    select(2, 2);
    expect(highlightRanges().length).toBe(0);
  });

  it("destroy すると塗りが残らない", () => {
    view = mount("abc", "def");
    select(2, 7);
    expect(highlightRanges().length).toBe(2);
    view.destroy();
    expect(highlightRanges().length).toBe(0);
  });

  it("エディタの中ではネイティブの選択が透明になっている", () => {
    view = mount("abc");
    const style = document.getElementById("ecw-selection-style");
    expect(style?.textContent).toContain("::selection");
    expect(style?.textContent).toContain("transparent");
  });
});
