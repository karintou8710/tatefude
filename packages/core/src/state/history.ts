// undo / redo。Wordgard (= CodeMirror 6) の history から派生。
// 著作権表示は LICENSE の "Third-party code" を参照。
//
// 変更を**逆向きの ChangeSet** として枝に積み、undo はそれをそのまま適用する。
// ステップの列を巻き戻すのではないので、履歴が持つのは「変更 1 個と、その前の選択」だけ。

import type { ChangeSet } from "../doc";
import { type Extension, Facet, Field } from "./facet";
import { TextSelection } from "./selection";
import type { EditorState } from "./state";
import { Annotation, Transaction, type TransactionSpec } from "./transaction";

type Side = "done" | "undone";

export interface HistoryConfig {
  /** 最低これだけの数の更新を残す。既定 100 */
  minDepth?: number;
  /** これ以内に続いた更新は 1 つにまとめる (ミリ秒)。既定 500 */
  newGroupDelay?: number;
}

export const historyConfig: Facet<HistoryConfig, Required<HistoryConfig>> = Facet.define<
  HistoryConfig,
  Required<HistoryConfig>
>({
  // 既定は「誰も指定しなかったとき」だけ。複数あれば深いほう / 短いほうを採る
  combine: (values) => {
    const depths = values.map((v) => v.minDepth).filter((v) => v !== undefined);
    const delays = values.map((v) => v.newGroupDelay).filter((v) => v !== undefined);
    return {
      minDepth: depths.length ? Math.max(...depths) : 100,
      newGroupDelay: delays.length ? Math.min(...delays) : 500,
    };
  },
});

/** 前後の更新とまとめない */
export const isolateHistory: Annotation.Type<true> = Annotation.define<true>();

/** まとめの判定に使う時刻。省略すると `Date.now()`。テストが刻みを決められるように開けてある */
export const historyTime: Annotation.Type<number> = Annotation.define<number>();

/** undo / redo が自分で作った更新。どちらの枝から来たかを持ち回る */
const fromHistory = Annotation.define<{ side: Side; rest: Branch | null }>();

/** まとめてよい更新。文字入力と削除だけで、分割や装飾は 1 手ずつ戻す */
const joinable = /^(input\.type|delete)($|\.)/;

/**
 * 更新 1 つ分。逆向きの変更と、その更新の**前**の選択を持つ連結リスト。
 *
 * Wordgard は `addToHistory: false` の更新を後から写像するために `mapped` を持つが、
 * この雛形には ChangeSet の rebase が無いので省いている。
 */
class Branch {
  readonly depth: number;

  constructor(
    readonly changes: ChangeSet,
    readonly anchor: number,
    readonly head: number,
    readonly next: Branch | null,
  ) {
    this.depth = (next?.depth ?? 0) + 1;
  }

  /** 同じまとまりに足す。undo は新しいほうから戻すので、新しい変更が先 */
  addChanges(changes: ChangeSet): Branch {
    return new Branch(changes.compose(this.changes), this.anchor, this.head, this.next);
  }
}

/** 深すぎる枝を切る。連結リストなので頭から数えて作り直す */
function clip(branch: Branch | null, depth: number): Branch | null {
  if (!branch || branch.depth <= depth * 1.3) return branch;
  const kept: Branch[] = [];
  for (let cur: Branch | null = branch; cur && kept.length < depth; cur = cur.next) kept.push(cur);
  let result: Branch | null = null;
  for (let i = kept.length - 1; i >= 0; i--) {
    result = new Branch(kept[i].changes, kept[i].anchor, kept[i].head, result);
  }
  return result;
}

/**
 * 2 つの変更が隣り合っているか。`a` は積んである逆向きの変更、`b` は今回の逆向きの変更。
 * 続けて打った文字はここで繋がり、離れた場所を触ったら別のまとまりになる。
 */
function isAdjacent(a: ChangeSet, b: ChangeSet): boolean {
  const ranges: number[] = [];
  a.iterChanges((fromA, toA) => ranges.push(fromA, toA));
  let adjacent = false;
  b.iterChanges((_fromA, _toA, fromB, toB) => {
    for (let i = 0; i < ranges.length; i += 2) {
      if (toB >= ranges[i] && fromB <= ranges[i + 1]) adjacent = true;
    }
  });
  return adjacent;
}

class HistoryState {
  constructor(
    readonly done: Branch | null,
    readonly undone: Branch | null,
    readonly prevTime = 0,
  ) {}
}

const historyField = Field.define<HistoryState>({
  create: () => new HistoryState(null, null),
  update: (value, tr) => {
    // tr.state を読むと applyTransaction に戻って無限に潜るので、必ず startState を見る
    const config = tr.startState.facet(historyConfig);

    const back = tr.annotation(fromHistory);
    if (back) {
      // undo / redo 自身の更新。戻した分を反対の枝へ積み直す
      const other = tr.changes.empty
        ? back.side === "done"
          ? value.undone
          : value.done
        : new Branch(
            tr.changes.invert(tr.startState.doc),
            tr.startState.selection.anchor,
            tr.startState.selection.head,
            back.side === "done" ? value.undone : value.done,
          );
      return back.side === "done"
        ? new HistoryState(back.rest, other)
        : new HistoryState(other, back.rest);
    }

    if (tr.changes.empty) return value;

    const changes = tr.changes.invert(tr.startState.doc);
    const time = tr.annotation(historyTime) ?? Date.now();
    const userEvent = tr.annotation(Transaction.userEvent);
    const top = value.done;
    const join =
      top !== null &&
      tr.annotation(isolateHistory) !== true &&
      (!userEvent || joinable.test(userEvent)) &&
      // 変換中は 1 文字ずつ別のまとまりにすると、確定前の状態が undo に並んでしまう
      (userEvent === "input.type.compose" ||
        (time - value.prevTime < config.newGroupDelay && isAdjacent(top.changes, changes)));

    const { anchor, head } = tr.startState.selection;
    const done = join && top ? top.addChanges(changes) : new Branch(changes, anchor, head, top);
    // 新しく編集したら redo の枝は捨てる
    return new HistoryState(clip(done, config.minDepth), null, time);
  },
});

/** 構成に足すと undo / redo が使えるようになる */
export function history(config: HistoryConfig = {}): Extension {
  return [historyField, historyConfig.of(config)];
}

/** `state.field` は構成に無いと投げるので、history を足していない構成では null を返す */
function stateOf(state: EditorState): HistoryState | null {
  return state.config.fields.includes(historyField) ? state.field(historyField) : null;
}

function pop(side: Side): (state: EditorState) => TransactionSpec | false {
  return (state) => {
    const value = stateOf(state);
    if (!value) return false;
    const branch = side === "done" ? value.done : value.undone;
    if (!branch) return false;
    return {
      changes: branch.changes,
      // 積んであるのは位置だけ。今の doc で解き直す
      selection: (doc) => TextSelection.create(doc, branch.anchor, branch.head),
      annotations: fromHistory.of({ side, rest: branch.next }),
      userEvent: side === "done" ? "undo" : "redo",
    };
  };
}

export const undo: (state: EditorState) => TransactionSpec | false = pop("done");
export const redo: (state: EditorState) => TransactionSpec | false = pop("undone");

/** 戻せる更新の数。ボタンの有効・無効に使う */
export function undoDepth(state: EditorState): number {
  return stateOf(state)?.done?.depth ?? 0;
}

export function redoDepth(state: EditorState): number {
  return stateOf(state)?.undone?.depth ?? 0;
}
