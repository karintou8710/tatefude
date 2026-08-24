import { toggleMark } from "../../commands/base";
import { Mark } from "../../doc";
import { keymap } from "../../input/keymap";
import type { Extension } from "../../state/facet";
import { schemaElement } from "../../state/state";

/**
 * 傍点。日本語組版での強調はこれで、`<em>` のイタリックは使わない。
 *
 * **要素ではなくスタイルで表すマーク**。縦書きでは text-emphasis が自動的に文字の右側へ
 * 回るので、書字方向ごとの出し分けが要らない。
 */
export const Bouten = Mark.define("Bouten", {
  rank: 43,
  spanning: true,
  shape: { attribute: "style/text-emphasis", value: "filled sesame" },
});

/** 日本語組版の強調はこれなので、イタリックの枠 (Mod-i) を充てる */
export const boutenExtension: Extension = [
  schemaElement.of(Bouten),
  keymap.of([{ key: "Mod-i", run: toggleMark(Bouten.name) }]),
];
