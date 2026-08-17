import { Blockquote, basicSchema, history, Paragraph, tcySchema } from "tatefude";
import { dots, ruby, tcy, text } from "../content";
import type { Editor } from "../types";
import { tcyItem } from "../vertical";
import styles from "./styles.module.css";

export const novel: Editor = {
  id: "novel",
  name: "縦書き・小説",
  description: "段落の字下げとルビ。スキーマは横書きと同じ",
  vertical: true,
  className: styles.novel,
  config: [basicSchema(), tcySchema, history()],
  toolbar: [tcyItem],
  doc: (schema) =>
    schema.doc([
      Paragraph.create([
        text("　"),
        ruby("硝子", "ガラス"),
        text("の向こうで、雪が斜めに降っていた。"),
      ]),
      Paragraph.create([
        text("　"),
        ruby("時任", "ときとう"),
        text("は指先で窓を拭い、白く曇った円の中に、遠い街灯の光を見つけた。"),
      ]),
      Paragraph.create([
        text("　この街に来て"),
        tcy("12"),
        text("年目の冬になる。誰にも "),
        dots("会わない"),
        text(" ための冬だった。"),
      ]),
      Blockquote.create([Paragraph.create([text("　――もう帰らないのですか。")])]),
      Paragraph.create([text("　問いは、雪の音に紛れて消えた。")]),
      Paragraph.create([]),
    ]),
};
