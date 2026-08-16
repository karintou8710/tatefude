import { type Plot, Pos } from "../doc";
import type { Mapping } from "../transform/mapping";

/** 雛形ではテキスト選択しか持たない (ノード選択は M1) */
export type Selection = TextSelection;

export class TextSelection {
  constructor(
    readonly $anchor: Pos,
    readonly $head: Pos,
  ) {}

  get anchor(): number {
    return this.$anchor.pos;
  }
  get head(): number {
    return this.$head.pos;
  }
  get from(): number {
    return Math.min(this.anchor, this.head);
  }
  get to(): number {
    return Math.max(this.anchor, this.head);
  }
  get $from(): Pos {
    return this.anchor <= this.head ? this.$anchor : this.$head;
  }
  get $to(): Pos {
    return this.anchor <= this.head ? this.$head : this.$anchor;
  }
  get empty(): boolean {
    return this.anchor === this.head;
  }

  eq(other: Selection): boolean {
    return this.anchor === other.anchor && this.head === other.head;
  }

  map(doc: Plot, mapping: Mapping): TextSelection {
    return new TextSelection(
      resolveNear(doc, mapping.map(this.anchor, 1)),
      resolveNear(doc, mapping.map(this.head, 1)),
    );
  }

  toJSON(): { anchor: number; head: number } {
    return { anchor: this.anchor, head: this.head };
  }

  static create(doc: Plot, anchor: number, head: number = anchor): TextSelection {
    return new TextSelection(Pos.resolve(doc, anchor), Pos.resolve(doc, head));
  }

  /** pos に一番近い、テキストを置ける位置を選ぶ */
  static near(doc: Plot, pos: number, bias: -1 | 1 = 1): TextSelection {
    const $pos = resolveNear(doc, pos, bias);
    return new TextSelection($pos, $pos);
  }

  static atStart(doc: Plot): TextSelection {
    return TextSelection.near(doc, 0, 1);
  }

  static atEnd(doc: Plot): TextSelection {
    return TextSelection.near(doc, doc.contentLength, -1);
  }
}

/** テキストブロックの中に収まる位置に丸めて解決する */
export function resolveNear(doc: Plot, pos: number, bias: -1 | 1 = 1): Pos {
  const size = doc.contentLength;
  const target = Math.max(0, Math.min(pos, size));
  const $target = Pos.resolve(doc, target);
  if ($target.parent.isTextblock) return $target;
  for (let d = 1; d <= size; d++) {
    for (const candidate of bias > 0 ? [target + d, target - d] : [target - d, target + d]) {
      if (candidate < 0 || candidate > size) continue;
      const $candidate = Pos.resolve(doc, candidate);
      if ($candidate.parent.isTextblock) return $candidate;
    }
  }
  throw new RangeError("テキストを置ける位置がドキュメントにない");
}
