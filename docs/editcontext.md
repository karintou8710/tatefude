# EditContext の挙動メモ

Chromium のソースから読み取ったことと、実機で確かめたこと。
出典は `third_party/blink/renderer/` からの相対パス + 行番号 (2026-08 時点のソース)。

---

## ソースから確認したこと

### どの要素に attach できるか

`core/dom/element.cc:6569 Element::setEditContext`

```cpp
// Step 1: If this's local name is neither a valid shadow host name nor
// "canvas", then throw a "NotSupportedError" DOMException.
if (!(IsCustomElement() && CustomElement::IsValidName(local_name)) &&
    !IsValidShadowHostName(local_name) &&
    local_name != html_names::kCanvasTag) { ... }
```

- valid shadow host name (div / span / section / p / h1..h6 / article / aside / main / nav 等)、
  canvas、custom element のみ
- 1 つの EditContext を 2 つの要素に付けることはできない
  (`EditContextAssignmentAsPerSpec`)。インスタンスを複数作るのは自由

### attach すると要素は editable になる

`core/css/resolver/style_adjuster.cc:397 StyleAdjuster::AdjustStyleForEditing`

```cpp
if (element && element->editContext()) {
  // ... should become editable and should have -webkit-user-modify set to
  // read-write. This overrides any other values that have been specified
  // for contenteditable or -webkit-user-modify on that element.
  builder.SetUserModify(EUserModify::kReadWrite);
}
```

→ キャレット描画・クリックでのキャレット配置・ブロック内の選択はブラウザがやる。
`contenteditable` 属性は付けない。

### 入力の振り分け

`core/editing/commands/editor_command.cc:2168` (EditContext が active なときの分岐)

| 種類 | コマンド | 挙動 |
| --- | --- | --- |
| 1 | ToggleBold / ToggleItalic / ToggleUnderline / InsertTab / InsertBacktab / InsertNewline / InsertLineBreak | **beforeinput のみ**。EditContext は何もしない |
| 2 | DeleteBackward / DeleteForward / DeleteWordBackward / DeleteWordForward | beforeinput + EditContext がバッファを書き換えて textupdate |
| 3 | それ以外 (キャレット移動など) | beforeinput + DOM の既定動作 |

文字入力は `core/editing/editor_key_bindings.cc:84` で EditContext にリダイレクトされる。

```cpp
// If EditContext is active, redirect text to EditContext, otherwise, send
// text to the focused element.
if (auto* edit_context = ...GetActiveEditContext()) {
  if (DispatchBeforeInputInsertText(...) != kNotCanceled) return true;
  edit_context->InsertText(text);
}
```

### 削除の境界計算は EditContext がやる

`core/editing/ime/edit_context.cc:628` 付近

- `DeleteBackward` は grapheme 境界 (`BackwardGraphemeBoundaryStateMachine`)
- `DeleteWordBackward` は単語境界 (`FindNextWordBackward`)
- どちらも「選択が空でなければ選択を消す」に落ちる (`DeleteCurrentSelection`)
- **バッファの端では何も起きない**。ブロック先頭の Backspace は textupdate を生まない

### フォーカスが移ると未確定文字列は確定される

`core/editing/ime/edit_context.cc:191 EditContext::Focus`

```cpp
EditContext* current_active_edit_context = ...GetActiveEditContext();
if (current_active_edit_context && current_active_edit_context != this) {
  current_active_edit_context->FinishComposingText(kKeepSelection);
}
```

`Blur()` でも同じく `FinishComposingText`。

### getTargetRanges は使えない

`core/editing/commands/editor_command.cc:230`

```cpp
// Due to interoperability differences in getTargetRanges() when deleting
// content, we do not provide these ranges for EditContext. Developers are
// expected to compute the ranges themselves based on selection position.
```

### イベントの形

`core/editing/ime/*.idl`

```webidl
TextUpdateEvent            { updateRangeStart, updateRangeEnd, text, selectionStart, selectionEnd }
TextFormatUpdateEvent      { getTextFormats(): TextFormat[] }
TextFormat                 { rangeStart, rangeEnd, underlineStyle, underlineThickness }
CharacterBoundsUpdateEvent { rangeStart, rangeEnd }
EditContextInit            { text, selectionStart, selectionEnd }
```

- `UnderlineStyle`: none / solid / dotted / dashed / wavy
- `UnderlineThickness`: none / thin / thick
- オフセットは UTF-16 code unit

---

## 実機で確かめたこと

Chrome 148 (Electron 42) / macOS。`pnpm dev` のデモを操作して確認した。

### 1. ブロックを跨ぐ選択 — Range は跨げる。描画と toString だけが丸められる **(重要)**

隣り合う 2 要素に対して `setBaseAndExtent(A.text, 3, B.text, 6)` を実行して比較した。

