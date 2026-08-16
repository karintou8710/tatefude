import type { ChangeSet } from "../doc";

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
    return this.decorations
      .map((d) => `${d.from}-${d.to}:${d.class ?? ""}:${d.style ?? ""}`)
      .join("|");
  }
}
