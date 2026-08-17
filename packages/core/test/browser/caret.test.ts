import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Leaf, Node, Plot } from "../../src/doc";
import { basicSchema, Doc, Paragraph, Ruby, RubyBase, RubyText } from "../../src/schema-basic";
import { TextSelection } from "../../src/state/selection";
import { EditorState, schemaElement } from "../../src/state/state";
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
  return view.dom.querySelector<HTMLElement>(".tf-caret");
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

  it("空白が潰れないようにしてある", () => {
    // 潰れると幅 0 になり、キャレットの矩形もクリックの写像も合わなくなる
    view = mount(false, "a  b");
    const block = view.textblocks[0].dom;
    expect(getComputedStyle(block).whiteSpace).toBe("pre-wrap");

    const collapsed = document.createElement("span");
    collapsed.style.whiteSpace = "normal";
    collapsed.textContent = "a  b";
    block.appendChild(collapsed);
    const narrow = collapsed.getBoundingClientRect().width;
    collapsed.remove();
    // ブロックの方が広い = 空白 2 つが残っている
    expect(block.getBoundingClientRect().width).toBeGreaterThan(narrow);
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

  it("line-height を広げても空ブロックのキャレットは太らない", () => {
    // ブロックの箱で代用すると行送りぶんの高さになり、隣の行のキャレットより明らかに太くなる
    place.style.lineHeight = "3";
    view = mount(false, "abc", "");
    view.focus();
    select(2, 2);
    const inText = caretBox();
    select(6, 6); // 空段落の中
    const inEmpty = caretBox();

    const line = view.textblocks[1].dom.getBoundingClientRect().height;
    expect(line).toBeGreaterThan((inText?.height ?? 0) * 1.5);
    expect(inEmpty?.height).toBeCloseTo(inText?.height ?? 0, 0);
  });

  it("縦書きの空ブロックでキャレットが列いっぱいに伸びない", () => {
    view = mount(true, "あい", "");
    view.focus();
    select(2, 2);
    const inText = caretBox();
    select(5, 5); // 空段落の中
    const inEmpty = caretBox();

    // 空ブロックの箱は列の全高になる。潰す軸を取り違えるとキャレットがそのまま伸びる
    const box = view.textblocks[1].dom.getBoundingClientRect();
    expect(box.height).toBeGreaterThan(50);

    expect(inEmpty?.height).toBeLessThan(4);
    expect(inEmpty?.height).toBeCloseTo(inText?.height ?? 0, 0);
    expect(inEmpty?.width).toBeGreaterThan(8);
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

  it("読みが空でも rt にキャレットを置ける", () => {
    view = new EditorView(place, {
      state: EditorState.create({
        config: [basicSchema()],
        doc: (schema) =>
          schema.doc([
            Paragraph.create([
              Ruby.create([RubyBase.create([Leaf.text("漢字")]), RubyText.create([])]),
            ]),
          ]),
      }),
    });
    view.focus();

    const rt = view.dom.querySelector("rt") as HTMLElement;
    // 代役は CSS の生成内容なので、DOM のテキストにもバッファにも入らない
    expect(rt.getAttribute("data-tf-placeholder")).toBe("ルビ");
    expect(rt.textContent).toBe("");
    expect(view.textblocks[0].contentDOM.textContent).toBe(view.ime.all[0].ec.text);

    // 代役のぶんだけ箱ができるので、キャレットを測れる
    const rtBox = rt.getBoundingClientRect();
    expect(rtBox.width).toBeGreaterThan(0);

    select(7, 7); // rt の内側 (空なので先頭 = 末尾)
    const box = caretBox();
    expect(box?.left).toBeGreaterThanOrEqual(rtBox.left - 1);
    expect(box?.top).toBeGreaterThanOrEqual(rtBox.top - 1);
    expect(box?.height).toBeGreaterThan(0);
  });

  it("destroy でレイヤごと消える", () => {
    view = mount(false, "abc");
    expect(place.querySelector(".tf-caret-layer")).not.toBeNull();
    view.destroy();
    expect(place.querySelector(".tf-caret-layer")).toBeNull();
  });
});

/**
 * テキストブロックの代役。インラインブロックのそれと違って**場所を取らせない** —
 * 空ブロックのキャレットは高さ確保の `<br>` から測るので、代役が行に並ぶと後ろへずれる。
 */
describe("ブロックの代役", () => {
  const Held = Plot.define("Held", {
    inlineContent: true,
    group: Node.Group.Content,
    defaultBlock: true,
    placeholder: "ト書き",
    shape: { element: "p" },
  });

  /** 生成内容として実際に出ている文字。規則が当たらなければ "none" になる */
  function shownText(dom: HTMLElement): string {
    return getComputedStyle(dom, "::before").content;
  }

  function mountHeld(...texts: string[]): EditorView {
    place.style.fontSize = "16px";
    return new EditorView(place, {
      state: EditorState.create({
        config: [Doc, Held].map((element) => schemaElement.of(element)),
        doc: (schema) => schema.doc(texts.map((t) => Held.create(t ? [Leaf.text(t)] : []))),
      }),
    });
  }

  it("空のときだけ属性が付く", () => {
    view = mountHeld("abc", "");
    const [filled, empty] = view.textblocks.map((block) => block.contentDOM);
    expect(filled.hasAttribute("data-tf-block-placeholder")).toBe(false);
    expect(empty.getAttribute("data-tf-block-placeholder")).toBe("ト書き");
  });

  it("文字を入れると属性が外れる", () => {
    view = mountHeld("");
    const dom = view.textblocks[0].contentDOM;
    expect(dom.hasAttribute("data-tf-block-placeholder")).toBe(true);
    view.dispatch({ changes: { from: 1, insert: [Leaf.text("あ")] } });
    expect(view.textblocks[0].contentDOM.hasAttribute("data-tf-block-placeholder")).toBe(false);
  });

  it("代役は場所を取らないので、キャレットの位置が変わらない", () => {
    view = mountHeld("");
    // 焦点のあるブロックでしか出ないので、当てないと比較にならない
    view.focus();
    const dom = view.textblocks[0].contentDOM;
    expect(shownText(dom)).toContain("ト書き");

    const br = dom.querySelector("br") as HTMLElement;
    const held = br.getBoundingClientRect();
    dom.removeAttribute("data-tf-block-placeholder");
    const bare = br.getBoundingClientRect();
    expect(held.top).toBe(bare.top);
    expect(held.left).toBe(bare.left);
  });

  it("出るのは焦点のあるブロックだけ", () => {
    view = mountHeld("", "");
    const [first, second] = view.textblocks;
    // 属性はどちらにも付く。出し分けるのは CSS の仕事
    expect(first.contentDOM.hasAttribute("data-tf-block-placeholder")).toBe(true);
    expect(second.contentDOM.hasAttribute("data-tf-block-placeholder")).toBe(true);

    first.dom.focus();
    expect(shownText(first.contentDOM)).toContain("ト書き");
    expect(shownText(second.contentDOM)).not.toContain("ト書き");

    second.dom.focus();
    expect(shownText(first.contentDOM)).not.toContain("ト書き");
    expect(shownText(second.contentDOM)).toContain("ト書き");
  });

  it("焦点が外れると消える", () => {
    view = mountHeld("");
    const dom = view.textblocks[0].contentDOM;
    view.focus();
    expect(shownText(dom)).toContain("ト書き");
    view.textblocks[0].dom.blur();
    expect(shownText(dom)).not.toContain("ト書き");
  });
});
