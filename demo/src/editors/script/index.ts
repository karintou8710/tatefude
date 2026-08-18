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
  layout: "paginated",
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

      dialogue("ヤス", text("長岡、お前は黙ってろ")),
      dialogue("長岡", text("黙ってた結果がこれです")),
      Action.create([
        text("窓の外はもう暗い。グラウンドの照明が落ち、部室棟だけが白く残っている。"),
      ]),
      dialogue("健太郎", text("……で、認めないってのは、どういう理屈で")),
      dialogue("ヤス", text("部員が"), tcy("3"), text("人。規定は"), tcy("5"), text("人")),
      Action.create([text("長岡、鞄から紙束を出して机に置く。")]),
      dialogue("長岡", text("入部届。"), tcy("2"), text("枚")),
      Action.create([text("二人、同時に長岡を見る。")]),
      dialogue("長岡", text("図書室で、と言ったら")),

      SceneHeading.create([text("廊下（夜）")]),
      Action.create([text("壁の時計は"), tcy("12"), text("時を回っている。")]),
      Action.create([text("暗がりを歩く二人。足音だけが響く。")]),
      dialogue("健太郎", text("図書室って、"), tcy("12"), text("時までやってたっけ")),
      dialogue("長岡", text("やってない")),
      Action.create([
        text("突き当たりの扉から光が漏れている。近づくと、"),
        ruby("閲覧室", "えつらんしつ"),
        text("の札が下がっている。"),
      ]),
      dialogue("司書", text("その"), ruby("一行", "ひとくだり"), text("、読めましたか")),
      Action.create([
        text("振り返ると、カウンターに司書が立っている。いつからいたのか分からない。"),
      ]),
      dialogue("司書", text("ここの者です。ずっと")),

      SceneHeading.create([text("図書室・閲覧室（夜）")]),
      Action.create([text("天井まで届く書架。通路は一人分の幅しかなく、奥は暗くて見通せない。")]),
      dialogue("司書", text("入部届は"), tcy("2"), text("枚しか出していません")),
      dialogue("長岡", text("足ります")),
      dialogue("ヤス", text("待て。誰の名前が書いてある")),
      Action.create([text("長岡、紙束をめくらずに差し出す。")]),
      Action.create([
        text("受け取ったヤスの手が止まる。健太郎が横から覗き込み、同じところで止まる。"),
      ]),
      dialogue("健太郎", text("……お前")),
      dialogue("長岡", text("去年")),
      Action.create([text("司書、カウンターの奥へ引っ込む。足音は聞こえない。")]),
      dialogue("健太郎", text("おい、"), ruby("司書", "あのひと"), text("は")),
      Action.create([text("振り返ったときには、カウンターに誰もいない。")]),
      dialogue("長岡", text("犯人はヤス")),
      dialogue("ヤス", text("その話まだ続けるの"), tcy("!?")),
      Action.create([]),
    ]),
};

/** 同じ中身をスクロールで見る版。横罫は段の周期ではなく全長に 1 本引く */
export const scriptScroll: Editor = {
  ...script,
  id: "script-scroll",
  name: "縦書き・台本スクロール",
  description: "台本と同じ中身。ページに割らず横スクロールで読む",
  layout: "vertical",
  className: `${styles.script} ${styles.scroll}`,
};
