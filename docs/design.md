# editcontext-wysiwyg 雛形設計

EditContext API を土台にした ProseMirror ライクな RTE ライブラリ。
contenteditable の DOM 監視・修復を一切持たないことが設計上の主張。

決定事項:

- ランタイム依存ゼロのフルスクラッチ。**モデルと構成の仕組みは Wordgard の設計に学ぶ**
  (doc は Plot / Leaf / Tag / Shape / Query ベースの Schema、state は facet / extension。
  コードは共有していない)。変更の表現だけ ProseMirror 寄りのステップ列 (§10, §11)
- **EditContext はブロック要素ごとに 1 つ**。各ブロックのバッファはそのブロックの全文を持ち、
  全ブロック分を常に保持する
- M0 の範囲は §6

---

## 0. 前提: EditContext がやること／やらないこと

Chromium のソース (`third_party/blink/renderer/core/editing/ime/edit_context.cc`,
`core/dom/element.cc`, `core/css/resolver/style_adjuster.cc`,
`core/editing/commands/editor_command.cc`) で確認した挙動。

### attach

```js
const ec = new EditContext({ text: "", selectionStart: 0, selectionEnd: 0 });
p.editContext = ec;
```

- attach できる要素は「valid shadow host name の要素 (div/span/section/p など)」「canvas」
  「custom element」のみ。それ以外は `NotSupportedError`。
- 1 つの EditContext を複数要素に付けることはできない (`EditContextAssignmentAsPerSpec`)。
  逆に、EditContext のインスタンスを複数作ることには制限がない。
- attach すると `-webkit-user-modify: read-write` が強制される
  (`StyleAdjuster::AdjustStyleForEditing`)。つまり **要素は editable 扱いになり、
  キャレット描画・マウス選択・矢印キー移動はブラウザがネイティブにやる**。
  一方で **文字入力で DOM が書き換わることはない**。`contenteditable` は付けない。
- **アクティブな EditContext はフォーカスで決まる**。`EditContext::Focus()` は、
  直前にアクティブだった EditContext に対して `FinishComposingText()` を呼ぶ。
  つまり変換中に別ブロックへフォーカスが移ると、未確定文字列は自動的に確定される。

### 入力がどう届くか (`EditorCommand::Execute` の分岐がそのまま契約)

| 操作 | 届き方 | ライブラリ側の責務 |
| --- | --- | --- |
| 文字入力・IME 変換 | `beforeinput` → EditContext がバッファを書き換え → `textupdate` | textupdate をトランザクションに変換 |
| Backspace / Delete / 単語削除 | `beforeinput` → `EditContext::DeleteBackward()` 等 → `textupdate` | 同上。**keymap で二重処理しないこと** |
| Enter / Tab / Ctrl+B,I,U | `beforeinput` **のみ**。EditContext は何もしない | 自前でコマンドを実行し、doc を更新して EC に push |
| 矢印キー・クリック等の移動 | `beforeinput` + ネイティブの DOM selection 移動 | `selectionchange` から model selection を復元 |

- 削除は EditContext 側が grapheme / 単語境界を計算してから `textupdate` を投げる
  (`FindNextBoundaryOffset`, `FindNextWordBackward`)。境界計算を自前で持たなくてよい。
- ただし **バッファの端では EditContext は何もしない**。ブロック先頭での Backspace は
  削除対象がないので `textupdate` が飛ばない。ブロック結合は自前で実装する (§3)。
- `beforeinput` を preventDefault すると EditContext 側の処理は走らない (乗っ取り可能)。
- EditContext 配下では `getTargetRanges()` は空 (意図的)。範囲は自分で計算する。

### イベントのペイロード

```webidl
TextUpdateEvent            { updateRangeStart, updateRangeEnd, text, selectionStart, selectionEnd }
TextFormatUpdateEvent      { getTextFormats(): TextFormat[] }
TextFormat                 { rangeStart, rangeEnd, underlineStyle, underlineThickness }
                           // UnderlineStyle: none|solid|dotted|dashed|wavy
                           // UnderlineThickness: none|thin|thick
CharacterBoundsUpdateEvent { rangeStart, rangeEnd }
```

こちらから押し込む API: `updateText(start, end, text)` / `updateSelection(start, end)` /
`updateControlBounds(rect)` / `updateSelectionBounds(rect)` / `updateCharacterBounds(start, rects[])`。

オフセットは全て **UTF-16 code unit** (JS 文字列と一致)。

