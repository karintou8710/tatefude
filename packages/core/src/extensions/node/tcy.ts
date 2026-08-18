import { type Command, wrapInline } from "../../commands/base";
import { Leaf, Plot } from "../../doc";
import { correction } from "../../state/correction";
import type { Extension } from "../../state/facet";
import { schemaElement } from "../../state/state";

/**
 * 縦中横。マークではなくノードなのは、インラインブロックの中で書字方向が変わり「その手前」と
 * 「内側の先頭」が別の点になるため。横書きでは要らないので `basicSchema()` には入れない。
 */
export const Tcy = Plot.define("Tcy", {
  inline: true,
  inlineContent: Leaf.Text,
  cursorInsideBounds: true,
  // インラインブロックの中は横組み。矢印キーは左右で中を進み、上下で外へ出る
  cursorAxisTurns: true,
  shape: { element: "span", attrs: { class: "tf-tcy" } },
});

/**
 * `text-combine-upright: all` が読める上限の目安。これを超えると潰れて読めなくなる。
 * 仕様上 UA は非結合に落としてよいが、Chromium は結合したまま伸ばす。
 */
const MAX_LENGTH = 4;

/** 選択を縦中横で包む。長すぎる選択は false を返すので、ボタンは無効表示になる */
export const wrapInTcy: Command = wrapInline(Tcy, MAX_LENGTH);

/** 空になったらインラインブロックごと消す。中身が無いと場所を持たず、クリックも測定もできなくなる */
export const tcyCorrection: Extension = correction({
  node: Tcy,
  correct: ({ node, pos }) => (node.contentLength ? null : { from: pos, to: pos + node.length }),
});

export const tcyExtension: Extension = [schemaElement.of(Tcy), tcyCorrection];
