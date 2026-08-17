import { history } from "tatefude";
import { ruby, tcy, text } from "../content";
import type { Editor } from "../types";
import { Action } from "./action";
import { dialogue } from "./dialogue";
import { SceneHeading } from "./scene-heading";
import { scriptSchema, scriptToolbar } from "./schema";
import styles from "./styles.module.css";

// シーンをまとめるコンテナは置かず、柱もブロックの 1 つとして並べる。
// 番号は柱自身の counter で出るので、入れ子にしなくても通し番号になる。

export const script: Editor = {
  id: "script",
  name: "縦書き・台本",
  description: "柱は番号付きの見出し。本文はセリフとト書き",
  vertical: true,
  className: styles.script,
  config: [scriptSchema(), history()],
  toolbar: scriptToolbar,
  doc: (schema) =>
    schema.doc([
      SceneHeading.create([text("教室")]),
      Action.create([text("長岡が喋り終わると同時に遮るヤス。")]),
      dialogue("ヤス", text("とにかく、この部活を認めるわけにはいかなーい！")),
      // 「!?」は縦書きでは寝てしまうので縦中横で起こす。台本でいちばん出る使い方
      dialogue("健太郎", text("なんで"), tcy("!?"), text("　どうして"), tcy("!?")),
      dialogue("ヤス", text("なにかと……アウトだからだぁ！")),
      dialogue("健太郎", text("セフセフ！")),
      Action.create([text("セーフのポーズをする健太郎。")]),
      Action.create([
        text("それに対抗し親指を立ててアウトのポーズをしつつ、その手で健太郎を叩く。"),
      ]),
      dialogue("健太郎", text("あいた")),
      Action.create([text("さっと手を引くヤス。")]),
      dialogue("健太郎", text("おい長岡、殴ったのは誰だ？")),
      dialogue("長岡", text("犯人はヤス")),

      SceneHeading.create([text("廊下（夜）")]),
      Action.create([text("壁の時計は"), tcy("12"), text("時を回っている。")]),
      Action.create([text("暗がりを歩く二人。足音だけが響く。")]),
      dialogue("司書", text("その "), ruby("一行", "ひとくだり"), text(" 、読めましたか")),
      Action.create([]),
    ]),
};
