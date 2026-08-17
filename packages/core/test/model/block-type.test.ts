import { describe, expect, it } from "vitest";
import { setBlockType } from "../../src/commands/base";
import { Leaf, Node, Plot, type Schema } from "../../src/doc";
import { Blockquote, basicSchema, Doc, Paragraph } from "../../src/schema-basic";
import { TextSelection } from "../../src/state/selection";
import { EditorState, schemaElement } from "../../src/state/state";

const Heading = Plot.define("Heading", {
  inlineContent: true,
  group: Node.Group.Content,
  shape: { element: "h2" },
});
const Narration = Plot.define("Narration", {
  inlineContent: true,
  group: Node.Group.Content,
  defaultBlock: true,
  shape: { element: "p" },
});

/** 台本の人物名相当のインラインブロック */
const Speaker = Plot.define("Speaker", {
  inline: true,
  inlineContent: Leaf.Text,
  shape: { element: "span" },
});
/** セリフ相当。人物名の箱を許す */
const Line = Plot.define("Line", {
  inlineContent: [Leaf.Text, Speaker],
  group: Node.Group.Content,
  shape: { element: "p" },
});
/** 地の文相当。文字だけで、人物名の箱は許さない */
const Plain = Plot.define("Plain", {
  inlineContent: Leaf.Text,
  group: Node.Group.Content,
  shape: { element: "p" },
});

const elements = [Doc, Heading, Narration];

function run(blocks: Plot[], caret: number, tag: Plot.Tag, schema: Schema.Element[] = elements) {
  let state = EditorState.create({
    config: schema.map((element) => schemaElement.of(element)),
    doc: (schema) => schema.doc(blocks),
  });
  state = state.update({ selection: TextSelection.create(state.doc, caret) }).state;
  const spec = setBlockType(tag)(state);
  if (!spec) return null;
  const next = state.update(spec).state;
  return { doc: next.doc.toString(), head: next.selection.head };
}

const h = (text: string) => Heading.create([Leaf.text(text)]);
const n = (text: string) => Narration.create([Leaf.text(text)]);

describe("setBlockType", () => {
  // Doc( Heading("ab") 0..4, Narration("cd") 4..8 )
  it("中身はそのままで型だけ変わる", () => {
    expect(run([h("ab"), n("cd")], 2, Narration)).toEqual({
      doc: 'Doc(Narration("ab"), Narration("cd"))',
      head: 2,
    });
  });

  // 中身ごと置き換えると、中の位置が写像で置換の端へ潰れて隣のブロックへ飛ぶ
  it("キャレットが同じ場所に残る", () => {
    expect(run([h("abcd")], 3, Narration)?.head).toBe(3);
  });

  it("同じ型なら false", () => {
    expect(run([h("ab")], 2, Heading)).toBeNull();
  });

  // 台本の「セリフを地の文にする」。人物名の箱は地の文に入らないので fit が落とすが、
  // 中の文字は残るので名前が本文の頭に繋がる
  it("新しい型に入れないインラインの箱は、中身を残して外れる", () => {
    const speech = Line.create([Speaker.create([Leaf.text("ヤス")]), Leaf.text("とにかく")]);
    // Line( Speaker("ヤス") 1..5, "とにかく" 5..9 ) — キャレットは「とに|かく」
    expect(run([speech], 7, Plain, [...elements, Line, Speaker, Plain])).toEqual({
      doc: 'Doc(Plain("ヤスとにかく"))',
      // 落ちたのは箱のトークン 2 つぶんだけ。文字の上では同じ場所
      head: 5,
    });
  });

  it("入れ替え先が許すインラインの箱はそのまま残る", () => {
    const speech = Line.create([Speaker.create([Leaf.text("ヤス")]), Leaf.text("とにかく")]);
    // Heading は何でも入る型なので箱ごと移る
    expect(run([speech], 7, Heading, [...elements, Line, Speaker, Plain])?.doc).toBe(
      'Doc(Heading(Speaker("ヤス"), "とにかく"))',
    );
  });

  it("テキストブロック以外へは変えない (箱で包むのは別のコマンド)", () => {
    let state = EditorState.create({
      config: [basicSchema()],
      doc: (schema) => schema.doc([Blockquote.create([Paragraph.create([Leaf.text("ab")])])]),
    });
    state = state.update({ selection: TextSelection.create(state.doc, 3) }).state;
    // Blockquote は中身がブロック。段落の中身 (インライン) が入らない
    expect(setBlockType(Blockquote)(state)).toBe(false);
  });
});
