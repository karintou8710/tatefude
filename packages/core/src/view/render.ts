import { ATOM_CHAR, type Elt, type Mark, type Node, type Plot } from "../doc";
import type { InlineDecoration } from "../state/decoration";

export interface RenderedBlock {
  /** 外側の要素 */
  dom: HTMLElement;
  /** Shape に穴がなければ dom と同じ */
  contentDOM: HTMLElement;
}

/** `0` の位置が中身の入る穴 */
export function renderElt(elt: Elt): { dom: HTMLElement; contentDOM: HTMLElement | null } {
  const dom = document.createElement(elt.tagName);
  applyAttributes(dom, elt.attrs);
  let contentDOM: HTMLElement | null = null;
  for (const child of elt.children) {
    if (child === 0) {
      contentDOM = dom;
    } else if (typeof child === "string") {
      dom.appendChild(document.createTextNode(child));
    } else {
      const rendered = renderElt(child);
      if (rendered.contentDOM) contentDOM = rendered.contentDOM;
      dom.appendChild(rendered.dom);
    }
  }
  return { dom, contentDOM };
}

/** インラインを持つ Plot の外枠。ここに EditContext が張られる */
export function createTextblockDOM(block: Plot): RenderedBlock {
  const { dom, contentDOM } = renderElt(block.type.shape.render(block.param));
  dom.setAttribute("data-tf-textblock", "");
  // EditContext を付けると editable にはなるが、focus() を確実に効かせるために持たせる
  dom.tabIndex = -1;
  return { dom, contentDOM: contentDOM ?? dom };
}

/** ブロックを持つ Plot の外枠。編集ホストにはしないので tabIndex も付けない */
export function createContainerDOM(block: Plot): RenderedBlock {
  const { dom, contentDOM } = renderElt(block.type.shape.render(block.param));
  dom.setAttribute("data-tf-container", "");
  return { dom, contentDOM: contentDOM ?? dom };
}

/** DOM はブラウザに書き換えられないので、現在の doc をそのまま描くだけでよい */
export function renderBlockContent(
  contentDOM: HTMLElement,
  block: Plot,
  blockFrom: number,
  decorations: readonly InlineDecoration[],
): void {
  contentDOM.textContent = "";
  // 空のときの代役。インラインブロックとは別の属性にしてある — あちらは大きさを
  // 与えたいが、こちらは場所を取らせたくない (styles.ts を参照)
  const placeholder = block.type.placeholder;
  if (placeholder && !block.contentLength) {
    contentDOM.setAttribute("data-tf-block-placeholder", placeholder);
  } else {
    contentDOM.removeAttribute("data-tf-block-placeholder");
  }
  if (!block.contentLength) {
    // 空ブロックでも高さを持たせる
    contentDOM.appendChild(document.createElement("br"));
    return;
  }
  renderInlineContent(contentDOM, block, blockFrom + 1, decorations);
}

/** インラインブロック (中身を持つインライン Plot) があるので、中身の描画は再帰する */
function renderInlineContent(
  target: HTMLElement,
  plot: Plot,
  contentStart: number,
  decorations: readonly InlineDecoration[],
): void {
  let offset = 0;
  for (const child of plot.content) {
    const from = contentStart + offset;
    if (child.isLeaf && child.isText) {
      for (const run of splitByDecorations(child.text, from, decorations)) {
        target.appendChild(renderInline(run.text, child.marks, run.decorations));
      }
    } else if (child.isPlot) {
      target.appendChild(renderInlineBlock(child, from, decorations));
    } else {
      target.appendChild(renderAtom(child));
    }
    offset += child.length;
  }
}

function renderInlineBlock(
  node: Plot,
  from: number,
  decorations: readonly InlineDecoration[],
): HTMLElement {
  const { dom, contentDOM } = renderElt(node.type.shape.render(node.param));
  dom.setAttribute("data-tf-inline", "");
  // 中身が空のときの代役。**CSS の生成内容として出す**ので DOM のテキストには入らない。
  // 実ノードにするとバッファとずれ、変換にもクリップボードにも混ざる
  if (node.type.placeholder) dom.setAttribute("data-tf-placeholder", node.type.placeholder);
  renderInlineContent(contentDOM ?? dom, node, from + 1, decorations);
  return dom;
}

function renderAtom(node: Node): HTMLElement {
  const elt = node.type.shape.render(node.param);
  const dom = elt.tagName ? renderElt(elt).dom : document.createElement("span");
  dom.setAttribute("data-tf-atom", "");
  // Range.toString() の長さを TextblockMap の数え方 (atom = 1 文字) に合わせる
  if (!dom.textContent) dom.textContent = ATOM_CHAR;
  return dom;
}

interface Run {
  text: string;
  decorations: InlineDecoration[];
}

function splitByDecorations(
  text: string,
  from: number,
  decorations: readonly InlineDecoration[],
): Run[] {
  const to = from + text.length;
  const overlapping = decorations.filter((d) => d.from < to && d.to > from);
  if (!overlapping.length) return [{ text, decorations: [] }];

  const points = new Set<number>([from, to]);
  for (const deco of overlapping) {
    if (deco.from > from && deco.from < to) points.add(deco.from);
    if (deco.to > from && deco.to < to) points.add(deco.to);
  }
  const sorted = [...points].sort((a, b) => a - b);
  const runs: Run[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const start = sorted[i];
    const end = sorted[i + 1];
    runs.push({
      text: text.slice(start - from, end - from),
      decorations: overlapping.filter((d) => d.from <= start && d.to >= end),
    });
  }
  return runs;
}

/**
 * マークは Shape が要素なら要素で包み、属性なら一番内側の span にまとめる。
 * rank の小さいマークが内側に来る。
 */
function renderInline(
  text: string,
  marks: Mark.Set,
  decorations: readonly InlineDecoration[],
): globalThis.Node {
  const attributeMarks = marks.filter((mark) => !mark.type.isElement);
  const elementMarks = marks.filter((mark) => mark.type.isElement);

  let node: globalThis.Node = document.createTextNode(text);
  if (attributeMarks.length) {
    const span = document.createElement("span");
    for (const mark of attributeMarks) {
      const shape = mark.type.spec.shape as { attribute: string; value: string | 0 };
      const value = shape.value === 0 ? String(mark.value) : shape.value;
      applyAttribute(span, shape.attribute, value);
    }
    span.appendChild(node);
    node = span;
  }
  for (const mark of elementMarks) {
    const shape = mark.type.spec.shape as {
      element: string;
      attrs?: Record<string, string> | ((value: unknown) => Record<string, string>);
    };
    const element = document.createElement(shape.element);
    const attrs = typeof shape.attrs === "function" ? shape.attrs(mark.value) : shape.attrs;
    if (attrs) applyAttributes(element, attrs);
    element.appendChild(node);
    node = element;
  }
  for (const deco of decorations) {
    const span = document.createElement("span");
    if (deco.class) span.className = deco.class;
    if (deco.style) span.setAttribute("style", deco.style);
    span.appendChild(node);
    node = span;
  }
  return node;
}

function applyAttributes(dom: HTMLElement, attrs: Readonly<Record<string, string>>): void {
  for (const [name, value] of Object.entries(attrs)) applyAttribute(dom, name, value);
}

/** `style/foo` は style プロパティ、それ以外はそのまま属性 */
function applyAttribute(dom: HTMLElement, name: string, value: string): void {
  if (name.startsWith("style/")) dom.style.setProperty(name.slice(6), value);
  else dom.setAttribute(name, value);
}
