import { beforeEach, describe, expect, it } from "vitest";
import { Elt, Leaf, Mark, Node, Plot } from "../../doc";
import { Bouten, Paragraph, Ruby, RubyBase, RubyText, Strong } from "../../extensions";
import type { InlineDecoration } from "../../state/decoration";
import { createContainerDOM, createTextblockDOM, renderBlockContent, renderElt } from "../render";

// レイアウトに依らない描画だけを見る。矩形が絡むものは coords / caret / dom-point 側

let host: HTMLElement;

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  return () => host.remove();
});

/** その要素の中身を、doc 位置 0 のブロックとして描く */
function renderInto(block: Plot, decorations: InlineDecoration[] = []): HTMLElement {
  renderBlockContent(host, block, 0, decorations);
  return host;
}

const p = (...content: Node[]) => Paragraph.create(content);
const t = (text: string, marks: Mark.Set = Mark.none) => Leaf.text(text, marks);

describe("renderElt", () => {
  it("0 の位置が中身の入る穴になる", () => {
    const { dom, contentDOM } = renderElt(Elt.mk("div", { class: "x" }, [Elt.mk("p", Elt.hole)]));
    expect(dom.outerHTML).toBe('<div class="x"><p></p></div>');
    expect(contentDOM?.tagName).toBe("P");
  });

  it("穴が無ければ contentDOM は null", () => {
    expect(renderElt(Elt.mk("hr")).contentDOM).toBeNull();
  });

  it("文字列の子はテキストとして入る", () => {
    expect(renderElt(Elt.mk("span", ["あ"])).dom.textContent).toBe("あ");
  });

  it("style/ 付きの属性は style プロパティになる", () => {
    const { dom } = renderElt(Elt.mk("span", { "style/color": "red", id: "a" }));
    expect(dom.style.color).toBe("red");
    expect(dom.id).toBe("a");
  });
});

describe("外枠", () => {
  it("テキストブロックは印と tabIndex を持つ", () => {
    const { dom, contentDOM } = createTextblockDOM(p());
    expect(dom.hasAttribute("data-tf-textblock")).toBe(true);
    expect(dom.tabIndex).toBe(-1);
    // 穴の無い Shape では外枠がそのまま中身の入れ物
    expect(contentDOM).toBe(dom);
  });

  it("コンテナは編集ホストにしないので tabIndex を持たない", () => {
    const { dom } = createContainerDOM(
      Plot.define("C", { blockContent: Node.Group.Content, shape: { element: "div" } }).create([
        p(),
      ]),
    );
    expect(dom.hasAttribute("data-tf-container")).toBe(true);
    expect(dom.hasAttribute("tabindex")).toBe(false);
  });
});

describe("renderBlockContent", () => {
  it("空ブロックには高さ確保の br が入る", () => {
    expect(renderInto(p()).innerHTML).toBe("<br>");
  });

  it("代役の属性は空のときだけ付く", () => {
    const WithPlaceholder = Plot.define("WithPlaceholder", {
      inlineContent: true,
      group: Node.Group.Content,
      placeholder: "本文",
      shape: { element: "p" },
    });
    expect(renderInto(WithPlaceholder.create([])).getAttribute("data-tf-block-placeholder")).toBe(
      "本文",
    );
    expect(
      renderInto(WithPlaceholder.create([t("あ")])).hasAttribute("data-tf-block-placeholder"),
    ).toBe(false);
  });

  it("描き直すたびに中身は作り直される", () => {
    renderInto(p(t("あ")));
    const first = host.firstChild;
    renderInto(p(t("い")));
    expect(host.textContent).toBe("い");
    expect(host.firstChild).not.toBe(first);
  });
});

describe("インライン", () => {
  it("インラインブロックは印を持ち、中身は再帰して描かれる", () => {
    renderInto(p(Ruby.create([RubyBase.create([t("漢")]), RubyText.create([t("かん")])])));
    const ruby = host.querySelector("ruby");
    expect(ruby?.hasAttribute("data-tf-inline")).toBe(true);
    expect(ruby?.innerHTML).toBe(
      '<rb data-tf-inline="">漢</rb><rt data-tf-inline="" data-tf-placeholder="ルビ">かん</rt>',
    );
  });

  it("代役を持つ型には属性が付く (中身が空でなくても)", () => {
    renderInto(p(Ruby.create([RubyBase.create([t("漢")]), RubyText.create([])])));
    expect(host.querySelector("rt")?.getAttribute("data-tf-placeholder")).toBe("ルビ");
  });
});

describe("マーク", () => {
  it("要素のマークは外側から順に包む", () => {
    renderInto(p(t("あ", Strong.addToSet(Mark.none))));
    expect(host.innerHTML).toBe("<strong>あ</strong>");
  });

  it("属性のマークは一番内側の span にまとめる", () => {
    renderInto(p(t("あ", Bouten.addToSet(Mark.none))));
    const span = host.querySelector("span");
    expect(span?.style.getPropertyValue("text-emphasis")).toBe("filled sesame");
    expect(span?.textContent).toBe("あ");
  });

  it("属性のマークは要素のマークの内側に入る", () => {
    renderInto(p(t("あ", Strong.addToSet(Bouten.addToSet(Mark.none)))));
    expect(host.querySelector("strong > span")).not.toBeNull();
  });
});

describe("装飾", () => {
  // Paragraph("あいう") の中身は 1..4
  const deco = (from: number, to: number, cls: string): InlineDecoration => ({
    from,
    to,
    class: cls,
  });

  it("重なった範囲だけが span で包まれる", () => {
    renderInto(p(t("あいう")), [deco(2, 3, "d")]);
    expect(host.innerHTML).toBe('あ<span class="d">い</span>う');
  });

  it("境目でテキストが割れる", () => {
    renderInto(p(t("あいう")), [deco(1, 2, "a"), deco(3, 4, "b")]);
    expect(host.innerHTML).toBe('<span class="a">あ</span>い<span class="b">う</span>');
  });

  // 走りごとに、掛かっている装飾を順に包む。先に足したものが内側
  it("重なった部分は両方に包まれる", () => {
    renderInto(p(t("あいう")), [deco(1, 4, "a"), deco(2, 3, "b")]);
    expect(host.innerHTML).toBe(
      '<span class="a">あ</span><span class="b"><span class="a">い</span></span><span class="a">う</span>',
    );
  });
});
