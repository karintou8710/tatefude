import { useCallback, useMemo, useRef } from "react";
import {
  type Command,
  type DocSource,
  EditorState,
  EditorView,
  type Extension,
  type Transaction,
  updateListener,
} from "tatefude";

export interface UseEditorOptions {
  /** 初期値。以後この値の変化は無視される (作り直したければ deps を変える) */
  doc?: DocSource;
  config?: Extension;
  /** 省略すると view が自分で state を進める */
  dispatchTransaction?(this: EditorView, tr: Transaction): void;
  /** view ができた直後。返した関数は破棄時に呼ばれる (listener の後始末用) */
  // biome-ignore lint/suspicious/noConfusingVoidType: useEffect と同じ「何も返さなくてよい」の形
  onCreate?(view: EditorView): void | (() => void);
}

export interface EditorHandle {
  /** `<div ref={editor.ref} />` か `<EditorContent editor={editor} />` に渡す */
  ref(node: HTMLElement | null): (() => void) | undefined;
  /** マウント前は null */
  readonly view: EditorView | null;
  run(command: Command): boolean;
  focus(): void;
  /** マウント前は初期 state を返す。null にはならない */
  getState(): EditorState;
  /** @internal {@link useEditorState} 用 */
  subscribe(onChange: () => void): () => void;
}

/**
 * view の生成と破棄だけを持つ。state が変わってもこの hook は再描画を起こさないので、
 * 値を読むときは {@link useEditorState} を使う。
 *
 * 返る handle は安定していて、`deps` が変わったときだけ view と state を作り直す。
 */
export function useEditor(
  options: UseEditorOptions = {},
  deps: readonly unknown[] = [],
): EditorHandle {
  // 最新のコールバックを掴んでおく。view の作り直しを起こさないため
  const latest = useRef(options);
  latest.current = options;

  const viewRef = useRef<EditorView | null>(null);
  const subscribersRef = useRef<Set<() => void> | null>(null);
  subscribersRef.current ??= new Set();
  const subscribers = subscribersRef.current;

  const notify = useCallback(() => {
    for (const fn of subscribers) fn();
  }, [subscribers]);

  // view より先に state を作る。マウント前でも selector が読めるようにするため。
  // deps は利用側が決めるので、依存配列は動的に伸びる
  const initialState = useMemo(
    () =>
      EditorState.create({
        doc: latest.current.doc,
        // 購読は updateListener で足す。dispatchTransaction は利用側のために空けておく
        config: [latest.current.config ?? [], updateListener.of(notify)],
      }),
    [notify, ...deps],
  );
  const stateRef = useRef(initialState);
  stateRef.current = initialState;

  const getState = useCallback(() => viewRef.current?.state ?? stateRef.current, []);
  const run = useCallback((command: Command) => viewRef.current?.run(command) ?? false, []);
  const focus = useCallback(() => viewRef.current?.focus(), []);

  const subscribe = useCallback(
    (onChange: () => void) => {
      subscribers.add(onChange);
      return () => {
        subscribers.delete(onChange);
      };
    },
    [subscribers],
  );

  const cleanupRef = useRef<(() => void) | null>(null);
  const destroy = useCallback(() => {
    cleanupRef.current?.();
    cleanupRef.current = null;
    viewRef.current?.destroy();
    viewRef.current = null;
    notify();
  }, [notify]);

  // initialState が変わると ref の identity も変わるので、React が付け直してくれる
  const ref = useCallback(
    (node: HTMLElement | null) => {
      // React 18 は ref(null) で外し、19 は返した cleanup を呼ぶ。両方に備える
      if (!node) return void destroy();

      const view = new EditorView(node, {
        state: initialState,
        dispatchTransaction(tr) {
          const custom = latest.current.dispatchTransaction;
          if (custom) custom.call(this, tr);
          else this.updateState(tr.state, tr);
        },
      });
      viewRef.current = view;
      cleanupRef.current = latest.current.onCreate?.(view) ?? null;
      notify();
      return destroy;
    },
    [initialState, notify, destroy],
  );

  return useMemo(
    () => ({
      ref,
      get view() {
        return viewRef.current;
      },
      run,
      focus,
      getState,
      subscribe,
    }),
    [ref, run, focus, getState, subscribe],
  );
}