### 対応ブラウザ

Chromium 121+ のみ。Safari / Firefox 未実装。雛形は Chromium 専用で作り、
contenteditable フォールバックは非スコープ。

---

## 1. 設計の主張

ProseMirror の view 層はコードの多くが「ブラウザが DOM を壊した後の復元」
(DOMObserver / readDOMChange / composition のワークアラウンド) に費やされている。
EditContext では DOM が書き換わらないので、

- **view は `(doc, selection, decorations) → DOM` の純粋な描画関数になる**
- **入力はフラットテキストバッファ上の構造化された差分として届く**

代わりに引き受けるものが 2 つある。

1. ツリー上の位置空間 (doc position) と、EditContext のフラットな文字列空間 (text offset)
   の双方向の写像
2. ブロックごとに EditContext を張ることの帰結として、**ブロックを跨ぐ操作は全部自前**

雛形はこの 2 つをそれぞれ独立したモジュール (`ime/`, `input/boundary.ts`) に切り出す。

---

## 2. ブロックごとの EditContext

```
doc                             DOM                        EditContext
├ paragraph "あいう"      →     <p> あいう </p>      ←→     EC("あいう")
├ paragraph "えお"        →     <p> えお </p>        ←→     EC("えお")
└ paragraph ""            →     <p> </p>             ←→     EC("")
                                                            ↑ フォーカス中のものだけがアクティブ
```

- 全ブロックに EditContext を作って attach し、そのブロックの全文をバッファに持つ。
  非アクティブなブロックのバッファも state 更新に追従させる (フォーカス移動の瞬間に
  作り直すと、その時点の doc と IME の見るテキストがずれる余地が生まれるため)。
- 全ブロックを editable にしておくことで、**クリックでのキャレット配置、ブロック内の
  ドラッグ選択、行内の矢印キー移動はブラウザのネイティブ挙動がそのまま使える**。
- アクティブな EditContext = フォーカス中のブロックの EditContext。
  ブロックを跨ぐキャレット移動は `el.focus()` によるフォーカス移動を伴う。

### この構成の対価と見返り

| | |
| --- | --- |
| 見返り | バッファがブロック単位に閉じるので、IME が見るテキスト・単語境界・再変換の範囲が段落と一致する。写像がブロックローカルになり単純。巨大ドキュメントでもバッファ更新は O(ブロック長) |
| 対価 | ブロック結合 / 分割 / 跨ぎ移動 / 跨ぎ選択 / 跨ぎ削除を全部自前で書く。フォーカス管理が常に付きまとう |

doc 全文を 1 つの EditContext に載せる案では、ブロック境界を `"\n"` に写すことで
結合や分割が「改行の削除・挿入」として無料で手に入る。ブロック単位ではそれが手に入らない
代わりに、IME の見る世界が段落に閉じる。後者を採る。

### 位置の写像

ブロックローカルなオフセットと doc の位置を写す。

```ts
class TextblockMap {
  readonly blockFrom: number;   // ブロックの開きトークンの位置
  readonly text: string;        // EditContext に載せる文字列
  posToOffset(pos: number): number;
  offsetToPos(offset: number): number;
}

function buildTextblockMap(block: Plot, blockFrom: number): TextblockMap;
```

構築規則:

| ブロック内の要素 | フラット化 |
| --- | --- |
| テキストノード | そのままの文字列 |
| インラインの atom (画像等) | `"￼"` (OBJECT REPLACEMENT CHARACTER) 1 文字 |
| ハードブレーク | `"\n"` 1 文字 (M1) |

マークはフラット文字列に影響しない (装飾はテキストの見た目だけを変える)。
内部表現はセグメント配列 `{ docFrom, docTo, offset, length }[]` + 二分探索。
インライン要素が 1 つだけのブロックでは単純な加算に縮退する。

---

## 3. 責務分担: どの入力を誰が処理するか

これが per-block 構成の設計の中心。

