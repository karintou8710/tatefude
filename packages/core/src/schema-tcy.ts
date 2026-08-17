import { Leaf, Plot } from "./doc";
import { correction } from "./state/correction";
import type { Extension } from "./state/facet";
import { schemaElement } from "./state/state";

/**
 * 縦中横。縦書きの行の中で、その部分だけ横に組む (二桁の数字など)。
 *
 * **マークではなくインラインブロックにしてある。** 箱の中で書字方向が変わるので、
 * 「箱の手前」と「内側の先頭」が画面上の別の点になり、次に打つ文字が箱に入るかどうかも
 * ユーザーの選択になる。傍点のような「点が付くか」だけの装飾とは別の種類。
 *
 * 横書きでは意味が無いので `basicSchema()` には入れず、縦書きの構成が取り込む。
 */
export const Tcy = Plot.define("Tcy", {
  inline: true,
  inlineContent: Leaf.Text,
  cursorInsideBounds: true,
  // 箱の中は横組み。矢印キーは左右で中を進み、上下で箱を出る
  cursorAxisTurns: true,
  shape: { element: "span", attrs: { class: "tf-tcy" } },
});

/**
 * `text-combine-upright: all` が読める上限の目安。これを超えると潰れて読めなくなる。
 * 仕様上 UA は非結合に落としてよいが、Chromium は結合したまま伸ばす。
 */
export const TCY_MAX_LENGTH = 4;

/** 空になったら箱ごと消す。中身が無い箱は場所を持たず、クリックも測定もできなくなる */
export const tcyCorrection: Extension = correction({
  node: Tcy,
  correct: ({ node, pos }) => (node.contentLength ? null : { from: pos, to: pos + node.length }),
});

export const tcySchema: Extension = [schemaElement.of(Tcy), tcyCorrection];
