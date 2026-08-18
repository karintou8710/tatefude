// ライブラリが動くために要る CSS。**見た目の好みではなく正しさの要件**なので、
// アプリ任せにせずここで当てる。後から書いた CSS で上書きできる。

import { INLINE_ACTIVE_HIGHLIGHT_NAME, SELECTION_HIGHLIGHT_NAME } from "./selection-highlight";

const STYLE_ID = "tf-style";
const BLINK_RATE = "1.2s";

let injected = false;

export function injectEditorStyles(): void {
  if (injected || typeof document === "undefined") return;
  injected = true;
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = RULES;
  document.head.appendChild(style);
}

const RULES = `
/* キャレット層の位置の基準 */
[data-tf-editor] { position: relative; }

/*
 * doc の文字と、実際に組まれる文字を 1 対 1 にする。既定の white-space だと空白が潰れて
 * 幅 0 になり、キャレットの矩形もクリックの写像も合わなくなる。
 */
[data-tf-textblock] {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

/* EditContext を張った要素は editable なので、放っておくとネイティブのキャレットが出る */
[data-tf-textblock] { caret-color: transparent; }

/* 選択もキャレットも model から描く */
[data-tf-editor]::selection,
[data-tf-editor] ::selection { background-color: transparent; }
::highlight(${SELECTION_HIGHLIGHT_NAME}) { background-color: Highlight; color: HighlightText; }

/*
 * キャレットがインラインブロックの中にいる印。選択とは意味が違うので名前を分けてある。
 * 既定は選択色を薄めたもの。同じ名前の ::highlight() を書けば変えられる。
 */
::highlight(${INLINE_ACTIVE_HIGHLIGHT_NAME}) {
  background-color: color-mix(in srgb, Highlight 30%, transparent);
}

.tf-caret-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
  contain: size style;
}
.tf-caret {
  position: absolute;
  background-color: currentColor;
  animation: steps(1) tf-blink ${BLINK_RATE} infinite;
}
@keyframes tf-blink { 0%, 50% { opacity: 1; } 50.01%, 100% { opacity: 0; } }
@keyframes tf-blink2 { 0%, 50% { opacity: 1; } 50.01%, 100% { opacity: 0; } }

/* 中身が空のインラインブロックの代役。生成内容なので DOM のテキストには入らない。
   こちらは**場所を取らせる** — 空のインラインブロックは大きさを失い、クリックもキャレットの測定もできない */
[data-tf-placeholder]:empty::before {
  content: attr(data-tf-placeholder);
  opacity: 0.45;
  user-select: none;
}

/* テキストブロックの代役。空でも高さ確保の <br> が入るので :empty では拾えず、属性は
   空のときだけ付く。**場所を取らせない** — 生成内容が行に並ぶと、<br> から測るキャレットが
   代役の後ろに立ってしまう。

   出すのは焦点のあるブロックだけ。空ブロックが並ぶ文書で代役が一斉に並ぶと、書かれた文と
   見分けが付かない。焦点は EditContext を張った外枠 (data-tf-textblock) が持つので、
   穴のある Shape では代役の載る要素と別になる — 2 通り書いて両方を拾う */
[data-tf-block-placeholder] {
  position: relative;
}
[data-tf-block-placeholder]:focus::before,
[data-tf-textblock]:focus [data-tf-block-placeholder]::before {
  content: attr(data-tf-block-placeholder);
  position: absolute;
  opacity: 0.45;
  user-select: none;
  pointer-events: none;
}

/* 縦中横。インラインブロックの中だけ横組みになるので、キャレットもこの中では縦棒になる (矩形から決まる) */
.tf-tcy { text-combine-upright: all; }
`;
