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

pnpm --filter tatefude-demo check   # wrangler の設定と Dockerfile を検算する (Docker が要る)
```

## なぜ server はコンテナなのか

Worker の isolate はメモリ上限が 128 MB。minitype は**初回のフォント読み込みで全グリフを
展開する**ので 2 GB 要る。しかもブラウザ向けビルドの better-sqlite3 は no-op シムで、
キャッシュが永続しない = **毎回その 2 GB の経路を通る**。逃げ道が無い。
