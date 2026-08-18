import type { ChangeSet, ChangeSpec, Mark, Plot, Schema } from "../doc";
import { Facet } from "./facet";
import type { Selection } from "./selection";
import type { EditorState } from "./state";

/**
 * コマンドが返すもの。位置は spec を適用する **前** の doc の座標。`selection` に関数を
 * 渡すと、変更後の doc を見て決められる。
 */
export interface TransactionSpec {
  /** 組み立て済みの {@link ChangeSet} も渡せる (undo が持っている逆向きの変更) */
  changes?: ChangeSet | ChangeSpec | readonly ChangeSpec[];
  selection?: Selection | ((doc: Plot, changes: ChangeSet) => Selection | null);
  // biome-ignore lint/suspicious/noExplicitAny: 注釈は型ごとに値が違う
  annotations?: Annotation<any> | readonly Annotation<any>[];
  // biome-ignore lint/suspicious/noExplicitAny: 効果も型ごとに値が違う
  effects?: Effect<any> | readonly Effect<any>[];
  /** `annotations: Transaction.userEvent.of(...)` の省略形 */
  userEvent?: string;
  /**
   * キャレットを見える位置まで送るか。省略時は `userEvent` の有無で決まる。
   * 外から差し替えただけの更新で、読んでいる場所を奪わないため。
   */
  scrollIntoView?: boolean;
}

/** ステップの列ではなく、変更 1 個 ({@link ChangeSet}) と選択・注釈・効果を持つ */
export class Transaction {
  private cachedState: EditorState | null = null;

  constructor(
    readonly startState: EditorState,
    readonly changes: ChangeSet,
    readonly newDoc: Plot,
    readonly selection: Selection,
    // biome-ignore lint/suspicious/noExplicitAny: 上と同じ
    readonly annotations: readonly Annotation<any>[],
    // biome-ignore lint/suspicious/noExplicitAny: 上と同じ
    readonly effects: readonly Effect<any>[],
    readonly scrollIntoView: boolean = false,
  ) {}

  get docChanged(): boolean {
    return !this.changes.empty;
  }

  get schema(): Schema {
    return this.startState.schema;
  }

  /** 1 度だけ作って使い回す */
  get state(): EditorState {
    if (!this.cachedState) this.cachedState = this.startState.applyTransaction(this);
    return this.cachedState;
  }

  annotation<T>(type: Annotation.Type<T>): T | undefined {
    for (const annotation of this.annotations) {
      if (annotation.type === type) return annotation.value as T;
    }
    return undefined;
  }

  effect<T>(type: Effect.Type<T>): T[] {
    return this.effects.filter((effect) => effect.type === type).map((effect) => effect.value as T);
  }

  /** 前方一致。`"input.type"` は `"input.type.compose"` にも当たる */
  isUserEvent(event: string): boolean {
    const actual = this.annotation(Transaction.userEvent);
    return !!actual && (actual === event || actual.startsWith(`${event}.`));
  }

  map(pos: number, assoc: -1 | 1 = 1): number {
    return this.changes.mapPos(pos, assoc);
  }
}

/** 更新に「誰が・なぜ」を載せる */
export class Annotation<T> {
  constructor(
    readonly type: Annotation.Type<T>,
    readonly value: T,
  ) {}
}

export namespace Annotation {
  export class Type<T> {
    /** 型を区別するためだけの印 */
    declare readonly tag: T;

    of(value: T): Annotation<T> {
      return new Annotation(this, value);
    }
  }

  export function define<T>(): Annotation.Type<T> {
    return new Type<T>();
  }
}

/** 注釈と違って同じ型を何個でも載せられる。フィールドがこれを見て自分の値を変える */
export class Effect<T> {
  constructor(
    readonly type: Effect.Type<T>,
    readonly value: T,
  ) {}

  is<U>(type: Effect.Type<U>): this is Effect<U> {
    return (this.type as Effect.Type<unknown>) === (type as Effect.Type<unknown>);
  }
}

export namespace Effect {
  export class Type<T> {
    declare readonly tag: T;

    of(value: T): Effect<T> {
      return new Effect(this, value);
    }
  }

  export function define<T>(): Effect.Type<T> {
    return new Type<T>();
  }
}

export namespace Transaction {
  /** `"input.type"` `"input.type.compose"` `"select.pointer"` など */
  export const userEvent: Annotation.Type<string> = Annotation.define<string>();

  /** 組み立て中の更新に追記する。返す spec の位置は **その時点の** doc の座標 */
  export const extender: Facet<(tr: Transaction) => TransactionSpec | null> =
    Facet.define<(tr: Transaction) => TransactionSpec | null>();
}

/** 選択に付いているマーク、無ければその位置が引き継ぐマーク */
export function marksAt(state: EditorState): Mark.Set {
  return state.selection.activeMarks ?? state.selection.$from.marks();
}
