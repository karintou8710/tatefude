# demo

`tatefude` を使う側。Cloudflare へ出す単位でもあるので、`wrangler.jsonc` もここに置く。

```
demo/
├─ frontend/   見えるほう。tatefude を名前で import する
├─ server/     組版して PDF を返すほう
└─ src/        両方を前で束ねる Worker
```

## 動かす

```bash
pnpm dev            # 両方。frontend :5180 / server :8787 (vite が /api を proxy する)
pnpm dev:frontend   # frontend だけ
pnpm dev:server     # server だけ

pnpm --filter tatefude-demo run check    # 設定と Dockerfile を検算 (Docker が要る)
pnpm --filter tatefude-demo run deploy   # 出す
```

**どちらも frontend を組み立ててから走る。**wrangler が配るのは `frontend/dist` の中身なので、
組み忘れると直したはずのものが出ない。CI も同じ `run build` を呼ぶ。

## なぜ server はコンテナなのか

Worker の isolate はメモリ上限が 128 MB。minitype は**初回のフォント読み込みで全グリフを
展開する**ので 2 GB 要る。しかもブラウザ向けビルドの better-sqlite3 は no-op シムで、
キャッシュが永続しない = **毎回その 2 GB の経路を通る**。逃げ道が無い。
