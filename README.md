# editcontext-wysiwyg

EditContext API を土台にした、ProseMirror ライクな RTE ライブラリの雛形。
contenteditable の DOM 監視・修復を一切持たないことが設計上の主張。

このライブラリのドキュメントモデルは [ProseMirror](https://prosemirror.net/) と
[Wordgard](https://wordgard.net/) の設計から学んでいます (コードは共有していません)。
入力層は EditContext を前提に独自に設計しました。

ドキュメントモデル (Plot / Leaf / Tag / Shape / クエリベースの Schema) と、
構成の仕組み (facet / extension / annotation / correction) は Wordgard 寄り。
変更の表現だけステップ列で ProseMirror 寄りです。

```ts
const state = EditorState.create({
  config: [basicSchema(), composition()],
  doc: (schema) => schema.doc([...]),
});
```

- 設計: [docs/design.md](docs/design.md) (モデルの詳細は §10)
- EditContext の挙動メモ (Blink のソース + 実機): [docs/editcontext.md](docs/editcontext.md)

Chromium 121+ 専用。Safari / Firefox には EditContext の実装が無い。

```bash
pnpm install
pnpm dev          # デモ (デバッグパネルつき) http://localhost:5180
pnpm test         # model / transform / 写像 (node)
pnpm test:browser # view / EditContext (Chromium 実機)
pnpm typecheck
pnpm lint
```

ブラウザテストの初回は `pnpm exec playwright install chromium` が要る。

## 何をしているか

ProseMirror の view 層はコードの多くが「ブラウザが DOM を壊した後の復元」
(DOMObserver / readDOMChange / composition のワークアラウンド) に費やされている。
EditContext を使うと DOM がブラウザに書き換えられないので、

- view は `(doc, selection, decorations) → DOM` の描画関数になる
- 入力はフラットな文字列バッファ上の `(範囲, 文字列, 選択)` として届く

代わりに引き受けるものが 2 つある。

1. ツリーの位置 (doc position) と、EditContext のフラットなオフセットの写像
2. **EditContext をブロックごとに張る**ことの帰結として、ブロックを跨ぐ操作が全部自前になる

```
doc                         DOM                  EditContext
├ paragraph "あいう"   →   <p>あいう</p>   ←→   EC("あいう")
├ paragraph "えお"     →   <p>えお</p>     ←→   EC("えお")
└ paragraph ""         →   <p></p>         ←→   EC("")
                                                 ↑ フォーカス中のものだけ active
```

doc が唯一の真実で、各 EditContext のバッファはその射影。state が更新されるたびに
全ブロック分のバッファを合わせ直す。比較の相手は「最後に押し込んだ文字列」ではなく
EditContext が今持っている文字列なので、EditContext 自身が書き換えた直後は差分ゼロになり、
変換中に `updateText` を叩いて IME を邪魔することがない。

## 入力の担当分け

| 操作 | 誰が処理するか |
| --- | --- |
| 文字入力・IME 変換 | EditContext → `textupdate` → トランザクション |
| ブロック内の Backspace / Delete / 単語削除 | 同上 (grapheme・単語境界は EditContext 任せ) |
| ブロック先頭の Backspace / 末尾の Delete | `beforeinput` を preventDefault して自前で結合 |
| ブロックを跨ぐ選択の削除 | 同上 |
| Enter | `beforeinput` (insertParagraph) → 分割 + 新ブロックへ focus |
| ブロック内のキャレット移動・選択 | ネイティブ (要素が editable なので) |
| ブロック境界を跨ぐ矢印キー移動 | `keydown` で端を判定して隣のブロックへ focus |
| ブロックを跨ぐドラッグ選択 | `mousedown` + `mousemove` を自前で追う |
| 選択の描画 | ネイティブの選択は透明にして CSS Custom Highlight で塗る |

矢印キーの軸は書字方向で入れ替わる (縦書きでは上下が行の中、左右が行の跨ぎ)。
`writing-mode` を読んで論理方向に直してから判定している。

## 今できること (M0)

- 段落 + `Strong` / `Emphasis` / `EmphasisDots` (傍点。属性で描くマーク)
- スキーマの検査。ステップを積むたびに `Schema.validate` が走り、
  スキーマ違反のドキュメントは組み立てられない
- ブロックごとの EditContext の生成・破棄・同期
- 文字入力、IME 変換 (変換中は decoration で下線、候補ウィンドウ位置は
  `updateSelectionBounds` / `updateCharacterBounds` で通知)
- ブロック内の削除 (EditContext 経由) と、ブロック先頭 / 末尾での結合 (自前)
- Enter による分割、フォーカス移動
- クリック・矢印キーによる選択、ブロックを跨ぐ矢印キー移動とドラッグ選択
- **ブロックを跨ぐ選択の描画**。ブラウザが描く選択は編集ホストの境界で丸められるので、
  エディタの中ではネイティブの選択描画を透明にして、model の選択を
  CSS Custom Highlight API で塗っている
- `Mod-b` / `Mod-i`
- 縦書き (`writing-mode: vertical-rl`)。デモの上部で切り替えられる
- デモのデバッグパネル (doc / 各ブロックのバッファ / イベント列)

選択の色は `::highlight(ecw-selection)` を上書きすれば変えられる。

```css
::highlight(ecw-selection) { background-color: #b4d5fe; color: inherit; }
```

## まだ無いもの

- undo / redo、コピー & ペースト、node view、テーブル、共同編集
- Shift + クリックでの範囲拡張、ダブル / トリプルクリックのブロック跨ぎ、
  タッチ・ペンでの選択 (ドラッグは `mousedown` 系しか見ていない)
- ネスト構造 (リスト、引用)。ブロックが入れ子になるとフォーカス管理の設計が増える
- Safari / Firefox 向けの contenteditable フォールバック
- モバイル (Android / iOS のソフトキーボード)
