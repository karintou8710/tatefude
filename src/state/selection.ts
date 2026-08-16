import type { ChangeSet, Mark, Node, Plot } from "../doc";
import { Pos } from "../doc";

/**
 * 選択の基底。Wordgard に倣って、テキスト選択とノード選択を別の型にし、
 * 拡張が独自の選択型を足せるようにしてある。
 */
export abstract class Selection {
  protected constructor(
    readonly $anchor: Pos,
    readonly $head: Pos,
    /**
     * この選択で次に入力される文字に付くマーク。
     * ProseMirror の storedMarks に当たるが、状態ではなく選択が持つ (Wordgard と同じ)。
     */
    readonly activeMarks: Mark.Set | null = null,
  ) {}

  /** マークを差し替えた選択 */
  abstract withMarks(marks: Mark.Set | null): Selection;

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
    return (
      this.constructor === other.constructor &&
      this.anchor === other.anchor &&
      this.head === other.head
    );
  }

  abstract map(doc: Plot, changes: ChangeSet): Selection;

  toJSON(): { type: string; anchor: number; head: number } {
    return { type: this.constructor.name, anchor: this.anchor, head: this.head };
  }

  /** pos に一番近い、テキストを置ける位置にキャレットを置く */
  static near(doc: Plot, pos: number, bias: -1 | 1 = 1): TextSelection {
    const $pos = resolveNear(doc, pos, bias);
    return new TextSelection($pos, $pos);
  }

  static atStart(doc: Plot): TextSelection {
    return Selection.near(doc, 0, 1);
  }

  static atEnd(doc: Plot): TextSelection {
    return Selection.near(doc, doc.contentLength, -1);
  }
}

/** テキストの範囲 (キャレットを含む) */
export class TextSelection extends Selection {
  map(doc: Plot, changes: ChangeSet): TextSelection {
    return new TextSelection(
      resolveNear(doc, changes.mapPos(this.anchor, 1)),
      resolveNear(doc, changes.mapPos(this.head, 1)),
      this.activeMarks,
    );
  }

  withMarks(marks: Mark.Set | null): TextSelection {
    return new TextSelection(this.$anchor, this.$head, marks);
  }

  static create(doc: Plot, anchor: number, head: number = anchor): TextSelection {
    return new TextSelection(Pos.resolve(doc, anchor), Pos.resolve(doc, head));
  }
}

/** ノードそのものの選択 (画像や表など、中身ではなく箱を選ぶとき) */
export class NodeSelection extends Selection {
  private constructor(
    $anchor: Pos,
    $head: Pos,
    readonly node: Node,
    activeMarks: Mark.Set | null = null,
  ) {
    super($anchor, $head, activeMarks);
  }

  /** pos はノードの直前の位置 */
  static create(doc: Plot, pos: number): NodeSelection {
    const node = doc.nodeAt(pos);
    if (!node) throw new RangeError(`位置 ${pos} から始まるノードがない`);
    return new NodeSelection(Pos.resolve(doc, pos), Pos.resolve(doc, pos + node.length), node);
  }

  withMarks(marks: Mark.Set | null): NodeSelection {
    return new NodeSelection(this.$anchor, this.$head, this.node, marks);
  }

  map(doc: Plot, changes: ChangeSet): Selection {
    const pos = changes.mapPos(this.anchor, 1);
    const node = doc.nodeAt(pos);
    // ノードが残っていなければテキスト選択に落とす
    if (!node?.eq(this.node)) return Selection.near(doc, pos);
    return NodeSelection.create(doc, pos);
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
