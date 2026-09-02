import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { serve } from "@hono/node-server";
import { minitype } from "@minitype/minitype";
import { Hono } from "hono";
import { buildDocument, type PrintRequest } from "./convert.ts";

const PORT = Number(process.env.PORT) || 8787;

// 同梱のフォント (Source Han Serif JP)。既定の探索先はプロセスの cwd なので、
// どこから起動しても当たるように解決しておく
const entry = createRequire(import.meta.url).resolve("@minitype/minitype");
const fontDir = fileURLToPath(new URL("../fonts/", pathToFileURL(entry)));

const app = new Hono();

app.get("/", (c) => c.text("minitype 実験サーバー"));

app.post("/pdf", async (c) => {
  const request = await c.req.json<PrintRequest>();
  const { groups, style } = buildDocument(request);
  const started = performance.now();
  const document = minitype(groups, style, { fontDir });
  const pdf = await document.toPdf();
  const elapsed = Math.round(performance.now() - started);
  console.log(`組版 ${await document.getPageCount()} ページ / ${elapsed}ms`);
  // オーバーフローした行など。組みが崩れたときの手掛かりになる
  for (const diagnostic of await document.getDiagnostics()) console.log(diagnostic);
  return new Response(pdf, { headers: { "content-type": "application/pdf" } });
});

// 失敗はブラウザ側に文字で返す。実験なので握り潰さない
app.onError((error, c) => {
  console.error(error);
  return c.text(error.message, 500);
});

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`http://localhost:${info.port}`);
});