| 隣り合う 2 つの p | anchor/focus | Range (getRangeAt(0)) | 描かれるハイライト | selection.toString() |
| --- | --- | --- | --- | --- |
| EditContext を張ったもの | 保持される | **跨ぐ** | **A の中だけ** | A の中だけ |
| contenteditable なもの | 保持される | **跨ぐ** | **A の中だけ** | A の中だけ |
| ただの p (編集不可) | 保持される | 跨ぐ | 跨ぐ | 跨ぐ |

ユーザーのドラッグ (block0 の途中 → block1 の途中) では、focus が
**block0 の末尾に寄せられる**。

```
結果: { anchorBlock: 0, anchorOffset: 8, focusBlock: 0, focusOffset: 25 (= 末尾) }
```

原因は `core/editing/visible_selection.cc:88` → `core/editing/selection_adjuster.cc:748`
`SelectionAdjuster::AdjustSelectionToAvoidCrossingEditingBoundaries`。
`IsEditable()` が切り替わるところで "root boundary element" (RBE) を切り、
anchor の RBE の外に focus があると

```cpp
if (selection.IsAnchorFirst())
  return PositionTemplate<Strategy>::LastPositionInNode(anchor_rbe);
return PositionTemplate<Strategy>::FirstPositionInNode(anchor_rbe);
```

と anchor 側の編集ホストの端に寄せる。VisibleSelection を作るときの調整なので、
DOM の Selection オブジェクトそのものは調整されない。描画 (LayoutSelection) と
`selection.toString()` が VisibleSelection 側を見ているので、そこだけ丸まる。

**EditContext 固有の制約ではない**。上の表のとおり隣接 contenteditable でも同じで、
EditContext が `-webkit-user-modify: read-write` を強制する
(`style_adjuster.cc:397`) 結果として同じ土俵に乗っているだけ。

→ 跨ぐ選択は「モデルとして持てる」「DOM Range としても持てる」「ブラウザが描いてくれない」。
描画は **CSS Custom Highlight API** で解決できることを実機で確認した。

```js
CSS.highlights.set("ecw-selection", new Highlight(range));
// ::highlight(ecw-selection) { background-color: ...; color: ...; }
```

EditContext を張った 2 ブロックを跨いでハイライトされる (2 行分の rect が塗られる)。
オーバーレイ要素も、Notion 型のブロック選択表示への切り替えも要らない。

この方式で実装済み (`view/selection-highlight.ts` + `input/pointer.ts`)。
実際にブロックを跨いでドラッグしたときの状態:

```
model の選択      : { anchor: 13, head: 39 }          ← ブロック 0 → 1 を跨ぐ
DOM の選択        : block0 の 12..25 (末尾で丸められている)
CSS.highlights    : [ block0 "で動くエディタの雛形です。", block1 "日本語を入力すると 変" ]
各 EditContext    : #0 sel=[12, 25] / #1 sel=[0, 11]  ← ブロックごとに切り出したもの
```

ブロック 1 には DOM の選択が届いていないのに塗られている = 描いているのは Highlight。

### 2. Enter は beforeinput(insertParagraph) としてブロック要素に飛ぶ

`{ inputType: "insertParagraph", target: "P", cancelable: true }`。
preventDefault すれば EditContext 側は何もしない。

### 3. 変換中のイベント順

実際に IME 変換が起きたときのログ (デモのイベントパネル)。

```
compositionstart {}
textupdate            {"range":[0,0],"text":"¥","selection":[1,1]}
textformatupdate      [[0,1,"solid","thin"]]
characterboundsupdate {"range":[0,1]}
textupdate            {"range":[0,1],"text":"","selection":[0,0]}
textformatupdate      []
compositionend {}
```

→ textupdate → textformatupdate → characterboundsupdate の順。
textformatupdate が来た時点で、変換文字列はもう doc に入っている。

### 4. selectionchange は非同期

自分で DOM の選択を書いている間だけフラグを立てても、`selectionchange` は
タスクとして後から飛ぶので守れない。実際の防御は
「読み取った選択が model と同じなら何もしない」という等価判定のほう
(`view/view.ts` の `onSelectionChange`)。

### 5. 自動化ツールのキーイベントには注意

CDP 経由で合成したキーは `keyCode: 0` / `code: ""` になることがあり、
その場合 Blink が編集コマンドに落とさないので beforeinput が飛ばない。
`event.key` だけ見る自前のハンドラ (矢印キーの境界移動) は動くのに、
Enter や Backspace は無反応、という食い違いが起きる。
ブラウザテストで Enter / Backspace を試すときは、beforeinput を直接
dispatch するか、CDP に正しい `windowsVirtualKeyCode` を渡すこと。
