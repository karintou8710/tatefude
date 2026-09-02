import { type Extension, Leaf, Plot, schemaElement } from "tatefude";

/**
 * 人物名。ルビと同じインラインブロックで、セリフの頭に立つ。
 *
 * 属性ではなくノードにしてあるのは、名前も編集される文字だから。
 * ここが型として分かれていれば、登場人物表との突き合わせ・人物ごとの集計・
 * 名前の一括変更が doc を歩くだけでできる。
 */
export const Speaker = Plot.define("Speaker", {
  inline: true,
  inlineContent: Leaf.Text,
  cursorInsideBounds: true,
  // 空だと箱を持たず、クリックもキャレットの測定もできなくなる
  placeholder: "人物",
  shape: { element: "span", attrs: { class: "script-speaker" } },
});

export const speakerExtension: Extension = [schemaElement.of(Speaker)];
