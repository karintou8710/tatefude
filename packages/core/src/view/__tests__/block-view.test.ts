import { beforeEach, describe, expect, it } from "vitest";
import { Leaf, type Node, Schema } from "../../doc";
import { Blockquote, basicSchemaElements, Paragraph } from "../../extensions";
import { DecorationSet } from "../../state/decoration";
import type { BlockViewContext } from "../block-view";
import { ContainerView, syncBlockChildren, TextblockView } from "../block-view";

// レイアウトに依らない「木の突き合わせ」だけを見る。EditContext は張らない

const schema = Schema.define(basicSchemaElements);

let host: HTMLElement;
let views: (TextblockView | ContainerView)[];
/** ctx.createEditContext が呼ばれた回数 = 外枠を作り直した回数 */
let created: number;
let ctx: BlockViewContext;

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  views = [];
  created = 0;
  ctx = {
    decorations: DecorationSet.empty,
    textblocks: [],
    createEditContext: () => {
      created++;
      return null;
    },
  };
  return () => host.remove();
});

const p = (text: string) => Paragraph.create(text ? [Leaf.text(text)] : []);

/** doc を描き直して、集まったテキストブロックを返す */
function sync(...blocks: Node[]): TextblockView[] {
  ctx = { ...ctx, textblocks: [] };
  syncBlockChildren(host, schema.doc(blocks), 0, views, ctx);
  return ctx.textblocks;
}

const texts = () => [...host.children].map((child) => child.textContent);

describe("突き合わせ", () => {
  it("同じ型なら view を使い回す", () => {
    sync(p("あ"), p("い"));
    const first = views[0];
    const dom = first.dom;
    sync(p("X"), p("い"));
    expect(views[0]).toBe(first);
    expect(views[0].dom).toBe(dom);
    expect(texts()).toEqual(["X", "い"]);
  });

  it("使い回した外枠には EditContext を張り直さない", () => {
    sync(p("あ"));
    expect(created).toBe(1);
    sync(p("い"));
    expect(created).toBe(1);
  });

  it("型が変わったら作り直す", () => {
    sync(p("あ"));
    const first = views[0];
    sync(Blockquote.create([p("あ")]));
    expect(views[0]).not.toBe(first);
    expect(views[0]).toBeInstanceOf(ContainerView);
    expect(host.children).toHaveLength(1);
  });

  it("減ったぶんは末尾から捨てる", () => {
    sync(p("あ"), p("い"), p("う"));
    sync(p("あ"));
    expect(views).toHaveLength(1);
    expect(texts()).toEqual(["あ"]);
  });

  it("増えたぶんは作って並べる", () => {
    sync(p("あ"));
    sync(p("あ"), p("い"), p("う"));
    expect(texts()).toEqual(["あ", "い", "う"]);
  });

  // key を持たないので、先頭に挿すと後続が 1 つずつずれて全部描き直される
  it("先頭に挿しても doc どおりの並びになる", () => {
    sync(p("あ"), p("い"));
    sync(p("X"), p("あ"), p("い"));
    expect(texts()).toEqual(["X", "あ", "い"]);
  });
});

describe("DOM の並べ方", () => {
  it("view 以外の子が混ざっていても順番を崩さない", () => {
    // キャレット層のような、view の管理外の子
    const foreign = document.createElement("div");
    foreign.className = "foreign";
    host.appendChild(foreign);

    sync(p("あ"), p("い"));
    expect([...host.children].map((child) => child.className || child.textContent)).toEqual([
      "あ",
      "い",
      "foreign",
    ]);
  });
});

describe("textblocks の集まり方", () => {
  it("入れ子を跨いで文書順に並ぶ", () => {
    const collected = sync(p("あ"), Blockquote.create([p("い"), p("う")]), p("え"));
    expect(collected.map((block) => block.node.textContent)).toEqual(["あ", "い", "う", "え"]);
  });

  it("コンテナ自身は入らない", () => {
    const collected = sync(Blockquote.create([p("い")]));
    expect(collected).toHaveLength(1);
    expect(collected[0]).toBeInstanceOf(TextblockView);
  });

  it("使い回しでも毎回集め直す", () => {
    sync(p("あ"));
    expect(sync(p("あ"))).toHaveLength(1);
  });
});

describe("位置", () => {
  // Doc( P("あ") 0..3, Blockquote( P("い") 4..7 ) 3..8 )
  it("from と content の範囲が doc に合う", () => {
    const collected = sync(p("あ"), Blockquote.create([p("い")]));
    expect(collected.map((block) => [block.from, block.contentFrom, block.contentTo])).toEqual([
      [0, 1, 2],
      [4, 5, 6],
    ]);
  });

  it("前が伸びると後ろの位置だけずれる", () => {
    sync(p("あ"), p("い"));
    const second = views[1];
    const collected = sync(p("あいう"), p("い"));
    expect(views[1]).toBe(second);
    expect(collected[1].from).toBe(5);
  });
});

describe("destroy", () => {
  it("コンテナは子ごと外す", () => {
    sync(Blockquote.create([p("い")]));
    const container = views[0] as ContainerView;
    container.destroy();
    expect(container.children).toHaveLength(0);
    expect(host.children).toHaveLength(0);
  });
});
