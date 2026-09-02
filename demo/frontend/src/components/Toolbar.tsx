import type { ReactNode } from "react";
import type { Command, EditorState } from "tatefude";
import { type EditorHandle, useEditorState } from "tatefude-react";
import styles from "./Toolbar.module.css";

export interface ToolbarItem {
  label: string;
  /** 見出しに添える絵。無くても label だけで成立する */
  icon?: ReactNode;
  command: Command;
  /** 押下状態。今の state から引く */
  isActive?(state: EditorState): boolean;
}

interface Props {
  editor: EditorHandle;
  items: readonly ToolbarItem[];
}

export function Toolbar({ editor, items }: Props) {
  if (!items.length) return null;
  return (
    <div className={styles.toolbar}>
      {items.map((item) => (
        <ToolbarButton key={item.label} editor={editor} item={item} />
      ))}
    </div>
  );
}

function ToolbarButton({ editor, item }: { editor: EditorHandle; item: ToolbarItem }) {
  // ボタン 1 つが読むのは 2 つの boolean だけ。値が変わらないキー入力では再描画されない
  const { active, enabled } = useEditorState(
    editor,
    (state) => ({
      active: item.isActive?.(state) ?? false,
      enabled: item.command(state) !== false,
    }),
    (a, b) => a.active === b.active && a.enabled === b.enabled,
  );

  return (
    <button
      type="button"
      className={active ? `${styles.button} ${styles.active}` : styles.button}
      aria-pressed={active}
      disabled={!active && !enabled}
      // これが無いと押した時点で EditContext から焦点が外れ、選択が消える。
      // editor.run() の中で focus() を呼んでも、押下時の blur は防げない
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => editor.run(item.command)}
    >
      {item.icon}
      {item.label}
    </button>
  );
}
