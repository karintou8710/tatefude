import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Leaf, Node, Plot } from "../../src/doc";
import { Doc } from "../../src/extensions";
import { TextSelection } from "../../src/state/selection";
import { EditorState, schemaElement } from "../../src/state/state";
import { caretRectFor } from "../../src/view/dom-point";
import { EditorView } from "../../src/view/view";

/**
 * 中身より広いインラインブロックを跨ぐ行移動。
 *
 * 台本の人物名の枠がこの形 — `min-inline-size: 8em` の inline-flex で、名前は 2〜3 文字。
 * 余りは当たり判定がインラインブロックの中なので、行を跨ぐと着地が名前の末尾まで戻ってしまっていた。
 */

/** 人物名の枠。中身より広く、末尾に鉤括弧が付く */
const Field = Plot.define("Field", {
  inline: true,
  inlineContent: Leaf.Text,
  cursorInsideBounds: true,
  shape: { element: "span", attrs: { class: "test-field" } },
});

const Line = Plot.define("Line", {
  inlineContent: true,
  group: Node.Group.Content,
  defaultBlock: true,
  // 先頭は枠で埋まる。その手前は枠の内側の先頭と同じ点に描かれる余り
  cursorAtContentStart: false,
  shape: { element: "p" },
});

let place: HTMLElement;
let view: EditorView;
let sheet: HTMLStyleElement;

beforeEach(() => {
  place = document.createElement("div");
  document.body.appendChild(place);
  sheet = document.createElement("style");
  sheet.textContent = `
    .test-field { display: inline-flex; justify-content: space-between; min-inline-size: 8em; }
    .test-field::after { content: "「"; }
  `;
  document.head.appendChild(sheet);
});

afterEach(() => {
  view?.destroy();
  place.remove();
  sheet.remove();
});

/** 枠 + 発話の行を 2 つ。縦書きなので行は右から左へ積まれる */
function mount(): EditorView {
  place.style.writingMode = "vertical-rl";
  place.style.height = "400px";
  place.style.fontSize = "16px";
  place.style.lineHeight = "2";
  const line = (name: string, speech: string) =>
    Line.create([Field.create([Leaf.text(name)]), Leaf.text(speech)]);
  return new EditorView(place, {
    state: EditorState.create({
      config: [Doc, Line, Field].map((element) => schemaElement.of(element)),
      doc: (schema) => schema.doc([line("ヤス", "あいうえお"), line("健太郎", "かきくけこ")]),
    }),
  });
}

function press(key: string): void {
  const target = document.activeElement ?? view.dom;
  target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
}

/** 縦書きなので inline 方向は上下 = top */
function caretAlong(pos: number): number {
  const block = view.textblockAt(pos);
  if (!block) throw new Error("ブロックが無い");
  return caretRectFor(block, pos).top;
}

describe("中身より広いインラインブロックを跨ぐ行移動", () => {
  // Doc( Line(Field("ヤス") 1..5, "あいうえお" 5..10) 0..11, Line(Field("健太郎") 12..17, ...) )
  const speechStart1 = 5;
  const speechStart2 = 17;

  it("枠の直後 (鉤括弧の先頭) から隣の行へ移っても、枠の中に落ちない", () => {
    view = mount();
    view.focus();
    view.dispatch({ selection: TextSelection.create(view.state.doc, speechStart1) });

    const before = caretAlong(speechStart1);
    press("ArrowLeft"); // vertical-rl では左が次の行
    const head = view.state.selection.head;

    // 隣の行の同じ場所 = そちらの枠の直後
    expect(head).toBe(speechStart2);
    expect(caretAlong(head)).toBeCloseTo(before, 0);
  });

  it("戻ると元の位置に着く", () => {
    view = mount();
    view.focus();
    view.dispatch({ selection: TextSelection.create(view.state.doc, speechStart2) });

    press("ArrowRight"); // 前の行へ
    expect(view.state.selection.head).toBe(speechStart1);
  });

  it("枠の中にいるときは枠の中へ移る", () => {
    view = mount();
    view.focus();
    // "ヤ" の手前 = 枠の内側の先頭
    view.dispatch({ selection: TextSelection.create(view.state.doc, 2) });
    const before = caretAlong(2);

    press("ArrowLeft");
    const head = view.state.selection.head;
    // 隣の行の枠の中 (13 = "健" の手前)
    expect(head).toBe(13);
    expect(caretAlong(head)).toBeCloseTo(before, 0);
  });
});
