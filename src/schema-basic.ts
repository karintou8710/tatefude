import { Mark, Node, Plot, Schema } from "./doc";

const G = Node.Group;

/** ドキュメントのトップ。中身は Content グループのブロック。 */
export const Doc = Plot.define("Doc", {
  doc: true,
  blockContent: G.Content,
  shape: { element: "div" },
});

/** 段落。インラインを入れられる既定のブロック。 */
export const Paragraph = Plot.define("Paragraph", {
  inlineContent: true,
  group: G.Content,
  defaultBlock: true,
  shape: { element: "p" },
});

export const Emphasis = Mark.define("Emphasis", {
  rank: 50,
  shape: { element: "em" },
});

export const Strong = Mark.define("Strong", {
  rank: 60,
  shape: { element: "strong" },
});

/**
 * 傍点。要素ではなくスタイルで表すマーク。
 * 縦書きでは自動的に文字の右側に付く。
 */
export const EmphasisDots = Mark.define("EmphasisDots", {
  rank: 43,
  spanning: true,
  shape: { attribute: "style/text-emphasis", value: "filled sesame" },
});

export const basicSchema = Schema.define([Doc, Paragraph, Strong, Emphasis, EmphasisDots]);
