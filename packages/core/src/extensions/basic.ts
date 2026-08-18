import type { Schema } from "../doc";
import type { Extension } from "../state/facet";
import { schemaElement } from "../state/state";
import { Bouten } from "./mark/bouten";
import { Strong } from "./mark/strong";
import { Blockquote } from "./node/blockquote";
import { Doc } from "./node/doc";
import { Paragraph } from "./node/paragraph";
import { Ruby, RubyBase, RubyText, rubyExtension } from "./node/ruby";

/**
 * 既定の構成に入る型。スキーマだけ組み替えたいとき用で、`basicSchema()` が要らない
 * 構成 (台本のように本文の型を入れ替えるもの) はここから拾って並べ直す。
 */
export const basicSchemaElements: readonly Schema.Element[] = [
  Doc,
  Paragraph,
  Blockquote,
  Ruby,
  RubyBase,
  RubyText,
  Strong,
  Bouten,
];

/**
 * `config: [basicSchema()]` のように使う。
 *
 * 縦中横は横書きでは意味が無いので入れない。縦書きの構成が `tcyExtension` を足す。
 */
export function basicSchema(): Extension {
  return [
    [Doc, Paragraph, Blockquote, Strong, Bouten].map((element) => schemaElement.of(element)),
    rubyExtension,
  ];
}
