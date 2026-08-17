import { describe, expect, it } from "vitest";
import { wrapInline } from "../../src/commands/base";
import { Leaf, type Plot } from "../../src/doc";
import { basicSchema, Paragraph } from "../../src/schema-basic";
import { TCY_MAX_LENGTH, Tcy, tcySchema } from "../../src/schema-tcy";
import { TextSelection } from "../../src/state/selection";
import { EditorState } from "../../src/state/state";
import { ruby } from "./doc";

function stateOf(blocks: Plot[], from: number, to = from) {
  const state = EditorState.create({
    config: [basicSchema(), tcySchema],
    doc: (schema) => schema.doc(blocks),
  });
  return state.update({ selection: TextSelection.create(state.doc, from, to) }).state;
}

const p = (...content: (string | Plot)[]) =>
  Paragraph.create(content.map((c) => (typeof c === "string" ? Leaf.text(c) : c)));

describe("wrapInline", () => {
  // Doc( Paragraph("あいうえ") 0..6 ) — 中身は 1..5
  it("選んだところを箱で包み、選択は中身に張り直す", () => {
    const state = stateOf([p("あいうえ")], 2, 4);
    const spec = wrapInline(Tcy)(state);
    if (!spec) throw new Error("包めなかった");
    const next = state.update(spec).state;
    expect(next.doc.toString()).toBe('Doc(Paragraph("あ", Tcy("いう"), "え"))');
    // 開きトークンのぶん 1 つ後ろへ
    expect([next.selection.from, next.selection.to]).toEqual([3, 5]);
  });

  it("空の選択では何もしない", () => {
    expect(wrapInline(Tcy)(stateOf([p("あいうえ")], 2))).toBe(false);
  });

  it("長すぎる選択は断る (縦中横は 4 文字を超えると読めない)", () => {
    const state = stateOf([p("あいうえおか")], 1, 7);
    expect(wrapInline(Tcy, TCY_MAX_LENGTH)(state)).toBe(false);
    expect(wrapInline(Tcy)(state)).not.toBe(false);
  });

  it("ブロックを跨ぐ選択は断る", () => {
    // Doc( Paragraph("あい") 0..4, Paragraph("うえ") 4..8 )
    expect(wrapInline(Tcy)(stateOf([p("あい"), p("うえ")], 2, 6))).toBe(false);
  });

  it("箱を含む選択は断る (箱の中に箱は作らない)", () => {
    // Doc( Paragraph("あ", Ruby(...) 2..10, "い") )
    const state = stateOf([p("あ", ruby("漢", "かん") as Plot, "い")], 1, 11);
    expect(wrapInline(Tcy)(state)).toBe(false);
  });
});

describe("tcyCorrection", () => {
  // Doc( Paragraph("あ" 1..2, Tcy("12") 2..6, "い" 6..7) )
  it("中身が空になったら箱ごと消える", () => {
    const state = stateOf([p("あ", Tcy.create([Leaf.text("12")]), "い")], 3);
    const next = state.update({ changes: { from: 3, to: 5 } }).state;
    expect(next.doc.toString()).toBe('Doc(Paragraph("あい"))');
  });

  it("1 文字残っていれば消えない", () => {
    const state = stateOf([p("あ", Tcy.create([Leaf.text("12")]), "い")], 3);
    const next = state.update({ changes: { from: 3, to: 4 } }).state;
    expect(next.doc.toString()).toBe('Doc(Paragraph("あ", Tcy("2"), "い"))');
  });
});
