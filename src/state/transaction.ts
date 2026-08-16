import type { ChangeSet, ChangeSpec, Mark, Plot, Schema } from "../doc";
import { Facet } from "./facet";
import type { Selection } from "./selection";
import type { EditorState } from "./state";

/**
 * 状態の更新の指定。**コマンドはこれを返す**。
 *
 * 位置は「この spec を適用する前の doc」の座標。`selection` に関数を渡すと、
 * 変更後の doc と変更そのものを見て決められる。
 */
export interface TransactionSpec {
  changes?: ChangeSpec | readonly ChangeSpec[];
  selection?: Selection | ((doc: Plot, changes: ChangeSet) => Selection | null);
  // biome-ignore lint/suspicious/noExplicitAny: 注釈は型ごとに値が違う
  annotations?: Annotation<any> | readonly Annotation<any>[];
  // biome-ignore lint/suspicious/noExplicitAny: 効果も型ごとに値が違う
  effects?: Effect<any> | readonly Effect<any>[];
  /** `annotations: Transaction.userEvent.of(...)` の省略形 */
  userEvent?: string;
}

/**
 * 状態から状態への 1 回分の更新。
 *
 * ステップの列ではなく、**変更 1 個 ({@link ChangeSet}) と、選択・注釈・効果**を持つ。
 * 組み立てるのは {@link EditorState.update}。
 */
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
  ) {}

  get docChanged(): boolean {
    return !this.changes.empty;
  }

  get schema(): Schema {
    return this.startState.schema;
  }

  /** この更新を適用した状態。1 度だけ作ってから使い回す。 */
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

  /** その型の効果を集める */
  effect<T>(type: Effect.Type<T>): T[] {
    return this.effects.filter((effect) => effect.type === type).map((effect) => effect.value as T);
  }

  /** 何が起こした更新かを前方一致で調べる (`"input.type"` など) */
  isUserEvent(event: string): boolean {
    const actual = this.annotation(Transaction.userEvent);
    return !!actual && (actual === event || actual.startsWith(`${event}.`));
  }

  /** 位置を変更後の座標に写す */
  map(pos: number, assoc: -1 | 1 = 1): number {
    return this.changes.mapPos(pos, assoc);
  }
}

/** 型付きのメタ情報。更新に「誰が・なぜ」を載せる。 */
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

/**
 * 更新に添える指示。注釈と違って同じ型を何個でも載せられる。
 * フィールドがこれを見て自分の値を変える。
 */
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
  /** 何が起こした更新か。`"input.type"` `"input.type.compose"` `"select.pointer"` など */
  export const userEvent: Annotation.Type<string> = Annotation.define<string>();

  /**
   * 更新に追記する仕組み。組み立て中の更新を受け取り、足したい spec を返す。
   * 返した spec の位置は**その時点の doc** の座標。{@link correction} はこの上に乗る。
   */
  export const extender: Facet<(tr: Transaction) => TransactionSpec | null> =
    Facet.define<(tr: Transaction) => TransactionSpec | null>();
}

/** 選択に付いているマーク、無ければその位置が引き継ぐマーク */
export function marksAt(state: EditorState): Mark.Set {
  return state.selection.activeMarks ?? state.selection.$from.marks();
}
