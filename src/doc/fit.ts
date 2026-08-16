import { ChangeSet } from "./change";
import type { Node, Plot } from "./node";
import type { Schema } from "./schema";
import { Close, isClose, isOpen, Slice, stackAt, type Token } from "./slice";

/**
 * 素朴な置換の指定を、木として成立する変更に直す。直すのは 2 つ。
 *
 * 1. 釣り合い — 閉じトークンに識別子が無いので、必要なのは「置換のあと、開いている深さが
 *    `to` の時点と一致すること」だけ
 * 2. スキーマ — 置けない内容は、外側の plot を閉じるか、既定ブロックで包むか、落とす
 *
 * 費用の比較による探索は持たない (包むのは既定ブロックの 1 段だけ)。
 */
export function fitChange(
  schema: Schema,
  doc: Plot,
  spec: { from: number; to?: number; insert?: Slice | readonly Token[] },
): ChangeSet {
  const from = spec.from;
  const to = spec.to ?? spec.from;
  const insert = !spec.insert
    ? Slice.empty
    : spec.insert instanceof Slice
      ? spec.insert
      : Slice.of(spec.insert);

  const leftStack = stackAt(doc, from);
  const rightStack = stackAt(doc, to);

  const out: Token[] = [];
  // doc 自身は閉じられないので、最低 1 段は残す
  const stack: Plot.Tag[] = [...leftStack];
  const baseDepth = 1;
  let droppedOpens = 0;

  const top = (): Plot.Tag => stack[stack.length - 1];
  const closeOne = (): void => {
    if (stack.length <= baseDepth) return;
    stack.pop();
    out.push(Close);
  };

  for (const token of insert.tokens) {
    if (isClose(token)) {
      if (droppedOpens > 0) droppedOpens--;
      else closeOne();
      continue;
    }
    if (isOpen(token)) {
      while (!schema.canContain(top().type, token.type) && stack.length > baseDepth) closeOne();
      if (schema.canContain(top().type, token.type)) {
        stack.push(token);
        out.push(token);
      } else {
        // どこにも置けない開きは、対応する閉じごと落とす
        droppedOpens++;
      }
      continue;
    }
    placeNode(token, schema, stack, out, closeOne, baseDepth);
  }

  // 置換のあとの深さを、`to` の時点の深さに合わせる。
  // 開き直すときは、置ける親になるまで閉じてから開く (`to` 側の方が深いと、左の
  // 開いたままの plot に右側の plot をそのまま入れられないことがある)
  while (stack.length > rightStack.length) closeOne();
  while (stack.length < rightStack.length) {
    const tag = rightStack[stack.length];
    if (!schema.canContain(top().type, tag.type)) {
      if (stack.length <= baseDepth) break;
      closeOne();
      continue;
    }
    stack.push(tag);
    out.push(tag);
  }

  return ChangeSet.of({ from, to, insert: Slice.of(out) }, doc.contentLength);
}

function placeNode(
  node: Node,
  schema: Schema,
  stack: Plot.Tag[],
  out: Token[],
  closeOne: () => void,
  baseDepth: number,
): void {
  const top = (): Plot.Tag => stack[stack.length - 1];
  while (!schema.canContain(top().type, node.type) && stack.length > baseDepth) closeOne();
  if (schema.canContain(top().type, node.type)) {
    out.push(node);
    return;
  }
  // インラインを直接置けない場所なら、既定のブロックで包んでみる
  const wrapper = schema.defaultBlock;
  if (
    node.isInline &&
    schema.canContain(top().type, wrapper.type) &&
    schema.canContain(wrapper.type, node.type)
  ) {
    stack.push(wrapper);
    out.push(wrapper, node);
    return;
  }
  // 置き場所が無いので落とす
}
