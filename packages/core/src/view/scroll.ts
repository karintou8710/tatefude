import type { ChangeSet } from "../doc";
import { caretRectFor } from "./dom-point";
import type { EditorView } from "./view";

/** キャレットと縁の間に残す隙間 */
const MARGIN = 8;

/**
 * ブラウザ任せの自動スクロールは効かない。選択を DOM に書くだけでは起きず、focus でも
 * `preventScroll: true` で止めてあるため。
 */
export function scrollCaretIntoView(view: EditorView, changes?: ChangeSet): void {
  // 触っていないときに動かすと、読んでいる場所を奪う
  if (!view.dom.contains(document.activeElement)) return;
  // **doc が変わったら変わり始めた位置を見せる。**undo は編集前の選択を戻すので、
  // head を狙うと全選択を戻したときに末尾へ飛ぶ。打っている間は変更位置 = キャレット位置
  const pos = changedFrom(changes) ?? view.state.selection.head;
  const block = view.textblockAt(pos);
  if (!block) return;
  scrollRectIntoView(block.dom, caretRectFor(block, pos));
}

/** いちばん手前の変更の頭 (変更後の座標)。変更が無ければ null */
function changedFrom(changes: ChangeSet | undefined): number | null {
  if (!changes || changes.empty) return null;
  let first: number | null = null;
  changes.iterChanges((_fromA, _toA, fromB) => {
    first ??= fromB;
  });
  return first;
}

/** 祖先の枠を内側から順に。動いたぶんだけ矩形をずらすので、測り直さずに済む */
function scrollRectIntoView(dom: HTMLElement, caret: DOMRect): void {
  const view = dom.ownerDocument.defaultView ?? window;
  let rect = caret;

  for (let cur: Node | null = dom; cur; cur = cur.parentNode) {
    if (cur.nodeType !== 1) break;
    const element = cur as HTMLElement;
    const isBody = element === dom.ownerDocument.body;
    let bounding: DOMRect;
    let scaleX = 1;
    let scaleY = 1;

    if (isBody) {
      bounding = viewportRect(view);
    } else {
      // 固定されている祖先より外は動かしても意味がない
      if (/^(fixed|sticky)$/.test(getComputedStyle(element).position)) break;
      if (
        element.scrollHeight <= element.clientHeight &&
        element.scrollWidth <= element.clientWidth
      ) {
        continue;
      }
      const box = element.getBoundingClientRect();
      ({ scaleX, scaleY } = scaleOf(element, box));
      // client* を使うのは、スクロールバーのぶんを枠から外すため
      bounding = new DOMRect(
        box.left,
        box.top,
        element.clientWidth * scaleX,
        element.clientHeight * scaleY,
      );
    }

    const moveX = overflowOf(rect.left, rect.right, bounding.left, bounding.right);
    const moveY = overflowOf(rect.top, rect.bottom, bounding.top, bounding.bottom);
    if (moveX || moveY) {
      if (isBody) {
        view.scrollBy(moveX, moveY);
      } else {
        // 実際に動いた量で矩形をずらす。端まで来ていて動かなければ 0
        const movedY = scrollBy(element, "scrollTop", moveY / scaleY) * scaleY;
        const movedX = scrollBy(element, "scrollLeft", moveX / scaleX) * scaleX;
        rect = new DOMRect(rect.left - movedX, rect.top - movedY, rect.width, rect.height);
      }
    }
    if (isBody) break;
  }
}

function scrollBy(element: HTMLElement, axis: "scrollTop" | "scrollLeft", amount: number): number {
  const start = element[axis];
  element[axis] = start + amount;
  return element[axis] - start;
}

/** 拡大されているとレイアウト上の長さと画面上の長さがずれる。1 に十分近ければ無視する */
function scaleOf(element: HTMLElement, rect: DOMRect): { scaleX: number; scaleY: number } {
  const near = (value: number, size: number, offset: number) =>
    !Number.isFinite(value) || Math.abs(size - offset) < 1 ? 1 : value;
  return {
    scaleX: near(rect.width / element.offsetWidth, rect.width, element.offsetWidth),
    scaleY: near(rect.height / element.offsetHeight, rect.height, element.offsetHeight),
  };
}

function viewportRect(view: Window): DOMRect {
  const visual = view.visualViewport;
  return new DOMRect(
    0,
    0,
    visual ? visual.width : view.innerWidth,
    visual ? visual.height : view.innerHeight,
  );
}

/** 枠から出ているぶん。手前に出ていれば負、奥に出ていれば正、収まっていれば 0 */
function overflowOf(from: number, to: number, low: number, high: number): number {
  if (from < low) return from - low - MARGIN;
  if (to > high) return to - high + MARGIN;
  return 0;
}
