import { appendContent, cutContent, Leaf, type Mark, type Node, type Plot, Pos } from "../doc";
import { StepMap } from "./mapping";

export interface Step {
  apply(doc: Plot): Plot;
  getMap(): StepMap;
}

/**
 * $pos の depth にある plot を replacement で差し替えた doc を返す。
 * 祖先を根まで作り直す。
 */
export function replaceNodeAtDepth($pos: Pos, depth: number, replacement: Plot): Plot {
  let node = replacement;
  for (let d = depth; d > 0; d--) {
    node = $pos.node(d - 1).replaceChildren($pos.index(d - 1), 1, [node]);
  }
  return node;
}

/** 1 つのテキストブロックの中で、[from, to) を text で置き換える */
export class ReplaceTextStep implements Step {
  constructor(
    readonly from: number,
    readonly to: number,
    readonly text: string,
    readonly marks: Mark.Set,
  ) {}

  apply(doc: Plot): Plot {
    const $from = Pos.resolve(doc, this.from);
    const $to = Pos.resolve(doc, this.to);
    if ($from.parent !== $to.parent) {
      throw new RangeError("ReplaceTextStep は 1 つのブロックの中でしか使えない");
    }
    const parent = $from.parent;
    if (!parent.isTextblock) {
      throw new RangeError("ReplaceTextStep の対象がテキストブロックではない");
    }
    const start = $from.start();
    const inserted: readonly Node[] = this.text ? [Leaf.text(this.text, this.marks)] : [];
    const content = appendContent(
      appendContent(cutContent(parent.content, 0, this.from - start), inserted),
      cutContent(parent.content, this.to - start),
    );
    return replaceNodeAtDepth($from, $from.depth, parent.withContent(content));
  }

  getMap(): StepMap {
    return new StepMap([this.from, this.to - this.from, this.text.length]);
  }
}

/** テキストブロックを pos で 2 つに割る */
export class SplitBlockStep implements Step {
  constructor(readonly pos: number) {}

  apply(doc: Plot): Plot {
    const $pos = Pos.resolve(doc, this.pos);
    const parent = $pos.parent;
    if (!parent.isTextblock)
      throw new RangeError("SplitBlockStep の対象がテキストブロックではない");
    const offset = this.pos - $pos.start();
    const before = parent.withContent(cutContent(parent.content, 0, offset));
    // 後ろ側は keepOnSplit のマークだけを引き継ぐ
    const after = parent.tag.split().create(cutContent(parent.content, offset));
    const grandDepth = $pos.depth - 1;
    const grand = $pos.node(grandDepth);
    return replaceNodeAtDepth(
      $pos,
      grandDepth,
      grand.replaceChildren($pos.index(grandDepth), 1, [before, after]),
    );
  }

  getMap(): StepMap {
    return new StepMap([this.pos, 0, 2]);
  }
}

/** pos の境界で、前後のテキストブロックを 1 つにまとめる */
export class JoinBlockStep implements Step {
  constructor(readonly pos: number) {}

  apply(doc: Plot): Plot {
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
    const joined = before.withContent(appendContent(before.content, after.content));
    return replaceNodeAtDepth($pos, $pos.depth, parent.replaceChildren(index - 1, 2, [joined]));
  }

  getMap(): StepMap {
    // 前のブロックの閉じと後ろのブロックの開きが消える
    return new StepMap([this.pos - 1, 2, 0]);
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

  apply(doc: Plot): Plot {
    const $from = Pos.resolve(doc, this.from);
    const $to = Pos.resolve(doc, this.to);
    if ($from.parent !== $to.parent) {
      throw new RangeError("MarkStep は 1 つのブロックの中でしか使えない");
    }
    const parent = $from.parent;
    const start = $from.start();
    const middle = cutContent(parent.content, this.from - start, this.to - start).map((node) =>
      node.isInline
        ? node.withMarks(
            this.add ? this.mark.addToSet(node.marks) : this.mark.removeFromSet(node.marks),
          )
        : node,
    );
    const content = appendContent(
      appendContent(cutContent(parent.content, 0, this.from - start), middle),
      cutContent(parent.content, this.to - start),
    );
    return replaceNodeAtDepth($from, $from.depth, parent.withContent(content));
  }

  getMap(): StepMap {
    return StepMap.empty;
  }
}
