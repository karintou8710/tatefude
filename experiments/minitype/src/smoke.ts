// ブラウザを立てずに convert.ts を試すための最小の入力。`pnpm --filter @tatefude/experiment-minitype smoke`

import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { minitype } from "@minitype/minitype";
import { buildDocument, type PrintRequest } from "./convert";

const entry = createRequire(import.meta.url).resolve("@minitype/minitype");
const fontDir = fileURLToPath(new URL("../fonts/", pathToFileURL(entry)));

const t = (param: string, marks?: Record<string, unknown>) => ({ type: "Text", param, marks });
const request: PrintRequest = {
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
          {
            type: "Ruby",
            content: [
              { type: "RubyBase", content: [t("硝子")] },
              { type: "RubyText", content: [t("ガラス")] },
            ],
          },
          t(
            "の向こうで、雪が斜めに降っていた。時任は指先で窓を拭い、白く曇った円の中に、遠い街灯の光を見つけた。",
          ),
        ],
      },
      {
        type: "Paragraph",
        content: [
          t("　この街に来て"),
          { type: "Tcy", content: [t("12")] },
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

const { groups, style } = buildDocument(request);
const document = minitype(groups, style, { fontDir });
const paths = await document.save("/tmp/minitype-smoke.pdf");
console.log(paths, await document.getPageCount(), await document.getDiagnostics());
