import type { ChangeSpec, Node, Plot } from "../doc";
import type { Extension } from "./facet";
import type { EditorState } from "./state";
import { Transaction } from "./transaction";

/**
 * ドキュメントの不変条件を守るための仕組み。
 *
 * 「この種類のノードが変わったら呼ばれて、条件を確かめ、必要ならさらに変更を足す」
 * という形で書く。トランザクションの追記 ({@link Transaction.extender}) の上に乗っているので、
 * 効果はそのトランザクションの一部として適用される。
 *
 * 例: ルビの親文字と読みの数を合わせる、表の行の長さを揃える、といった
 * スキーマだけでは表せない条件。
 */
export interface CorrectionContext {
  /** 変更に触れた、種類の合うノード */
  node: Plot;
  /** そのノードの (変更後の doc における) 開始位置 */
  pos: number;
  /** 組み立て中の更新 */
  tr: Transaction;
  /** 変更前の状態 */
  oldState: EditorState;
}

export interface CorrectionSpec {
  /** 見張るノードの種類 */
  node: Node.Query;
  /** 足したい変更を返す。何も要らなければ null。位置は変更後の doc の座標。 */
  correct(context: CorrectionContext): ChangeSpec | readonly ChangeSpec[] | null;
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
              if (added) changes.push(...(Array.isArray(added) ? added : [added as ChangeSpec]));
            }
            walk(child, from + 1);
          }
        }
        pos += child.length;
      }
    };

    walk(tr.newDoc, 0);
    return changes.length ? { changes } : null;
  });
}