| 操作 | 処理経路 |
| --- | --- |
| ブロック内の文字入力・IME 変換 | EditContext → `textupdate` → トランザクション |
| ブロック内の Backspace / Delete / 単語削除 | 同上 (境界計算は EditContext 任せ) |
| **ブロック先頭での Backspace** | EditContext は無反応。`beforeinput` の `deleteContentBackward` を検知し、直前ブロックとの結合コマンドを実行 |
| **ブロック末尾での Delete** | 同様に `deleteContentForward` → 次ブロックとの結合 |
| **選択がブロックを跨ぐ状態での削除・入力** | `beforeinput` で乗っ取り、自前で範囲削除してから挿入 |
| Enter | `beforeinput` の `insertParagraph`。ブロック分割 → 新ブロックの EC を作り `focus()` |
| Mod-b / Mod-i | `beforeinput` の `formatBold` / `formatItalic`、または keymap |
| ブロック内のキャレット移動・選択 | ネイティブ。`selectionchange` で model に取り込む |
| **ブロック境界を跨ぐ矢印キー移動** | `keydown` で「キャレットがブロックの端にいるか」を判定し、隣接ブロックへ `focus()` + キャレット設定 |
| **ブロックを跨ぐドラッグ選択** | `mousedown` + `mousemove` を自前で追う (`input/pointer.ts`)。跨いだ瞬間だけ主導権を取り、DOM の選択との同期を止める |
| **選択の描画** | ネイティブの選択描画は透明にして、model の選択を CSS Custom Highlight API で塗る (`view/selection-highlight.ts`) |

「ブロックの端にいるか」の判定は、行頭・行末 (ArrowUp/Down における視覚行) を含むので
`coords.ts` の矩形計算に依存する。ここは実装が濁りやすいので、判定を
`isAtBlockBoundary(view, direction): boolean` の 1 関数に閉じ込める。

### データフロー

```
   OS / IME
      │
      ▼
 ┌──────────────────┐  textupdate(range, text, sel)
 │ EditContext (対象 │ ─────────────────────────────┐
 │ ブロックのもの)    │                              │
 └──────────────────┘                              ▼
      ▲                                     ┌──────────────┐
      │ updateText / updateSelection         │  ime/bridge  │ blockOffset → docPos
      │ updateSelectionBounds                └──────────────┘
      │ updateCharacterBounds                       │
      │                                             ▼
      │                                     ┌──────────────┐
      │                                     │   commands   │ Transaction 組み立て
      │                                     └──────────────┘
      │                                             │
      │                                             ▼
      │                                     ┌──────────────┐
      └─────────────────────────────────────│ EditorState  │
                                            └──────────────┘
                                                    │ apply
                                                    ▼
   keydown / beforeinput ────────────────────┌──────────────┐
   (Enter, 境界の Backspace, 境界の矢印) ──▶ │     view     │ 描画 + focus + DOM Selection
   selectionchange ─────────────────────────▶└──────────────┘
```

### 不変条件

**doc が唯一の真実。各 EditContext のバッファは対応するブロックの射影であり、
state 更新のたびに強制的に再同期する。**

EditContext は `textupdate` を投げる前に自分のバッファを書き換え済みである。
こちらがその変更をそのまま受け入れなかった場合 (スキーマ違反で拒否した、別の形に変換した)
はバッファと doc が食い違う。そこで state 更新後に、変更のあったブロックについて

```ts
sync(prevBlockText, nextBlockText)  // 共通の前後を削って 1 回の updateText に畳む
```

を行う。差分がなければ何もしない。IME 変換中は「そのまま受理」が普通なので差分ゼロになり、
変換中に `updateText` を叩いて IME を混乱させる事故も同時に防げる。

### textupdate の処理

```ts
onTextUpdate(block: BlockHandle, e: TextUpdateEvent) {
  const bt = block.text;                       // 変更前の写像
  const from = bt.offsetToPos(e.updateRangeStart);
  const to   = bt.offsetToPos(e.updateRangeEnd);

  const tr = view.state.tr.replaceWithText(from, to, e.text);
  // 選択は「変更後」のオフセット空間なので、tr.doc から作った写像で解く
  const next = buildBlockText(tr.doc.nodeAt(block.from)!, block.from);
  tr.setSelection(TextSelection.create(
    tr.doc,
    next.offsetToPos(e.selectionStart),
    next.offsetToPos(e.selectionEnd),
  ));
  tr.setMeta(compositionKey, block.composing);  // 履歴のまとめに使う
  view.dispatch(tr);
}
```

### IME 変換中の表示

変換文字列は **doc に直接入れる** (ProseMirror と同じ)。
下線は doc のマークではなく **decoration** として描く。

- `textformatupdate` → `TextFormat[]` を offset → pos に写して inline decoration 化
- `compositionstart` / `compositionend` で decoration の生存期間を管理
- 変換中のトランザクションは `setMeta(compositionKey, true)` を付け、
  history プラグインが 1 ステップにまとめる

