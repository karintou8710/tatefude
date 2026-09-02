# demo/server

デモの doc を **minitype (組版エンジン) で組んで PDF にする**サーバー。
「minitype (実験)」ボタンがここを叩く。

```bash
pnpm dev:server   # これだけ。http://localhost:8787
pnpm dev          # frontend も一緒に。あちらの /api がここへ proxy される
```

ブラウザは `doc.toJSON()` と組みの数字を投げるだけで、`Group[]` への変換は `convert.ts` が持つ。
`server.ts` は dev でもコンテナでも同じで、違うのは前に立つものだけ —
dev は vite の proxy、Cloudflare は Worker が `/api/pdf` を `/pdf` に書き換えて渡す。

## ライセンス

`@minitype/minitype` は **PolyForm Strict License 1.0.0**。非商用の利用は自由だが、
**改変と再配布は許可されていない**。守るのは次の 4 つ。

- **ブラウザへ配らない。**組版はいつもサーバー側で、返すのは PDF だけ。
  デモのクライアントバンドルにも `package.json` にも入らない (配ると再配布になる)
- **イメージは private registry だけ。**`registry.cloudflare.com` はアカウントに閉じていて、
  push も pull も認証が要る。Docker Hub のような public のレジストリへ出さない
- **パッチを当てない。**Dockerfile での梱包は改変ではないが、`dist/` は触らない
- **非商用のまま。**広告も課金も付けない

生成した PDF 自体にはこのライセンスは適用されない (作者の README に明記がある)。
