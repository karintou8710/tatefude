import type { Node, Plot } from "./node";

/** OBJECT REPLACEMENT CHARACTER。atom 1 個を 1 文字として数えるための代役 */
export const ATOM_CHAR = "￼";

interface Segment {
  /** doc 上でこの断片が始まる位置 */
  docFrom: number;
  /** フラット文字列上でこの断片が始まるオフセット */
  offset: number;
  length: number;
}

/**
 * テキストブロックを 1 本のフラットな文字列として見せる対応表。EditContext のバッファに
 * 載せるのはこの text で、オフセットは UTF-16 code unit。
 */
export class TextblockMap {
  constructor(
    /** ブロックの開きトークンの位置 */
    readonly blockFrom: number,
    readonly text: string,
    private readonly segments: readonly Segment[],
  ) {}

  /** ブロックの中身が始まる doc 位置 */
  get contentStart(): number {
    return this.blockFrom + 1;
  }

  get length(): number {
    return this.text.length;
  }

  posToOffset(pos: number): number {
    for (const segment of this.segments) {
      if (pos >= segment.docFrom && pos <= segment.docFrom + segment.length) {
        return segment.offset + (pos - segment.docFrom);
      }
    }
    return pos <= this.contentStart ? 0 : this.text.length;
  }

  offsetToPos(offset: number): number {
    const clamped = Math.max(0, Math.min(offset, this.text.length));
    for (const segment of this.segments) {
      if (clamped >= segment.offset && clamped <= segment.offset + segment.length) {
        return segment.docFrom + (clamped - segment.offset);
      }
    }
    return this.contentStart;
  }

  eq(other: TextblockMap): boolean {
    return this.blockFrom === other.blockFrom && this.text === other.text;
  }
}

export function buildTextblockMap(block: Plot, blockFrom: number): TextblockMap {
  const segments: Segment[] = [];
  let text = "";
  const contentStart = blockFrom + 1;
  let offset = 0;
  for (const child of block.content as readonly Node[]) {
    const docFrom = contentStart + offset;
    if (child.isLeaf && child.isText) {
      segments.push({ docFrom, offset: text.length, length: child.length });
      text += child.text;
    } else if (child.isInline) {
      segments.push({ docFrom, offset: text.length, length: 1 });
      text += ATOM_CHAR;
    }
    offset += child.length;
  }
  return new TextblockMap(blockFrom, text, segments);
}