装飾の仕組みは IME に必須なので、雛形の時点で decoration を入れる。
なお変換中にフォーカスが別ブロックへ移ると Blink 側が `FinishComposingText()` を呼ぶため、
`compositionend` を受けてから移動処理を進める順序にする。

### 座標系 (IME 候補ウィンドウの位置)

- `updateControlBounds` = **そのブロック要素**の `getBoundingClientRect()`
- `updateSelectionBounds` = キャレット / 選択の矩形
- `characterboundsupdate` → `[rangeStart, rangeEnd)` の **1 文字ずつの矩形**を返す。
  offset → pos → DOM Range → `getClientRects()` で計算する

縦書き・ルビのような特殊レイアウトで候補ウィンドウが正しく出るかは、
ここの実装品質がそのまま出る。デバッグ用に矩形をオーバーレイ描画する開発モードを用意する。

### 選択の同期

- **model → DOM**: 描画のたびに、対象ブロックへ `focus()` してから
  `selection.setBaseAndExtent()` を設定する。キャレットはブラウザが描く。
- **DOM → model**: `document` の `selectionchange` を購読し、DOM 位置 → doc 位置に写して
  model selection を更新する。
- 自分で書いた selection / focus によるイベントは無視する (ガードフラグ)。
  ただし `selectionchange` は非同期に飛ぶのでフラグだけでは守れない。実際の防御は
  「読み取った選択が model と同じなら何もしない」という等価判定のほう。

### 選択の描画

ブラウザが描く選択は編集ホストの境界で丸められるので、ブロックを跨ぐ選択は
ネイティブには描けない (§7-1)。そこで

- エディタの中では `::selection { background-color: transparent }` でネイティブの
  選択描画を消す
- model の選択をブロックごとの `Range` にして **CSS Custom Highlight API** に登録する
  (`CSS.highlights.set("ecw-selection", ...)`)。Highlight はブロックを跨いで塗られる
- 色は既定でシステムの選択色 (`Highlight` / `HighlightText`)。
  `::highlight(ecw-selection)` を上書きすれば変えられる

キャレット (空の選択) はネイティブのままブラウザが描く。塗るのは範囲があるときだけ。

跨ぐ選択を作る側は `input/pointer.ts`。ブロックの中で完結するドラッグはブラウザに任せ、
跨いだ瞬間だけ `suppressSelectionSync` を立てて model の選択だけを進める。
DOM の選択は丸まったままになるが、見た目は Highlight が持っているので問題にならない。

---

## 4. ディレクトリ構成

