# tatefude

EditContext API を土台にした、[Wordgard](https://wordgard.net/) ライクな RTE ライブラリの雛形。
モデルと構成の仕組みは Wordgard を踏襲し、土台だけ contenteditable から EditContext に
差し替える。**contenteditable の DOM 監視・修復を一切持たない**ことが設計上の主張。

contenteditable を土台にしたエディタは、view 層のコードの多くが「ブラウザが DOM を壊した
後の復元」(DOM の監視、読み戻し、IME のワークアラウンド) に費やされる。EditContext なら
DOM がブラウザに書き換えられないので、view は `(doc, selection, decorations) → DOM` の
描画関数になる。代わりに、EditContext を**ブロックごとに張る**帰結として、ブロックを跨ぐ
操作 (選択・削除・矢印移動と、その描画) が全部自前になる。縦書き・ルビ・傍点への対応も
入力層と表示層が持つ。

Chromium 121+ 専用。Safari / Firefox には EditContext の実装が無い。

- デモ: <https://karintou8710.github.io/tatefude/>
- 設計: [docs/design.md](docs/design.md)
- EditContext の挙動メモ (Blink のソース + 実機で確かめたこと): [docs/editcontext.md](docs/editcontext.md)

## 使う

```ts
const state = EditorState.create({
  config: [basicSchema(), history()],
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

React は `tatefude-react` が view のライフサイクルと購読を持つ。

```tsx
const editor = useEditor({ config: [basicSchema(), history()], doc }, [id]);
// 読む範囲を selector で決めるので、関係ないキー入力では再描画されない
const canUndo = useEditorState(editor, (state) => undoDepth(state) > 0);

<EditorContent editor={editor} />;
```

**選択はネイティブではなく CSS Custom Highlight で塗る。** ネイティブの選択描画は
編集ホスト = 1 ブロックの境界で丸められるので、透明にして model の選択を塗り直している。
既定はシステムの選択色なので指定は要らない。変えたいときは上書きする。

```css
/* 選択 */
::highlight(tf-selection) { background-color: #b4d5fe; color: inherit; }

/* キャレットがインラインブロック (ルビの rb / rt) の中にいる印。
   中身と外側の端は画面上の同じ点なので、キャレットだけでは区別が付かない */
::highlight(tf-inline-active) { background-color: #ffe9a8; }
```

## 開発

```bash
pnpm install
pnpm dev          # デモ http://localhost:5180 (PORT=xxxx で上書きできる)
pnpm test         # model / transform / 写像 (node)
pnpm test:browser # view / EditContext (Chromium 実機)
pnpm typecheck    # 全パッケージ + デモ
pnpm build        # packages/*/dist
pnpm lint
```

ブラウザテストの初回は `pnpm exec playwright install chromium` が要る。

pnpm workspace。`packages/core` (`tatefude`、依存ゼロ・素の DOM) と `packages/react`
(`tatefude-react`) が公開するもので、`demo/` は**それを名前で import する利用側**。
相対パスで `src/` の奥に入れないので、公開 API だけで組めているかが自然に検査される。

## まだ無いもの

- コピー & ペースト、node view、テーブル、リスト、共同編集
- Shift + クリックでの範囲拡張、タッチ・ペンでの選択
  (ドラッグは `mousedown` 系しか見ていない)
- Safari / Firefox 向けの contenteditable フォールバック
- モバイル (Android / iOS のソフトキーボード)

## Acknowledgements

`packages/core/src/doc/` と undo / redo は [Wordgard](https://wordgard.net/) (MIT) から
**派生**しています。ドキュメントモデル、構成の仕組み (facet / extension / annotation /
effect / correction)、変更の表現 (ChangeSet / Slice / Token / fit) がそれで、元をたどると
[CodeMirror 6](https://codemirror.net/) の設計です。著作権表示と対象ファイルの一覧は
[packages/core/LICENSE](packages/core/LICENSE) の "Third-party code" を参照してください。

入力層と表示層 (`ime/` `input/` `view/`) は独自の実装です。

Wordgard プロジェクトとは無関係で、その承認も受けていません。
