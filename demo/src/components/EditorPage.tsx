import type React from "react";
import { useRef } from "react";
import { updateListener } from "tatefude";
import { BubbleMenu, EditorContent, useEditor, useEditorState } from "tatefude-react";
import type { Editor } from "../editors";
import { inlineItems } from "../editors/toolbar-items";
import styles from "./EditorPage.module.css";
import { usePageCount, usePageScroll } from "./pagination";
import { Toolbar } from "./Toolbar";

/** どのページも中身はこれ。違うのは渡すエディタだけ */
export function EditorPage({ editor: spec }: { editor: Editor }) {
  // ポインタで選んだ更新かどうか。ページ送りの抑止に使う
  const pointerSelect = useRef(false);

  const editor = useEditor(
    {
      config: [
        spec.config,
        updateListener.of((update) => {
          pointerSelect.current = update.tr?.isUserEvent("select.pointer") ?? false;
        }),
      ],
      doc: spec.doc,
      onCreate(view) {
        view.focus();
      },
    },
    [spec.id],
  );

  // 段組みでページに割るときだけ、紙の高さを測って決める
  const paginated = spec.layout === "paginated";
  const doc = useEditorState(editor, (state) => state.doc);
  const pages = usePageCount(editor, paginated, doc);

  // ページを移ったらそのページ全体を出す。張り付いたツールバーのぶんだけ下げる
  const toolbarRef = useRef<HTMLDivElement>(null);
  const selection = useEditorState(editor, (state) => state.selection);
  usePageScroll(editor, paginated, selection, toolbarRef, pointerSelect);

  return (
    <main className={styles.main}>
      <div className={styles.column}>
        <div ref={toolbarRef} className={styles.toolbarBar}>
          <Toolbar editor={editor} items={spec.toolbar ?? []} />
        </div>
        {/* 選択したときだけ浮く。ブロックの型はキャレットだけで押せるので外す */}
        <BubbleMenu editor={editor} className={styles.bubble}>
          <Toolbar
            editor={editor}
            items={(spec.toolbar ?? []).filter((item) => inlineItems.includes(item))}
          />
        </BubbleMenu>
        <section className={paneClass(spec)}>
          <EditorContent editor={editor} className={styles.host} />
          <PageNumbers count={pages} />
        </section>
      </div>
    </main>
  );
}

/**
 * ノンブル。段はブロックではないので counter で数えられず、位置も要素として存在しない。
 * ページ数は usePageCount が持っているので、その数だけ置いて周期で並べる。
 *
 */
function PageNumbers({ count }: { count: number }) {
  if (!count) return null;
  return (
    <div className={styles.pageNumbers} aria-hidden="true">
      {Array.from({ length: count }, (_, index) => index + 1).map((page) => (
        <span key={page} style={{ "--page-index": page - 1 } as React.CSSProperties}>
          {page}
        </span>
      ))}
    </div>
  );
}

/** ペインの見た目は「共通 + 組み方 + そのエディタ固有」の重ね合わせ */
function paneClass(spec: Editor): string {
  const layout = spec.layout === "vertical" ? styles.vertical : styles[spec.layout];
  return [styles.pane, layout, spec.className].filter(Boolean).join(" ");
}