```
editcontext-wysiwyg/
├── package.json            ESM only / 依存ゼロ / pnpm
├── tsconfig.json           strict
├── biome.json
├── vite.config.ts          demo 用
├── vitest.config.ts        node project + browser project
├── README.md
├── docs/
│   ├── design.md           このファイル
│   └── editcontext.md      Blink 実装から読み取った挙動メモ + 実機で確かめたこと
├── demo/
│   ├── index.html
│   ├── style.css
│   └── main.ts             エディタ + デバッグパネル
├── src/
│   ├── index.ts
│   ├── schema-basic.ts     doc / paragraph / text + strong / em
│   ├── doc/                ドキュメントモデルと変更 (Wordgard 由来・永続・不変)
│   │   ├── node.ts         Node = Plot | Leaf、Tag、Group / Role / Query
│   │   ├── mark.ts         Mark / Mark.Type (rank 順の集合)
│   │   ├── shape.ts        Elt と Shape (ノード・マークの DOM での姿)
│   │   ├── schema.ts       Schema.define / canContain / markAllowed / validate
│   │   ├── slice.ts        Slice / Token (ツリーをトークンの並びに線形化)
│   │   ├── change.ts       ChangeSet (変更 1 個。合成・逆・位置の写像)
│   │   ├── fit.ts          fitChange (木として成立する形に直す)
│   │   ├── pos.ts          Pos (解決済みの位置)
│   │   ├── textblock.ts    TextblockMap (ブロック → フラット文字列 + 写像)
│   │   └── error.ts        SchemaError / ValidationError
│   ├── state/              構成と状態 (Wordgard = CodeMirror 式)
│   │   ├── facet.ts        Facet / Field / Extension / Configuration
│   │   ├── state.ts        EditorState.create({config, doc}) / facet() / field()
│   │   ├── transaction.ts  Transaction / Annotation / extender
│   │   ├── correction.ts   ドキュメントの不変条件を守る仕組み
│   │   └── selection.ts    Selection (基底) / TextSelection / NodeSelection
│   ├── view/
│   │   ├── view.ts         EditorView: dispatch と更新ループ
│   │   ├── block-view.ts   ブロック 1 つ分の描画状態 (DOM とノードの対応)
│   │   ├── render.ts       doc → DOM (ノード参照の等価性で差分描画)
│   │   ├── decoration.ts   インライン装飾
│   │   ├── dom-selection.ts model selection ↔ DOM Selection + focus
│   │   ├── selection-highlight.ts 選択の描画 (CSS Custom Highlight)
│   │   └── coords.ts       DOM 位置 ↔ オフセット、矩形、行頭行末の判定
│   ├── ime/
│   │   ├── edit-context-api.ts EditContext の型と feature detection
│   │   ├── block-context.ts    1 ブロック分の EditContext の生成・同期・破棄
│   │   ├── manager.ts          ブロックと EditContext の対応付け + イベント処理
│   │   └── bounds.ts           control / selection / character の矩形計算
│   ├── input/
│   │   ├── beforeinput.ts  Enter / 境界削除 / フォーマットの inputType 経路
│   │   ├── keymap.ts       keydown → コマンド
│   │   ├── boundary.ts     ブロック境界の判定と跨ぎ移動
│   │   └── pointer.ts      ドラッグ選択 (ブロックを跨いだときだけ主導権を取る)
│   ├── commands/
│   │   └── base.ts         コマンド (状態を見て TransactionSpec を返す)
│   ├── view/extension.ts   view が読む facet (decorations / handleKeyDown / handleBeforeInput)
│   └── plugins/
│       ├── composition.ts  変換中の decoration (Field + Annotation)
│       └── history.ts      undo / redo (M1)
└── test/
    ├── model/*.test.ts     node 環境
    └── browser/*.test.ts   Chromium 実機
```

設計時から変えたところ:

- `TextblockMap` (旧 `block-text.ts`) は `ime/` ではなく `doc/` に置いた。DOM の選択を
  doc 位置に読み替えるときに view からも要るので、EditContext より下の層に居るべきだった
  (Wordgard は同じものを `state/textblock.ts` に置いている)
- ProseMirror の ViewDesc のような木は要らなかった。ブロック内の DOM 位置 ↔ オフセットは
  `Range.toString().length` と TreeWalker で計算できる (`view/coords.ts`)。
  ブロック単位でしか対応表を持たないので、これで足りる
- ステップは `ReplaceTextStep` / `SplitBlockStep` / `JoinBlockStep` / `MarkStep` の 4 つ。
  Slice を持たずに済ませているので、貼り付け (M1) で作り直しになるはず

層の依存方向は `model → transform → state → view → ime / input / commands` の一方向。
`ime/` が `view/` の座標計算と ViewDesc に依存するのは許すが、逆は禁止
(`view/` は EditContext の存在を知らない)。

---

## 5. 主要な型

```ts
// state/state.ts
class EditorState {
  readonly doc: Node;
  readonly selection: Selection;
  readonly plugins: Plugin[];
  get tr(): Transaction;
  apply(tr: Transaction): EditorState;
}

// view/view.ts
class EditorView {
  constructor(place: HTMLElement, props: {
    state: EditorState;
    dispatchTransaction?(tr: Transaction): void;
  });
  state: EditorState;
  dispatch(tr: Transaction): void;
  updateState(state: EditorState): void;
  destroy(): void;
}

// ime/manager.ts
class EditContextManager {
  constructor(view: EditorView);
  syncFromState(state: EditorState): void;
  destroy(): void;
}
// フォーカスの切り替えは view/dom-selection.ts の writeDOMSelection が
// キャレットのあるブロックへ focus() することで起きる (= active な EditContext が決まる)

// ime/block-context.ts
class BlockEditContext {
  readonly dom: HTMLElement;
  readonly ec: EditContext;
  from: number;                 // doc 上のブロック開始位置
  text: BlockText;
  composing: boolean;
  sync(next: BlockText, selection: { start: number; end: number } | null): void;
  destroy(): void;
}
```

`EditorView` は `EditContextManager` を内部で 1 つ保持する。
ユーザーが直接 EditContext を触ることは通常ない。

---

## 6. 雛形 (M0) のスコープ

**動くようにするもの**

