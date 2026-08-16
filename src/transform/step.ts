import { ChangeSet, Close, Leaf, type Mark, type Plot, Pos, Slice, sliceDoc } from "../doc";

/**
 * ドキュメントへの操作。
 *
 * ステップは「何をしたいか」を型で表す層で、**実際の変更は
 * {@link ChangeSet} に落として適用する**。位置の写像も合成も ChangeSet 側の仕事。
 */
export interface Step {
  /** この操作を、その doc に対する変更として表す */
  getChanges(doc: Plot): ChangeSet;
}

export function applyStep(step: Step, doc: Plot): Plot {
  return step.getChanges(doc).apply(doc);
}

/** 1 つのテキストブロックの中で、[from, to) を text で置き換える */
export class ReplaceTextStep implements Step {
  constructor(
    readonly from: number,
    readonly to: number,
    readonly text: string,
    readonly marks: Mark.Set,
  ) {}

  getChanges(doc: Plot): ChangeSet {
    const $from = Pos.resolve(doc, this.from);
    const $to = Pos.resolve(doc, this.to);
    if ($from.parent !== $to.parent) {
      throw new RangeError("ReplaceTextStep は 1 つのブロックの中でしか使えない");
    }
    if (!$from.parent.isTextblock) {
      throw new RangeError("ReplaceTextStep の対象がテキストブロックではない");
    }
    const insert = this.text ? Slice.of([Leaf.text(this.text, this.marks)]) : Slice.empty;
    return ChangeSet.of({ from: this.from, to: this.to, insert }, doc.contentLength);
  }
}

/** テキストブロックを pos で 2 つに割る */
export class SplitBlockStep implements Step {
  constructor(readonly pos: number) {}

  getChanges(doc: Plot): ChangeSet {
    const $pos = Pos.resolve(doc, this.pos);
    const parent = $pos.parent;
    if (!parent.isTextblock)
      throw new RangeError("SplitBlockStep の対象がテキストブロックではない");
    // 閉じてから、後ろ側のタグで開き直す
    const insert = Slice.of([Close, parent.tag.split()]);
    return ChangeSet.of({ from: this.pos, to: this.pos, insert }, doc.contentLength);
  }
}

/** pos の境界で、前後のテキストブロックを 1 つにまとめる */
export class JoinBlockStep implements Step {
  constructor(readonly pos: number) {}

  getChanges(doc: Plot): ChangeSet {
    const $pos = Pos.resolve(doc, this.pos);
    const parent = $pos.parent;
    const index = $pos.index($pos.depth);
    if (index === 0 || index >= parent.childCount) {
      throw new RangeError("JoinBlockStep の位置にブロックの境界がない");
    }
    const before = parent.child(index - 1);
    const after = parent.child(index);
    if (!before.isPlot || !after.isPlot || !before.isTextblock || !after.isTextblock) {
      throw new RangeError("JoinBlockStep はテキストブロック同士でしか使えない");
    }
    // 前のブロックの閉じと、後ろのブロックの開きを取り除く
    return ChangeSet.of(
      { from: this.pos - 1, to: this.pos + 1, insert: Slice.empty },
      doc.contentLength,
    );
  }
}

/** [from, to) のインラインにマークを足す / 外す */
export class MarkStep implements Step {
  constructor(
    readonly from: number,
    readonly to: number,
    readonly mark: Mark,
    readonly add: boolean,
  ) {}

  getChanges(doc: Plot): ChangeSet {
    const $from = Pos.resolve(doc, this.from);
    const $to = Pos.resolve(doc, this.to);
    if ($from.parent !== $to.parent) {
      throw new RangeError("MarkStep は 1 つのブロックの中でしか使えない");
    }
    const current = sliceDoc(doc, this.from, this.to);
    const marked = current.tokens.map((token) => {
      if (typeof token === "object" && "isInline" in token && token.isInline) {
        const marks = this.add
          ? this.mark.addToSet(token.marks)
          : this.mark.removeFromSet(token.marks);
        return token.withMarks(marks);
      }
      return token;
    });
    return ChangeSet.of(
      { from: this.from, to: this.to, insert: Slice.of(marked) },
      doc.contentLength,
    );
  }
}
