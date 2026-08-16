import { Mark } from "./mark";
import { findIndex, type Leaf, type Node, type Plot } from "./node";

type PathEntry = Plot | number;

/**
 * 解決済みの位置。数値の位置に「どの plot の何番目か」という文脈を付けたもの。
 * path は [plot, index, その plot の開始位置] の 3 つ組の並び。
 */
export class Pos {
  readonly depth: number;

  private constructor(
    readonly pos: number,
    private readonly path: readonly PathEntry[],
    readonly parentOffset: number,
  ) {
    this.depth = path.length / 3 - 1;
  }

  static resolve(doc: Plot, pos: number): Pos {
    if (!(pos >= 0 && pos <= doc.contentLength)) {
      throw new RangeError(`Position ${pos} out of range`);
    }
    const path: PathEntry[] = [];
    let start = 0;
    let parentOffset = pos;
    let node: Plot = doc;
    for (;;) {
      const { index, offset } = findIndex(node.content, parentOffset);
      const rem = parentOffset - offset;
      path.push(node, index, start + offset);
      if (!rem) break;
      const child = node.maybeChild(index);
      if (!child || child.isLeaf) break;
      node = child;
      parentOffset = rem - 1;
      start += offset + 1;
    }
    return new Pos(pos, path, parentOffset);
  }

  private resolveDepth(depth?: number): number {
    if (depth == null) return this.depth;
    return depth < 0 ? this.depth + depth : depth;
  }

  node(depth?: number): Plot {
    return this.path[this.resolveDepth(depth) * 3] as Plot;
  }

  index(depth?: number): number {
    return this.path[this.resolveDepth(depth) * 3 + 1] as number;
  }

  /** その plot の中身が始まる位置 */
  start(depth?: number): number {
    const d = this.resolveDepth(depth);
    return d === 0 ? 0 : (this.path[d * 3 - 1] as number) + 1;
  }

  /** その plot の中身が終わる位置 */
  end(depth?: number): number {
    const d = this.resolveDepth(depth);
    return this.start(d) + this.node(d).contentLength;
  }

  /** その plot の直前の位置 */
  before(depth?: number): number {
    const d = this.resolveDepth(depth);
    if (!d) throw new RangeError("トップの前には位置がない");
    return d === this.depth + 1 ? this.pos : (this.path[d * 3 - 1] as number);
  }

  /** その plot の直後の位置 */
  after(depth?: number): number {
    const d = this.resolveDepth(depth);
    if (!d) throw new RangeError("トップの後には位置がない");
    return d === this.depth + 1 ? this.pos : (this.path[d * 3 - 1] as number) + this.node(d).length;
  }

  get parent(): Plot {
    return this.node(this.depth);
  }

  /** テキストの途中にいるときの、そのテキスト内オフセット */
  get textOffset(): number {
    return this.pos - (this.path[this.path.length - 1] as number);
  }

  get nodeBefore(): Node | null {
    const index = this.index(this.depth);
    const offset = this.textOffset;
    if (offset) {
      const child = this.parent.child(index);
      return child.isLeaf && child.isText ? (child as Leaf<string>).sliceText(0, offset) : child;
    }
    return index === 0 ? null : this.parent.maybeChild(index - 1);
  }

  get nodeAfter(): Node | null {
    const parent = this.parent;
    const index = this.index(this.depth);
    if (index === parent.childCount) return null;
    const child = parent.child(index);
    const offset = this.textOffset;
    if (!offset) return child;
    return child.isLeaf && child.isText ? (child as Leaf<string>).sliceText(offset) : child;
  }

  /** この位置に文字を挿し込んだときに引き継ぐマーク */
  marks(): Mark.Set {
    const parent = this.parent;
    if (!parent.contentLength) return Mark.none;
    if (this.textOffset) return parent.child(this.index(this.depth)).marks;
    const before = this.nodeBefore;
    if (before?.isInline) return before.marks.filter((mark) => mark.type.inclusive);
    const after = this.nodeAfter;
    return after?.isInline ? after.marks.filter((mark) => mark.type.inclusive) : Mark.none;
  }

  /** この位置を含む一番内側のテキストブロックの深さ */
  textblockDepth(): number | null {
    for (let d = this.depth; d >= 0; d--) {
      if (this.node(d).isTextblock) return d;
    }
    return null;
  }

  toString(): string {
    return `Pos(${this.pos}, depth=${this.depth}, parent=${this.parent.name})`;
  }
}
