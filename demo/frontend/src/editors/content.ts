import { Bouten, Leaf, Mark, type Node, Ruby, RubyBase, RubyText, Strong, Tcy } from "tatefude";

/** ドキュメントを組み立てる小道具。どのエディタからも使う */

export function text(value: string): Leaf<string> {
  return Leaf.text(value);
}

export function ruby(base: string, reading: string): Node {
  return Ruby.create([RubyBase.create([text(base)]), RubyText.create([text(reading)])]);
}

/** 縦中横。縦書きの行の中でここだけ横に組む */
export function tcy(value: string): Node {
  return Tcy.create([text(value)]);
}

/** 傍点。日本語組版での強調 */
export function bouten(value: string): Node {
  return Leaf.text(value, Bouten.addToSet(Mark.none));
}

export function strong(value: string): Node {
  return Leaf.text(value, Strong.addToSet(Mark.none));
}
