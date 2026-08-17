import { type EditorHandle, useEditorState } from "tatefude-react";
import styles from "./DebugPanel.module.css";

export interface DebugEvent {
  type: string;
  detail: unknown;
}

interface Props {
  editor: EditorHandle;
  events: readonly DebugEvent[];
  open: boolean;
  onToggle(): void;
}

/** 開閉のつまみは常に出しておく。閉じている間は幅が縮んでエディタが広がる */
export function DebugPanel({ editor, events, open, onToggle }: Props) {
  return (
    <aside className={styles.pane}>
      <button
        type="button"
        className={styles.toggle}
        onClick={onToggle}
        aria-expanded={open}
        title={open ? "デバッグパネルを閉じる" : "デバッグパネルを開く"}
      >
        {open ? "›" : "‹"}
      </button>
      {open && <DebugBody editor={editor} events={events} />}
    </aside>
  );
}

function DebugBody({ editor, events }: Pick<Props, "editor" | "events">) {
  // ここは state 全部が要るので、更新のたびに再描画される (デバッグ用途なのでそれでよい)
  const state = useEditorState(editor, (s) => s);
  const selection = state.selection;

  return (
    <div className={styles.body}>
      <h2>selection</h2>
      <pre>{JSON.stringify({ anchor: selection.anchor, head: selection.head })}</pre>

      <h2>doc</h2>
      <pre>{JSON.stringify(state.doc.toJSON(), null, 2)}</pre>

      <h2>events</h2>
      <pre>{events.map((event) => `${event.type} ${JSON.stringify(event.detail)}`).join("\n")}</pre>
    </div>
  );
}
