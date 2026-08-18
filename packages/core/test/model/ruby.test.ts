import { describe, expect, it } from "vitest";
import { Leaf, type Plot } from "../../src/doc";
import { basicSchema, Paragraph, RubyText, wrapInRuby } from "../../src/extensions";
import { TextSelection } from "../../src/state/selection";
import { EditorState } from "../../src/state/state";
import { ruby } from "./doc";

function stateOf(blocks: Plot[], from: number, to = from) {
  const state = EditorState.create({
    config: [basicSchema()],
    doc: (schema) => schema.doc(blocks),
  });
  return state.update({ selection: TextSelection.create(state.doc, from, to) }).state;
}

const p = (...content: (string | Plot)[]) =>
  Paragraph.create(content.map((c) => (typeof c === "string" ? Leaf.text(c) : c)));

describe("wrapInRuby", () => {
  // Doc( Paragraph("あいうえ") 0..6 ) — 中身は 1..5
  it("選んだところを親文字にし、キャレットを空の読みに入れる", () => {
    const state = stateOf([p("あいうえ")], 2, 4);
    const spec = wrapInRuby(state);
    if (!spec) throw new Error("包めなかった");
    const next = state.update(spec).state;
    expect(next.doc.toString()).toBe(
      'Doc(Paragraph("あ", Ruby(RubyBase("いう"), RubyText()), "え"))',
    );
    // 読みの中。次に打つのは振り仮名
    expect(next.selection.empty).toBe(true);
    expect(next.selection.$from.parent.type).toBe(RubyText.type);
  });

  it("読みを打つとそのまま振り仮名になる", () => {
    const state = stateOf([p("あいうえ")], 2, 4);
    const spec = wrapInRuby(state);
    if (!spec) throw new Error("包めなかった");
    const wrapped = state.update(spec).state;
    const typed = wrapped.update({
      changes: { from: wrapped.selection.from, insert: [Leaf.text("かな")] },
    }).state;
    expect(typed.doc.toString()).toBe(
      'Doc(Paragraph("あ", Ruby(RubyBase("いう"), RubyText("かな")), "え"))',
    );
  });

  it("空の選択では何もしない", () => {
    expect(wrapInRuby(stateOf([p("あいうえ")], 2))).toBe(false);
  });

  it("ブロックを跨ぐ選択は断る", () => {
    // Doc( Paragraph("あい") 0..4, Paragraph("うえ") 4..8 )
    expect(wrapInRuby(stateOf([p("あい"), p("うえ")], 2, 6))).toBe(false);
  });

  it("インラインブロックを含む選択は断る", () => {
    // Doc( Paragraph("あ" 1..2, Ruby(...) 2..10, "い" 10..11) )
    expect(wrapInRuby(stateOf([p("あ", ruby("漢", "かん") as Plot, "い")], 1, 11))).toBe(false);
  });

  it("ルビの中では入れ子にしない", () => {
    // 親文字 "漢字" の中だけを選ぶ。RubyBase はルビを含められない
    const state = stateOf([p(ruby("漢字", "かんじ") as Plot)], 3, 5);
    expect(state.selection.$from.parent.type.name).toBe("RubyBase");
    expect(wrapInRuby(state)).toBe(false);
  });

  it("親文字が消えたらルビごと消える (rubyCorrection)", () => {
    const state = stateOf([p("あいうえ")], 2, 4);
    const spec = wrapInRuby(state);
    if (!spec) throw new Error("包めなかった");
    const wrapped = state.update(spec).state;
    // Paragraph("あ" 1..2, Ruby(RubyBase("いう" 4..6) 3..7, RubyText() 7..9) 2..10, "え")
    const emptied = wrapped.update({ changes: { from: 4, to: 6 } }).state;
    expect(emptied.doc.toString()).toBe('Doc(Paragraph("あえ"))');
  });
});
