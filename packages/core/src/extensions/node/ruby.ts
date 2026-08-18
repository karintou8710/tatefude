import type { Command } from "../../commands/base";
import { Close, isClose, isOpen, Leaf, Plot, sliceDoc } from "../../doc";
import { correction } from "../../state/correction";
import type { Extension } from "../../state/facet";
import { TextSelection } from "../../state/selection";
import { schemaElement } from "../../state/state";

/**
 * インラインブロック = 中身を持つインライン Plot。ルビがその代表。
 *
 * 開き / 閉じトークンは EditContext のバッファでは 0 文字で、中身だけが乗る。
 * doc の位置は進むがバッファのオフセットは進まない。
 */
export const RubyBase = Plot.define("RubyBase", {
  inline: true,
  inlineContent: Leaf.Text,
  cursorInsideBounds: true,
  shape: { element: "rb" },
});

/** 読み。ブラウザが行の外の帯に置くので、行の矩形には入らない */
export const RubyText = Plot.define("RubyText", {
  inline: true,
  inlineContent: Leaf.Text,
  cursorInsideBounds: true,
  // 読みが空だとルビは箱を持たず、クリックもキャレットの測定もできなくなる
  placeholder: "ルビ",
  shape: { element: "rt" },
});

export const Ruby = Plot.define("Ruby", {
  inline: true,
  inlineContent: [RubyBase, RubyText],
  shape: { element: "ruby" },
});

/**
 * 親文字が消えたらルビごと消す。読みだけ残しても、下に何も無いまま行の場所を取り続ける。
 */
export const rubyCorrection: Extension = correction({
  node: Ruby,
  correct({ node, pos }) {
    for (const child of node.content) {
      if (child.isPlot && child.type === RubyBase.type && child.contentLength) return null;
    }
    return { from: pos, to: pos + node.length };
  },
});

/**
 * 選択をルビで包む。`Ruby(RubyBase(選択), RubyText())` の 2 段になるので、
 * 器が 1 つの `wrapInline` では作れない。
 *
 * 読みは空のまま作り、キャレットを `rt` の中へ入れる。次に打つのは振り仮名なので。
 */
export const wrapInRuby: Command = (state) => {
  const { from, to, empty } = state.selection;
  if (empty) return false;
  const $from = state.selection.$from;
  const depth = $from.textblockDepth();
  if (depth == null) return false;
  // ブロックを跨ぐ選択は扱わない
  if (from < $from.start(depth) || to > $from.end(depth)) return false;
  // 親が置けないなら作らない。ルビの中で押したときはここで止まる
  if (!state.schema.canContain($from.parent.type, Ruby.type)) return false;

  const tokens = sliceDoc(state.doc, from, to).tokens;
  for (const token of tokens) {
    // 開き / 閉じが出てくる = インラインブロックをまたいでいる
    if (isClose(token) || isOpen(token)) return false;
    // スキーマにルビが無ければ undefined から false になる
    if (!state.schema.canContain(RubyBase.type, token.type)) return false;
  }
  return {
    changes: { from, to, insert: [Ruby, RubyBase, ...tokens, Close, RubyText, Close, Close] },
    // 読みの中。選択の末尾から ruby / rb の開き・rb の閉じ・rt の開きで 4 つぶん後ろ
    selection: (doc) => TextSelection.create(doc, to + 4),
    userEvent: "input.wrapInRuby",
  };
};

export const rubyExtension: Extension = [
  [Ruby, RubyBase, RubyText].map((element) => schemaElement.of(element)),
  rubyCorrection,
];
