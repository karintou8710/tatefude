import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Leaf, type Plot } from "../../src/doc";
import { arrowMotion } from "../../src/input/arrow";
import { basicSchema, Paragraph } from "../../src/schema-basic";
import { TextSelection } from "../../src/state/selection";
import { EditorState } from "../../src/state/state";
import { EditorView } from "../../src/view/view";

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
