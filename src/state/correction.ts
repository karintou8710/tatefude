import type { Node, Plot } from "../doc";
import type { Mapping } from "../transform/mapping";
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
  /** 追記してよいトランザクション */
  tr: Transaction;
  /** 変更前の状態 */
  oldState: EditorState;
}

export interface CorrectionSpec {
  /** 見張るノードの種類 */
  node: Node.Query;
  correct(context: CorrectionContext): void;
}

export function correction(spec: CorrectionSpec): Extension {
  return Transaction.extender.of((tr) => {
    if (!tr.docChanged) return;
    const ranges = changedRanges(tr.mapping);
    if (!ranges.length) return;
    const schema = tr.schema;
    const seen = new Set<Plot>();

    const walk = (parent: Plot, offset: number): void => {
      let pos = offset;
      for (const child of parent.content) {
        if (child.isPlot) {
          const from = pos;
          const to = pos + child.length;
          if (ranges.some((range) => range.from < to && range.to > from)) {
            if (schema.matchNode(child.type, spec.node) && !seen.has(child)) {
              seen.add(child);
              spec.correct({ node: child, pos: from, tr, oldState: tr.startState });
            }
            walk(child, from + 1);
          }
        }
        pos += child.length;
      }
    };

    walk(tr.doc, 0);
  });
}

/** 変更のあった範囲を、変更後の doc の座標で返す */
function changedRanges(mapping: Mapping): { from: number; to: number }[] {
  const result: { from: number; to: number }[] = [];
  mapping.maps.forEach((map, index) => {
    for (let i = 0; i < map.ranges.length; i += 3) {
      const start = map.ranges[i];
      const newSize = map.ranges[i + 2];
      let from = start;
      let to = start + newSize;
      // 後続の写像を通して、今の doc の座標に直す
      for (let later = index + 1; later < mapping.maps.length; later++) {
        from = mapping.maps[later].map(from, -1);
        to = mapping.maps[later].map(to, 1);
      }
      result.push({ from, to });
    }
  });
  return result;
}
