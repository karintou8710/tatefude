import { Blockquote, basicSchema, history, Paragraph, Ruby, RubyBase, RubyText } from "tatefude";
import { rubyItem } from "../common";
import { bouten, ruby, strong, text } from "../content";
import type { Editor } from "../types";

export const horizontal: Editor = {
  id: "horizontal",
  name: "横書き",
  description: "既定のスキーマ。段落・引用・ルビ・マーク",
  vertical: false,
  config: [basicSchema(), history()],
  toolbar: [rubyItem],
  doc: (schema) =>
    schema.doc([
      Paragraph.create([text("EditContext で動くエディタの雛形です。")]),
      Paragraph.create([
        text("日本語を入力すると "),
        strong("変換中の下線"),
        text(" が "),
        bouten("傍点"),
        text(" と decoration で描かれます。"),
      ]),
      Paragraph.create([
        text("ルビは "),
        ruby("振り仮名", "ふりがな"),
        text(" のようなインラインブロックです。読みが空だと "),
        Ruby.create([RubyBase.create([text("代役")]), RubyText.create([])]),
        text(" が出ます。"),
      ]),
      Blockquote.create([
        Paragraph.create([text("引用はブロックを入れ子にしたものです。")]),
        Paragraph.create([text("中で Enter を押すと引用の中で割れ、空行でもう一度押すと出ます。")]),
      ]),
      Paragraph.create([]),
    ]),
};
