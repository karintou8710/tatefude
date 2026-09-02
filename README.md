# tatefude

[English](README.en.md)

**ルビ・傍点・縦中横が使える縦書きの WYSIWYG エディタ**を作るための RTE ライブラリ。  
contenteditable ではなく EditContext API を土台にする。

- デモ: <https://demo.tatefude.com>

Chromium 121+ 専用。  
Safari / Firefox には EditContext の実装が無い。

## 設計

**ルビのために EditContext を選んだ。**  
contenteditable では、IME で変換している間の DOM はブラウザに任せるしかない。  
ルビは特殊なレイアウトなので、ここでバグを踏みやすい。  
EditContext ならブラウザが DOM を書き換えないから、**MutationObserver で見張って壊れたところを戻す仕事がまるごと消える**。

おかげで view は `(doc, selection, decorations) → DOM` の描画関数で済む。  
代わりに EditContext はブロックごとに張るので、ブロックを跨ぐ操作 (選択・削除・矢印移動) と縦組みの表示は自前で書く。

## 使う

```ts
const state = EditorState.create({
  config: [basicSchema(), history()],
  doc: (schema) => schema.doc([...]),
});

// 置き場を渡すと、その中に描いて入力を受け取りはじめる
const view = new EditorView(document.getElementById("editor")!, { state });
view.focus();

// コマンドは「どう更新したいか」を返すだけ。run が実行して焦点を戻す
const splitBlock: Command = (state) => ({
  changes: { from, to, insert: [Close, tag], fit: true },
  selection: (doc, changes) => Selection.near(doc, changes.mapPos(to, 1)),
  userEvent: "input.split",
});
view.run(splitBlock);
```

React なら `tatefude-react` が view の作り直しと購読を持つ。

```tsx
const editor = useEditor({ config: [basicSchema(), history()], doc }, [id]);
// 読む範囲を selector で決めるので、関係ないキー入力では再描画されない
const canUndo = useEditorState(editor, (state) => undoDepth(state) > 0);

<EditorContent editor={editor} />;
```

選択はネイティブではなく CSS Custom Highlight で塗る。  
既定はシステムの選択色なので、変えたいときだけ書く。

```css
::highlight(tf-selection) { background-color: #b4d5fe; color: inherit; }

/* キャレットがインラインブロック (ルビの rb / rt) の中にいる印 */
::highlight(tf-inline-active) { background-color: #ffe9a8; }
```

## 開発

```bash
pnpm install
pnpm dev          # デモ http://localhost:5180
pnpm test         # model (node)
pnpm test:browser # view / EditContext (Chromium 実機)
pnpm typecheck
pnpm build
pnpm lint
```

ブラウザテストの初回は `pnpm exec playwright install chromium` が要る。

## まだ無いもの

- コピー & ペースト、node view、テーブル、リスト、共同編集
- Shift + クリックでの範囲拡張、タッチ・ペンでの選択
- Safari / Firefox 向けのフォールバック、モバイル

## Acknowledgements

`packages/core/src/doc/` と undo / redo は [Wordgard](https://wordgard.net/) (MIT) からの**派生**です (元をたどると [CodeMirror 6](https://codemirror.net/) の設計)。  
対象ファイルは [packages/core/LICENSE](packages/core/LICENSE) の "Third-party code" に。

入力層と表示層 (`ime/` `input/` `view/`) は独自の実装です。  
Wordgard プロジェクトとは無関係で、その承認も受けていません。
