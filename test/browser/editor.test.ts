import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Leaf, type Plot } from "../../src/doc";
import { isEditContextSupported } from "../../src/ime/edit-context-api";
import { composition } from "../../src/plugins/composition";
import { Blockquote, basicSchema, Paragraph } from "../../src/schema-basic";
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
  return mountNodes(...texts.map(paragraph));
}

function mountNodes(...nodes: Plot[]): EditorView {
  return new EditorView(place, {
    state: EditorState.create({
      config: [basicSchema(), composition()],
      doc: (schema) => schema.doc(nodes),
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

/** 変換の開始 / 終了。EditContext が投げるものと同じ経路で流す */
function fireComposition(index: number, type: "compositionstart" | "compositionend"): void {
  view.ime.all[index].ec.dispatchEvent(new Event(type));
}

function fireBeforeInput(inputType: string): void {
  const target = document.activeElement ?? view.dom;
  target.dispatchEvent(
    new InputEvent("beforeinput", { inputType, bubbles: true, cancelable: true }),
  );
}

/** keydown を投げて、preventDefault されたか (= 自前で処理したか) を返す */
function pressKey(key: string, init: KeyboardEventInit = {}): boolean {
  const target = document.activeElement ?? view.dom;
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event.defaultPrevented;
}

function setCaret(pos: number): void {
  view.dispatch({ selection: TextSelection.create(view.state.doc, pos) });
}

function setSelection(anchor: number, head: number): void {
  view.dispatch({ selection: TextSelection.create(view.state.doc, anchor, head) });
}

/** Mod- 付きのキー。mac かどうかで meta / ctrl が変わるので両方立てておく */
function pressMod(key: string): boolean {
  return pressKey(key, { metaKey: true, ctrlKey: true });
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
    expect(view.textblocks.length).toBe(2);
    expect(view.ime.all.length).toBe(2);
    expect(view.ime.all[0].ec.text).toBe("abc");
    expect(view.ime.all[1].ec.text).toBe("de");
    expect(view.ime.all[0].ec.attachedElements()[0]).toBe(view.textblocks[0].dom);
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
    expect(pressKey("Enter")).toBe(true);
    expect(blockTexts()).toEqual(["ab", "cd"]);
    expect(view.ime.all.length).toBe(2);
    expect(view.ime.all[1].ec.text).toBe("cd");
    expect(view.state.selection.head).toBe(5);
  });

  it("Shift-Enter は keymap では拾わない (hard break の意図なので beforeinput へ)", () => {
    view = mount("abcd");
    setCaret(3);
    expect(pressKey("Enter", { shiftKey: true })).toBe(false);
    expect(blockTexts()).toEqual(["abcd"]);
  });

  it("Mod-b が選択範囲に Strong を付け外しする", () => {
    view = mount("abcd");
    setSelection(1, 3); // "ab"
    expect(pressMod("b")).toBe(true);
    expect(view.textblocks[0].contentDOM.innerHTML).toBe("<strong>ab</strong>cd");
    expect(pressMod("b")).toBe(true);
    expect(view.textblocks[0].contentDOM.innerHTML).toBe("abcd");
  });

  it("Mod-i が選択範囲に Emphasis を付ける", () => {
    view = mount("abcd");
    setSelection(1, 3);
    expect(pressMod("i")).toBe(true);
    expect(view.textblocks[0].contentDOM.innerHTML).toBe("<em>ab</em>cd");
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
    view.dispatch({ selection: TextSelection.create(view.state.doc, 3, 7) });
    fireBeforeInput("deleteContentBackward");
    expect(blockTexts()).toEqual(["abef"]);
  });

  it("変換中の keydown は IME に譲る", () => {
    view = mount("abc", "de");
    setCaret(4); // 1 つ目のブロックの末尾
    // 変換中でなければブロックを跨ぐ
    expect(pressKey("ArrowRight")).toBe(true);
    expect(view.state.selection.head).toBe(6);

    setCaret(4);
    fireComposition(0, "compositionstart");
    // 変換中は何もしない。EditContext 経由では isComposing が立たないので自前の状態で見る
    expect(view.ime.composing).toBe(true);
    expect(pressKey("ArrowRight")).toBe(false);
    expect(view.state.selection.head).toBe(4);
  });

  it("変換を確定した Enter は改行にしない (捨てるのは 1 回だけ)", () => {
    view = mount("abcd");
    setCaret(3);
    fireComposition(0, "compositionstart");
    fireComposition(0, "compositionend");

    // 確定に使われた Enter。preventDefault はするが doc は変えない
    expect(pressKey("Enter")).toBe(true);
    expect(blockTexts()).toEqual(["abcd"]);

    // 2 回目は改行の意図
    expect(pressKey("Enter")).toBe(true);
    expect(blockTexts()).toEqual(["ab", "cd"]);
  });

  it("Mod-a がドキュメント全体を選ぶ", () => {
    view = mount("abc", "de");
    setCaret(2);
    expect(pressMod("a")).toBe(true);
    // 1 つ目のブロックの中身の先頭から、2 つ目のブロックの中身の末尾まで
    expect([view.state.selection.from, view.state.selection.to]).toEqual([1, 8]);
    // ブラウザの選択はホスト境界で丸まるが、model は跨いだままでいる
    expect(view.ime.all[0].ec.selectionStart).toBe(0);
    expect(view.ime.all[1].ec.selectionEnd).toBe(2);
  });

  it("全選択してからの削除で空のブロック 1 つになる", () => {
    view = mount("abc", "de");
    setCaret(2);
    pressMod("a");
    fireBeforeInput("deleteContentBackward");
    expect(view.state.doc.toString()).toBe("Doc(Paragraph())");
  });

  it("変換と関係ない Enter は捨てない", () => {
    view = mount("abcd");
    setCaret(3);
    expect(pressKey("Enter")).toBe(true);
    expect(blockTexts()).toEqual(["ab", "cd"]);
  });

  it("フォーカスはキャレットのあるブロックに移る", () => {
    view = mount("abc", "de");
    setCaret(7);
    expect(document.activeElement).toBe(view.textblocks[1].dom);
    setCaret(2);
    expect(document.activeElement).toBe(view.textblocks[0].dom);
  });
});

/**
 * doc: paragraph("a") / blockquote( paragraph("b"), paragraph("c") )
 * 位置: "a" = 1..2、blockquote = 3..11、"b" = 5..6、"c" = 8..9
 */
describe("ネストしたブロック", () => {
  function mountNested(): EditorView {
    return mountNodes(paragraph("a"), Blockquote.create([paragraph("b"), paragraph("c")]));
  }

  it("EditContext はテキストブロックにだけ張られる", () => {
    view = mountNested();
    const quote = view.dom.querySelector("blockquote");
    expect(quote?.hasAttribute("data-ecw-container")).toBe(true);
    expect(quote?.hasAttribute("data-ecw-textblock")).toBe(false);
    // 中身を持つ Plot は編集ホストにしない
    expect(quote?.hasAttribute("tabindex")).toBe(false);
    expect((quote as unknown as { editContext?: unknown }).editContext ?? null).toBe(null);
  });

  it("テキストブロックは文書順に並ぶ", () => {
    view = mountNested();
    expect(view.textblocks.length).toBe(3);
    expect(view.ime.all.map((context) => context.ec.text)).toEqual(["a", "b", "c"]);
    // 引用の中のブロックは引用の DOM の中に描かれる
    const quote = view.dom.querySelector("blockquote");
    expect(quote?.contains(view.textblocks[1].dom)).toBe(true);
    expect(quote?.contains(view.textblocks[0].dom)).toBe(false);
  });

  it("位置からテキストブロックを引ける", () => {
    view = mountNested();
    expect(view.textblockIndexAt(2)).toBe(0);
    expect(view.textblockIndexAt(5)).toBe(1);
    expect(view.textblockIndexAt(9)).toBe(2);
    // ブロックとブロックの間はどこにも属さない
    expect(view.textblockAt(3)).toBe(null);
  });

  it("矢印キーの跨ぎ移動が引用の内外をまたぐ", () => {
    view = mountNested();
    setCaret(2); // "a" の末尾
    expect(pressKey("ArrowRight")).toBe(true);
    expect(view.state.selection.head).toBe(5); // 引用の中の "b" の先頭
    setCaret(5);
    expect(pressKey("ArrowLeft")).toBe(true);
    expect(view.state.selection.head).toBe(2);
  });

  it("引用の中のブロック先頭の Backspace が結合になる", () => {
    view = mountNested();
    setCaret(8); // "c" の先頭
    fireBeforeInput("deleteContentBackward");
    expect(view.state.doc.toString()).toBe('Doc(Paragraph("a"), Blockquote(Paragraph("bc")))');
    expect(view.textblocks.length).toBe(2);
    expect(view.ime.all[1].ec.text).toBe("bc");
  });

  it("引用の先頭の Backspace は何もしない (引用を出るのは未実装)", () => {
    view = mountNested();
    setCaret(5); // "b" の先頭
    fireBeforeInput("deleteContentBackward");
    expect(view.state.doc.toString()).toBe(
      'Doc(Paragraph("a"), Blockquote(Paragraph("b"), Paragraph("c")))',
    );
  });

  it("引用の中の Enter は引用の中で割れる", () => {
    view = mountNested();
    setCaret(6); // "b" の末尾
    expect(pressKey("Enter")).toBe(true);
    expect(view.state.doc.toString()).toBe(
      'Doc(Paragraph("a"), Blockquote(Paragraph("b"), Paragraph(), Paragraph("c")))',
    );
    expect(view.textblocks.length).toBe(4);
  });

  it("引用の中でもマークを付けられる", () => {
    view = mountNested();
    setSelection(5, 6); // "b"
    expect(pressMod("b")).toBe(true);
    expect(view.textblocks[1].contentDOM.innerHTML).toBe("<strong>b</strong>");
  });

  it("引用の外から中への跨ぎ削除が、木として成立する形に落ちる", () => {
    view = mountNested();
    setSelection(2, 6); // "a" の末尾 → 引用の中の "b" の末尾
    fireBeforeInput("deleteContentBackward");
    expect(view.state.doc.toString()).toBe(
      'Doc(Paragraph("a"), Blockquote(Paragraph(), Paragraph("c")))',
    );
  });

  it("引用の中から外への跨ぎ削除も成立する", () => {
    view = mountNodes(Blockquote.create([paragraph("a"), paragraph("b")]), paragraph("c"));
    setSelection(5, 11); // 引用の中の "b" の先頭 → "c" の末尾
    fireBeforeInput("deleteContentBackward");
    expect(view.state.doc.toString()).toBe('Doc(Blockquote(Paragraph("a"), Paragraph()))');
  });

  it("Mod-a は引用の中まで含めて端から端まで選ぶ", () => {
    view = mountNested();
    setCaret(5);
    expect(pressMod("a")).toBe(true);
    expect([view.state.selection.from, view.state.selection.to]).toEqual([1, 9]);
    expect(
      view.ime.all.map((context) => [context.ec.selectionStart, context.ec.selectionEnd]),
    ).toEqual([
      [0, 1],
      [0, 1],
      [0, 1],
    ]);
  });

  it("全選択してからの削除では、空になった引用が残る (畳み込みは未実装)", () => {
    view = mountNested();
    setCaret(5);
    pressMod("a");
    fireBeforeInput("deleteContentBackward");
    // 木としては成立している。空のコンテナを畳むのは fit / correction 側の仕事
    expect(view.state.doc.toString()).toBe("Doc(Paragraph(), Blockquote(Paragraph()))");
  });

  it("EditContext は同じ型なら張り替えない", () => {
    view = mountNested();
    const before = view.ime.all[1];
    setCaret(9);
    fireTextUpdate(2, {
      updateRangeStart: 1,
      updateRangeEnd: 1,
      text: "X",
      selectionStart: 2,
      selectionEnd: 2,
    });
    expect(view.state.doc.toString()).toBe(
      'Doc(Paragraph("a"), Blockquote(Paragraph("b"), Paragraph("cX")))',
    );
    expect(view.ime.all[1]).toBe(before);
  });
});
