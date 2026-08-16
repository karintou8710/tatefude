import type { Plot } from "./node";
import { buildPlot, Slice, sliceDoc, type Token } from "./slice";

/**
 * ドキュメントの変更を 1 個の値として表したもの。
 *
 * Wordgard / CodeMirror と同じ「区間の並び」で持つ。ステップの列と違って
 * **合成・逆・位置の写像がすべて ChangeSet のまま閉じている**のが利点。
 *
 * `sections` は 2 個ずつの組:
 * - 1 つ目 = もとの doc でのその区間の長さ
 * - 2 つ目 = `-1` なら「そのまま」、0 以上なら「その長さに置き換え」
 *
 * 置き換える内容は {@link Slice} (トークンの並び) で `inserted` に入る。
 */
export interface ChangeSpec {
  from: number;
  to?: number;
  insert?: Slice | readonly Token[];
  /** 木として成立する形に直してから使う (fitChange を通す) */
  fit?: boolean;
}

function toSlice(insert: Slice | readonly Token[] | undefined): Slice {
  if (!insert) return Slice.empty;
  return insert instanceof Slice ? insert : Slice.of(insert);
}

export type Assoc = -1 | 1;

export class ChangeSet {
  private constructor(
    /** [長さ, -1 か 置換後の長さ] の並び */
    readonly sections: readonly number[],
    /** 区間ごとの挿入内容 (そのままの区間は null) */
    readonly inserted: readonly (Slice | null)[],
  ) {}

  /** @internal */
  static build(sections: readonly number[], inserted: readonly (Slice | null)[]): ChangeSet {
    return new ChangeSet(sections, inserted);
  }

  /** 何も変えない変更 */
  static empty(length: number): ChangeSet {
    return length ? new ChangeSet([length, -1], [null]) : new ChangeSet([], []);
  }

  /** 置換の指定から組み立てる */
  static of(specs: ChangeSpec | readonly ChangeSpec[], docLength: number): ChangeSet {
    const list = (Array.isArray(specs) ? specs : [specs]) as readonly ChangeSpec[];
    const sorted = [...list]
      .map((spec) => ({
        from: spec.from,
        to: spec.to ?? spec.from,
        insert: toSlice(spec.insert),
      }))
      .sort((a, b) => a.from - b.from || a.to - b.to);

    const builder = new ChangeBuilder();
    let pos = 0;
    for (const spec of sorted) {
      if (spec.from < pos) throw new RangeError("置換の範囲が重なっている");
      if (spec.to > docLength) throw new RangeError("置換の範囲がドキュメントの外にある");
      builder.keep(spec.from - pos);
      builder.replace(spec.to - spec.from, spec.insert);
      pos = spec.to;
    }
    builder.keep(docLength - pos);
    return builder.finish();
  }

  get length(): number {
    let total = 0;
    for (let i = 0; i < this.sections.length; i += 2) total += this.sections[i];
    return total;
  }

  get newLength(): number {
    let total = 0;
    for (let i = 0; i < this.sections.length; i += 2) {
      const ins = this.sections[i + 1];
      total += ins < 0 ? this.sections[i] : ins;
    }
    return total;
  }

  get empty(): boolean {
    for (let i = 1; i < this.sections.length; i += 2) {
      if (this.sections[i] >= 0) return false;
    }
    return true;
  }

  eq(other: ChangeSet): boolean {
    if (this.sections.length !== other.sections.length) return false;
    return (
      this.sections.every((value, i) => value === other.sections[i]) &&
      this.inserted.every((slice, i) => {
        const theirs = other.inserted[i];
        return slice === theirs || (!!slice && !!theirs && slice.eq(theirs));
      })
    );
  }

  /** 変更を適用した doc を返す */
  apply(doc: Plot): Plot {
    if (this.length !== doc.contentLength) {
      throw new RangeError(`変更の長さ (${this.length}) が doc (${doc.contentLength}) と合わない`);
    }
    if (this.empty) return doc;
    const tokens = [];
    let pos = 0;
    for (let i = 0; i < this.sections.length; i += 2) {
      const len = this.sections[i];
      const ins = this.sections[i + 1];
      if (ins < 0) tokens.push(...sliceDoc(doc, pos, pos + len).tokens);
      else tokens.push(...(this.inserted[i / 2] ?? Slice.empty).tokens);
      pos += len;
    }
    return buildPlot(doc.tag, tokens);
  }

