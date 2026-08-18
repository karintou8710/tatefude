import { useCallback, useRef, useSyncExternalStore } from "react";
import type { EditorState } from "tatefude";
import type { EditorHandle } from "./use-editor";

/**
 * state から必要な値だけを取り出して購読する。ツールバーが全キー入力で再描画されないよう、
 * 読む側が範囲を決める。オブジェクトを返す selector には `isEqual` が要る。
 * EditContext はブラウザ専用なので SSR では投げる。
 */
export function useEditorState<T>(
  editor: EditorHandle,
  selector: (state: EditorState) => T,
  isEqual?: (a: T, b: T) => boolean,
): T {
  const latest = useRef({ selector, isEqual });
  latest.current = { selector, isEqual };

  const cache = useRef<{ state: EditorState; value: T } | null>(null);

  const getSnapshot = useCallback(() => {
    const state = editor.getState();
    const hit = cache.current;
    if (hit?.state === state) return hit.value;

    const value = latest.current.selector(state);
    if (hit && latest.current.isEqual?.(hit.value, value)) {
      cache.current = { state, value: hit.value };
      return hit.value;
    }
    cache.current = { state, value };
    return value;
  }, [editor]);

  return useSyncExternalStore(editor.subscribe, getSnapshot);
}
