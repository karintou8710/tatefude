import { Leaf, Mark, type Schema } from "../src/doc";
import { isEditContextSupported } from "../src/ime/edit-context-api";
import {
  Blockquote,
  basicSchema,
  EmphasisDots,
  Paragraph,
  Ruby,
  RubyBase,
  RubyText,
  Strong,
} from "../src/schema-basic";
import { EditorState } from "../src/state/state";
import type { Transaction } from "../src/state/transaction";
import { EditorView } from "../src/view/view";

const makeDoc = (schema: Schema) =>
  schema.doc([
    Paragraph.create([Leaf.text("EditContext で動くエディタの雛形です。")]),
    // 中身を持つインライン Plot。開き / 閉じは EditContext のバッファでは 0 文字
    Paragraph.create([
      Leaf.text("ルビは "),
      Ruby.create([
        RubyBase.create([Leaf.text("振り仮名")]),
        RubyText.create([Leaf.text("ふりがな")]),
      ]),
      Leaf.text(" のようなインラインブロックです。"),
    ]),
    Paragraph.create([
      Leaf.text("日本語を入力すると "),
      Leaf.text("変換中の下線", Strong.addToSet(Mark.none)),
      Leaf.text(" が "),
      Leaf.text("傍点", EmphasisDots.addToSet(Mark.none)),
      Leaf.text(" と decoration で描かれます。"),
    ]),
    // 中身がブロックの Plot。EditContext は張らず、中の段落が 1 つずつ持つ
    Blockquote.create([
      Paragraph.create([Leaf.text("引用の中の段落。ここにも EditContext が張られます。")]),
      Paragraph.create([Leaf.text("引用の中で Enter を押すと、引用の中で割れます。")]),
    ]),
    Paragraph.create([]),
  ]);

const state = EditorState.create({
  config: [basicSchema()],
  doc: makeDoc,
});

const place = document.querySelector<HTMLElement>("#editor");
if (!place) throw new Error("#editor がない");

const view = new EditorView(place, {
  state,
  dispatchTransaction(tr: Transaction) {
    this.updateState(tr.state);
    renderDebug();
  },
});

view.ime.debug = (type, detail) => {
  pushEvent(type, detail);
  renderDebug();
};

// keydown と compositionstart / compositionend の前後関係を見るための記録。
// isComposing は EditContext 経路では常に false になるので、並べて出しておく。
view.dom.addEventListener(
  "keydown",
  (event) => {
    pushEvent("keydown", {
      key: event.key,
      isComposing: event.isComposing,
      composing: view.ime.composing,
    });
    renderDebug();
  },
  true,
);

const supportEl = document.querySelector<HTMLElement>("#support");
if (supportEl) {
  supportEl.textContent = isEditContextSupported()
    ? "EditContext: 使える"
    : "EditContext: この ブラウザには無い (Chromium 121+ が必要)";
}

const pane = document.querySelector<HTMLElement>("#editor-pane");
for (const input of document.querySelectorAll<HTMLInputElement>('input[name="writing-mode"]')) {
  input.addEventListener("change", () => {
    if (!input.checked) return;
    pane?.classList.toggle("vertical", input.value === "vertical");
    // 書字方向が変わると矩形が全部変わるので、EditContext に渡した bounds を取り直す
    view.dispatch({ selection: view.state.selection });
    view.focus();
    renderDebug();
  });
}

const events: string[] = [];

function pushEvent(type: string, detail: unknown): void {
  events.unshift(`${type} ${JSON.stringify(detail)}`);
  if (events.length > 25) events.pop();
}

function renderDebug(): void {
  const selection = view.state.selection;
  setText("#selection", JSON.stringify({ anchor: selection.anchor, head: selection.head }));
  setText("#doc", JSON.stringify(view.state.doc.toJSON(), null, 2));
  setText("#events", events.join("\n"));

  const contexts = document.querySelector<HTMLElement>("#contexts");
  if (!contexts) return;
  contexts.textContent = "";
  view.ime.all.forEach((context, index) => {
    const block = view.textblocks[index];
    const element = document.createElement("div");
    element.className = context.dom === document.activeElement ? "context active" : "context";
    element.innerHTML = [
      `<span class="label">#${index} from=${block?.from ?? "?"}</span>`,
      `text=${JSON.stringify(context.ec.text)}`,
      `sel=[${context.ec.selectionStart}, ${context.ec.selectionEnd}]`,
      context.composing ? "composing" : "",
    ]
      .filter(Boolean)
      .join(" ");
    contexts.appendChild(element);
  });
}

function setText(selector: string, text: string): void {
  const element = document.querySelector<HTMLElement>(selector);
  if (element) element.textContent = text;
}

document.addEventListener("selectionchange", renderDebug);
view.focus();
renderDebug();
