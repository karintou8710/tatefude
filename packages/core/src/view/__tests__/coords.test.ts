import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Leaf, type Plot } from "../../doc";
import { basicSchema, Paragraph } from "../../extensions";
import { arrowMotion } from "../../input/arrow";
import { TextSelection } from "../../state/selection";
import { EditorState } from "../../state/state";
import { blockOffsetRange, isOnEdgeLine } from "../coords";
import { EditorView } from "../view";

let place: HTMLElement;
let view: EditorView;

function paragraph(text: string): Plot {
  return Paragraph.create(text ? [Leaf.text(text)] : []);
}

function mount(vertical: boolean, ...texts: string[]): EditorView {
  place.style.writingMode = vertical ? "vertical-rl" : "horizontal-tb";
  // 縦書きでは height が行の長さになる。折り返さないだけの長さを与える。
  place.style.height = vertical ? "300px" : "";
  place.style.fontSize = "16px";
  return new EditorView(place, {
    state: EditorState.create({
      config: [basicSchema()],
      doc: (schema) => schema.doc(texts.map(paragraph)),
    }),
  });
}

function setCaret(pos: number): void {
  view.dispatch({ selection: TextSelection.create(view.state.doc, pos) });
}

/** preventDefault されたか (= 自前でブロックを跨いだか) */
function pressKey(key: string): boolean {
  const target = document.activeElement ?? view.dom;
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event.defaultPrevented;
}

function blockIndexOfCaret(): number {
  return view.textblockIndexAt(view.state.selection.head);
}

beforeEach(() => {
  place = document.createElement("div");
  document.body.appendChild(place);
});

afterEach(() => {
  view?.destroy();
  place.remove();
});

// Doc(P("あいう"), P("かきく")) の位置:
//   block0 = 0..5 (中身 1..4) / block1 = 5..10 (中身 6..9)
describe("書字方向とブロックを跨ぐ移動", () => {
  it("横書き: ArrowRight が行内の前進として端で効く", () => {
    view = mount(false, "あいう", "かきく");
    setCaret(4);
    expect(pressKey("ArrowRight")).toBe(true);
    expect(blockIndexOfCaret()).toBe(1);
    expect(view.state.selection.head).toBe(6);
  });

  it("横書き: ArrowDown は行を跨ぐ向き", () => {
    view = mount(false, "あいう", "かきく");
    setCaret(2);
    expect(pressKey("ArrowDown")).toBe(true);
    expect(blockIndexOfCaret()).toBe(1);
  });

  it("縦書き: ArrowDown が行内の前進になる", () => {
    view = mount(true, "あいう", "かきく");
    setCaret(4);
    expect(pressKey("ArrowDown")).toBe(true);
    expect(blockIndexOfCaret()).toBe(1);
    expect(view.state.selection.head).toBe(6);
  });

  it("縦書き: ArrowUp が行内の後退になる", () => {
    view = mount(true, "あいう", "かきく");
    setCaret(6);
    expect(pressKey("ArrowUp")).toBe(true);
    expect(blockIndexOfCaret()).toBe(0);
    expect(view.state.selection.head).toBe(4);
  });

  it("縦書き (vertical-rl): ArrowLeft が次のブロック、ArrowRight が前のブロック", () => {
    view = mount(true, "あいう", "かきく");
    setCaret(2);
    expect(pressKey("ArrowLeft")).toBe(true);
    expect(blockIndexOfCaret()).toBe(1);

    expect(pressKey("ArrowRight")).toBe(true);
    expect(blockIndexOfCaret()).toBe(0);
  });

  it("縦書き: 行の途中の ArrowDown はブロックの中で 1 つ進む", () => {
    view = mount(true, "あいう", "かきく");
    setCaret(2);
    expect(pressKey("ArrowDown")).toBe(true);
    expect(blockIndexOfCaret()).toBe(0);
    expect(view.state.selection.head).toBe(3);
  });

  it("縦書きでもブロックごとに EditContext が張られ、バッファは同じ", () => {
    view = mount(true, "あいう", "かきく");
    expect(view.ime.all.map((c) => c.ec.text)).toEqual(["あいう", "かきく"]);
  });
});

