import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Leaf } from "../../src/doc";
import { basicSchema, Paragraph, Ruby, RubyBase, RubyText } from "../../src/schema-basic";
import { TextSelection } from "../../src/state/selection";
import { EditorState } from "../../src/state/state";
import { EditorView } from "../../src/view/view";

let place: HTMLElement;
let view: EditorView;

function mount(vertical: boolean, ...texts: string[]): EditorView {
  place.style.writingMode = vertical ? "vertical-rl" : "horizontal-tb";
  place.style.height = vertical ? "300px" : "";
  place.style.fontSize = "16px";
  return new EditorView(place, {
    state: EditorState.create({
      config: [basicSchema()],
      doc: (schema) =>
        schema.doc(texts.map((text) => Paragraph.create(text ? [Leaf.text(text)] : []))),
    }),
  });
}

function caret(): HTMLElement | null {
  return view.dom.querySelector<HTMLElement>(".ecw-caret");
}

/** 表示されているキャレットの矩形。隠れていれば null */
function caretBox(): DOMRect | null {
  const element = caret();
  if (!element || element.style.display === "none") return null;
  return element.getBoundingClientRect();
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

describe("キャレットの自前描画", () => {
  it("ネイティブのキャレットは消してある", () => {
    view = mount(false, "abc");
    const block = view.textblocks[0].dom;
    expect(getComputedStyle(block).caretColor).toBe("rgba(0, 0, 0, 0)");
  });

  it("キャレットのいるブロックの行の上に出る", () => {
    view = mount(false, "abc", "def");
    view.focus();
    select(2, 2);
    const box = caretBox();
    expect(box).not.toBeNull();

    const line = view.textblocks[0].dom.getBoundingClientRect();
    expect(box?.top).toBeGreaterThanOrEqual(line.top - 1);
    expect(box?.bottom).toBeLessThanOrEqual(line.bottom + 1);
    // 横書きでは細いのが幅、行の高さが高さ
    expect(box?.width).toBeLessThan(4);
    expect(box?.height).toBeGreaterThan(8);
  });

  it("ブロックを移ると付いていく", () => {
    view = mount(false, "abc", "def");
    view.focus();
    select(2, 2);
    const first = caretBox();
    select(7, 7);
    const second = caretBox();
    expect(second?.top).toBeGreaterThan(first?.top ?? 0);
  });

  it("縦書きでは太さの軸が入れ替わる", () => {
    view = mount(true, "あいう");
    view.focus();
    select(2, 2);
    const box = caretBox();
    expect(box?.height).toBeLessThan(4);
    expect(box?.width).toBeGreaterThan(8);
  });

  it("範囲を選んでいる間は出さない", () => {
    view = mount(false, "abc");
    view.focus();
    select(1, 3);
    expect(caretBox()).toBeNull();
    select(2, 2);
    expect(caretBox()).not.toBeNull();
  });

  it("フォーカスが外れると消える", () => {
    view = mount(false, "abc");
    view.focus();
    select(2, 2);
    expect(caretBox()).not.toBeNull();

    const outside = document.createElement("input");
    document.body.appendChild(outside);
    outside.focus();
    expect(caretBox()).toBeNull();
    outside.remove();
  });

  it("rt の内側の先頭では rt の帯に出る", () => {
    // rb の末尾と rt の先頭は同じバッファオフセットに写る。手前のテキストを採ると
    // キャレットが rb の行に出てしまう
    view = new EditorView(place, {
      state: EditorState.create({
        config: [basicSchema()],
        doc: (schema) =>
          schema.doc([
            Paragraph.create([
              Ruby.create([
                RubyBase.create([Leaf.text("漢字")]),
                RubyText.create([Leaf.text("かんじ")]),
              ]),
            ]),
          ]),
      }),
    });
    view.focus();

    // rb の中身 = 3..5、rt の中身 = 7..10
    const rb = view.dom.querySelector("rb") as HTMLElement;
    const rt = view.dom.querySelector("rt") as HTMLElement;
    select(5, 5); // rb の内側の末尾
    const atBase = caretBox();
    select(7, 7); // rt の内側の先頭。同じバッファオフセットに写る
    const atText = caretBox();

    select(12, 12); // ruby の閉じの直後 = 箱の外
    const afterRuby = caretBox();

    const rbBox = rb.getBoundingClientRect();
    const rtBox = rt.getBoundingClientRect();
    expect(atBase?.top).toBeGreaterThanOrEqual(rbBox.top - 1);
    expect(atBase?.bottom).toBeLessThanOrEqual(rbBox.bottom + 1);
    expect(atText?.top).toBeGreaterThanOrEqual(rtBox.top - 1);
    expect(atText?.bottom).toBeLessThanOrEqual(rtBox.bottom + 1);
    // ルビの帯は base より上にある
    expect(atText?.top).toBeLessThan(atBase?.top ?? 0);
    // 箱を出たら行の高さのキャレットになる。rt の帯に閉じ込められない
    const rubyBox = (view.dom.querySelector("ruby") as HTMLElement).getBoundingClientRect();
    expect(afterRuby?.left).toBeGreaterThanOrEqual(rubyBox.right - 1);
    expect(afterRuby?.bottom).toBeGreaterThanOrEqual(rbBox.bottom - 1);
    expect(afterRuby?.height).toBeGreaterThan(rtBox.height);
  });

  it("destroy でレイヤごと消える", () => {
    view = mount(false, "abc");
    expect(place.querySelector(".ecw-caret-layer")).not.toBeNull();
    view.destroy();
    expect(place.querySelector(".ecw-caret-layer")).toBeNull();
  });
});
