import { describe, expect, it } from "vitest";
import { joinBackward, joinForward, splitBlock } from "../../src/commands/base";
import { Leaf, Node, Plot } from "../../src/doc";
import { Blockquote, basicSchema, Doc } from "../../src/schema-basic";
import { TextSelection } from "../../src/state/selection";
import { EditorState, schemaElement } from "../../src/state/state";
import { p, ruby } from "./doc";

type Result = { doc: string; head: number } | null;

function run(blocks: Plot[], caret: number, backward: boolean): Result {
  let state = EditorState.create({
    config: [basicSchema()],
    doc: (schema) => schema.doc(blocks),
  });
  state = state.update({ selection: TextSelection.create(state.doc, caret) }).state;
  const spec = (backward ? joinBackward : joinForward)(state);
  if (!spec) return null;
  const next = state.update(spec).state;
  return { doc: next.doc.toString(), head: next.selection.head };
}

const back = (blocks: Plot[], caret: number) => run(blocks, caret, true);
const fwd = (blocks: Plot[], caret: number) => run(blocks, caret, false);

describe("joinBackward", () => {
  it("同じ親の中の 1 つ前と結合する", () => {
    // Doc( P("ab") 0..4, P("cd") 4..8 ) → 2 つ目の先頭は 5
    expect(back([p("ab"), p("cd")], 5)).toEqual({ doc: 'Doc(Paragraph("abcd"))', head: 3 });
  });

  it("引用の最初の段落なら、引用の手前の段落と結合する", () => {
    // Doc( P("a") 0..3, Blockquote( P("b") 4..7, P("c") 7..10 ) )
    // 引用の中の最初の段落の先頭 = 5
    expect(back([p("a"), Blockquote.create([p("b"), p("c")])], 5)).toEqual({
      doc: 'Doc(Paragraph("ab"), Blockquote(Paragraph("c")))',
      head: 2,
    });
  });

  it("引用の中に段落が 1 つだけなら引用ごと畳む", () => {
    expect(back([p("a"), Blockquote.create([p("b")])], 5)).toEqual({
      doc: 'Doc(Paragraph("ab"))',
      head: 2,
    });
  });

  it("手前が引用なら、その中の最後の段落と結合する", () => {
    // Doc( Blockquote( P("a") 1..4, P("b") 4..7 ) 0..8, P("c") 8..11 )
    expect(back([Blockquote.create([p("a"), p("b")]), p("c")], 9)).toEqual({
      doc: 'Doc(Blockquote(Paragraph("a"), Paragraph("bc")))',
      head: 6,
    });
  });

  it("手前が入れ子の引用なら一番内側の最後の段落と結合する", () => {
    expect(back([Blockquote.create([Blockquote.create([p("a")])]), p("b")], 8)?.doc).toBe(
      'Doc(Blockquote(Blockquote(Paragraph("ab"))))',
    );
  });

  it("先頭のブロックでは何もしない", () => {
    expect(back([p("ab"), p("cd")], 1)).toBeNull();
  });

  it("引用の中の 2 つ目なら引用の中で結合する", () => {
    // Doc( Blockquote( P("a") 1..4, P("b") 4..7 ) ) → 2 つ目の先頭は 5
    expect(back([Blockquote.create([p("a"), p("b")])], 5)?.doc).toBe(
      'Doc(Blockquote(Paragraph("ab")))',
    );
  });

  it("ブロックの途中では何もしない", () => {
    expect(back([p("ab"), p("cd")], 6)).toBeNull();
  });
});

