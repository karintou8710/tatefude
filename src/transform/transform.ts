import { type Assoc, ChangeSet, Mark, type Plot, Pos, type Schema } from "../doc";
import { JoinBlockStep, MarkStep, ReplaceTextStep, SplitBlockStep, type Step } from "./step";

/**
 * ステップを積んでドキュメントを書き換えていく器。
 *
 * 積んだ操作は {@link ChangeSet} 1 個に合成されていく。位置の写像も、
 * どこが変わったかも、この 1 個から読める。
 *
 * ステップを適用するたびにスキーマの検査を通す。検査済みのノードは Schema 側の
 * WeakSet に覚えられるので、変わっていない部分は見直されない。
 *
 * 雛形はブロックが doc の直下に並ぶ平らな構造だけを相手にしている
 * (リストや引用のような入れ子は M1)。
 */
export class Transform {
  doc: Plot;
  readonly steps: Step[] = [];
  /** ステップごとの変更。部分的な写像に使う。 */
  readonly stepChanges: ChangeSet[] = [];
  changes: ChangeSet;

  constructor(
    readonly schema: Schema,
    doc: Plot,
  ) {
    this.doc = doc;
    this.changes = ChangeSet.empty(doc.contentLength);
  }

  get docChanged(): boolean {
    return this.steps.length > 0;
  }

  /** 位置を今の doc の座標に写す */
  map(pos: number, assoc: Assoc = 1): number {
    return this.changes.mapPos(pos, assoc);
  }

  /** from 番目のステップから先だけで写す */
  mapFrom(pos: number, from: number, assoc: Assoc = 1): number {
    let result = pos;
    for (let i = from; i < this.stepChanges.length; i++) {
      result = this.stepChanges[i].mapPos(result, assoc);
    }
    return result;
  }

  step(step: Step): this {
    const changes = step.getChanges(this.doc);
    const next = changes.apply(this.doc);
    this.schema.validate(next);
    this.steps.push(step);
    this.stepChanges.push(changes);
    this.changes = this.changes.compose(changes);
    this.doc = next;
    return this;
  }

  /** [from, to) を text に置き換える。ブロックを跨いでもよい。 */
  replaceWithText(from: number, to: number, text: string, marks: Mark.Set = Mark.none): this {
    const $from = Pos.resolve(this.doc, from);
    const $to = Pos.resolve(this.doc, to);
    if ($from.parent === $to.parent && $from.parent.isTextblock && !text.includes("\n")) {
      return this.step(new ReplaceTextStep(from, to, text, marks));
    }
    this.deleteRange(from, to);
    return this.insertText(this.map(from, 1), text, marks);
  }

  insertText(pos: number, text: string, marks: Mark.Set = Mark.none): this {
    if (!text) return this;
    const parts = text.split("\n");
    let at = pos;
    for (let i = 0; i < parts.length; i++) {
      if (i > 0) {
        this.step(new SplitBlockStep(at));
        // 分割で閉じ + 開きの 2 つが入るので、次のブロックの中身はここから始まる
        at += 2;
      }
      if (parts[i]) {
        this.step(new ReplaceTextStep(at, at, parts[i], marks));
        at += parts[i].length;
      }
    }
    return this;
  }

  deleteRange(from: number, to: number): this {
    if (from >= to) return this;
    const $from = Pos.resolve(this.doc, from);
    const $to = Pos.resolve(this.doc, to);
    if (!$from.parent.isTextblock || !$to.parent.isTextblock) {
      throw new RangeError("削除範囲の端がテキストブロックの中にない");
    }
    if ($from.parent === $to.parent) {
      return this.step(new ReplaceTextStep(from, to, "", Mark.none));
    }

    // 1. 最初のブロックの末尾を削る
    const endOfFirst = $from.end();
    if (endOfFirst > from) this.step(new ReplaceTextStep(from, endOfFirst, "", Mark.none));

    // 2. 最後のブロックの先頭を削る
    const mappedTo = this.map(to, -1);
    const $mappedTo = Pos.resolve(this.doc, mappedTo);
    const startOfLast = $mappedTo.start();
    if (mappedTo > startOfLast) {
      this.step(new ReplaceTextStep(startOfLast, mappedTo, "", Mark.none));
    }

    // 3. 間のブロックを空にしつつ、順に結合していく
    const joins = $to.index(0) - $from.index(0);
    for (let i = 0; i < joins; i++) {
      const at = this.map(from, 1);
      const $at = Pos.resolve(this.doc, at);
      const boundary = $at.after($at.depth);
      if (i < joins - 1) {
        // 中間のブロックは丸ごと消える
        const $boundary = Pos.resolve(this.doc, boundary);
        const next = $boundary.parent.child($boundary.index($boundary.depth));
        if (next.isPlot && next.contentLength) {
          this.step(
            new ReplaceTextStep(boundary + 1, boundary + 1 + next.contentLength, "", Mark.none),
          );
        }
      }
      this.step(new JoinBlockStep(boundary));
    }
    return this;
  }

  splitBlock(pos: number): this {
    return this.step(new SplitBlockStep(pos));
  }

  /** pos の境界で前後のブロックを結合する */
  joinBlocks(pos: number): this {
    return this.step(new JoinBlockStep(pos));
  }

  addMark(from: number, to: number, mark: Mark): this {
    this.eachTextblockRange(from, to, (f, t) => this.step(new MarkStep(f, t, mark, true)));
    return this;
  }

  removeMark(from: number, to: number, mark: Mark): this {
    this.eachTextblockRange(from, to, (f, t) => this.step(new MarkStep(f, t, mark, false)));
    return this;
  }

  /** [from, to) と重なるテキストブロックごとに、その中の範囲を渡す */
  private eachTextblockRange(
    from: number,
    to: number,
    f: (from: number, to: number) => void,
  ): void {
    const ranges: [number, number][] = [];
    let offset = 0;
    for (const child of this.doc.content) {
      if (child.isPlot && child.isTextblock) {
        const start = offset + 1;
        const end = start + child.contentLength;
        const rangeFrom = Math.max(from, start);
        const rangeTo = Math.min(to, end);
        if (rangeFrom < rangeTo) ranges.push([rangeFrom, rangeTo]);
      }
      offset += child.length;
    }
    for (const [rangeFrom, rangeTo] of ranges) f(rangeFrom, rangeTo);
  }
}
