import { describe, expect, it } from "vitest";
import { Leaf, Slice } from "../../src/doc";
import { basicSchema, Paragraph } from "../../src/schema-basic";
import { correction } from "../../src/state/correction";
import { type Extension, Facet, Field } from "../../src/state/facet";
import { EditorState } from "../../src/state/state";
import { Annotation, Transaction } from "../../src/state/transaction";
import { p } from "./doc";

function stateWith(config: Extension, ...texts: string[]) {
  return EditorState.create({
    config: [basicSchema(), config],
    doc: (schema) => schema.doc(texts.length ? texts.map((t) => p(t)) : [p("abc")]),
  });
}

describe("facet", () => {
  it("供給された値が畳まれる", () => {
    const size = Facet.define<number, number>({
      combine: (values) => values.reduce((a, b) => a + b, 0),
    });
    const state = stateWith([size.of(1), size.of(2), size.of(4)]);
    expect(state.facet(size)).toBe(7);
  });

  it("combine を書かなければ配列のまま", () => {
    const names = Facet.define<string>();
    const state = stateWith([names.of("a"), names.of("b")]);
    expect(state.facet(names)).toEqual(["a", "b"]);
  });

  it("供給が無ければ既定値", () => {
    const names = Facet.define<string>();
    expect(stateWith([]).facet(names)).toEqual([]);
  });

  it("compute は状態から計算する", () => {
    const length = Facet.define<number, number>({ combine: (values) => values[0] ?? 0 });
    const state = stateWith([length.compute((s) => s.doc.textContent.length)]);
    expect(state.facet(length)).toBe(3);
    const next = state.update({ changes: insertAt(2, "XY") }).state;
    expect(next.facet(length)).toBe(5);
  });
});

describe("field", () => {
  it("create してトランザクションごとに update される", () => {
    const count = Field.define<number>({
      create: () => 0,
      update: (value, tr) => (tr.docChanged ? value + 1 : value),
    });
    let state = stateWith([count]);
    expect(state.field(count)).toBe(0);
    state = state.update({ changes: insertAt(2, "X") }).state;
    expect(state.field(count)).toBe(1);
    state = state.update({}).state; // 変更なし
    expect(state.field(count)).toBe(1);
  });

  it("provide でフィールドの値を facet に流せる", () => {
    const label = Facet.define<string>();
    const field = Field.define<string>({
      create: () => "first",
      update: (value) => value,
      provide: (self) => label.from(self),
    });
    expect(stateWith([field]).facet(label)).toEqual(["first"]);
  });

  it("構成に無いフィールドは読めない", () => {
    const field = Field.define<number>({ create: () => 1, update: (v) => v });
    expect(() => stateWith([]).field(field)).toThrow(RangeError);
  });
});

describe("annotation", () => {
  it("型付きで読み書きできる", () => {
    const source = Annotation.define<string>();
    const state = stateWith([]);
    const tr = state.update({ annotations: source.of("ime") });
    expect(tr.annotation(source)).toBe("ime");
    expect(tr.annotation(Annotation.define<string>())).toBeUndefined();
  });

  it("userEvent は前方一致で調べられる", () => {
    const tr = stateWith([]).update({ userEvent: "input.type.compose" });
    expect(tr.isUserEvent("input")).toBe(true);
    expect(tr.isUserEvent("input.type")).toBe(true);
    expect(tr.isUserEvent("select")).toBe(false);
  });
});

describe("extender と correction", () => {
  it("extender がトランザクションに追記できる", () => {
    const state = stateWith([
      Transaction.extender.of((tr) =>
        tr.docChanged ? { annotations: Transaction.userEvent.of("input.type") } : null,
      ),
    ]);
    const tr = state.update({ changes: insertAt(2, "X") });
    expect(tr.annotation(Transaction.userEvent)).toBe("input.type");
  });

  it("correction は変更のあったノードにだけ走る", () => {
    const seen: string[] = [];
    const state = stateWith(
      [
        correction({
          node: Paragraph.type,
          correct: ({ node }) => {
            seen.push(node.textContent);
            return null;
          },
        }),
      ],
      "abc",
      "def",
    );
    state.update({ changes: insertAt(2, "X") });
    expect(seen).toEqual(["aXbc"]);
  });

  it("correction が不変条件を直せる", () => {
    // 「段落は必ず ! で終わる」という条件を守らせる
    const state = stateWith([
      correction({
        node: Paragraph.type,
        correct: ({ node, pos }) =>
          node.textContent.endsWith("!")
            ? null
            : { from: pos + 1 + node.contentLength, insert: [Leaf.text("!")] },
      }),
    ]);
    const next = state.update({ changes: insertAt(2, "X") }).state;
    expect(next.doc.child(0).textContent).toBe("aXbc!");
  });

  it("変更が無ければ correction は走らない", () => {
    let calls = 0;
    const state = stateWith([
      correction({
        node: Paragraph.type,
        correct: () => {
          calls++;
          return null;
        },
      }),
    ]);
    state.update({});
    expect(calls).toBe(0);
  });
});

/** pos に文字を入れる変更 */
function insertAt(pos: number, text: string) {
  return { from: pos, to: pos, insert: Slice.of([Leaf.text(text)]) };
}
