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
  store: "script",
  name: "縦書き・台本",
  description: "柱は番号付きの見出し。本文はセリフとト書き",
  layout: "paginated",
  className: styles.script,
  config: [scriptSchema(), history()],
  toolbar: scriptToolbar,
  // シナリオの組み。行頭に帯 3 字と人物名 8 字を取るので、発話に残るのは 25 字。
  // 画面はこの字数と行数だけを見て紙を組み立てるので、プレビューと編集画面で組みが揃う
  print: {
    format: "script",
    chars: 36,
    lines: 26,
    charAdvance: 12.1,
    lineAdvance: 24.2,
    // B5 (JIS) の横置き。縦書きなので height が行の長さ (= 字数)、
    // width が行の積み方向 (= 行数)。地はノンブルが入るぶん天より広い
    sheet: {
      width: 257,
      height: 182,
      margin: { top: 13, bottom: 15, side: 17.4 },
    },
  },
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

      SceneHeading.create([text("同・書架の奥（夜）")]),
      Action.create([
        text("一人分の幅しかない通路。突き当たりの返却台に、本が一冊開いたまま置かれている。"),
      ]),
      Action.create([
        text("健太郎、覗き込む。頁の余白に、"),
        ruby("罫線", "けいせん"),
        text("を引いたような細い字が縦に並んでいる。"),
      ]),
      dialogue("健太郎", text("……名簿だ、これ")),
      dialogue("ヤス", text("いつの")),
      dialogue("健太郎", text("去年の")),
      Action.create([text("ヤス、指でなぞる。三行目で止まる。")]),
      dialogue("ヤス", text("この字")),
      dialogue("長岡", text("はい")),
      dialogue("ヤス", text("俺の字だ。書いた覚えがない")),
      dialogue("長岡", text("去年、書いてもらいました")),
      dialogue("健太郎", text("誰に"), tcy("!?")),
      Action.create([
        text("答えはない。書架のあいだを風が抜け、開いていた頁がいっせいにめくれて閉じる。"),
      ]),
      dialogue("ヤス", text("……帰るぞ")),
      dialogue("長岡", text("まだ"), tcy("2"), text("枚目を見ていません")),

      SceneHeading.create([text("同・カウンター（夜）")]),
      Action.create([text("カウンターに司書が座っている。さっきと同じ姿勢のまま。")]),
      dialogue("司書", text("見つかりましたか")),
      dialogue("健太郎", text("あんた、さっき奥に行ったよな")),
      dialogue("司書", text("わたしはずっとここにいます")),
      Action.create([text("健太郎、ヤスを見る。ヤスは司書を見ていない。")]),
      dialogue("ヤス", text("……おい健太郎")),
      dialogue("健太郎", text("なに")),
      dialogue("ヤス", text("誰と喋ってる")),
      Action.create([text("間。")]),
      Action.create([
        text("健太郎、ゆっくりカウンターへ向き直る。椅子は引かれたままで、"),
        text("座面に埃が均していない。"),
      ]),
      dialogue("長岡", text(""), tcy("3"), text("人だと足りないんです")),
      dialogue("長岡", text("だから去年、"), tcy("2"), text("人に頼みました")),

      SceneHeading.create([text("昇降口（夜）")]),
      Action.create([text("靴箱の並び。非常灯だけが緑に点いている。")]),
      Action.create([text("三人分の上履きが、揃えて箱の外に出してある。")]),
      dialogue("健太郎", text("俺、こんな出し方しない")),
      dialogue("ヤス", text("俺もだ")),
      Action.create([text("長岡、自分の靴箱を開ける。空。")]),
      dialogue("長岡", text("わたしのは去年から入っていません")),
      dialogue("健太郎", text("え")),
      Action.create([
        text(
          "引き戸を開けると外は雨。降りはじめではなく、だいぶ前から降っていた地面の色をしている。",
        ),
      ]),
      dialogue("ヤス", text("傘は")),
      dialogue("長岡", text("要りません")),
      Action.create([text("長岡、そのまま雨の中へ歩いていく。肩が濡れない。")]),

      SceneHeading.create([text("部室（朝）")]),
      Action.create([
        text("窓が開いている。机の上に入部届が"),
        tcy("2"),
        text("枚、きれいに揃えて置かれている。"),
      ]),
      Action.create([text("ヤス、椅子に沈んでいる。健太郎は立ったまま壁を見ている。")]),
      dialogue("ヤス", text("規定は満たした。認める")),
      dialogue("健太郎", text("いいのかよ")),
      dialogue("ヤス", text("よくはない")),
      Action.create([text("健太郎、入部届を一枚つまみ上げ、窓の光にかざす。")]),
      dialogue("健太郎", text("インク、乾いてる")),
      dialogue("ヤス", text("当たり前だろ")),
      dialogue("健太郎", text("去年のにしては、乾きたてみたいな黒だ")),
      Action.create([text("ヤス、答えない。机の木目を見ている。")]),
      dialogue("健太郎", text("なあ。名簿、写してきた")),
      Action.create([
        text("鞄から紙を一枚出す。図書室の本から書き写したもので、三行目だけ筆圧が違う。"),
      ]),
      dialogue("ヤス", text("……持ってきたのか")),
      dialogue("健太郎", text("書架ごと担いでくるわけにいかないだろ")),
      dialogue("ヤス", text("燃やせ")),
      dialogue("健太郎", text("こわ")),
      Action.create([text("ヤス、初めて健太郎の顔を見る。")]),
      dialogue("ヤス", text("去年、俺はこの部にいない")),
      Action.create([text("秒針が一度だけ跳ねて、また動きだす。")]),
      Action.create([text("長岡、入ってくる。いつもと同じ顔。")]),
      dialogue("長岡", text("おはようございます")),
      dialogue("健太郎", text("長岡")),
      dialogue("健太郎", text("あの"), ruby("二人", "ふたり"), text("、いま何年")),
      Action.create([
        text("長岡、答えずに窓を閉める。ガラスに三人分の影が映り、数えると四つある。"),
      ]),
      dialogue("ヤス", text("……なあ")),
      dialogue("長岡", text("犯人はヤス")),
      dialogue("ヤス", text("そこは崩さないんだ")),
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