/**
 * キャレットの矩形は文字の高さにしかならないので、行送りの代わりには使えない。
 * line-height を広げると半 leading のぶん、罫線を引くとその太さのぶん、行が箱の端から
 * 浮く。ここを取り違えると 1 行しかないブロックが「行の途中」に見え、隣のブロックへ
 * 出られなくなる (台本の柱 = border-block を持つ h2 で見つけた)。
 */
describe("行の端の判定", () => {
  /** 行が何本あるか。Range の矩形は 1 行につき 1 つ返る */
  function lineCount(dom: HTMLElement): number {
    return blockOffsetRange(dom, 0, dom.textContent?.length ?? 0).getClientRects().length;
  }

  function mountWith(vertical: boolean, text: string, lineHeight: string): HTMLElement {
    view = mount(vertical, text);
    place.style.lineHeight = lineHeight;
    return view.textblocks[0].contentDOM;
  }

  it("縦書き: 行送りを広げても 1 行だけのブロックは前後どちらの端でもある", () => {
    const dom = mountWith(true, "あいう", "3");
    expect(lineCount(dom)).toBe(1);
    expect(isOnEdgeLine(dom, 1, 1)).toBe(true);
    expect(isOnEdgeLine(dom, 1, -1)).toBe(true);
  });

  it("横書き: 行送りを広げても 1 行だけのブロックは前後どちらの端でもある", () => {
    const dom = mountWith(false, "あいう", "3");
    expect(lineCount(dom)).toBe(1);
    expect(isOnEdgeLine(dom, 1, 1)).toBe(true);
    expect(isOnEdgeLine(dom, 1, -1)).toBe(true);
  });

  it("罫線は行の外なので、端の判定に混ぜない", () => {
    // border-block は論理プロパティなので、書字方向によらず block 軸に付く
    const dom = mountWith(false, "あいう", "2");
    dom.style.borderBlock = "6px solid";
    expect(lineCount(dom)).toBe(1);
    expect(isOnEdgeLine(dom, 1, 1)).toBe(true);
    expect(isOnEdgeLine(dom, 1, -1)).toBe(true);
  });

  it("横書き: 折り返していれば最初の行と最後の行だけが端になる", () => {
    const dom = mountWith(false, "あいうえおかきくけこ", "3");
    place.style.width = "5em";
    expect(lineCount(dom)).toBe(2);

    expect(isOnEdgeLine(dom, 1, -1)).toBe(true);
    expect(isOnEdgeLine(dom, 1, 1)).toBe(false);
    expect(isOnEdgeLine(dom, 9, 1)).toBe(true);
    expect(isOnEdgeLine(dom, 9, -1)).toBe(false);
  });

  it("行送りが広くても、折り返した行の中で次の行へ進める", () => {
    // ずらす量が足りないと同じ行に着地し、矢印を消費するだけで動かない
    view = mount(false, "あいうえおかきくけこ", "さしすせそ");
    place.style.lineHeight = "3";
    place.style.width = "5em";
    view.focus();
    expect(lineCount(view.textblocks[0].contentDOM)).toBe(2);

    setCaret(2);
    expect(pressKey("ArrowDown")).toBe(true);
    expect(blockIndexOfCaret()).toBe(0);
    expect(view.state.selection.head).toBeGreaterThan(2);
  });
});

describe("物理キー → 論理方向", () => {
  function motions(vertical: boolean): Record<string, string> {
    view = mount(vertical, "あいう");
    const dom = view.textblocks[0].contentDOM;
    const result: Record<string, string> = {};
    for (const key of ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"] as const) {
      const { axis, backward } = arrowMotion(key, dom);
      result[key] = `${axis} ${backward ? "backward" : "forward"}`;
    }
    return result;
  }

  it("横書きは左右が行の中、上下が行の跨ぎ", () => {
    expect(motions(false)).toEqual({
      ArrowLeft: "inline backward",
      ArrowRight: "inline forward",
      ArrowUp: "block backward",
      ArrowDown: "block forward",
    });
  });

  it("縦書き (vertical-rl) は軸が入れ替わり、左が「次」になる", () => {
    expect(motions(true)).toEqual({
      ArrowUp: "inline backward",
      ArrowDown: "inline forward",
      ArrowLeft: "block forward",
      ArrowRight: "block backward",
    });
  });
});
