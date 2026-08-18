import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Leaf, type Plot } from "../../src/doc";
import { basicSchema, Paragraph, Ruby, RubyBase, RubyText } from "../../src/extensions";
import { TextSelection } from "../../src/state/selection";
import { EditorState } from "../../src/state/state";
import {
  INLINE_ACTIVE_HIGHLIGHT_NAME,
  isHighlightSupported,
  SELECTION_HIGHLIGHT_NAME,
} from "../../src/view/selection-highlight";
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

function rangesOf(name: string): Range[] {
  const highlight = (CSS as unknown as { highlights: Map<string, Iterable<Range>> }).highlights.get(
    name,
  );
  return highlight ? [...highlight] : [];
}

const highlightRanges = () => rangesOf(SELECTION_HIGHLIGHT_NAME);
const insideRanges = () => rangesOf(INLINE_ACTIVE_HIGHLIGHT_NAME);

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
      expect(view.textblocks[index].dom.contains(range.startContainer)).toBe(true);
      expect(view.textblocks[index].dom.contains(range.endContainer)).toBe(true);
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

  // Doc(Paragraph("あ", Ruby(RubyBase("漢"), RubyText("かん")), "い"))
  // 位置: "あ" = 1..2 / rb の中身 = 4..5 / rt の中身 = 7..9 / "い" = 11..12
  describe("インラインブロックの内側", () => {
    function mountRuby(): EditorView {
      return new EditorView(place, {
        state: EditorState.create({
          config: [basicSchema()],
          doc: (schema) =>
            schema.doc([
              Paragraph.create([
                Leaf.text("あ"),
                Ruby.create([
                  RubyBase.create([Leaf.text("漢")]),
                  RubyText.create([Leaf.text("かん")]),
                ]),
                Leaf.text("い"),
              ]),
            ]),
        }),
      });
    }

    it("キャレットが rb の中にあると rb 全体が塗られる", () => {
      view = mountRuby();
      select(4, 4); // rb の内側の先頭
      const ranges = insideRanges();
      expect(ranges.map((r) => r.toString())).toEqual(["漢"]);
      // 選択の Highlight とは別の名前に入る (色を別々に指定できる)
      expect(highlightRanges().length).toBe(0);

      // 塗る範囲が rb の矩形に収まっていること (境界に幅が無いので、Range の端の
      // ノードは rb の外に出ることがある。見た目で確かめる)
      const rb = view.dom.querySelector("rb") as HTMLElement;
      const rbBox = rb.getBoundingClientRect();
      const painted = ranges[0].getBoundingClientRect();
      expect(painted.left).toBeGreaterThanOrEqual(rbBox.left - 1);
      expect(painted.right).toBeLessThanOrEqual(rbBox.right + 1);
      expect(painted.width).toBeGreaterThan(0);
    });

    it("rt の中なら rt 全体が塗られる", () => {
      view = mountRuby();
      select(8, 8); // "かん" の途中
      expect(insideRanges().map((r) => r.toString())).toEqual(["かん"]);
    });

    it("外側に出ると消える", () => {
      view = mountRuby();
      select(4, 4);
      expect(insideRanges().length).toBe(1);
      select(2, 2); // ルビの手前 (画面上は 4 と同じ点)
      expect(insideRanges().length).toBe(0);
    });

    it("destroy すると中にいる印も残らない", () => {
      view = mountRuby();
      select(4, 4);
      expect(insideRanges().length).toBe(1);
      view.destroy();
      expect(insideRanges().length).toBe(0);
    });

    it("範囲を選んでいるときは今までどおり選択範囲だけ塗る", () => {
      view = mountRuby();
      select(4, 5); // rb の中の "漢" を選ぶ
      expect(highlightRanges().map((r) => r.toString())).toEqual(["漢"]);
      expect(insideRanges().length).toBe(0);
      select(1, 12); // 全体
      expect(highlightRanges().map((r) => r.toString())).toEqual(["あ漢かんい"]);
    });

    it("それぞれに別の ::highlight() が当たっている", () => {
      view = mountRuby();
      const css = document.getElementById("tf-style")?.textContent ?? "";
      expect(css).toContain(`::highlight(${SELECTION_HIGHLIGHT_NAME})`);
      expect(css).toContain(`::highlight(${INLINE_ACTIVE_HIGHLIGHT_NAME})`);
    });
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
    const style = document.getElementById("tf-style");
    expect(style?.textContent).toContain("::selection");
    expect(style?.textContent).toContain("transparent");
  });
});
