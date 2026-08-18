import { describe, expect, it } from "vitest";
import { liftEmptyBlock } from "../../src/commands/base";
import type { Plot } from "../../src/doc";
import { Blockquote, basicSchema } from "../../src/extensions";
import { TextSelection } from "../../src/state/selection";
import { EditorState } from "../../src/state/state";
import { p } from "./doc";

/** caret を置いた状態を作って liftEmptyBlock を適用する。動かなければ null */
function lift(blocks: Plot[], caret: number): { doc: string; head: number } | null {
  let state = EditorState.create({
    config: [basicSchema()],
    doc: (schema) => schema.doc(blocks),
  });
  state = state.update({ selection: TextSelection.create(state.doc, caret) }).state;

  const spec = liftEmptyBlock(state);
  if (!spec) return null;
  const next = state.update(spec).state;
  return { doc: next.doc.toString(), head: next.selection.head };
}

const empty = () => p();

describe("liftEmptyBlock", () => {
  it("最後の子なら引用の後ろへ出る", () => {
    // Doc( P("a") 0..3, Blockquote( P("b") 4..7, P 7..9 ) )
    expect(lift([p("a"), Blockquote.create([p("b"), empty()])], 8)).toEqual({
      doc: 'Doc(Paragraph("a"), Blockquote(Paragraph("b")), Paragraph())',
      head: 9,
    });
  });

  it("最初の子なら引用の前へ出る", () => {
    expect(lift([p("a"), Blockquote.create([empty(), p("b")])], 5)).toEqual({
      doc: 'Doc(Paragraph("a"), Paragraph(), Blockquote(Paragraph("b")))',
      head: 4,
    });
  });

  it("途中の子なら引用が 2 つに割れる", () => {
    expect(lift([Blockquote.create([p("a"), empty(), p("b")])], 5)?.doc).toBe(
      'Doc(Blockquote(Paragraph("a")), Paragraph(), Blockquote(Paragraph("b")))',
    );
  });

  it("ただ 1 つの子なら引用ごと消える", () => {
    expect(lift([p("a"), Blockquote.create([empty()])], 5)).toEqual({
      doc: 'Doc(Paragraph("a"), Paragraph())',
      head: 4,
    });
  });

  it("入れ子の引用からは 1 段だけ出る", () => {
    expect(lift([Blockquote.create([Blockquote.create([empty()])])], 3)?.doc).toBe(
      "Doc(Blockquote(Paragraph()))",
    );
  });

  it("doc 直下の空段落は出る先が無い", () => {
    expect(lift([p("a"), empty()], 4)).toBeNull();
  });

  it("中身のある段落は出ない", () => {
    expect(lift([Blockquote.create([p("ab")])], 3)).toBeNull();
  });
});
