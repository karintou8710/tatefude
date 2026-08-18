import {
  boutenExtension,
  docExtension,
  type Extension,
  history,
  type Node,
  Paragraph,
  type Plot,
  paragraphExtension,
  rubyExtension,
  strongExtension,
  tcyExtension,
} from "tatefude";
import { bouten, ruby, tcy, text } from "../content";
import { rubyItem, tcyItem } from "../toolbar-items";
import type { Editor } from "../types";
import styles from "./styles.module.css";

/** 小説は地の文だけで組む。引用は入れないので、既定のスキーマから拾って並べ直す */
const novelSchema: Extension = [
  docExtension,
  paragraphExtension,
  rubyExtension,
  strongExtension,
  boutenExtension,
  tcyExtension,
];

/** 段落 1 つ。字下げの全角空白は doc 側で持つ */
function p(...content: Node[]): Plot {
  return Paragraph.create(content);
}

export const novel: Editor = {
  id: "novel",
  name: "縦書き・小説",
  description: "段落の字下げとルビ。引用は持たない",
  layout: "paginated",
  className: styles.novel,
  config: [novelSchema, history()],
  toolbar: [rubyItem, tcyItem],
  doc: (schema) =>
    schema.doc([
      p(text("　"), ruby("硝子", "ガラス"), text("の向こうで、雪が斜めに降っていた。")),
      p(
        text("　"),
        ruby("時任", "ときとう"),
        text("は指先で窓を拭い、白く曇った円の中に、遠い街灯の光を見つけた。"),
      ),
      p(
        text("　この街に来て"),
        tcy("12"),
        text("年目の冬になる。誰にも"),
        bouten("会わない"),
        text("ための冬だった。"),
      ),
      p(text("　問いは、雪の音に紛れて消えた。")),
      p(
        text("　"),
        ruby("階下", "かいか"),
        text(
          "で誰かが戸を閉めた。木の枠が鳴り、それから足音が遠ざかって、また雪の音だけが残った。時任はしばらく窓に手を当てたまま、指の跡が白く戻っていくのを見ていた。",
        ),
      ),
      p(
        text(
          "　机の上には、封を切らないままの手紙が三通。差出人はどれも同じ字で、どれも同じことを書いているのだろうと思うと、開ける気にならなかった。",
        ),
      ),
      p(text("　――もう帰らないのですか。")),
      p(
        text("　"),
        bouten("あの声"),
        text(
          "は、封筒の中にはない。半年前の夏、駅の改札で聞いたきりだ。それでも冬になるたび、雪の降りはじめの静けさの中に、同じ調子でまぎれこんでくる。",
        ),
      ),
      p(
        text("　時任は湯を沸かし、"),
        ruby("薬缶", "やかん"),
        text(
          "の鳴るのを待った。台所の窓は北を向いていて、そこからは街灯が見えない。かわりに、隣家の屋根が白く盛り上がっていくのが見えた。今夜は積もる。",
        ),
      ),
      p(
        text("　"),
        tcy("22"),
        text(
          "時を過ぎて、雪はいっそう細かくなった。細かい雪はよく積もる、と誰かに教わった気がする。誰だったかは思い出せない。思い出せないことが、この街の冬にはいくつもあった。",
        ),
      ),
      p(
        text("　湯が鳴った。時任は火を止め、"),
        ruby("湯呑", "ゆのみ"),
        text("をふたつ出して、片方を戸棚に戻した。"),
      ),
      p(
        text(
          "　窓の外で、雪が斜めに降りつづけている。斜めなのは風のせいで、風は北から来ている。それだけのことだ。それだけのことを、時任はもう一度、声に出さずに確かめた。",
        ),
      ),
      p(text("　朝には、道が白くなっているだろう。")),
      p(
        text("　"),
        ruby("足跡", "あしあと"),
        text(
          "のない道を最初に歩くのは、この街ではたいてい新聞屋だ。時任はそれを窓から見るのが好きだった。誰かが通ったあとの道より、誰も通っていない道のほうが、まだ何も決まっていないように見えるからだ。",
        ),
      ),
      p(text("　湯呑をひとつだけ持って、窓辺に戻る。")),
      p(text("　雪は、まだ降っていた。")),
      p(),
    ]),
};

/**
 * 同じ中身をスクロールで見る版。段組みに割らないので行が左へ伸び続ける。
 * 紙に見せるかどうかが `layout` だけの違いになっていることを見るためのもの。
 */
export const novelScroll: Editor = {
  ...novel,
  id: "novel-scroll",
  name: "縦書き・スクロール",
  description: "小説と同じ中身。ページに割らず横スクロールで読む",
  layout: "vertical",
  className: `${styles.novel} ${styles.scroll}`,
};
