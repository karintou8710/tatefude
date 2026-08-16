import { ChangeSet } from "./change";
import type { Node, Plot } from "./node";
import type { Schema } from "./schema";
import { Close, isClose, isOpen, Slice, stackAt, type Token } from "./slice";

/**
 * 「この範囲をこの内容に置き換えたい」という素朴な指定を、
 * **木として成立する変更**に直してから ChangeSet にする。
 *
 * 直す必要があるのは 2 つ。
 *
 * 1. **釣り合い** — 開きと閉じの数が合わないと木にならない。閉じトークンに識別子は
 *    無いので、必要なのは「置換のあと、開いている深さが `to` の時点の深さと一致すること」
 * 2. **スキーマ** — 置ける場所にしか置けない。置けなければ、外側の plot を閉じるか、
 *    既定のブロックで包むか、諦めて落とす
 *
 * Wordgard の ChangeFitter に当たるが、こちらは費用の比較による探索や、
 * 元の文脈への同期は持たない (包むのは既定ブロックの 1 段だけ)。
 */
export function fitChange(
  schema: Schema,
  doc: Plot,
  spec: { from: number; to?: number; insert?: Slice },
): ChangeSet {
  const from = spec.from;
  const to = spec.to ?? spec.from;
  const insert = spec.insert ?? Slice.empty;

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

  // 置換のあとの深さを、`to` の時点の深さに合わせる
  while (stack.length > rightStack.length) closeOne();
  for (let depth = stack.length; depth < rightStack.length; depth++) {
    const tag = rightStack[depth];
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
