// Wordgard (MIT) から派生。著作権表示は LICENSE の "Third-party code" を参照。

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
      // インラインブロックの開き / 閉じは 0 文字なので、どの断片にも入らない位置がある。
      // 断片は doc 順なので、行き過ぎたらその手前に寄せる
      if (pos < segment.docFrom) return segment.offset;
      if (pos <= segment.docFrom + segment.length) {
        return segment.offset + (pos - segment.docFrom);
      }
    }
    return this.text.length;
  }

  /**
   * インラインブロックの境界では、1 つのオフセットに複数の doc 位置が当たる
   * (ルビの手前とルビの中の先頭など)。`bias` が正なら内側 (文書順で後ろ) を採る。
   * 境界の無いブロックではどちらでも同じ位置になる。
   */
  offsetToPos(offset: number, bias: -1 | 1 = -1): number {
    const clamped = Math.max(0, Math.min(offset, this.text.length));
    let last: number | null = null;
    for (const segment of this.segments) {
      if (clamped >= segment.offset && clamped <= segment.offset + segment.length) {
        const pos = segment.docFrom + (clamped - segment.offset);
        if (bias < 0) return pos;
        last = pos;
      }
    }
    return last ?? this.contentStart;
  }

  eq(other: TextblockMap): boolean {
    return this.blockFrom === other.blockFrom && this.text === other.text;
  }
}

export function buildTextblockMap(block: Plot, blockFrom: number): TextblockMap {
  const segments: Segment[] = [];
  let text = "";

  /**
   * インラインブロック (中身を持つインライン Plot) は中身を展開する。開きと閉じは
   * **0 文字**に写す — バッファは DOM のテキストと一致していなければならず
   * (`Range.toString()` で測るため)、要素の境界に対応する文字が DOM に無いから。
   */
  const scan = (plot: Plot, contentStart: number): void => {
    let pos = contentStart;
    for (const child of plot.content as readonly Node[]) {
      if (child.isLeaf && child.isText) {
        segments.push({ docFrom: pos, offset: text.length, length: child.length });
        text += child.text;
      } else if (child.isPlot) {
        // 箱の外側の端は中の断片では表せない。0 文字の断片で押さえないと、そのオフセットから
        // doc 位置に戻すとき必ず箱の中へ吸い込まれる
        segments.push({ docFrom: pos, offset: text.length, length: 0 });
        scan(child, pos + 1);
        segments.push({ docFrom: pos + child.length, offset: text.length, length: 0 });
      } else if (child.isInline) {
        segments.push({ docFrom: pos, offset: text.length, length: 1 });
        text += ATOM_CHAR;
      }
      pos += child.length;
    }
  };

  scan(block, blockFrom + 1);
  return new TextblockMap(blockFrom, text, segments);
}
