import {
  Close,
  type Command,
  type Extension,
  keymap,
  Node,
  Paragraph,
  Plot,
  Selection,
  schemaElement,
  setBlockType,
} from "tatefude";

/**
 * ページの先頭から始まる段落。**改ページを型で表す。**
 *
 * `Plot.define` はパラメータを持てないので、段落に「ここで改ページ」の属性を足せない。
 * 型を分ければ、既存の setBlockType / splitBlock がそのまま使える (台本が本文の型を
 * 分けているのと同じ形)。中身の決まりは Paragraph と同じで、違うのは組みだけ。
 */
export const PageStart = Plot.define("PageStart", {
  inlineContent: true,
  group: Node.Group.Content,
  shape: { element: "p", attrs: { class: "novel-page-start" } },
});

/**
 * Shift-Enter。キャレットの位置で割り、**後ろ側**を次のページの先頭にする。
 *
 * ブロックの先頭では割らずに型だけ変える。割ると前のページの末尾に空の段落が残る。
 */
export const breakPage: Command = (state) => {
  const selection = state.selection;
  const $from = selection.$from;
  if (!$from.parent.isTextblock) return false;
  if (selection.empty && selection.from === $from.start($from.depth)) {
    return setBlockType(PageStart)(state);
  }
  const { from, to } = selection;
  return {
    changes: { from, to, insert: [Close, PageStart], fit: true },
    selection: (doc, changes) => Selection.near(doc, changes.mapPos(to, 1)),
    userEvent: "input.pageBreak",
  };
};

/**
 * ページ先頭の段落を途中で割ったとき、後ろ側は普通の段落にする。
 *
 * 既定の splitBlock は途中で割ると同じ型で開き直すので、そのままだと後ろ側にも改ページが
 * 付いて次のページへ飛んでしまう。末尾で割るぶんは既定 (地の文になる) に任せる。
 */
const splitPageStart: Command = (state) => {
  const $from = state.selection.$from;
  if ($from.parent.type !== PageStart.type) return false;
  const { from, to } = state.selection;
  if (to === $from.end($from.depth)) return false;
  return {
    changes: { from, to, insert: [Close, Paragraph], fit: true },
    selection: (doc, changes) => Selection.near(doc, changes.mapPos(to, 1)),
    userEvent: "input.split",
  };
};

export const pageStartExtension: Extension = [
  schemaElement.of(PageStart),
  // Enter は既定より先に試される。当てはまらなければ false を返して既定へ落ちる
  keymap.of([
    { key: "Enter", run: splitPageStart },
    { key: "Shift-Enter", run: breakPage },
  ]),
];
