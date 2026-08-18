# tatefude

EditContext API を土台にした、ProseMirror ライクな RTE ライブラリの雛形。
contenteditable の DOM 監視・修復を一切持たないことが設計上の主張。

`packages/core/src/doc/` は [Wordgard](https://wordgard.net/) (MIT) の doc パッケージから
**派生**しています。`state/history.ts` も同様です。著作権表示と対象ファイルは
[packages/core/LICENSE](packages/core/LICENSE) の "Third-party code" を参照してください。

ドキュメントモデル (Plot / Leaf / Tag / Shape / クエリベースの Schema)、
構成の仕組み (facet / extension / annotation / effect / correction)、
変更の表現 (ChangeSet / Slice / Token / fit) は Wordgard 由来で、
元をたどると CodeMirror 6 の設計です。
ProseMirror の Step / Transform / storedMarks に当たるものはありません。

**入力層と表示層 (`ime/` `input/` `view/`) は独自の実装です。**
EditContext を直接駆動し、contenteditable の DOM 監視・修復を一切持ちません。
縦書き・ルビ・傍点への対応もここに含まれます。

## Acknowledgements

The document model (`packages/core/src/doc/`) and the undo/redo history are **derived
from [Wordgard](https://wordgard.net/)**, which is MIT licensed. Copyright notices and
the full list of affected files are in [packages/core/LICENSE](packages/core/LICENSE).
Wordgard's own `doc` and `state` designs descend from
[CodeMirror 6](https://codemirror.net/), by the same author.

The input and rendering layers are original work: this library drives
[EditContext](https://developer.mozilla.org/docs/Web/API/EditContext) directly and holds
**no contenteditable DOM observation or repair** at all. Vertical writing mode, ruby and
emphasis dots are part of that layer.

Not affiliated with or endorsed by the Wordgard or ProseMirror projects.

```ts
const state = EditorState.create({
  config: [basicSchema()],
  doc: (schema) => schema.doc([...]),
});

// コマンドは「どう更新したいか」を返すだけ
const splitBlock: Command = (state) => ({
  changes: { from, to, insert: [Close, tag], fit: true },
  selection: (doc, changes) => Selection.near(doc, changes.mapPos(to, 1)),
  userEvent: "input.split",
});
view.dispatch(splitBlock(view.state));
```

- 設計: [docs/design.md](docs/design.md) (モデルの詳細は §10)
- EditContext の挙動メモ (Blink のソース + 実機): [docs/editcontext.md](docs/editcontext.md)

Chromium 121+ 専用。Safari / Firefox には EditContext の実装が無い。

```bash
pnpm install
pnpm dev          # デモ http://localhost:5180 (プロジェクトごとに /horizontal /novel /script)
                  #   PORT=xxxx で上書きできる
pnpm test         # model / transform / 写像 (node)
pnpm test:browser # view / EditContext (Chromium 実機)
pnpm typecheck    # 全パッケージ + デモ
pnpm build        # packages/*/dist (tsdown で 1 ファイルに束ねる)
pnpm lint
```

`exports` は開発中は `src/index.ts` を指したまま、**publish 時だけ `publishConfig` が
`dist/` に差し替える**。デモは常にソースを読むので HMR が効き、配布物は束ねた 1 ファイルに
なる。ソースの相対 import は拡張子なしなので、束ねずに配ると Node の ESM 解決が通らない。

pnpm workspace になっている。`packages/` が公開するもの、`demo/` がそれを
**名前で import する利用側**。相対パスで `src/` の奥に入れないので、公開 API
(`src/index.ts`) だけで組めているかが自然に検査される。

```
.
├── pnpm-workspace.yaml
├── tsconfig.base.json     共有の compilerOptions
├── packages/
│   ├── core/              tatefude (依存ゼロ・素の DOM)
│   │   ├── LICENSE        Third-party code の表示を含む
│   │   ├── src/ test/ vitest.config.ts tsdown.config.ts
│   └── react/             tatefude-react (React アダプタ)
│       └── src/           useEditor / useEditorState / EditorContent
└── demo/                  利用側
    ├── index.html
    ├── package.json / vite.config.ts / tsconfig.json
    └── src/
        ├── main.tsx       エントリ (BrowserRouter)
        ├── App.tsx        ヘッダ + ルート定義
        ├── global.css     ページ全体と、ライブラリが描くクラスへの指定
        ├── pages/         ルート 1 つにコンポーネント 1 つ
        ├── components/    ページが共有するもの (EditorPage / Toolbar / DebugPanel)
        └── editors/       エディタ 1 つに 1 ディレクトリ
```

React から使う場合は view のライフサイクルと購読を hook が持つ。

```tsx
const editor = useEditor({ config: [basicSchema(), history()], doc }, [id]);
// 読む範囲を selector で決めるので、関係ないキー入力では再描画されない
const canUndo = useEditorState(editor, (state) => undoDepth(state) > 0);

<EditorContent editor={editor} />;
```

デモの見た目は **CSS Module** (`*.module.css`)。ただし `.tf-editor` や `[data-tf-*]`、
スキーマの Shape が付けるクラスはライブラリ側の名前なので、ハッシュ化すると当たらない。
それらへの指定は `global.css` か、モジュール内の `:global()` に置く。基底は `:where()` で
詳細度を持たせないので、エディタ固有の書式が注入順に関係なく勝つ。
エディタ固有の書式は各エディタが `className` として自分で持つ。

Vite はリンク先を prebundle せず `src/*.ts` を個別に配信するので、本体を書き換えると
デモに HMR で届く。

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
| Enter | `keydown` → 分割 + 新ブロックへ focus |
| Mod-b / Mod-i | `keydown` |
| undo / redo | `keydown` (Mod-z / Mod-Shift-z / Mod-y)。メニューからの取り消しは `beforeinput` の historyUndo |
| ブロック内のキャレット移動・選択 | ネイティブ (要素が editable なので) |
| ブロック境界を跨ぐ矢印キー移動 | `keydown` で端を判定して隣のブロックへ focus |
| ブロックを跨ぐドラッグ選択 | `mousedown` + `mousemove` を自前で追う |
| 選択の描画 | ネイティブの選択は透明にして CSS Custom Highlight で塗る |

`keydown` (`input/keymap.ts`) が主で、`beforeinput` (`input/beforeinput.ts`) が受け皿。
編集の意図はまず keydown で捕まえて preventDefault し、そこで拾えなかったものを
beforeinput が受ける。Backspace / Delete だけは keydown で見ない — 握り潰すと
ブロックの内側の削除まで EditContext から奪ってしまうので、境界かどうかを判定できる
beforeinput の側で見る。

同じ意図を両方に書くことはしない。keymap に割り当てがあるものは keymap だけ、
beforeinput にあるのは「キーの割り当てが OS ごとに違うので意図でしか受けられないもの」
(macOS の Ctrl-H / Ctrl-D / Ctrl-O など) だけ。取り消しだけは例外で、メニューや
右クリックからキーを伴わずに飛んでくるので両方で受ける。

矢印キーの軸は書字方向で入れ替わる (縦書きでは上下が行の中、左右が行の跨ぎ)。
`writing-mode` を読んで論理方向に直してから判定している。

## 今できること (M0)

- 段落 + `Strong` / `Bouten` (傍点。属性で描くマーク)
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
- `Mod-b` (太字) / `Mod-i` (傍点)。日本語組版の強調は傍点なので、`<em>` のイタリックは持たない
- undo / redo (`Mod-z` / `Mod-Shift-z` / `Mod-y`)。`history()` を config に足すと有効
- 選択をインラインブロックで包む。ルビは `wrapInRuby` (親文字を選ぶと読みが空で作られ、
  キャレットがその中に入る)、縦中横は `wrapInTcy`。デモのツールバー
- 縦書き (`writing-mode: vertical-rl`)。デモの上部で切り替えられる
- デモのデバッグパネル (doc / 各ブロックのバッファ / イベント列)

塗りは Highlight を 2 つに分けてあるので、それぞれ別に指定できる。

```css
/* 選択 */
::highlight(tf-selection) { background-color: #b4d5fe; color: inherit; }

/* キャレットがインラインブロック (ルビの rb / rt) の中にいる印 */
::highlight(tf-inline-active) { background-color: #ffe9a8; }
```

`rb` / `rt` の中身と、その外側の端は画面上の同じ点なので、キャレットだけでは
どちらにいるか見えない。中にいるときは囲んでいるインラインブロックを塗って見せている。

## まだ無いもの

- コピー & ペースト、node view、テーブル、共同編集
- Shift + クリックでの範囲拡張、ダブル / トリプルクリックのブロック跨ぎ、
  タッチ・ペンでの選択 (ドラッグは `mousedown` 系しか見ていない)
- ネスト構造 (リスト、引用)。ブロックが入れ子になるとフォーカス管理の設計が増える
- Safari / Firefox 向けの contenteditable フォールバック
- モバイル (Android / iOS のソフトキーボード)
