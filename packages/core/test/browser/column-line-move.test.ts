import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Leaf } from "../../src/doc";
import { basicSchema, Paragraph } from "../../src/extensions";
import { TextSelection } from "../../src/state/selection";
import { EditorState } from "../../src/state/state";
import { EditorView } from "../../src/view/view";

/**
 * 段組みを跨ぐ block 軸の移動。
 *
 * 段の最後の行の隣は**次の段の先頭**にあり、block 軸にもインライン方向にも飛ぶ。
 * 「1 行送りぶんずらす」だけでは段の外に出て空振りし、同じ段を行き来して進めなくなる。
 */

let place: HTMLElement;
let view: EditorView;

beforeEach(() => {
  place = document.createElement("div");
  document.body.appendChild(place);
});

afterEach(() => {
  view?.destroy();
  place.remove();
});

/** 縦書きを 3 段に割る。段は下へ積まれる (ページ分割と同じ形) */
function mount(text: string): EditorView {
  place.style.cssText = `
    writing-mode: vertical-rl; font-size: 16px; line-height: 32px;
    width: 160px; height: 480px;
    column-count: 3; column-gap: 24px; column-fill: auto;`;
  return new EditorView(place, {
    state: EditorState.create({
      config: [basicSchema()],
      doc: (schema) => schema.doc([Paragraph.create([Leaf.text(text)])]),
    }),
  });
}

function press(key: string): void {
  const target = document.activeElement ?? view.dom;
  target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
}

/** キャレットの矩形。縦書きなので left が行の位置、top が行の中の位置 */
function caret(): DOMRect {
  const element = view.dom.querySelector(".tf-caret") as HTMLElement;
  return element.getBoundingClientRect();
}

/** その段の帯 (何段目か) */
function bandOf(rect: DOMRect): number {
  const content = view.textblocks[0].contentDOM.getClientRects();
  for (let i = 0; i < content.length; i++) {
    const r = content[i];
    if (rect.top >= r.top - 2 && rect.top <= r.bottom + 2) return i;
  }
  return -1;
}

describe("段組みを跨ぐ行移動", () => {
  const long = "あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろ";

  it("ブロックが段に割れている", () => {
    view = mount(long.repeat(3));
    view.focus();
    expect(view.textblocks[0].contentDOM.getClientRects().length).toBeGreaterThan(1);
  });

  it("ArrowLeft を押し続けると段を跨いで進み、同じ場所に戻らない", () => {
    view = mount(long.repeat(3));
    view.focus();
    view.dispatch({ selection: TextSelection.create(view.state.doc, 2) });

    const seen = new Set<number>();
    let crossed = false;
    let startBand = bandOf(caret());
    for (let i = 0; i < 40; i++) {
      const before = view.state.selection.head;
      press("ArrowLeft");
      const head = view.state.selection.head;
      if (head === before) break;
      // 同じ位置に二度来たら循環している
      expect(seen.has(head), `pos=${head} に戻った`).toBe(false);
      seen.add(head);
      if (bandOf(caret()) !== startBand) {
        crossed = true;
        startBand = bandOf(caret());
      }
    }
    expect(crossed, "段を跨がなかった").toBe(true);
  });

  it("跨いだ先は次の段の先頭 (block 軸が戻り、1 段下)", () => {
    view = mount(long.repeat(3));
    view.focus();
    view.dispatch({ selection: TextSelection.create(view.state.doc, 2) });

    let before = caret();
    for (let i = 0; i < 40; i++) {
      press("ArrowLeft");
      const after = caret();
      if (bandOf(after) !== bandOf(before)) {
        // 次の段は 1 つ下にあり、行は右端から積み直す
        expect(after.top).toBeGreaterThan(before.top);
        expect(after.left).toBeGreaterThan(before.left);
        return;
      }
      before = after;
    }
    throw new Error("段を跨がなかった");
  });
});
