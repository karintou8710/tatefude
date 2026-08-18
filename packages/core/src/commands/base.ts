import {
  buildTextblockMap,
  type ChangeSpec,
  Close,
  type Node as DocNode,
  isClose,
  isOpen,
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

/**
 * 分割してできる後ろ側のタグ。
 *
 * **キャレットの位置に依らず既定のブロックにする。** 柱やセリフのような「その型で書き
 * 続けるとは限らない」ブロックを割ったら、新しくできる側は地の文だから。前側は元の型の
 * まま残るので、途中で割っても書いていたブロックの型は失われない。
 */
function splitTag(state: EditorState, $to: Pos, parent: Plot): Plot.Tag {
  const fallback = state.schema.defaultBlock;
  if (fallback.type === parent.type) return parent.tag.split();
  // 入れられない場所 (引用の中など) では元の型のまま
  return state.schema.canContain($to.node($to.depth - 1).type, fallback.type)
    ? fallback
    : parent.tag.split();
}

/**
 * Enter による分割。閉じてから後ろ側のタグで開き直す。
 * インラインブロック (ルビ) の中では何もしない — 開き直すと rb の末尾で割ったとき rt が中に入り、
 * スキーマに合わず読みが黙って捨てられる。
 */
export const splitBlock: Command = (state) => {
  const { from, to } = state.selection;
  const $to = state.selection.$to;
  const parent = state.selection.$from.parent;
  if (!parent.isTextblock) return false;
  const insert: Token[] = [Close, splitTag(state, $to, parent)];
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

/**
 * 2 つのテキストブロックを 1 つにする変更。**深さが違ってもよい**のが要点で、
 * 差のぶんを「閉じを足す」か「親を開き直す」で埋める (wordgard の `joinBlocks`)。
 *
 * ChangeSpec 1 個に畳んでいるのは、`resolveChanges` が 1 個ずつ適用して都度木を組み直すため。
 * 「閉じを消す」と「開き直す」を別の spec にすると、1 個目の時点で釣り合わなくなる。
 */
function joinBlocks(doc: Plot, $before: Pos, $after: Pos): ChangeSpec {
  const dBefore = $before.depth;
  const dAfter = $after.depth;
  const afterStart = $after.start(dAfter);
  const afterAfter = $after.after(dAfter);
  const tokens: Token[] = [...sliceDoc(doc, afterStart, afterAfter).tokens];
  let end = afterAfter;

  if (dBefore > dAfter) {
    // after を before の側へ引き込む。降りたぶんの閉じが足りなくなる
    // (wordgard は autoJoin なら閉じずに繋ぐが、このスキーマには autoJoin が無い)
    for (let i = dBefore - dAfter; i > 0; i--) tokens.push(Close);
  } else if (dAfter > dBefore) {
    // after を外へ出す。中身が残る親は開き直し、空になる親は閉じを消す
    const reopen: Token[] = [];
    let emptied = true;
    for (let d = dAfter; d > dBefore; d--) {
      if ($after.index(d - 1) < $after.node(d - 1).childCount - 1) emptied = false;
      if (emptied) end++;
      else reopen.push($after.node(d - 1).tag);
    }
    // 内側から集めたので、開き直すのは外側から
    tokens.push(...reopen.reverse());
  }

  // 繋いだ先が中身を許すとは限らない (セリフの人物名をト書きへ、など)。fit に通せば
  // 入れないインラインブロックだけが外れて、中の文字は残る
  return { from: $before.end(dBefore), to: end, insert: tokens, fit: true };
}

/** そのノードの中の、文書順で最初 / 最後のテキストブロック。`pos` は開きトークンの位置 */
function edgeTextblock(
  node: DocNode,
  pos: number,
  last: boolean,
): { node: Plot; pos: number } | null {
  let current = node;
  let at = pos;
  while (current.isPlot && !current.isTextblock) {
    const child = last ? current.lastChild : current.firstChild;
    if (!child) return null;
    // 最後の子は閉じの直前、最初の子は開きの直後
    at = last ? at + current.length - 1 - child.length : at + 1;
    current = child;
  }
  return current.isPlot && current.isTextblock ? { node: current, pos: at } : null;
}

/**
 * ブロック先頭の Backspace。同じ親の中に手前がいなければ**外へ登り**、手前が引用なら
 * **その中の最後のテキストブロックまで降りる**。それ以外の位置では false。
 */
export const joinBackward: Command = (state) => {
  const { from, empty } = state.selection;
  if (!empty) return false;
  const $from = state.selection.$from;
  const depth = $from.depth;
  if (!$from.parent.isTextblock || from !== $from.start(depth)) return false;

  // 手前に兄弟がいる深さまで登る
  let d = depth;
  while (d > 0 && $from.index(d - 1) === 0) d--;
  if (d === 0) return false;

  const prev = $from.node(d - 1).child($from.index(d - 1) - 1);
  const found = edgeTextblock(prev, $from.before(d) - prev.length, true);
  if (!found) return false;

  const doc = state.doc;
  const $before = Pos.resolve(doc, found.pos + found.node.length - 1);
  const changes = joinBlocks(doc, $before, $from);
  const caret = $before.end($before.depth);
  return {
    changes,
    selection: (result) => Selection.near(result, caret),
    userEvent: "delete.backward",
  };
};

/** ブロック末尾の Delete。joinBackward の対称で、次のテキストブロックを引き上げる */
export const joinForward: Command = (state) => {
  const { from, empty } = state.selection;
  if (!empty) return false;
  const $from = state.selection.$from;
  const depth = $from.depth;
  if (!$from.parent.isTextblock || from !== $from.end(depth)) return false;

  let d = depth;
  while (d > 0 && $from.index(d - 1) >= $from.node(d - 1).childCount - 1) d--;
  if (d === 0) return false;

  const next = $from.node(d - 1).child($from.index(d - 1) + 1);
  const found = edgeTextblock(next, $from.after(d), false);
  if (!found) return false;

  const doc = state.doc;
  const $after = Pos.resolve(doc, found.pos + 1);
  return {
    changes: joinBlocks(doc, $from, $after),
    selection: (result) => Selection.near(result, from),
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

/** plot を開き・中身・閉じに開く。丸ごと渡すと fit が中身を見られず、インラインブロックごと落ちてしまう */
function openTokens(content: readonly DocNode[]): Token[] {
  const out: Token[] = [];
  for (const child of content) {
    if (child.isPlot) out.push(child.tag, ...openTokens(child.content), Close);
    else out.push(child);
  }
  return out;
}

/**
 * テキストブロックの型を変える。中身は fit に通すので、新しい型に入れないインラインブロックは
 * 落ちて中の文字だけ残る。足りない子は correction が挿す。
 */
export function setBlockType(tag: Plot.Tag): Command {
  return (state) => {
    const $from = state.selection.$from;
    const depth = $from.textblockDepth();
    if (depth == null || depth < 1) return false;
    const block = $from.node(depth);
    if (block.type === tag.type) return false;
    // テキストブロック同士の入れ替え。インラインブロックで包むのは別のコマンド (wrapIn) の仕事
    if (!tag.type.isTextblock) return false;
    if (!state.schema.canContain($from.node(depth - 1).type, tag.type)) return false;
    const open = $from.before(depth);
    // 中身ごと置き換えるので、位置の写像では置換の端に潰れる。落ちるのはインラインブロックだけで文字は
    // 残るから、キャレットは**文字数**で数え直す
    const offset = buildTextblockMap(block, open).posToOffset(state.selection.head);
    return {
      changes: {
        from: open,
        to: open + block.length,
        insert: [tag, ...openTokens(block.content), Close],
        fit: true,
      },
      selection: (doc) => {
        const next = doc.nodeAt(open);
        if (!next?.isPlot || !next.isTextblock) return Selection.near(doc, open + 1, 1);
        return Selection.near(doc, buildTextblockMap(next, open).offsetToPos(offset), 1);
      },
      userEvent: "input.setBlockType",
    };
  };
}

/**
 * 選択範囲をインラインブロックで包む。入れ子は今は作らない。
 * `maxLength` は縦中横のように長いと読めなくなるインラインブロックのため。
 */
export function wrapInline(tag: Plot.Tag, maxLength?: number): Command {
  return (state) => {
    const { from, to, empty } = state.selection;
    if (empty) return false;
    if (maxLength != null && to - from > maxLength) return false;
    const $from = state.selection.$from;
    const depth = $from.textblockDepth();
    if (depth == null) return false;
    // ブロックを跨ぐ選択は扱わない
    if (from < $from.start(depth) || to > $from.end(depth)) return false;
    // 親が置けないなら作らない。インラインブロックの中で押したときはここで止まる
    if (!state.schema.canContain($from.parent.type, tag.type)) return false;

    const tokens = sliceDoc(state.doc, from, to).tokens;
    for (const token of tokens) {
      // 開き / 閉じが出てくる = インラインブロックをまたいでいる
      if (isClose(token) || isOpen(token)) return false;
      if (!state.schema.canContain(tag.type, token.type)) return false;
    }
    return {
      changes: { from, to, insert: [tag, ...tokens, Close] },
      // 中身は開きトークンのぶん 1 つ後ろへ動く。選択はそのまま中身に張り直す
      selection: (doc) => TextSelection.create(doc, from + 1, to + 1),
      userEvent: "input.wrapInline",
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
