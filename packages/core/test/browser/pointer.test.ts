import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Leaf, Node, Plot } from "../../src/doc";
import { basicSchema, Doc, Paragraph, Ruby, RubyBase, RubyText } from "../../src/extensions";
import { posAtCoords } from "../../src/input/pointer";
import { EditorState, schemaElement } from "../../src/state/state";
import { EditorView } from "../../src/view/view";

/** 台本の人物名の欄と同じ形。インラインブロックを中身より大きく取り、鉤括弧を生成内容で出す */
const Speaker = Plot.define("Speaker", {
  inline: true,
  inlineContent: Leaf.Text,
  cursorInsideBounds: true,
  shape: { element: "span", attrs: { class: "speaker" } },
});
const Dialogue = Plot.define("Dialogue", {
  inlineContent: true,
  group: Node.Group.Content,
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
    .speaker { display: inline-flex; justify-content: space-between; min-inline-size: 8em; }
    .speaker::after { content: "「"; }
  `;
  document.head.appendChild(sheet);
});

afterEach(() => {
  view?.destroy();
  place.remove();
  sheet.remove();
});

function mountDialogue(): EditorView {
  place.style.writingMode = "vertical-rl";
  place.style.height = "400px";
  place.style.fontSize = "16px";
  place.style.lineHeight = "2";
  return new EditorView(place, {
    state: EditorState.create({
      config: [Doc, Dialogue, Speaker].map((element) => schemaElement.of(element)),
      // Dialogue( Speaker("ヤス") 1..5 )。発話は空なので 5 が鉤括弧の位置
      doc: (schema) => schema.doc([Dialogue.create([Speaker.create([Leaf.text("ヤス")])])]),
    }),
  });
}

function speakerBox(): DOMRect {
  return (view.dom.querySelector("[data-tf-inline]") as HTMLElement).getBoundingClientRect();
}

/**
 * インラインブロックの中身より後ろは、生成内容や余りで**対応する DOM 位置が無い**。
 * そこを押すと caretPositionFromPoint が中の文字の末尾へ寄せてしまい、発話が空のときは
 * 鉤括弧を押しても名前の末尾に吸い込まれて「動かない」ように見えていた。
 */
describe("人物名の欄まわりのクリック", () => {
  it("名前の上は名前の中を指す", () => {
    view = mountDialogue();
    const box = speakerBox();
    expect(posAtCoords(view, (box.left + box.right) / 2, box.top + 8)).toBe(2);
  });

  it("鉤括弧を押すと発話の先頭", () => {
    view = mountDialogue();
    const box = speakerBox();
    expect(posAtCoords(view, (box.left + box.right) / 2, box.bottom - 8)).toBe(5);
  });

  it("名前と鉤括弧の間の余りも発話の先頭", () => {
    view = mountDialogue();
    const box = speakerBox();
    expect(posAtCoords(view, (box.left + box.right) / 2, (box.top + box.bottom) / 2)).toBe(5);
  });

  it("インラインブロックを出たすぐ後ろも発話の先頭", () => {
    view = mountDialogue();
    const box = speakerBox();
    expect(posAtCoords(view, (box.left + box.right) / 2, box.bottom + 6)).toBe(5);
  });
});

describe("普通の文字と空のインラインブロックは変わらない", () => {
  it("文字の上はその文字の位置", () => {
    place.style.fontSize = "16px";
    view = new EditorView(place, {
      state: EditorState.create({
        config: [basicSchema()],
        doc: (schema) => schema.doc([Paragraph.create([Leaf.text("abc")])]),
      }),
    });
    const text = view.dom.querySelector("p") as HTMLElement;
    const box = text.getBoundingClientRect();
    // 1 文字目の上。中身より後ろではないので、これまでどおり文字から引く
    expect(posAtCoords(view, box.left + 2, box.top + box.height / 2)).toBe(1);
  });

  it("中身が空のインラインブロックは中を指したまま", () => {
    place.style.fontSize = "16px";
    view = new EditorView(place, {
      state: EditorState.create({
        config: [basicSchema()],
        doc: (schema) =>
          schema.doc([
            Paragraph.create([
              Ruby.create([RubyBase.create([Leaf.text("漢")]), RubyText.create([])]),
            ]),
          ]),
      }),
    });
    const rt = view.dom.querySelector("rt") as HTMLElement;
    const box = rt.getBoundingClientRect();
    const pos = posAtCoords(view, (box.left + box.right) / 2, (box.top + box.bottom) / 2);
    // Paragraph( Ruby( RubyBase("漢") 2..5, RubyText() 5..7 ) 1..8 ) の、rt の中身
    expect(pos).toBe(6);
  });
});
