import type { ChangeSpec, Node, Plot } from "../doc";
import type { Extension } from "./facet";
import type { EditorState } from "./state";
import { Transaction, type TransactionSpec } from "./transaction";

/**
 * スキーマだけでは表せない不変条件 (ルビの親文字と読みの数を合わせる、表の行を揃える等)。
 * {@link Transaction.extender} の上に乗るので、同じトランザクションの一部として適用される。
 */
export interface CorrectionContext {
  node: Plot;
  /** 変更後の doc における開始位置 */
  pos: number;
  tr: Transaction;
  oldState: EditorState;
}

export interface CorrectionSpec {
  node: Node.Query;
  /**
   * 要らなければ null。位置は変更後の doc の座標。
   * 挿した入れ物にキャレットを入れたいときは {@link TransactionSpec} を返す。
   */
  correct(context: CorrectionContext): ChangeSpec | readonly ChangeSpec[] | TransactionSpec | null;
}

export function correction(spec: CorrectionSpec): Extension {
  return Transaction.extender.of((tr) => {
    if (!tr.docChanged) return null;
    const ranges: { from: number; to: number }[] = [];
    tr.changes.iterChanges((_fromA, _toA, fromB, toB) => ranges.push({ from: fromB, to: toB }));
    if (!ranges.length) return null;
    const schema = tr.schema;
    const seen = new Set<Plot>();
    const changes: ChangeSpec[] = [];
    let selection: TransactionSpec["selection"];

    const walk = (parent: Plot, offset: number): void => {
      let pos = offset;
      for (const child of parent.content) {
        if (child.isPlot) {
          const from = pos;
          const to = pos + child.length;
          if (ranges.some((range) => range.from < to && range.to > from)) {
            if (schema.matchNode(child.type, spec.node) && !seen.has(child)) {
              seen.add(child);
              const added = spec.correct({ node: child, pos: from, tr, oldState: tr.startState });
              if (added) {
                if (Array.isArray(added)) changes.push(...added);
                // ChangeSpec だけが from を持つ
                else if ("from" in added) changes.push(added as ChangeSpec);
                else {
                  const extra = added as TransactionSpec;
                  if (extra.changes) {
                    changes.push(
                      ...(Array.isArray(extra.changes)
                        ? extra.changes
                        : [extra.changes as ChangeSpec]),
                    );
                  }
                  if (extra.selection) selection = extra.selection;
                }
              }
            }
            walk(child, from + 1);
          }
        }
        pos += child.length;
      }
    };

    walk(tr.newDoc, 0);
    if (!changes.length && !selection) return null;
    return { changes, selection };
  });
}