- スキーマ: `doc / paragraph / text` + マーク `strong / em`
- ブロックごとの EditContext の生成・破棄・同期 (段落の追加削除に追従する)
- 日本語 IME での入力・変換・確定 (下線つき)、候補ウィンドウの位置が正しい
- ブロック内の Backspace / Delete (EditContext 経由)
- **ブロック先頭の Backspace / 末尾の Delete によるブロック結合** (自前)
- Enter によるブロック分割 + 新ブロックへのフォーカス移動
- マウス・矢印キーによる選択。**ブロック境界を跨ぐ矢印キー移動とドラッグ選択** (自前)
- 選択の描画 (ネイティブの選択は透明にして CSS Custom Highlight で塗る)
- `Mod-b` / `Mod-i` によるマークのトグル
- デバッグパネル: doc の JSON、各ブロックの EditContext バッファと選択、
  アクティブな EditContext、直近のイベント列

**やらないこと (M1 以降)**

- undo / redo、コピー&ペースト、node view、テーブル、共同編集
- Shift + クリックでの範囲拡張、ダブル / トリプルクリックの跨ぎ、タッチ・ペンでの選択
  (ドラッグは `mousedown` 系しか見ていない)
- ネスト構造 (リスト、引用) — ブロックが入れ子になるとフォーカス管理の設計が増える
- Safari / Firefox 向けの contenteditable フォールバック
- モバイル (Android / iOS のソフトキーボード)

---

## 7. 先に潰す不確実性 (spike)

per-block 構成の成否がここに乗っている。確認したことは `docs/editcontext.md` に記録する。

1. **隣接する EditContext 要素を跨ぐドラッグ選択** → **確認済み**。
   - DOM の Selection オブジェクトと Range は跨げる (`setBaseAndExtent` は保持される)
   - **ブラウザが描くハイライトと `selection.toString()` だけが編集ホストの境界で丸められる**
     (`AdjustSelectionToAvoidCrossingEditingBoundaries`)
   - ユーザーのドラッグでは focus が anchor 側のブロックの末尾に寄る
   - EditContext 固有ではない。隣接 contenteditable でも同じ挙動
   → **対応済み**。ドラッグは `input/pointer.ts` が自前で検知して model の選択を跨がせ、
   描画は `view/selection-highlight.ts` が CSS Custom Highlight API に Range を渡す。
   オーバーレイ要素は要らなかった
2. ブロック数が増えたとき (100 / 1000 段落) の attach コストとメモリ → 未確認
3. フォーカス移動時の `FinishComposingText` の実挙動 → 未確認
   (ソース上は確定されることを確認済み)
4. `updateControlBounds` をブロック要素の矩形にしたときの、macOS / Windows での
   候補ウィンドウの出方 → 未確認

---

## 8. 実装順序

1. `model` + `transform` + `state` の最小 (テキストと段落だけ、node テスト)
2. `view` の描画と DOM Selection 同期 (まだ入力は受けない、表示専用)
3. §7 の spike
4. `ime/block-text` と写像の単体テスト (先に固める)
5. `ime/block-context` + `manager` + `handlers` → ブロック内の直接入力と IME が動く
6. `input/beforeinput` + `boundary` → Enter / 境界の結合 / 跨ぎ移動
7. `decoration` + `composition` プラグイン → IME 変換の下線
8. `bounds` → 候補ウィンドウの位置
9. デモのデバッグパネル

---

## 9. ツールチェイン

| 用途 | 選択 |
| --- | --- |
| パッケージ管理 | pnpm |
| 言語 | TypeScript strict / ESM only / ランタイム依存ゼロ |
| デモ | Vite |
| Lint / Format | Biome |
| テスト (model, transform, block-text) | Vitest (node) |
| テスト (view, ime) | Vitest browser mode + Playwright Chromium |

IME のテストは CDP の `Input.imeSetComposition` を叩いて実際の変換経路を通す。
`textupdate` 経由で doc がどう変わるかを、変換開始・候補変更・確定の各段階で検証する。
フレームワーク非依存 (素の DOM) で作り、React アダプタは別パッケージとして後から足す。

---

## 10. ドキュメントモデル (Wordgard の設計に学ぶ)

