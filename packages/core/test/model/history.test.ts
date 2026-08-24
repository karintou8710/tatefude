import { describe, expect, it } from "vitest";
import { insertText, splitBlock } from "../../src/commands/base";
import { basicSchema } from "../../src/extensions";
import {
  history,
  historyTime,
  isolateHistory,
  redo,
  redoDepth,
  undo,
  undoDepth,
} from "../../src/extensions/functionality/undo-redo";
import { TextSelection } from "../../src/state/selection";
import { EditorState } from "../../src/state/state";
import { p } from "./doc";

function start(text = "abc", config = {}) {
  return EditorState.create({
    config: [basicSchema(), history(config)],
    doc: (schema) => schema.doc([p(text)]),
  });
}

/** 時刻を指定して文字を入れる。刻みを決めないとまとめの判定が実時間に依る */
function type(state: EditorState, pos: number, text: string, time: number): EditorState {
  const spec = insertText(pos, pos, text, "input.type")(state);
  if (!spec) throw new Error("insertText が false を返した");
  return state.update({ ...spec, annotations: historyTime.of(time) }).state;
}

function apply(state: EditorState, spec: ReturnType<typeof undo>): EditorState {
  if (!spec) throw new Error("履歴が空");
  return state.update(spec).state;
}

const textOf = (state: EditorState) => state.doc.textContent;

describe("history", () => {
  it("1 手戻して、やり直せる", () => {
    let state = type(start(), 4, "X", 1000);
    expect(textOf(state)).toBe("abcX");

    state = apply(state, undo(state));
    expect(textOf(state)).toBe("abc");
    expect(undoDepth(state)).toBe(0);
    expect(redoDepth(state)).toBe(1);

    state = apply(state, redo(state));
    expect(textOf(state)).toBe("abcX");
    expect(undoDepth(state)).toBe(1);
    expect(redoDepth(state)).toBe(0);
  });

  it("履歴が空なら false", () => {
    const state = start();
    expect(undo(state)).toBe(false);
    expect(redo(state)).toBe(false);
  });

  it("続けて打った文字は 1 手にまとまる", () => {
    let state = type(start(), 4, "X", 1000);
    state = type(state, 5, "Y", 1100);
    state = type(state, 6, "Z", 1200);
    expect(textOf(state)).toBe("abcXYZ");
    expect(undoDepth(state)).toBe(1);

    state = apply(state, undo(state));
    expect(textOf(state)).toBe("abc");
  });

  it("間が空くと別の手になる", () => {
    let state = type(start(), 4, "X", 1000);
    state = type(state, 5, "Y", 3000); // 既定の 500ms を超える
    expect(undoDepth(state)).toBe(2);

    state = apply(state, undo(state));
    expect(textOf(state)).toBe("abcX");
    state = apply(state, undo(state));
    expect(textOf(state)).toBe("abc");
  });

  it("離れた場所を触ると別の手になる", () => {
    let state = type(start(), 4, "X", 1000);
    state = type(state, 1, "Y", 1100); // 時間は近いが位置が離れている
    expect(textOf(state)).toBe("YabcX");
    expect(undoDepth(state)).toBe(2);
  });

  it("isolateHistory を付けるとまとまらない", () => {
    let state = type(start(), 4, "X", 1000);
    const spec = insertText(5, 5, "Y", "input.type")(state);
    if (!spec) throw new Error("false");
    state = state.update({
      ...spec,
      annotations: [historyTime.of(1100), isolateHistory.of(true)],
    }).state;
    expect(undoDepth(state)).toBe(2);
  });

  it("文字入力と構造の変更はまとまらない", () => {
    let state = type(start(), 4, "X", 1000);
    state = state.update({
      selection: TextSelection.create(state.doc, 5),
    }).state;
    const spec = splitBlock(state);
    if (!spec) throw new Error("false");
    state = state.update({ ...spec, annotations: historyTime.of(1100) }).state;
    expect(state.doc.toString()).toBe('Doc(Paragraph("abcX"), Paragraph())');
    expect(undoDepth(state)).toBe(2);

    state = apply(state, undo(state));
    expect(state.doc.toString()).toBe('Doc(Paragraph("abcX"))');
  });

  it("戻したあとに編集すると redo は消える", () => {
    let state = type(start(), 4, "X", 1000);
    state = apply(state, undo(state));
    expect(redoDepth(state)).toBe(1);

    state = type(state, 4, "Y", 5000);
    expect(redoDepth(state)).toBe(0);
    expect(textOf(state)).toBe("abcY");
  });

  it("選択が更新の前の位置に戻る", () => {
    let state = start();
    state = state.update({ selection: TextSelection.create(state.doc, 2) }).state;
    const spec = insertText(2, 2, "X", "input.type")(state);
    if (!spec) throw new Error("false");
    state = state.update({ ...spec, annotations: historyTime.of(1000) }).state;
    expect(state.selection.head).toBe(3);

    state = apply(state, undo(state));
    expect(textOf(state)).toBe("abc");
    expect(state.selection.head).toBe(2);
  });

  it("何度も往復しても壊れない", () => {
    let state = type(start(), 4, "X", 1000);
    state = type(state, 5, "Y", 5000);
    for (let i = 0; i < 3; i++) {
      state = apply(state, undo(state));
      state = apply(state, undo(state));
      expect(textOf(state)).toBe("abc");
      state = apply(state, redo(state));
      state = apply(state, redo(state));
      expect(textOf(state)).toBe("abcXY");
    }
  });

  it("minDepth を超えたら古いものから捨てる", () => {
    let state = start("", { minDepth: 2 });
    for (let i = 0; i < 20; i++) state = type(state, 1 + i, "x", 1000 + i * 1000);
    expect(undoDepth(state)).toBeLessThanOrEqual(3);
    expect(undoDepth(state)).toBeGreaterThanOrEqual(2);
  });
});
