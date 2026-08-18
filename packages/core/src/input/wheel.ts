import { writingModeOf } from "../view/coords";
import type { EditorView } from "../view/view";

/** deltaMode が行・ページ単位のときの 1 目盛りの大きさ */
const LINE_STEP = 30;

/**
 * 縦ホイールを行の積み方向へ写す。
 *
 * Chrome は入れ子のスクローラでは deltaY を block 軸に写してくれない。ルート要素なら
 * 効くので、縦書きのページは動くが、`overflow` を持つ箱の中は動かないままになる。
 */
export function handleWheel(view: EditorView, event: WheelEvent): boolean {
  // Ctrl 付きは拡大縮小
  if (event.ctrlKey || !event.deltaY) return false;
  const { vertical, blockForwardIsPositive } = writingModeOf(view.dom);
  if (!vertical) return false;

  const scroller = horizontalScrollerOf(view.dom);
  if (!scroller) return false;

  const step = event.deltaMode === 1 ? LINE_STEP : event.deltaMode === 2 ? scroller.clientWidth : 1;
  const forward = blockForwardIsPositive ? 1 : -1;
  const before = scroller.scrollLeft;
  scroller.scrollLeft += (event.deltaX + event.deltaY * forward) * step;
  // 端まで来たら消費しない。そのままページ側へ渡す
  return scroller.scrollLeft !== before;
}

function horizontalScrollerOf(dom: HTMLElement): HTMLElement | null {
  for (let cur: HTMLElement | null = dom; cur; cur = cur.parentElement) {
    if (cur.scrollWidth > cur.clientWidth) return cur;
  }
  return null;
}
