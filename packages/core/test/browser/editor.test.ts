import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Leaf, type Plot } from "../../src/doc";
import { isEditContextSupported } from "../../src/ime/edit-context-api";
import { posAtCoords, wordRangeAt } from "../../src/input/pointer";
import {
  Blockquote,
  basicSchema,
  Paragraph,
  Ruby,
  RubyBase,
  RubyText,
} from "../../src/schema-basic";
import type { Extension } from "../../src/state/facet";
import { history } from "../../src/state/history";
import { TextSelection } from "../../src/state/selection";
import { EditorState } from "../../src/state/state";
import { caretPointFromCoords, caretRectAt } from "../../src/view/coords";
import { readDOMSelection } from "../../src/view/dom-selection";
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
  return mountWith([basicSchema()], ...nodes);
}

function mountWith(config: Extension, ...nodes: Plot[]): EditorView {
  return new EditorView(place, {
    state: EditorState.create({ config, doc: (schema) => schema.doc(nodes) }),
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

/** 変換範囲の下線。EditContext が textformatupdate で渡してくるもの */
function fireTextFormatUpdate(index: number, rangeStart: number, rangeEnd: number): void {
  const event = new Event("textformatupdate");
  Object.assign(event, {
    getTextFormats: () => [
      { rangeStart, rangeEnd, underlineStyle: "solid", underlineThickness: "thin" },
    ],
  });
  view.ime.all[index].ec.dispatchEvent(event);
}

function fireBeforeInput(inputType: string): void {
  const target = document.activeElement ?? view.dom;
  target.dispatchEvent(
    new InputEvent("beforeinput", { inputType, bubbles: true, cancelable: true }),
  );
}

/** IME が処理したキーに付く keyCode。ime/manager.ts の非公開の定数と同じ値 */
const IME_PROCESS_KEY = 229;

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
const isMac = /Mac|iP(hone|ad|od)/.test(navigator.userAgent);

/** Mod だけを押す。mac の Ctrl / 他の Meta は Mod ではないので混ぜない */
function pressMod(key: string, init: KeyboardEventInit = {}): boolean {
  return pressKey(key, { ...init, ...(isMac ? { metaKey: true } : { ctrlKey: true }) });
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

  it("変換中の下線は config に何も足さなくても出る", () => {
    view = mount("abcd");
    fireComposition(0, "compositionstart");
    fireTextFormatUpdate(0, 1, 3);
    expect(view.textblocks[0].contentDOM.innerHTML).toContain('class="tf-composition"');

    fireComposition(0, "compositionend");
    expect(view.textblocks[0].contentDOM.innerHTML).toBe("abcd");
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

    // 確定に使われた Enter。IME が処理したキーには keyCode 229 が付く。
    // preventDefault はするが doc は変えない
    expect(pressKey("Enter", { keyCode: IME_PROCESS_KEY })).toBe(true);
    expect(blockTexts()).toEqual(["abcd"]);

    // 2 回目はユーザーが自分で押した Enter (keyCode 13) なので改行の意図
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

  it("矢印はブロックの中も自前で動く", () => {
    view = mount("abc");
    setCaret(2);
    expect(pressKey("ArrowRight")).toBe(true);
    expect(view.state.selection.head).toBe(3);
    expect(pressKey("ArrowLeft")).toBe(true);
    expect(view.state.selection.head).toBe(2);
  });

  it("移動の単位は grapheme cluster", () => {
    // "👍" はサロゲートペア、"が" は結合文字。どちらも 1 つ分として跨ぐ
    view = mount("a👍がb");
    setCaret(2); // "a" の直後
    expect(pressKey("ArrowRight")).toBe(true);
    expect(view.state.selection.head).toBe(4); // 絵文字を割らない
    expect(pressKey("ArrowRight")).toBe(true);
    expect(view.state.selection.head).toBe(6); // 濁点も割らない
    expect(pressKey("ArrowLeft")).toBe(true);
    expect(view.state.selection.head).toBe(4);
  });

  it("範囲があるときの矢印は端に畳む", () => {
    view = mount("abcd");
    setSelection(2, 4);
    expect(pressKey("ArrowLeft")).toBe(true);
    expect([view.state.selection.anchor, view.state.selection.head]).toEqual([2, 2]);

    setSelection(2, 4);
    expect(pressKey("ArrowRight")).toBe(true);
    expect([view.state.selection.anchor, view.state.selection.head]).toEqual([4, 4]);
  });

  it("Shift + 矢印は anchor を置いたまま伸ばす", () => {
    view = mount("abc", "de");
    setCaret(2);
    expect(pressKey("ArrowRight", { shiftKey: true })).toBe(true);
    expect([view.state.selection.anchor, view.state.selection.head]).toEqual([2, 3]);
    // ブロックを跨いでも anchor は動かない
    expect(pressKey("ArrowRight", { shiftKey: true })).toBe(true);
    expect(pressKey("ArrowRight", { shiftKey: true })).toBe(true);
    expect([view.state.selection.anchor, view.state.selection.head]).toEqual([2, 6]);
  });

  it("折り返した行の中でも上下に動く", () => {
    place.style.width = "6ch";
    place.style.fontFamily = "monospace";
    place.style.wordBreak = "break-all";
    view = mount("abcdefghij"); // 6 文字で折り返るので 2 行になる
    setCaret(2); // 1 行目の "a" の直後
    expect(pressKey("ArrowDown")).toBe(true);
    const down = view.state.selection.head;
    expect(down).toBeGreaterThan(2);
    expect(view.textblockIndexAt(down)).toBe(0); // 同じブロックの中で動いた
    expect(pressKey("ArrowUp")).toBe(true);
    expect(view.state.selection.head).toBe(2);
  });

  /** 折り返し位置は 1 つの doc 位置に 2 つの見た目が対応する。そこを行頭に固定する */
  function mountWrapped(): HTMLElement {
    place.style.width = "6ch";
    place.style.fontFamily = "monospace";
    place.style.wordBreak = "break-all";
    view = mount("abcdefghij"); // "abcdef" / "ghij" の 2 行
    return view.textblocks[0].contentDOM;
  }

  it("ソフトラップの位置のキャレットは、前の行の末尾ではなく折り返した行の先頭に立つ", () => {
    const dom = mountWrapped();
    const line1 = caretRectAt(dom, 0); // 1 行目の行頭
    const line2 = caretRectAt(dom, 7); // "g" の直後 = 2 行目の中
    const wrap = caretRectAt(dom, 6); // 1 行目の末尾と 2 行目の先頭が同じ位置

    expect(line2.top).toBeGreaterThan(line1.top);
    expect(Math.abs(wrap.top - line2.top)).toBeLessThan(1);
    expect(Math.abs(wrap.left - line1.left)).toBeLessThan(1);
  });

  it("ソフトラップの位置から上へ動くと、同じブロックの 1 行目に入る", () => {
    place.style.width = "6ch";
    place.style.fontFamily = "monospace";
    place.style.wordBreak = "break-all";
    // 手前にブロックを置く。前の行の末尾を基準にすると、ここへ飛び出してしまう
    view = mount("xy", "abcdefghij");
    setCaret(11); // 2 つ目のブロックの 2 行目の先頭
    expect(pressKey("ArrowUp")).toBe(true);
    expect(view.textblockIndexAt(view.state.selection.head)).toBe(1);
    expect(view.state.selection.head).toBe(5); // 2 つ目のブロックの 1 行目の行頭
  });

  it("行を跨ぐ移動はインライン方向の位置を保つ", () => {
    // 2 つ目が短いので、そこでは末尾に丸まる。3 つ目では元の位置に戻ってほしい
    view = mount("abcdefgh", "ab", "abcdefgh");
    setCaret(9); // 1 つ目の末尾
    expect(pressKey("ArrowDown")).toBe(true);
    expect(view.state.selection.head).toBe(13); // "ab" の末尾
    expect(pressKey("ArrowDown")).toBe(true);
    // 丸まった位置からではなく、最初に決めた目標座標から引き直す
    expect(view.state.selection.head).toBe(23);
  });

  it("doc の端では動かないが、矢印は消費する", () => {
    view = mount("ab");
    setCaret(1);
    expect(pressKey("ArrowLeft")).toBe(true);
    expect(view.state.selection.head).toBe(1);
    setCaret(3);
    expect(pressKey("ArrowRight")).toBe(true);
    expect(view.state.selection.head).toBe(3);
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
 * doc: paragraph("あ", Ruby(RubyBase("漢"), RubyText("かん")), "い")
 * 位置: "あ" = 1..2 / Ruby = 2..11 ("漢" = 4..5、"かん" = 7..9) / "い" = 11..12
 */
describe("インラインブロック", () => {
  function mountRuby(): EditorView {
    return mountNodes(
      Paragraph.create([
        Leaf.text("あ"),
        Ruby.create([RubyBase.create([Leaf.text("漢")]), RubyText.create([Leaf.text("かん")])]),
        Leaf.text("い"),
      ]),
    );
  }

  it("インライン Plot として描かれる", () => {
    view = mountRuby();
    expect(view.textblocks[0].contentDOM.innerHTML).toBe(
      'あ<ruby data-tf-inline=""><rb data-tf-inline="">漢</rb>' +
        '<rt data-tf-inline="" data-tf-placeholder="ルビ">かん</rt></ruby>い',
    );
    // EditContext を張るのはテキストブロックだけ。インラインブロックには張らない
    expect(view.ime.all.length).toBe(1);
  });

  it("バッファは DOM のテキストと一致する", () => {
    view = mountRuby();
    // ここがずれると coords.ts の Range.toString() ベースの写像が壊れる
    expect(view.ime.all[0].ec.text).toBe("あ漢かんい");
    expect(view.textblocks[0].contentDOM.textContent).toBe(view.ime.all[0].ec.text);
  });

  it("矢印がルビの内側の端にも止まる", () => {
    view = mountRuby();
    setCaret(1);
    const visited = [view.state.selection.head];
    for (let i = 0; i < 8; i++) {
      expect(pressKey("ArrowRight")).toBe(true);
      visited.push(view.state.selection.head);
    }
    // 4 / 7 = rb・rt の内側の先頭、5 / 9 = 内側の末尾。
    // 3 / 6 / 10 は ruby 自身の内側なので止まらない (cursorInsideBounds が無い)
    expect(visited).toEqual([1, 2, 4, 5, 7, 8, 9, 11, 12]);
  });

  it("戻る向きも同じ位置を通る", () => {
    view = mountRuby();
    setCaret(12);
    const visited = [view.state.selection.head];
    for (let i = 0; i < 8; i++) {
      expect(pressKey("ArrowLeft")).toBe(true);
      visited.push(view.state.selection.head);
    }
    expect(visited).toEqual([12, 11, 9, 8, 7, 5, 4, 2, 1]);
  });

  it("内側の端に留まれる (DOM から読み戻しても外へ弾かれない)", async () => {
    view = mountRuby();
    setCaret(4); // RubyBase の中の先頭
    expect(view.state.selection.head).toBe(4);
    // selectionchange は非同期に届く。そこで外側 (2) に戻されないこと
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(view.state.selection.head).toBe(4);
  });

  it("DOM の選択も rt の中に入る", () => {
    view = mountRuby();
    setCaret(7); // rt の内側の先頭。rb の末尾と同じバッファオフセットに写る
    const dom = document.getSelection();
    expect(view.dom.querySelector("rt")?.contains(dom?.anchorNode ?? null)).toBe(true);

    setCaret(5); // rb の内側の末尾
    expect(
      view.dom.querySelector("rb")?.contains(document.getSelection()?.anchorNode ?? null),
    ).toBe(true);
  });

  it("ruby の直後は箱の外を指す", () => {
    view = mountRuby();
    setCaret(11); // ruby の閉じの直後。平らに数えると rt の末尾と同じ番号になる
    const anchor = document.getSelection()?.anchorNode ?? null;
    expect(view.dom.querySelector("rt")?.contains(anchor)).toBe(false);
    expect(view.dom.querySelector("ruby")?.contains(anchor)).toBe(false);
  });

  it("読みをクリックすると読みの中にキャレットが入る", () => {
    view = mountRuby();
    const rt = view.dom.querySelector("rt") as HTMLElement;
    const text = rt.firstChild as Text;
    // クリックで届く DOM 点をそのまま流す
    document.getSelection()?.setBaseAndExtent(text, 1, text, 1);
    const selection = readDOMSelection(view);
    expect(selection?.head).toBe(8); // rt の "か" と "ん" の間
  });

  it("親文字が消えるとルビごと消える", () => {
    view = mountRuby();
    // rb の中身 "漢" (4..5) だけを消す
    view.dispatch({ changes: { from: 4, to: 5, fit: true } });
    expect(view.state.doc.toString()).toBe('Doc(Paragraph("あい"))');
  });

  it("親文字が残っていればルビは消えない", () => {
    view = mountNodes(
      Paragraph.create([
        Ruby.create([RubyBase.create([Leaf.text("漢字")]), RubyText.create([Leaf.text("かんじ")])]),
      ]),
    );
    view.dispatch({ changes: { from: 3, to: 4, fit: true } }); // "漢" だけ消す
    expect(view.state.doc.toString()).toBe(
      'Doc(Paragraph(Ruby(RubyBase("字"), RubyText("かんじ"))))',
    );
  });

  it("変換を始めても内側から弾き出されない", () => {
    view = mountRuby();
    setCaret(4); // RubyBase の中の先頭
    // compositionstart は選択を指定せずに dispatch する。ここで外側 (2) に落ちると、
    // 続く textupdate がルビの外に入ってしまう
    fireComposition(0, "compositionstart");
    expect(view.state.selection.head).toBe(4);

    fireTextUpdate(0, {
      updateRangeStart: 1,
      updateRangeEnd: 1,
      text: "ん",
      selectionStart: 2,
      selectionEnd: 2,
    });
    expect(view.state.doc.toString()).toBe(
      'Doc(Paragraph("あ", Ruby(RubyBase("ん漢"), RubyText("かん")), "い"))',
    );
  });

  it("変換中の文字を消しきっても内側に残る", () => {
    view = mountRuby();
    setCaret(4);
    fireComposition(0, "compositionstart");
    fireTextUpdate(0, {
      updateRangeStart: 1,
      updateRangeEnd: 1,
      text: "ん",
      selectionStart: 2,
      selectionEnd: 2,
    });
    // 変換をやめて未確定文字列を消す。ここでキャレットが外へ出ると次の入力が外に入る
    fireTextUpdate(0, {
      updateRangeStart: 1,
      updateRangeEnd: 2,
      text: "",
      selectionStart: 1,
      selectionEnd: 1,
    });
    expect(view.state.doc.toString()).toBe(
      'Doc(Paragraph("あ", Ruby(RubyBase("漢"), RubyText("かん")), "い"))',
    );
    expect(view.state.selection.head).toBe(4);
  });

  it("内側の端に打った文字はルビの中に入る", () => {
    view = mountRuby();
    setCaret(4);
    fireTextUpdate(0, {
      updateRangeStart: 1,
      updateRangeEnd: 1,
      text: "X",
      selectionStart: 2,
      selectionEnd: 2,
    });
    // 外側 (pos 2) に入ると "あX漢" になる。内側なので "X漢"
    expect(view.state.doc.toString()).toBe(
      'Doc(Paragraph("あ", Ruby(RubyBase("X漢"), RubyText("かん")), "い"))',
    );
  });

  it("ルビの直後の文字を消してもキャレットがルビの中に落ちない", () => {
    // ルビの中身とその直後は同じバッファオフセットに写る。外側を採らないと rt の末尾に着く
    view = mountNodes(
      Paragraph.create([
        Ruby.create([RubyBase.create([Leaf.text("漢字")]), RubyText.create([Leaf.text("かんじ")])]),
        Leaf.text("あ"),
      ]),
    );
    setCaret(13); // "あ" の直後
    fireTextUpdate(0, {
      updateRangeStart: 5,
      updateRangeEnd: 6,
      text: "",
      selectionStart: 5,
      selectionEnd: 5,
    });
    expect(view.state.doc.toString()).toBe(
      'Doc(Paragraph(Ruby(RubyBase("漢字"), RubyText("かんじ"))))',
    );
    // 12 = ruby の閉じの直後。10 は rt の中身の末尾
    expect(view.state.selection.head).toBe(12);
  });

  it("ルビの中の textupdate がその中の文字を書き換える", () => {
    view = mountRuby();
    setCaret(5); // "漢" の直後
    fireTextUpdate(0, {
      updateRangeStart: 1,
      updateRangeEnd: 2,
      text: "字",
      selectionStart: 2,
      selectionEnd: 2,
    });
    expect(view.state.doc.toString()).toBe(
      'Doc(Paragraph("あ", Ruby(RubyBase("字"), RubyText("かん")), "い"))',
    );
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
    expect(quote?.hasAttribute("data-tf-container")).toBe(true);
    expect(quote?.hasAttribute("data-tf-textblock")).toBe(false);
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

  it("引用の先頭の Backspace が引用の手前の段落と結合する", () => {
    view = mountNested();
    setCaret(5); // "b" の先頭
    fireBeforeInput("deleteContentBackward");
    expect(view.state.doc.toString()).toBe('Doc(Paragraph("ab"), Blockquote(Paragraph("c")))');
    // 結合した先にキャレットが来て、EditContext もそこに張り替わる
    expect(view.state.selection.head).toBe(2);
    expect(view.ime.all.map((c) => c.ec.text)).toEqual(["ab", "c"]);
  });

  it("引用の後ろの段落の Backspace は引用の中の最後の段落と結合する", () => {
    view = mountNodes(Blockquote.create([paragraph("a"), paragraph("b")]), paragraph("c"));
    setCaret(9); // "c" の先頭
    fireBeforeInput("deleteContentBackward");
    expect(view.state.doc.toString()).toBe('Doc(Blockquote(Paragraph("a"), Paragraph("bc")))');
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

describe("ポインタ", () => {
  /** mousedown を投げて、preventDefault されたか (= 自前で処理したか) を返す */
  function pressMouseDown(target: HTMLElement, x: number, y: number): boolean {
    const event = new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: x,
      clientY: y,
    });
    target.dispatchEvent(event);
    return event.defaultPrevented;
  }

  function topLeftOf(element: HTMLElement): [number, number] {
    const box = element.getBoundingClientRect();
    return [box.left + 2, box.top + 2];
  }

  it("ブロックの外を押すとキャレットが一番近いブロックに入る", () => {
    view = mount("abc", "de");
    setSelection(1, 3);
    // 押した先はテキストブロックではない (エディタの余白を押したのと同じ状況)
    const [x, y] = topLeftOf(view.textblocks[1].dom);
    expect(pressMouseDown(view.dom, x, y)).toBe(true);

    expect(view.state.selection.empty).toBe(true);
    expect(view.textblockAt(view.state.selection.head)).toBe(view.textblocks[1]);
    expect(document.activeElement).toBe(view.textblocks[1].dom);
  });

  it("ブロックの中を押したときも自前で置く", () => {
    view = mount("abc");
    const block = view.textblocks[0];
    const [x, y] = topLeftOf(block.dom);
    expect(pressMouseDown(block.dom, x, y)).toBe(true);
    expect(view.state.selection.empty).toBe(true);
    expect(view.textblockAt(view.state.selection.head)).toBe(block);
    expect(document.activeElement).toBe(block.dom);
  });

  it("ドラッグでブロックを跨いで伸ばせる", () => {
    view = mount("abc", "def");
    const first = view.textblocks[0].dom.getBoundingClientRect();
    const second = view.textblocks[1].dom.getBoundingClientRect();
    pressMouseDown(view.textblocks[0].dom, first.left + 2, first.top + 2);
    window.dispatchEvent(
      new MouseEvent("mousemove", {
        bubbles: true,
        clientX: second.right - 2,
        clientY: second.top + 2,
      }),
    );
    const selection = view.state.selection;
    expect(selection.empty).toBe(false);
    expect(view.textblockAt(selection.anchor)).toBe(view.textblocks[0]);
    expect(view.textblockAt(selection.head)).toBe(view.textblocks[1]);
    window.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  });

  it("Shift + クリックは anchor を置いたまま伸ばす", () => {
    view = mount("abcd");
    setCaret(2);
    const box = view.textblocks[0].dom.getBoundingClientRect();
    const event = new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
      button: 0,
      shiftKey: true,
      clientX: box.right - 2,
      clientY: box.top + 2,
    });
    view.textblocks[0].dom.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(view.state.selection.anchor).toBe(2);
    expect(view.state.selection.head).toBeGreaterThan(2);
    window.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  });

  it("語の上でないダブルクリックのあともドラッグで伸ばせる", () => {
    // 語が取れないと anchor を置き忘れ、以降の mousemove が何もしなくなっていた
    // 記号だけなら Intl.Segmenter は isWordLike な区間を返さない = どこを押しても語が無い
    view = mount("---");
    const block = view.textblocks[0];
    const box = block.dom.getBoundingClientRect();
    expect(wordRangeAt(view, block.contentFrom)).toBeNull();
    const event = new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
      button: 0,
      detail: 2,
      clientX: box.left + 1,
      clientY: box.top + 2,
    });
    block.dom.dispatchEvent(event);
    expect(view.state.selection.empty).toBe(true);

    window.dispatchEvent(
      new MouseEvent("mousemove", { bubbles: true, clientX: box.right - 1, clientY: box.top + 2 }),
    );
    window.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    expect(view.state.selection.empty).toBe(false);
    expect(view.state.selection.to).toBe(block.contentTo);
  });

  it("引用の中のトリプルクリックはその段落だけを選ぶ", () => {
    view = mountNodes(paragraph("a"), Blockquote.create([paragraph("bcd"), paragraph("efg")]));
    const inner = view.textblocks[1];
    const [x, y] = topLeftOf(inner.dom);
    const event = new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
      button: 0,
      detail: 3,
      clientX: x,
      clientY: y,
    });
    inner.dom.dispatchEvent(event);
    window.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    // 引用まるごとではない
    expect([view.state.selection.from, view.state.selection.to]).toEqual([
      inner.contentFrom,
      inner.contentTo,
    ]);
  });

  it("左のパディングを押すとその行の頭に置く", () => {
    view = mount("abcdef", "ghijkl");
    view.dom.style.padding = "8px 16px";
    const block = view.textblocks[1];
    const box = block.dom.getBoundingClientRect();
    const editor = view.dom.getBoundingClientRect();
    const y = box.top + box.height / 2;
    // ブロックの箱より左 = パディングの中。ブロック方向だけで見ると行末になってしまう
    expect(editor.left).toBeLessThan(box.left);
    expect(posAtCoords(view, editor.left + 4, y)).toBe(block.contentFrom);
    expect(posAtCoords(view, editor.right - 4, y)).toBe(block.contentTo);
  });

  it("折り返した行の左は、ブロックの頭ではなくその行の頭", () => {
    place.style.width = "120px";
    view = mount("aaaa bbbb cccc dddd eeee");
    const block = view.textblocks[0];
    const box = block.dom.getBoundingClientRect();
    // 折り返して 2 行以上になっている (1 行は 18px 前後)
    expect(box.height).toBeGreaterThan(25);

    const first = posAtCoords(view, box.left - 8, box.top + 4);
    const last = posAtCoords(view, box.left - 8, box.bottom - 4);
    expect(first).toBe(block.contentFrom);
    expect(last).toBeGreaterThan(block.contentFrom);
    expect(last).toBeLessThan(block.contentTo);
  });

  it("空のインラインブロック (代役) を押すとその中にキャレットが入る", () => {
    // P("あ", Ruby(Rb("代役") 3..6, Rt() 8), "い") → rt の中身は 8
    view = mountNodes(
      Paragraph.create([
        Leaf.text("あ"),
        Ruby.create([RubyBase.create([Leaf.text("代役")]), RubyText.create([])]),
        Leaf.text("い"),
      ]),
    );
    const rt = view.dom.querySelector("rt") as HTMLElement;
    const box = rt.getBoundingClientRect();
    // 代役の生成内容のおかげで箱はある
    expect(box.width).toBeGreaterThan(0);

    const x = box.left + box.width / 2;
    const y = box.top + box.height / 2;
    // 生成内容には DOM 位置が無いので、ブラウザの当たり判定は外のテキストへ逃げる
    const point = caretPointFromCoords(x, y);
    expect(view.textblockForDOM(point?.node ?? null)).not.toBeNull();
    expect(point?.node.nodeType).toBe(3);

    // それでも rt の中 (8) に入ること。10 はルビの外
    expect(posAtCoords(view, x, y)).toBe(8);
    expect(pressMouseDown(rt, x, y)).toBe(true);
    expect(view.state.selection.head).toBe(8);
  });

  it("ダブルクリックで語、トリプルクリックでブロックを選ぶ", () => {
    view = mount("foo bar baz");
    const block = view.textblocks[0];
    const box = block.dom.getBoundingClientRect();
    const press = (detail: number) => {
      const event = new MouseEvent("mousedown", {
        bubbles: true,
        cancelable: true,
        button: 0,
        detail,
        clientX: box.left + 2,
        clientY: box.top + 2,
      });
      block.dom.dispatchEvent(event);
      window.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    };

    press(2);
    expect([view.state.selection.from, view.state.selection.to]).toEqual([1, 4]); // "foo"

    press(3);
    expect([view.state.selection.from, view.state.selection.to]).toEqual([
      block.contentFrom,
      block.contentTo,
    ]);
  });
});

/** liftEmptyBlock の中身は test/model/lift.test.ts。ここは Enter に繋がっているかだけ見る */
describe("Enter と liftEmptyBlock", () => {
  it("引用の中の空段落で Enter を押すと引用の外へ出る", () => {
    view = mountNodes(paragraph("a"), Blockquote.create([paragraph("b"), Paragraph.create([])]));
    setCaret(8);
    expect(pressKey("Enter")).toBe(true);
    expect(view.state.doc.toString()).toBe(
      'Doc(Paragraph("a"), Blockquote(Paragraph("b")), Paragraph())',
    );
    expect(view.textblockAt(view.state.selection.head)).toBe(view.textblocks[2]);
  });

  it("出られないときは今まで通り割れる", () => {
    view = mountNodes(Blockquote.create([paragraph("ab")]));
    setCaret(3);
    expect(pressKey("Enter")).toBe(true);
    expect(view.state.doc.toString()).toBe('Doc(Blockquote(Paragraph("a"), Paragraph("b")))');
  });
});

describe("undo / redo のキー", () => {
  it("Mod-z で戻り、Mod-Shift-z でやり直せる", () => {
    view = mountWith([basicSchema(), history()], paragraph("abc"));
    setCaret(4);
    expect(pressKey("Enter")).toBe(true);
    expect(blockTexts()).toEqual(["abc", ""]);

    expect(pressMod("z")).toBe(true);
    expect(blockTexts()).toEqual(["abc"]);
    // 戻したあとキャレットは分割する前の位置に戻る
    expect(view.state.selection.head).toBe(4);

    expect(pressMod("z", { shiftKey: true })).toBe(true);
    expect(blockTexts()).toEqual(["abc", ""]);
  });

  it("メニューからの取り消し (historyUndo) も効く", () => {
    view = mountWith([basicSchema(), history()], paragraph("abc"));
    setCaret(4);
    pressKey("Enter");
    fireBeforeInput("historyUndo");
    expect(blockTexts()).toEqual(["abc"]);
    fireBeforeInput("historyRedo");
    expect(blockTexts()).toEqual(["abc", ""]);
  });

  it("history が無い構成では Mod-z を握り潰さない", () => {
    view = mountNodes(paragraph("abc"));
    setCaret(4);
    expect(pressMod("z")).toBe(false);
  });
});
