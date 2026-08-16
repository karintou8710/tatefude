import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Leaf, type Plot } from "../../src/doc";
import { isEditContextSupported } from "../../src/ime/edit-context-api";
import { composition } from "../../src/plugins/composition";
import { basicSchema, Paragraph } from "../../src/schema-basic";
import { TextSelection } from "../../src/state/selection";
import { EditorState } from "../../src/state/state";
import { EditorView } from "../../src/view/view";

interface TextUpdateInit {
  updateRangeStart: number;
  updateRangeEnd: number;
  text: string;
  selectionStart: number;
  selectionEnd: number;
}

let place: HTMLElement;
let view: EditorView;

function paragraph(text: string): Plot {
  return Paragraph.create(text ? [Leaf.text(text)] : []);
}

function mount(...texts: string[]): EditorView {
  return new EditorView(place, {
    state: EditorState.create({
      config: [basicSchema(), composition()],
      doc: (schema) => schema.doc(texts.map(paragraph)),
    }),
  });
}

/** 実際の IME の代わりに textupdate だけを再現する (実機の IME 経路は CDP で別途) */
function fireTextUpdate(index: number, init: TextUpdateInit): void {
  const context = view.ime.all[index];
  const event = new Event("textupdate");
  Object.assign(event, init);
  context.ec.dispatchEvent(event);
}

function fireBeforeInput(inputType: string): void {
  const target = document.activeElement ?? view.dom;
  target.dispatchEvent(
    new InputEvent("beforeinput", { inputType, bubbles: true, cancelable: true }),
  );
}

function setCaret(pos: number): void {
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos)));
}

function blockTexts(): string[] {
  return view.state.doc.content.map((block) => block.textContent);
}

beforeEach(() => {
  place = document.createElement("div");
  document.body.appendChild(place);
});

afterEach(() => {
  view?.destroy();
  place.remove();
});

describe("EditContext との接続", () => {
  it("この環境で EditContext が使える", () => {
    expect(isEditContextSupported()).toBe(true);
  });

  it("ブロックごとに EditContext が張られる", () => {
    view = mount("abc", "de");
    expect(view.blocks.length).toBe(2);
    expect(view.ime.all.length).toBe(2);
    expect(view.ime.all[0].ec.text).toBe("abc");
    expect(view.ime.all[1].ec.text).toBe("de");
    expect(view.ime.all[0].ec.attachedElements()[0]).toBe(view.blocks[0].dom);
  });

  it("textupdate がドキュメントの変更になる", () => {
    view = mount("abc");
    setCaret(2);
    fireTextUpdate(0, {
      updateRangeStart: 1,
      updateRangeEnd: 1,
      text: "X",
      selectionStart: 2,
      selectionEnd: 2,
    });
    expect(blockTexts()).toEqual(["aXbc"]);
    expect(view.state.selection.head).toBe(3);
    // doc を正として EditContext のバッファも合っている
    expect(view.ime.all[0].ec.text).toBe("aXbc");
  });

  it("2 つ目のブロックの textupdate もブロックローカルに写る", () => {
    view = mount("abc", "de");
    setCaret(7);
    fireTextUpdate(1, {
      updateRangeStart: 1,
      updateRangeEnd: 2,
      text: "XY",
      selectionStart: 3,
      selectionEnd: 3,
    });
    expect(blockTexts()).toEqual(["abc", "dXY"]);
    expect(view.state.selection.head).toBe(9);
  });

  it("Enter でブロックが割れて、新しいブロックに EditContext が増える", () => {
    view = mount("abcd");
    setCaret(3);
    fireBeforeInput("insertParagraph");
    expect(blockTexts()).toEqual(["ab", "cd"]);
    expect(view.ime.all.length).toBe(2);
    expect(view.ime.all[1].ec.text).toBe("cd");
    expect(view.state.selection.head).toBe(5);
  });

  it("ブロック先頭の Backspace が結合になる", () => {
    view = mount("ab", "cd");
    setCaret(5); // 2 つ目のブロックの先頭
    fireBeforeInput("deleteContentBackward");
    expect(blockTexts()).toEqual(["abcd"]);
    expect(view.state.selection.head).toBe(3);
    expect(view.ime.all.length).toBe(1);
    expect(view.ime.all[0].ec.text).toBe("abcd");
  });

  it("ブロックの途中の Backspace は EditContext に任せる (doc は変わらない)", () => {
    view = mount("ab", "cd");
    setCaret(6);
    fireBeforeInput("deleteContentBackward");
    expect(blockTexts()).toEqual(["ab", "cd"]);
  });

  it("ブロックを跨ぐ選択の削除は自前で処理する", () => {
    view = mount("abc", "def");
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 3, 7)));
    fireBeforeInput("deleteContentBackward");
    expect(blockTexts()).toEqual(["abef"]);
  });

  it("フォーカスはキャレットのあるブロックに移る", () => {
    view = mount("abc", "de");
    setCaret(7);
    expect(document.activeElement).toBe(view.blocks[1].dom);
    setCaret(2);
    expect(document.activeElement).toBe(view.blocks[0].dom);
  });
});
