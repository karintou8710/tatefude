import { describe, expect, it } from "vitest";
import { wrapInline } from "../../src/commands/base";
import { Leaf, type Plot } from "../../src/doc";
import { basicSchema, Paragraph, Tcy, tcyExtension, wrapInTcy } from "../../src/extensions";
import { TextSelection } from "../../src/state/selection";
import { EditorState } from "../../src/state/state";
import { ruby } from "./doc";

function stateOf(blocks: Plot[], from: number, to = from) {
  const state = EditorState.create({
    config: [basicSchema(), tcyExtension],
    doc: (schema) => schema.doc(blocks),
  });
  return state.update({ selection: TextSelection.create(state.doc, from, to) }).state;
}

const p = (...content: (string | Plot)[]) =>
  Paragraph.create(content.map((c) => (typeof c === "string" ? Leaf.text(c) : c)));

describe("wrapInline", () => {
  // Doc( Paragraph("あいうえ") 0..6 ) — 中身は 1..5
  it("選んだところをインラインブロックで包み、選択は中身に張り直す", () => {
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
    expect(wrapInTcy(state)).toBe(false);
    // 上限は wrapInTcy が持つもので、包むこと自体ができないわけではない
    expect(wrapInline(Tcy)(state)).not.toBe(false);
  });

  it("ブロックを跨ぐ選択は断る", () => {
    // Doc( Paragraph("あい") 0..4, Paragraph("うえ") 4..8 )
    expect(wrapInline(Tcy)(stateOf([p("あい"), p("うえ")], 2, 6))).toBe(false);
  });

  it("ルビの中では作らない (RubyBase は Tcy を含められない)", () => {
    // Doc( Paragraph( Ruby(RubyBase("漢" 3..4), RubyText("かん" 6..8)) ) )
    const state = stateOf([p(ruby("漢", "かん") as Plot)], 3, 4);
    expect(state.selection.$from.parent.type.name).toBe("RubyBase");
    expect(wrapInline(Tcy)(state)).toBe(false);
  });

  it("インラインブロックを含む選択は断る (入れ子は作らない)", () => {
    // Doc( Paragraph("あ", Ruby(...) 2..10, "い") )
    const state = stateOf([p("あ", ruby("漢", "かん") as Plot, "い")], 1, 11);
    expect(wrapInline(Tcy)(state)).toBe(false);
  });
});

describe("tcyCorrection", () => {
  // Doc( Paragraph("あ" 1..2, Tcy("12") 2..6, "い" 6..7) )
  it("中身が空になったらインラインブロックごと消える", () => {
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
