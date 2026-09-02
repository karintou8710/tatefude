import { Container, getContainer } from "@cloudflare/containers";

/** 64 KB で 57 ページぶん。コンテナを起こす前に切る */
const MAX_BODY = 64 * 1024;
const TIMEOUT = 30_000;

export class Minitype extends Container<Env> {
  defaultPort = 8787;
  /** 起きているあいだメモリを抱えたまま。起こし直しは数秒 */
  sleepAfter = "1m";
  /** 組版は外へ出ない */
  enableInternet = false;
  /** Hono の GET / が文字を返す */
  pingEndpoint = "/";
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);

    // 資産に無い URL はここへ来る。SPA なので index.html に落とす
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);

    if (url.pathname !== "/api/pdf" || request.method !== "POST") {
      return new Response("not found", { status: 404 });
    }

    // 組版は数秒 CPU を回す。連打で埋まらないように
    const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
    const { success } = await env.PDF_RATE_LIMIT.limit({ key: ip });
    if (!success) {
      return new Response("混んでいます。少し待ってから押してください", { status: 429 });
    }

    // content-length は付かないことがある
    const body = await request.text();
    if (body.length > MAX_BODY) {
      return new Response(`原稿が大きすぎます (${MAX_BODY} 文字まで)`, { status: 413 });
    }

    // 止まっていれば起こしてくれる
    const container = getContainer(env.MINITYPE);
    // コンテナの Hono は /pdf で受ける
    const pdf = container.fetch(
      new Request(new URL("/pdf", url), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
      }),
    );

    // JSRPC 越しなので AbortSignal が渡らない。待つのをやめるだけで組版は走り切る
    const giveUp = new Promise<Response>((resolve) => {
      setTimeout(() => resolve(new Response("組版が終わりませんでした", { status: 504 })), TIMEOUT);
    });
    return Promise.race([pdf, giveUp]);
  },
} satisfies ExportedHandler<Env>;
