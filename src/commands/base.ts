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

/** 「どう更新したいか」を返すだけ。適用するのは呼び出し側。何もできなければ false */
export type Command = (state: EditorState) => TransactionSpec | false;

export const deleteSelection: Command = (state) => {
  const { from, to, empty } = state.selection;
  if (empty) return false;
  return {
    changes: { from, to, fit: true },
    selection: (doc, changes) => Selection.near(doc, changes.mapPos(from, -1)),
    userEvent: "delete.selection",
  };
};

/**
 * doc の端から端まで選ぶ。ブラウザの SelectAll は編集ホスト = 1 ブロックの中で閉じてしまうので、
 * 自前で model の選択を跨がせる (描画は Highlight が持つ)。
 */
export const selectAll: Command = (state) => {
  const doc = state.doc;
  const selection = TextSelection.create(
    doc,
    Selection.atStart(doc).anchor,
    Selection.atEnd(doc).head,
  );
  return { selection, userEvent: "select.all" };
};

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

/**
 * 空のテキストブロックを親のブロックから 1 段外に出す。引用の中で Enter を 2 回、で抜ける動き。
 *
 * 前後の兄弟をそれぞれ親で包み直し、間に自分を裸で置く。兄弟がいない側は包まない
 * (包むと空の親が残る)。親をまるごと 1 回で置き換えるのは、開きだけ / 閉じだけを消す
 * 変更に割ると、ChangeSpec を 1 個適用した時点で木が釣り合わなくなるため。
 */
export const liftEmptyBlock: Command = (state) => {
  const $from = state.selection.$from;
  if (!state.selection.empty) return false;
  if (!$from.parent.isTextblock || $from.parent.contentLength) return false;
  // 深さ 1 の親は doc なので、出る先が無い
  const depth = $from.depth;
  if (depth < 2) return false;

  const parent = $from.node(depth - 1);
  if (!state.schema.canContain($from.node(depth - 2).type, $from.parent.type)) return false;

  const index = $from.index(depth - 1);
  const before = parent.content.slice(0, index);
  const after = parent.content.slice(index + 1);
  const tokens: Token[] = [];
  if (before.length) tokens.push(parent.tag, ...before, Close);
  tokens.push(parent.child(index));
  if (after.length) tokens.push(parent.tag.split(), ...after, Close);

  const parentFrom = $from.before(depth - 1);
  const leading = before.length ? 2 + before.reduce((n, node) => n + node.length, 0) : 0;
  const caret = parentFrom + leading + 1;
  return {
    changes: { from: parentFrom, to: $from.after(depth - 1), insert: tokens },
    selection: (doc) => Selection.near(doc, caret),
    userEvent: "input.lift",
  };
};

/** ブロック先頭の Backspace。それ以外の位置では false */
export const joinBackward: Command = (state) => {
  const { from, empty } = state.selection;
  if (!empty) return false;
  const $from = state.selection.$from;
  if (!$from.parent.isTextblock || from !== $from.start()) return false;
  // 相手は同じ親の中の 1 つ前。親が doc でも blockquote でも同じ形になる
  const index = $from.index($from.depth - 1);
  if (index === 0) return false;
  const before = $from.node($from.depth - 1).maybeChild(index - 1);
  if (!before?.isPlot || !before.isTextblock) return false;
  const boundary = $from.before($from.depth);
  return {
    // 前のブロックの閉じと、このブロックの開きを取り除くと 1 つになる
    changes: { from: boundary - 1, to: boundary + 1 },
    selection: (doc) => TextSelection.create(doc, boundary - 1),
    userEvent: "delete.backward",
  };
};

/** ブロック末尾の Delete。それ以外の位置では false */
export const joinForward: Command = (state) => {
  const { from, empty } = state.selection;
  if (!empty) return false;
  const $from = state.selection.$from;
  if (!$from.parent.isTextblock || from !== $from.end()) return false;
  const after = $from.node($from.depth - 1).maybeChild($from.index($from.depth - 1) + 1);
  if (!after?.isPlot || !after.isTextblock) return false;
  const boundary = $from.after($from.depth);
  return {
    changes: { from: boundary - 1, to: boundary + 1 },
    selection: (doc) => TextSelection.create(doc, from),
    userEvent: "delete.forward",
  };
};

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

/** 選択が空のときは、次の入力に付くマークだけを切り替える */
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

/**
 * テキストブロックを文書順に訪ねる。ブロックはネストしうるので木を降りる。
 * `contentStart` はそのブロックの中身が始まる doc 位置。
 */
function eachTextblock(
  plot: Plot,
  contentFrom: number,
  visit: (block: Plot, contentStart: number) => void,
): void {
  let pos = contentFrom;
  for (const child of plot.content) {
    if (child.isPlot) {
      if (child.isTextblock) visit(child, pos + 1);
      else eachTextblock(child, pos + 1, visit);
    }
    pos += child.length;
  }
}

/** マークはテキストブロックを跨げないので、ブロックごとの置換に割る */
export function markChanges(
  doc: Plot,
  from: number,
  to: number,
  mark: Mark,
  add: boolean,
): ChangeSpec[] {
  const specs: ChangeSpec[] = [];
  eachTextblock(doc, 0, (block, contentStart) => {
    const rangeFrom = Math.max(from, contentStart);
    const rangeTo = Math.min(to, contentStart + block.contentLength);
    if (rangeFrom >= rangeTo) return;
    const marked = sliceDoc(doc, rangeFrom, rangeTo).tokens.map((token) =>
      typeof token === "object" && "isInline" in token && token.isInline
        ? token.withMarks(add ? mark.addToSet(token.marks) : mark.removeFromSet(token.marks))
        : token,
    );
    specs.push({ from: rangeFrom, to: rangeTo, insert: marked });
  });
  return specs;
}

/** [from, to) のどこかに mark が付いているか */
export function rangeHasMark(doc: Plot, from: number, to: number, mark: Mark): boolean {
  let found = false;
  eachTextblock(doc, 0, (block, contentStart) => {
    if (found) return;
    let offset = 0;
    for (const child of block.content) {
      const childFrom = contentStart + offset;
      const childTo = childFrom + child.length;
      if (child.isInline && childFrom < to && childTo > from && mark.isInSet(child.marks)) {
        found = true;
        return;
      }
      offset += child.length;
    }
  });
  return found;
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