`src/doc/` は [Wordgard](https://wordgard.net/) の doc パッケージの考え方をなぞっている
(設計から学んだだけで、コードは共有していない)。ProseMirror の
`Node` / `Fragment` / `NodeSpec` ではなく、次の語彙を使う。

| Wordgard の語彙 | 中身 |
| --- | --- |
| `Node = Plot \| Leaf` | 中身を持つ (Plot) か、持たない (Leaf) か。テキストは値が文字列の Leaf |
| `Tag` | 型 + パラメータ + マーク。**Leaf は自分がタグ、Plot はタグを持つ** |
| `Node.Type<Param>` | 型ごとにパラメータの型が付く (見出しのレベルなど)。`attrs` の袋ではない |
| `Mark.Type<Value>` | マークも型 + 値。集合は `rank` の昇順で正規化される |
| `Shape` | ノード・マークの DOM での姿。`{element: "p"}` / `{structure: p => Elt.mk(...)}` / マークは `{attribute: "style/text-emphasis", value: ...}` も書ける |
| `Node.Query` | 中身やマークの適用先の指定。型そのもの・`Node.Group`・配列 (和)・`{and: [...]}` (積) |
| `Schema.define([...])` | タグ・型・マークを 1 つの配列に混ぜて渡す。ドキュメント型はちょうど 1 つ |

ProseMirror との一番の違いは 2 つ。

**1. コンテンツ式ではなくクエリ。** `"paragraph block*"` のような文字列は無く、
グループの集合演算で書く。順序や個数の制約は表現できない代わりに、パーサが要らず、
型で組み立てられる。

```ts
export const Paragraph = Plot.define("Paragraph", {
  inlineContent: true,          // 中身はインライン。true なら何でも入る
  group: G.Content,             // doc の blockContent: G.Content に入れる資格
  defaultBlock: true,
  shape: { element: "p" },
});
```

**2. Shape が描画と (将来の) パースの両方を持つ。** `toDOM` / `parseDOM` に分かれていない。
マークを要素ではなく属性で描けるので、傍点 (`text-emphasis`) や縦中横のような
「要素を増やしたくない装飾」を素直に書ける。

```ts
export const EmphasisDots = Mark.define("EmphasisDots", {
  rank: 43,
  spanning: true,
  shape: { attribute: "style/text-emphasis", value: "filled sesame" },
});
```

### 検査が実際に走る

`Schema.validate(node)` が再帰的に

- タグの型がスキーマにあるか
- `canContain(親の型, 子の型)` (クエリ + インライン / ブロックの一致)
- 空にできないノードが空でないか
- マークがその型に付けられるか (`markAllowed`)
- `spec.validate` によるパラメータの検査

を見る。検査済みのノードは `WeakSet` に覚えるので、**変わっていない部分は 2 度見ない**。
`Transform.step()` がステップを積むたびにこれを呼ぶので、スキーマ違反のドキュメントは
そもそも組み立てられない。

### 入れていないもの

Wordgard にあって、雛形では省いたもの:

- `parse` / `serialize` (HTML ↔ doc) — Shape に parse 側を足すのは M1
- `Schema.Override` (スキーマごとの関係の上書き)
- 集合値のマーク (`Mark.Spec.set`)、`Node.Role` の実利用

---

## 11. 構成と状態 (facet / extension)

`src/state/` は Wordgard の state パッケージ、つまり CodeMirror 6 由来の
**facet / extension** で組んである。プラグインという単位は無い。

| 部品 | 役割 |
| --- | --- |
| `Facet<Input, Output>` | 「複数の入力を 1 つの出力に畳む」定義。`combine` を書かなければ入力の配列 |
| `Extension` | facet に値を供給するもの、またはフィールドを足すもの。配列で入れ子にできる |
| `Field<Value>` | 状態が持つ値。`create` で作り、トランザクションごとに `update` |
| `Configuration` | extension の木を畳んで、フィールドと供給元を集めたもの |
| `Annotation<T>` | 型付きのメタ情報。文字列キーの `setMeta` ではない |
| `Transaction.extender` | dispatch されたトランザクションに追記する facet |
| `Correction` | extender の上に乗る、ドキュメントの不変条件を守る仕組み |

スキーマも facet で渡す。ノード型・マーク型を `schemaElement` に供給すると、
構成側でスキーマが組み上がる。

```ts
const state = EditorState.create({
  config: [basicSchema(), composition()],
  doc: (schema) => schema.doc([...]),
});
```

機能の足し方は「facet に値を供給する extension を config に並べる」だけになる。
たとえば IME 変換中の下線は、装飾を持つフィールドと、それを `decorations` facet に
流す `provide` の組で書かれている。

```ts
export const compositionField = Field.define<CompositionState>({
  create: () => ({ decorations: DecorationSet.empty }),
  update: (value, tr) => { /* 注釈を読んで装飾を作り直す */ },
  provide: (field) => decorations.from(field, (value) => value.decorations),
});
```

### 本家との違い

- **値の計算は遅延 + 依存追跡ではない。** フィールドは構成順に先に作り、facet は
  読まれたときに計算してメモ化するだけ。CodeMirror のスロット割り当てと再計算の
  最小化は入れていない
- **`Compartment` (構成の差し替え) と優先度 (`Prec`) が無い**
- **`Compartment` (構成の差し替え) と優先度 (`Prec`) が無い**
- **OT (`transform`) を入れていない。** 共同編集をやる段で足す

---

## 12. 変更の表現 (ChangeSet)

ステップは「何をしたいか」を型で表す層で、**実際の変更は {@link ChangeSet} に落として
適用する**。位置の写像も合成も ChangeSet 側の仕事で、`StepMap` / `Mapping` は無くなった。

```
sections: [2, -1,  2, 1,  6, -1]
          「2 そのまま、2 を 1 に置換、6 そのまま」
inserted: [null, Slice, null]
```

ツリーは**トークンの並び**に線形化する (`doc/slice.ts`)。

```ts
type Token = Node | Plot.Tag | typeof Close
//           ノード  plot の開き   plot の閉じ
```

閉じトークンに識別子は無く、そのとき開いている plot を閉じるだけ。おかげで

- **ブロックの分割** = `[Close, Open(tag)]` の挿入
- **ブロックの結合** = 境界の 2 トークンの削除
- **ブロックを跨ぐ削除** = 閉じと開きが 1 つずつ消えるので、自然に結合になる

と、構造の操作がすべて「トークンの挿入・削除」に収まる。

### 更新の指定 (TransactionSpec)

Step も Transform も無い。**コマンドは「どう更新したいか」を返すだけ**で、
組み立ては `EditorState.update(spec)` がやる。

```ts
export const splitBlock: Command = (state) => {
  const { from, to } = state.selection;
  const parent = state.selection.$from.parent;
  if (!parent.isTextblock) return false;
  return {
    changes: { from, to, insert: [Close, parent.tag.split()], fit: true },
    selection: (doc, changes) => Selection.near(doc, changes.mapPos(to, 1)),
    userEvent: "input.split",
  };
};
```

`fit: true` を付けると {@link fitChange} を通る。**ブロックを跨ぐ削除は
`{from, to, fit: true}` の 1 行で済む** — 昔は「末尾を削る → 先頭を削る → 順に結合」と
手で書いていた手順が、修復に吸収された。

`state.update(spec)` は `Transaction` を返し、適用した状態は `tr.state`。
view は `dispatch(spec)` でも `dispatch(tr)` でも受ける。

### 次に入力される文字のマーク

ProseMirror の `storedMarks` に当たるものは、状態ではなく**選択が持つ**
(`selection.activeMarks`)。Wordgard の `activeMarks` と同じ置き場所で、
選択を動かせば自然に消える。

### 修復 (fitChange)

`fitChange(schema, doc, {from, to, insert})` は、素朴な置換の指定を**木として成立する
変更**に直してから ChangeSet にする。直すのは 2 つ。

1. **釣り合い** — 置換のあと、開いている深さが `to` の時点の深さと一致すること
2. **スキーマ** — 置けない要素は、外側の plot を閉じてから置く / 既定のブロックで包む /
   それでも駄目なら落とす

Wordgard の `ChangeFitter` に当たるが、費用の比較による探索と、元の文脈への同期は無い
(包むのは既定ブロックの 1 段だけ)。

### 合成についての注意

**合成すると途中の区切りが失われる**ので、変更に掛かった位置については
`a.compose(b).mapPos(p)` と `b.mapPos(a.mapPos(p))` は一致しない (CodeMirror と同じ性質)。
一致が保証されるのは、変わらなかった区間の中だけ。

この性質と、合成・逆・適用の整合は性質テストで押さえている
(`test/model/change.test.ts`)。ランダムな操作列を 300 回積んで、

- 合成した変更を最初の doc に当てた結果 == 最後の doc
- 合成した変更の逆で最初の doc に戻る
- 変わらなかった区間の位置はずれない
- 写像は単調で範囲に収まる

を確かめている。実際この 4 本が、書いた直後の `compose` のバグを 3 つ捕まえた。
