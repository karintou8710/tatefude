import type { Mark } from "../doc";
import type { Step } from "../transform/step";
import { Transform } from "../transform/transform";
import { Facet } from "./facet";
import type { Selection } from "./selection";
import type { EditorState } from "./state";

/**
 * ドキュメントの変更 + 選択・マーク・注釈をまとめた 1 回分の更新。
 *
 * メタ情報は Wordgard に倣って **注釈 (annotation)** で持つ。文字列キーではなく
 * 型付きの `Annotation.Type<T>` を使うので、値の型が保たれる。
 */
export class Transaction extends Transform {
  private curSelection: Selection;
  /** curSelection がどこまでのステップを反映しているか */
  private curSelectionFor = 0;
  private selectionExplicit = false;
  // biome-ignore lint/suspicious/noExplicitAny: 注釈は型ごとに値の型が違う
  private readonly annotations: Annotation<any>[] = [];

  storedMarks: Mark.Set | null;

  constructor(readonly startState: EditorState) {
    super(startState.schema, startState.doc);
    this.curSelection = startState.selection;
    this.storedMarks = startState.storedMarks;
  }

  /** ステップの分だけ写像した選択 */
  get selection(): Selection {
    if (this.curSelectionFor < this.steps.length) {
      let rest = this.stepChanges[this.curSelectionFor];
      for (let i = this.curSelectionFor + 1; i < this.stepChanges.length; i++) {
        rest = rest.compose(this.stepChanges[i]);
      }
      this.curSelection = this.curSelection.map(this.doc, rest);
      this.curSelectionFor = this.steps.length;
    }
    return this.curSelection;
  }

  get selectionSet(): boolean {
    return this.selectionExplicit;
  }

  setSelection(selection: Selection): this {
    this.curSelection = selection;
    this.curSelectionFor = this.steps.length;
    this.selectionExplicit = true;
    this.storedMarks = null;
    return this;
  }

  setStoredMarks(marks: Mark.Set | null): this {
    this.storedMarks = marks;
    return this;
  }

  override step(step: Step): this {
    return super.step(step);
  }

  /** 注釈を足す */
  annotate<T>(type: Annotation.Type<T>, value: T): this {
    this.annotations.push(new Annotation(type, value));
    return this;
  }

  /** 注釈を読む */
  annotation<T>(type: Annotation.Type<T>): T | undefined {
    for (const annotation of this.annotations) {
      if (annotation.type === type) return annotation.value as T;
    }
    return undefined;
  }

  /** この操作が user event かどうかを、前方一致で調べる (`"input.type"` など) */
  isUserEvent(event: string): boolean {
    const actual = this.annotation(Transaction.userEvent);
    return !!actual && (actual === event || actual.startsWith(`${event}.`));
  }

  /** 現在の選択を text で置き換える */
  insertTextAtSelection(text: string): this {
    const { from, to } = this.selection;
    const marks = this.storedMarks ?? this.selection.$from.marks();
    return this.replaceWithText(from, to, text, marks);
  }
}

/** 型付きのメタ情報。トランザクションに「誰が・なぜ」を載せる。 */
export class Annotation<T> {
  constructor(
    readonly type: Annotation.Type<T>,
    readonly value: T,
  ) {}
}

export namespace Annotation {
  export class Type<T> {
    /** 型を区別するためだけの印。値としては存在しない。 */
    declare readonly tag: T;
  }

  export function define<T>(): Annotation.Type<T> {
    return new Type<T>();
  }
}

export namespace Transaction {
  /** 何が起こしたトランザクションか。`"input.type"` `"input.type.compose"` `"select.pointer"` など */
  export const userEvent: Annotation.Type<string> = Annotation.define<string>();

  /**
   * トランザクションに追記する仕組み。dispatch されたトランザクションを受け取り、
   * 必要ならステップや注釈を足す。{@link Correction} はこの上に乗っている。
   */
  export const extender: Facet<(tr: Transaction) => void> =
    Facet.define<(tr: Transaction) => void>();
}
