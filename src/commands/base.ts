import type { Mark, Plot } from "../doc";
import { TextSelection } from "../state/selection";
import type { EditorState } from "../state/state";
import type { Transaction } from "../state/transaction";

export type Dispatch = (tr: Transaction) => void;
export type Command = (state: EditorState, dispatch?: Dispatch) => boolean;

/** 選択範囲を消す */
export const deleteSelection: Command = (state, dispatch) => {
  const { from, to, empty } = state.selection;
  if (empty) return false;
  if (dispatch) {
    const tr = state.tr.deleteRange(from, to);
    tr.setSelection(TextSelection.near(tr.doc, tr.mapping.map(from, -1)));
    dispatch(tr);
  }
  return true;
};

/** Enter: ブロックを 2 つに割る */
export const splitBlock: Command = (state, dispatch) => {
  const { from, to, empty } = state.selection;
  if (!state.selection.$from.parent.isTextblock) return false;
  if (dispatch) {
    const tr = state.tr;
    if (!empty) tr.deleteRange(from, to);
    const at = tr.mapping.map(from, 1);
    tr.splitBlock(at);
    // 分割で入る閉じ + 開きの 2 つ分だけ先が新しいブロックの中身
    tr.setSelection(TextSelection.create(tr.doc, at + 2));
    dispatch(tr);
  }
  return true;
};

/** ブロック先頭の Backspace: 直前のブロックと結合する */
export const joinBackward: Command = (state, dispatch) => {
  const { from, empty } = state.selection;
  if (!empty) return false;
  const $from = state.selection.$from;
  if (!$from.parent.isTextblock || from !== $from.start()) return false;
  if ($from.index(0) === 0) return false;
  const boundary = $from.before($from.depth);
  const before = state.doc.maybeChild($from.index(0) - 1);
  if (!before?.isPlot || !before.isTextblock) return false;
  if (dispatch) {
    const tr = state.tr.joinBlocks(boundary);
    tr.setSelection(TextSelection.create(tr.doc, boundary - 1));
    dispatch(tr);
  }
  return true;
};

/** ブロック末尾の Delete: 次のブロックと結合する */
export const joinForward: Command = (state, dispatch) => {
  const { from, empty } = state.selection;
  if (!empty) return false;
  const $from = state.selection.$from;
  if (!$from.parent.isTextblock || from !== $from.end()) return false;
  const after = state.doc.maybeChild($from.index(0) + 1);
  if (!after?.isPlot || !after.isTextblock) return false;
  if (dispatch) {
    const tr = state.tr.joinBlocks($from.after($from.depth));
    tr.setSelection(TextSelection.create(tr.doc, from));
    dispatch(tr);
  }
  return true;
};

/** マークの付け外し。選択が空のときは storedMarks を切り替える。 */
export function toggleMark(markName: string): Command {
  return (state, dispatch) => {
    const markType = state.schema.marks.find((type) => type.name === markName);
    if (!markType) return false;
    const mark = markType.default ?? markType.of(null);
    const { from, to, empty } = state.selection;

    if (empty) {
      if (dispatch) {
        const marks = state.storedMarks ?? state.selection.$from.marks();
        dispatch(
          state.tr.setStoredMarks(
            mark.isInSet(marks) ? mark.removeFromSet(marks) : mark.addToSet(marks),
          ),
        );
      }
      return true;
    }

    if (dispatch) {
      const tr = state.tr;
      if (rangeHasMark(state.doc, from, to, mark)) tr.removeMark(from, to, mark);
      else tr.addMark(from, to, mark);
      dispatch(tr);
    }
    return true;
  };
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

/** 最初に true を返したコマンドを採用する */
export function chainCommands(...commands: Command[]): Command {
  return (state, dispatch) => commands.some((command) => command(state, dispatch));
}
