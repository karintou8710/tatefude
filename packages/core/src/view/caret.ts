// 選択と同じく、キャレットも model から描く。ネイティブのキャレットは
// caret-color: transparent で消す。
//
// ブラウザ任せだと「DOM の選択が編集ホストの境界で丸められた位置」に出てしまうので、
// ブロックを跨ぐ選択の最中に実際の head とずれる。model から描けばそれが無くなる。

import { caretRectFor } from "./dom-point";
import type { EditorView } from "./view";

/** 幅 0 / 高さ 0 の軸に与える太さ */
const THICKNESS = 1.2;

export class CaretLayer {
  private readonly layer: HTMLElement;
  private readonly caret: HTMLElement;

  constructor(private readonly view: EditorView) {
    this.layer = document.createElement("div");
    this.layer.className = "tf-caret-layer";
    this.caret = document.createElement("div");
    this.caret.className = "tf-caret";
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
      this.caret.style.animationName === "tf-blink" ? "tf-blink2" : "tf-blink";
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
