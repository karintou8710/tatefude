import {
  type ChangeSpec,
  Close,
  Leaf,
  type Mark,
  type Plot,
  Pos,
  sliceDoc,
  type Token,
} from "../doc";
import { Selection, TextSelection } from "../state/selection";
import type { EditorState } from "../state/state";
import { marksAt, type TransactionSpec } from "../state/transaction";

/**
 * コマンドは状態を見て「どう更新したいか」を返す。適用するのは呼び出し側。
 * 何もできないときは false。
 */
export type Command = (state: EditorState) => TransactionSpec | false;

/** 選択範囲を消す */
export const deleteSelection: Command = (state) => {
  const { from, to, empty } = state.selection;
  if (empty) return false;
  return {
    changes: { from, to, fit: true },
    selection: (doc, changes) => Selection.near(doc, changes.mapPos(from, -1)),
    userEvent: "delete.selection",
  };
};

/** Enter: ブロックを 2 つに割る */
export const splitBlock: Command = (state) => {
  const { from, to } = state.selection;
  const parent = state.selection.$from.parent;
  if (!parent.isTextblock) return false;
  // 閉じてから、後ろ側のタグで開き直す
  const insert: Token[] = [Close, parent.tag.split()];
  return {
    changes: { from, to, insert, fit: true },
    selection: (doc, changes) => Selection.near(doc, changes.mapPos(to, 1)),
    userEvent: "input.split",
  };
};

/** ブロック先頭の Backspace: 直前のブロックと結合する */
export const joinBackward: Command = (state) => {
  const { from, empty } = state.selection;
  if (!empty) return false;
  const $from = state.selection.$from;
  if (!$from.parent.isTextblock || from !== $from.start()) return false;
  if ($from.index(0) === 0) return false;
  const before = state.doc.maybeChild($from.index(0) - 1);
  if (!before?.isPlot || !before.isTextblock) return false;
  const boundary = $from.before($from.depth);
  return {
    // 前のブロックの閉じと、このブロックの開きを取り除く
    changes: { from: boundary - 1, to: boundary + 1 },
    selection: (doc) => TextSelection.create(doc, boundary - 1),
    userEvent: "delete.backward",
  };
};

/** ブロック末尾の Delete: 次のブロックと結合する */
export const joinForward: Command = (state) => {
  const { from, empty } = state.selection;
  if (!empty) return false;
  const $from = state.selection.$from;
  if (!$from.parent.isTextblock || from !== $from.end()) return false;
  const after = state.doc.maybeChild($from.index(0) + 1);
  if (!after?.isPlot || !after.isTextblock) return false;
  const boundary = $from.after($from.depth);
  return {
    changes: { from: boundary - 1, to: boundary + 1 },
    selection: (doc) => TextSelection.create(doc, from),
    userEvent: "delete.forward",
  };
};

/** テキストを入れる (選択があれば置き換える) */
export function insertText(from: number, to: number, insert: string, userEvent: string): Command {
  return (state) => {
    const marks =
      from === state.selection.from && to === state.selection.to
        ? marksAt(state)
        : Pos.resolve(state.doc, from).marks();
    return {
      changes: { from, to, insert: [Leaf.text(insert, marks)], fit: true },
      selection: (doc, changes) => Selection.near(doc, changes.mapPos(to, 1), -1),
      userEvent,
    };
  };
}

/** マークの付け外し。選択が空のときは、次の入力に付くマークだけを切り替える。 */
export function toggleMark(markName: string): Command {
  return (state) => {
    const markType = state.schema.marks.find((type) => type.name === markName);
    if (!markType) return false;
    const mark = markType.default ?? markType.of(null);
    const { from, to, empty } = state.selection;

    if (empty) {
      const marks = marksAt(state);
      const next = mark.isInSet(marks) ? mark.removeFromSet(marks) : mark.addToSet(marks);
      return { selection: state.selection.withMarks(next), userEvent: "format.mark" };
    }

    const add = !rangeHasMark(state.doc, from, to, mark);
    return { changes: markChanges(state.doc, from, to, mark, add), userEvent: "format.mark" };
  };
}

/** マークを付け外しするための、テキストブロックごとの置換 */
export function markChanges(
  doc: Plot,
  from: number,
  to: number,
  mark: Mark,
  add: boolean,
): ChangeSpec[] {
  const specs: ChangeSpec[] = [];
  let offset = 0;
  for (const block of doc.content) {
    if (block.isPlot && block.isTextblock) {
      const start = offset + 1;
      const end = start + block.contentLength;
      const rangeFrom = Math.max(from, start);
      const rangeTo = Math.min(to, end);
      if (rangeFrom < rangeTo) {
        const marked = sliceDoc(doc, rangeFrom, rangeTo).tokens.map((token) =>
          typeof token === "object" && "isInline" in token && token.isInline
            ? token.withMarks(add ? mark.addToSet(token.marks) : mark.removeFromSet(token.marks))
            : token,
        );
        specs.push({ from: rangeFrom, to: rangeTo, insert: marked });
      }
    }
    offset += block.length;
  }
  return specs;
}

/** [from, to) のどこかに mark が付いているか */
export function rangeHasMark(doc: Plot, from: number, to: number, mark: Mark): boolean {
  let offset = 0;
  for (const block of doc.content) {
    if (block.isPlot && block.isTextblock) {
      const contentStart = offset + 1;
      let childOffset = 0;
      for (const child of block.content) {
        const childFrom = contentStart + childOffset;
        const childTo = childFrom + child.length;
        if (child.isInline && childFrom < to && childTo > from && mark.isInSet(child.marks)) {
          return true;
        }
        childOffset += child.length;
      }
    }
    offset += block.length;
  }
  return false;
}

/** 最初に spec を返したコマンドを採用する */
export function chainCommands(...commands: Command[]): Command {
  return (state) => {
    for (const command of commands) {
      const spec = command(state);
      if (spec) return spec;
    }
    return false;
  };
}