  /** 位置を変更後の座標に写す */
  mapPos(pos: number, assoc: Assoc = 1): number {
    let posA = 0;
    let posB = 0;
    for (let i = 0; i < this.sections.length; i += 2) {
      const len = this.sections[i];
      const ins = this.sections[i + 1];
      const endA = posA + len;
      if (ins < 0) {
        // 区間の終わりちょうどは、次の区間 (挿入かもしれない) に判断を渡す
        if (pos < endA) return posB + (pos - posA);
        posB += len;
      } else {
        if (pos <= endA) {
          const side = len === 0 ? assoc : pos === posA ? -1 : pos === endA ? 1 : assoc;
          return side < 0 ? posB : posB + ins;
        }
        posB += ins;
      }
      posA = endA;
    }
    return posB;
  }

  /** 変わった区間 (もとの座標と変更後の座標) を順に渡す */
  iterChanges(
    f: (fromA: number, toA: number, fromB: number, toB: number, inserted: Slice) => void,
  ): void {
    let posA = 0;
    let posB = 0;
    for (let i = 0; i < this.sections.length; i += 2) {
      const len = this.sections[i];
      const ins = this.sections[i + 1];
      if (ins < 0) {
        posA += len;
        posB += len;
      } else {
        f(posA, posA + len, posB, posB + ins, this.inserted[i / 2] ?? Slice.empty);
        posA += len;
        posB += ins;
      }
    }
  }

  /** 変わらなかった区間を順に渡す */
  iterGaps(f: (fromA: number, fromB: number, length: number) => void): void {
    let posA = 0;
    let posB = 0;
    for (let i = 0; i < this.sections.length; i += 2) {
      const len = this.sections[i];
      const ins = this.sections[i + 1];
      if (ins < 0) {
        f(posA, posB, len);
        posA += len;
        posB += len;
      } else {
        posA += len;
        posB += ins;
      }
    }
  }

  /** [from, to) に変更が掛かっているか */
  touchesRange(from: number, to: number): boolean {
    let touched = false;
    this.iterChanges((fromA, toA) => {
      if (fromA <= to && toA >= from) touched = true;
    });
    return touched;
  }

  /** 変更前の doc を使って、逆向きの変更を作る */
  invert(doc: Plot): ChangeSet {
    const sections: number[] = [];
    const inserted: (Slice | null)[] = [];
    let pos = 0;
    for (let i = 0; i < this.sections.length; i += 2) {
      const len = this.sections[i];
      const ins = this.sections[i + 1];
      if (ins < 0) {
        sections.push(len, -1);
        inserted.push(null);
      } else {
        const removed = sliceDoc(doc, pos, pos + len);
        sections.push(ins, len);
        inserted.push(removed);
      }
      pos += len;
    }
    return new ChangeSet(sections, inserted);
  }

