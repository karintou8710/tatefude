import type { ChangeSet } from "../doc";
import { Facet } from "./facet";

/** doc は変えずに見た目だけを足す。IME 変換中の下線がこれ */
export interface InlineDecoration {
  from: number;
  to: number;
  class?: string;
  style?: string;
}

export class DecorationSet {
  static readonly empty = new DecorationSet([]);

  constructor(readonly decorations: readonly InlineDecoration[]) {}

  static create(decorations: readonly InlineDecoration[]): DecorationSet {
    const valid = decorations.filter((d) => d.from < d.to);
    return valid.length ? new DecorationSet(valid) : DecorationSet.empty;
  }

  /**
   * 供給された分を 1 つに畳む。**位置順に並べる** — 供給の順で描くと、同じ位置の
   * 重なりが構成の並び順に左右される
   */
  static join(sets: readonly DecorationSet[]): DecorationSet {
    if (sets.length === 1) return sets[0];
    const all = sets.flatMap((set) => set.decorations);
    return DecorationSet.create([...all].sort((a, b) => a.from - b.from || a.to - b.to));
  }

  /** [from, to) と重なる装飾 */
  find(from: number, to: number): InlineDecoration[] {
    return this.decorations.filter((d) => d.from < to && d.to > from);
  }

  map(changes: ChangeSet): DecorationSet {
    if (!this.decorations.length) return this;
    return DecorationSet.create(
      this.decorations.map((d) => ({
        ...d,
        from: changes.mapPos(d.from, -1),
        to: changes.mapPos(d.to, 1),
      })),
    );
  }

  /** 再描画が要るかの判定に使う軽い署名 */
  get signature(): string {
    return signatureOf(this.decorations);
  }
}

/** 中身が同じなら同じ文字列。ブロックごとの再描画の判定にも使う (view/block-view.ts) */
export function signatureOf(decorations: readonly InlineDecoration[]): string {
  return decorations.map((d) => `${d.from}-${d.to}:${d.class ?? ""}:${d.style ?? ""}`).join("|");
}

/**
 * 描画に重ねる装飾。DOM を持たないので view ではなく state 側に置く。
 * **畳むのは facet の仕事**にしてある — 読む側は 1 つのセットだけを見ればよい
 */
export const decorations: Facet<DecorationSet, DecorationSet> = Facet.define<
  DecorationSet,
  DecorationSet
>({
  combine: (sets) => (sets.length ? DecorationSet.join(sets) : DecorationSet.empty),
});
