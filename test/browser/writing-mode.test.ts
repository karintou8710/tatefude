import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Leaf, type Plot } from "../../src/doc";
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
  const doc = basicSchema.doc(texts.map(paragraph));
  return new EditorView(place, { state: EditorState.create({ schema: basicSchema, doc }) });
}

function setCaret(pos: number): void {
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos)));
}

/** preventDefault されたか (= 自前でブロックを跨いだか) */
function pressKey(key: string): boolean {
  const target = document.activeElement ?? view.dom;
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event.defaultPrevented;
}

function blockIndexOfCaret(): number {
  return view.blockIndexAt(view.state.selection.head);
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

  it("縦書き: 行の途中では跨がない", () => {
    view = mount(true, "あいう", "かきく");
    setCaret(2);
    expect(pressKey("ArrowDown")).toBe(false);
    expect(blockIndexOfCaret()).toBe(0);
  });

  it("縦書きでもブロックごとに EditContext が張られ、バッファは同じ", () => {
    view = mount(true, "あいう", "かきく");
    expect(view.ime.all.map((c) => c.ec.text)).toEqual(["あいう", "かきく"]);
  });
});