  /**
   * この変更のあとに other を適用したのと同じ 1 個の変更を作る。
   * `other` はこの変更を適用した doc の上の変更であること。
   *
   * この変更の出力を「区間の待ち行列」にして、other をその上に流す。
   */
  compose(other: ChangeSet): ChangeSet {
    if (this.newLength !== other.length) {
      throw new RangeError(`合成できない (${this.newLength} と ${other.length})`);
    }
    if (this.empty) return other;
    if (other.empty) return this;

    const queue = outputQueue(this);
    const builder = new ChangeBuilder();

    /** 空になった置換区間 (削除だけ) を先に片付ける。放っておくと消費が進まない。 */
    const drainEmpty = (): void => {
      while (queue.length && queue[0].kind === "insert") {
        const front = queue[0] as { kind: "insert"; slice: Slice; aDeleted: number };
        if (!front.slice.empty) break;
        queue.shift();
        builder.replace(front.aDeleted, Slice.empty);
      }
    };

    /** 先頭の区間を n だけ消費する。keep なら消費した長さ、置換なら 0 を返す。 */
    const takeFront = (n: number): { taken: number; aDeleted: number; slice: Slice } => {
      const front = queue[0];
      if (front.kind === "keep") {
        const taken = Math.min(n, front.length);
        front.length -= taken;
        if (!front.length) queue.shift();
        return { taken, aDeleted: taken, slice: Slice.empty };
      }
      const taken = Math.min(n, front.slice.length);
      const slice = front.slice.slice(0, taken);
      const aDeleted = front.aDeleted;
      front.aDeleted = 0;
      front.slice = front.slice.slice(taken);
      if (front.slice.empty) queue.shift();
      return { taken, aDeleted, slice };
    };

    for (let i = 0; i < other.sections.length; i += 2) {
      const len = other.sections[i];
      const ins = other.sections[i + 1];
      if (ins < 0) {
        // そのままの区間: A 側の出力をそのまま通す
        let left = len;
        while (left > 0) {
          drainEmpty();
          if (!queue.length) break;
          const front = queue[0];
          if (front.kind === "keep") {
            const { taken } = takeFront(left);
            builder.keep(taken);
            left -= taken;
          } else {
            const { taken, aDeleted, slice } = takeFront(left);
            builder.replace(aDeleted, slice);
            left -= taken;
          }
        }
      } else {
        // 置換の区間: A 側の出力を食い潰して、B の内容を出す
        let left = len;
        let deleted = 0;
        while (left > 0) {
          drainEmpty();
          if (!queue.length) break;
          const { taken, aDeleted } = takeFront(left);
          deleted += aDeleted;
          left -= taken;
        }
        builder.replace(deleted, other.inserted[i / 2] ?? Slice.empty);
      }
      // 使い切った置換区間に削除だけが残っていたら出しておく
      drainEmpty();
    }

    // 残りをそのまま流す
    for (const item of queue) {
      if (item.kind === "keep") builder.keep(item.length);
      else builder.replace(item.aDeleted, item.slice);
    }
    return builder.finish();
  }

  toString(): string {
    const parts: string[] = [];
    for (let i = 0; i < this.sections.length; i += 2) {
      const len = this.sections[i];
      const ins = this.sections[i + 1];
      parts.push(ins < 0 ? `keep ${len}` : `replace ${len} -> ${this.inserted[i / 2] ?? "∅"}`);
    }
    return parts.join(", ");
  }
}

type QueueItem =
  | { kind: "keep"; length: number }
  | { kind: "insert"; slice: Slice; aDeleted: number };

/** 変更の「出力側」を区間の待ち行列にする */
function outputQueue(set: ChangeSet): QueueItem[] {
  const queue: QueueItem[] = [];
  for (let i = 0; i < set.sections.length; i += 2) {
    const len = set.sections[i];
    const ins = set.sections[i + 1];
    if (ins < 0) {
      if (len) queue.push({ kind: "keep", length: len });
    } else {
      queue.push({ kind: "insert", slice: set.inserted[i / 2] ?? Slice.empty, aDeleted: len });
    }
  }
  return queue;
}

/** 区間を足しながら ChangeSet を組み立てる。隣り合う同種の区間はまとめる。 */
export class ChangeBuilder {
  private readonly sections: number[] = [];
  private readonly inserted: (Slice | null)[] = [];

  keep(length: number): void {
    if (length <= 0) return;
    const last = this.sections.length;
    if (last && this.sections[last - 1] === -1) this.sections[last - 2] += length;
    else {
      this.sections.push(length, -1);
      this.inserted.push(null);
    }
  }

  replace(deleted: number, insert: Slice): void {
    if (deleted <= 0 && insert.empty) return;
    const last = this.sections.length;
    if (last && this.sections[last - 1] >= 0) {
      this.sections[last - 2] += deleted;
      this.sections[last - 1] += insert.length;
      const index = last / 2 - 1;
      this.inserted[index] = (this.inserted[index] ?? Slice.empty).append(insert);
    } else {
      this.sections.push(deleted, insert.length);
      this.inserted.push(insert);
    }
  }

  /** 削除と挿入をまとめて足す */
  emit(deleted: number, insert: Slice): void {
    this.replace(deleted, insert);
  }

  finish(): ChangeSet {
    return ChangeSet.build(this.sections, this.inserted);
  }
}
