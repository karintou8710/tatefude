// 選択と同じく、キャレットも model から描く。ネイティブのキャレットは
// caret-color: transparent で消す。
//
// ブラウザ任せだと「DOM の選択が編集ホストの境界で丸められた位置」に出てしまうので、
// ブロックを跨ぐ選択の最中に実際の head とずれる。model から描けばそれが無くなる。

import { caretRectFor } from "./dom-point";
import type { EditorView } from "./view";

const STYLE_ID = "ecw-caret-style";
const BLINK_RATE = "1.2s";
/** 幅 0 / 高さ 0 の軸に与える太さ */
const THICKNESS = 1.8;

/** 後から書いた CSS で上書きできる */
function injectDefaultStyle(): void {
  if (typeof document === "undefined" || document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = [
    // レイヤの位置の基準。エディタ側で position を付けているなら上書きされてよい
    "[data-ecw-editor] { position: relative; }",
    // EditContext を張った要素は editable なので、放っておくとネイティブのキャレットが出る
    "[data-ecw-textblock] { caret-color: transparent; }",
    ".ecw-caret-layer { position: absolute; inset: 0; pointer-events: none; contain: size style; }",
    ".ecw-caret { position: absolute; background-color: currentColor; }",
    `.ecw-caret { animation: steps(1) ecw-blink ${BLINK_RATE} infinite; }`,
    "@keyframes ecw-blink { 0%, 50% { opacity: 1; } 50.01%, 100% { opacity: 0; } }",
    `@keyframes ecw-blink2 { 0%, 50% { opacity: 1; } 50.01%, 100% { opacity: 0; } }`,
  ].join("\n");
  document.head.appendChild(style);
}

export class CaretLayer {
  private readonly layer: HTMLElement;
  private readonly caret: HTMLElement;

  constructor(private readonly view: EditorView) {
    injectDefaultStyle();
    this.layer = document.createElement("div");
    this.layer.className = "ecw-caret-layer";
    this.caret = document.createElement("div");
    this.caret.className = "ecw-caret";
    this.layer.appendChild(this.caret);
    view.dom.appendChild(this.layer);
    view.dom.addEventListener("focusin", this.onFocusChange);
    view.dom.addEventListener("focusout", this.onFocusChange);
  }

  update(): void {
    const rect = this.caretRect();
    if (!rect) {
      this.caret.style.display = "none";
      return;
    }
    const origin = this.layer.getBoundingClientRect();
    const width = rect.width || THICKNESS;
    const height = rect.height || THICKNESS;
    this.caret.style.display = "block";
    this.caret.style.left = `${rect.left - origin.left - (rect.width ? 0 : THICKNESS / 2)}px`;
    this.caret.style.top = `${rect.top - origin.top - (rect.height ? 0 : THICKNESS / 2)}px`;
    this.caret.style.width = `${width}px`;
    this.caret.style.height = `${height}px`;
    // 動かした直後は点いた状態から始めたい。名前を入れ替えるとアニメーションが巻き戻る
    this.caret.style.animationName =
      this.caret.style.animationName === "ecw-blink" ? "ecw-blink2" : "ecw-blink";
  }

  destroy(): void {
    this.view.dom.removeEventListener("focusin", this.onFocusChange);
    this.view.dom.removeEventListener("focusout", this.onFocusChange);
    this.layer.remove();
  }

  /** キャレットを出さないときは null。範囲を選んでいる間とフォーカスが無い間は出さない */
  private caretRect(): DOMRect | null {
    const selection = this.view.state.selection;
    if (!selection.empty) return null;
    if (!this.view.dom.contains(document.activeElement)) return null;
    const block = this.view.textblockAt(selection.head);
    if (!block) return null;
    return caretRectFor(block, selection.head);
  }

  private onFocusChange = (): void => {
    this.update();
  };
}