describe("joinForward", () => {
  it("同じ親の中の次と結合する", () => {
    expect(fwd([p("ab"), p("cd")], 3)).toEqual({ doc: 'Doc(Paragraph("abcd"))', head: 3 });
  });

  it("引用の直前の段落なら、引用の中の最初の段落と結合する", () => {
    expect(fwd([p("a"), Blockquote.create([p("b"), p("c")])], 2)).toEqual({
      doc: 'Doc(Paragraph("ab"), Blockquote(Paragraph("c")))',
      head: 2,
    });
  });

  it("引用の中の最後の段落なら、引用の後ろの段落と結合する", () => {
    expect(fwd([Blockquote.create([p("a")]), p("b")], 3)?.doc).toBe(
      'Doc(Blockquote(Paragraph("ab")))',
    );
  });

  it("最後のブロックでは何もしない", () => {
    expect(fwd([p("ab"), p("cd")], 7)).toBeNull();
  });
});

describe("splitBlock", () => {
  function split(blocks: Plot[], caret: number): string | null {
    let state = EditorState.create({
      config: [basicSchema()],
      doc: (schema) => schema.doc(blocks),
    });
    state = state.update({ selection: TextSelection.create(state.doc, caret) }).state;
    const spec = splitBlock(state);
    return spec ? state.update(spec).state.doc.toString() : null;
  }

  it("引用の中でも割れる", () => {
    expect(split([Blockquote.create([p("ab")])], 3)).toBe(
      'Doc(Blockquote(Paragraph("a"), Paragraph("b")))',
    );
  });

  // P("あ", Ruby(RubyBase("漢字") 4..6, RubyText("かんじ") 8..11), "い")
  it("ルビの中では何もしない (割ると読みが落ちるので、割らないと決めた)", () => {
    const doc = [p("あ", ruby("漢字", "かんじ"), "い")];
    expect(split(doc, 4)).toBeNull(); // rb の先頭
    expect(split(doc, 5)).toBeNull(); // rb の途中
    expect(split(doc, 6)).toBeNull(); // rb の末尾
    expect(split(doc, 9)).toBeNull(); // rt の途中
  });

  it("ルビの外なら割れる", () => {
    expect(split([p("あ", ruby("漢", "かん"), "い")], 11)).toBe(
      'Doc(Paragraph("あ", Ruby(RubyBase("漢"), RubyText("かん"))), Paragraph("い"))',
    );
  });
});

// 既定のブロックが段落ではないスキーマ。柱・セリフ・地の文の三種で、地の文が既定
describe("splitBlock: 新しくできる側は既定のブロックになる", () => {
  const G = Node.Group;
  const Heading = Plot.define("Heading", {
    inlineContent: true,
    group: G.Content,
    shape: { element: "h2" },
  });
  const Narration = Plot.define("Narration", {
    inlineContent: true,
    group: G.Content,
    defaultBlock: true,
    shape: { element: "p" },
  });
  const elements = [Doc, Heading, Narration];

  function split(block: Plot, caret: number): string {
    let state = EditorState.create({
      config: elements.map((element) => schemaElement.of(element)),
      doc: (schema) => schema.doc([block]),
    });
    state = state.update({ selection: TextSelection.create(state.doc, caret) }).state;
    const spec = splitBlock(state);
    return spec ? state.update(spec).state.doc.toString() : "false";
  }

  // Doc( Heading("ab") 0..4 )
  it("末尾なら既定のブロックで開き直す", () => {
    expect(split(Heading.create([Leaf.text("ab")]), 3)).toBe('Doc(Heading("ab"), Narration())');
  });

  it("途中でも後ろ側は既定のブロックになる (前側は元の型のまま)", () => {
    expect(split(Heading.create([Leaf.text("ab")]), 2)).toBe('Doc(Heading("a"), Narration("b"))');
  });

  it("先頭で割ると、空の元の型が残って中身が既定のブロックへ移る", () => {
    expect(split(Heading.create([Leaf.text("ab")]), 1)).toBe('Doc(Heading(), Narration("ab"))');
  });

  it("元から既定の型なら変わらない", () => {
    expect(split(Narration.create([Leaf.text("ab")]), 3)).toBe('Doc(Narration("ab"), Narration())');
  });
});
