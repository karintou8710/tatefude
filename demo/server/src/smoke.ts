// ブラウザを立てずに convert.ts を試すための最小の入力。`pnpm --filter tatefude-demo-server smoke`

import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { minitype } from "@minitype/minitype";
import { buildDocument, type NodeJson, type PrintRequest } from "./convert.ts";

const entry = createRequire(import.meta.url).resolve("@minitype/minitype");
const fontDir = fileURLToPath(new URL("../fonts/", pathToFileURL(entry)));

const t = (param: string, marks?: Record<string, unknown>) => ({ type: "Text", param, marks });
const tcy = (param: string) => ({ type: "Tcy", content: [t(param)] });
const ruby = (base: string, reading: string) => ({
  type: "Ruby",
  content: [
    { type: "RubyBase", content: [t(base)] },
    { type: "RubyText", content: [t(reading)] },
  ],
});
const dialogue = (speaker: string, ...speech: NodeJson[]) => ({
  type: "Dialogue",
  content: [{ type: "Speaker", content: [t(speaker)] }, ...speech],
});

const novel: PrintRequest = {
  format: "novel",
  chars: 41,
  lines: 16,
  charAdvance: 8.15,
  lineAdvance: 13.95,
  sheet: {
    width: 105,
    height: 148,
    margin: { top: 14, bottom: 16, side: 13 },
  },
  doc: {
    type: "Doc",
    content: [
      {
        type: "Paragraph",
        content: [
          t("　"),
          ruby("硝子", "ガラス"),
          t(
            "の向こうで、雪が斜めに降っていた。時任は指先で窓を拭い、白く曇った円の中に、遠い街灯の光を見つけた。",
          ),
        ],
      },
      {
        type: "Paragraph",
        content: [
          t("　この街に来て"),
          tcy("12"),
          t("年目の冬になる。誰にも"),
          t("会わない", { Bouten: null }),
          t("ための冬だった。"),
          t("強調", { Strong: null }),
        ],
      },
      // 1 ページ (17 行) を埋めて、行数と改ページを見るための水増し
      ...Array.from({ length: 8 }, () => ({
        type: "Paragraph",
        content: [
          t(
            "　雪はやんだり降ったりを繰り返していて、そのたびに町の輪郭が少しずつ丸くなっていくようだった。橋を渡り切るころには、来た道の足跡はもう半分ほど埋まっていた。",
          ),
        ],
      })),
      { type: "Paragraph", content: [] },
      { type: "PageStart", content: [t("　次のページの頭から始まる段落。")] },
    ],
  },
};

const script: PrintRequest = {
  format: "script",
  chars: 36,
  lines: 26,
  charAdvance: 12.1,
  lineAdvance: 24.2,
  sheet: {
    width: 257,
    height: 182,
    margin: { top: 13, bottom: 15, side: 17.4 },
  },
  doc: {
    type: "Doc",
    content: [
      { type: "SceneHeading", content: [t("教室")] },
      { type: "Action", content: [t("長岡が喋り終わると同時に遮るヤス。")] },
      dialogue("ヤス", t("部員が"), tcy("3"), t("人。規定は"), tcy("5"), t("人")),
      {
        type: "Action",
        content: [
          t("それに対抗し親指を立ててアウトのポーズをしつつ、その手で健太郎を叩く。"),
          t("折り返した行が字下げに揃うかを見るための長いト書き。"),
        ],
      },
      // 1 ページ (26 行) を跨いで、帯の罫が次のページにも渡るかを見るための水増し
      ...Array.from({ length: 30 }, (_, index) => dialogue("長岡", t(`犯人はヤス (${index + 1})`))),
      { type: "SceneHeading", content: [t("図書室・閲覧室（夜）")] },
      {
        type: "Action",
        content: [t("突き当たりの扉から光が漏れている。"), ruby("閲覧室", "えつらんしつ")],
      },
      { type: "Action", content: [] },
    ],
  },
};

for (const request of [novel, script]) {
  const { groups, style } = buildDocument(request);
  const document = minitype(groups, style, { fontDir });
  const paths = await document.save(`/tmp/minitype-smoke-${request.format}.pdf`);
  console.log(paths, await document.getPageCount(), await document.getDiagnostics());
}
