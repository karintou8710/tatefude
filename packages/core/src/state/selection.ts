import type { ChangeSet, Mark, Node, Plot } from "../doc";
import { Pos } from "../doc";

/** テキスト選択とノード選択を別の型にし、拡張が独自の選択型を足せるようにしてある */
export abstract class Selection {
  protected constructor(
    readonly $anchor: Pos,
    readonly $head: Pos,
    /** 次に入力される文字に付くマーク。storedMarks 相当だが、状態ではなく選択が持つ */
    readonly activeMarks: Mark.Set | null = null,
  ) {}

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

  /** pos に一番近い、テキストを置ける位置に寄せる */
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

/** キャレット (空の範囲) もこれ */
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

/** 画像や表など、中身ではなく箱を選ぶとき */
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

/**
 * キャレットが留まれる位置か。テキストブロックの中に加えて、`cursorInsideBounds` を持つ
 * インラインブロック (ルビの rb / rt) の中も認める。ここを認めないと、選択を指定しない
 * トランザクションが挟まるたびにキャレットがインラインブロックの外へ弾き出される。
 */
function isCaretPosition($pos: Pos): boolean {
  const parent = $pos.parent;
  if (!parent.isTextblock && !parent.type.cursorInsideBounds) return false;
  const type = parent.type;
  if (!type.cursorAtContentStart && $pos.pos === $pos.start($pos.depth)) return false;
  if (!type.cursorAtContentEnd && $pos.pos === $pos.end($pos.depth)) return false;
  return true;
}

/** キャレットが留まれる位置に丸める */
export function resolveNear(doc: Plot, pos: number, bias: -1 | 1 = 1): Pos {
  const size = doc.contentLength;
  const target = Math.max(0, Math.min(pos, size));
  const $target = Pos.resolve(doc, target);
  if (isCaretPosition($target)) return $target;
  for (let d = 1; d <= size; d++) {
    for (const candidate of bias > 0 ? [target + d, target - d] : [target - d, target + d]) {
      if (candidate < 0 || candidate > size) continue;
      const $candidate = Pos.resolve(doc, candidate);
      if (isCaretPosition($candidate)) return $candidate;
    }
  }
  throw new RangeError("テキストを置ける位置がドキュメントにない");
}
