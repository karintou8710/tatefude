import type React from "react";
import { useEffect, useRef } from "react";
import { type Plot, type Schema, updateListener } from "tatefude";
import { BubbleMenu, EditorContent, useEditor, useEditorState } from "tatefude-react";
import type { Editor } from "../editors";
import { inlineItems } from "../editors/toolbar-items";
import { load, save } from "../storage";
import styles from "./EditorPage.module.css";
import { MinitypeButton } from "./MinitypeButton";
import { usePageCount, usePageScroll } from "./pagination";
import { Toolbar } from "./Toolbar";

/** `/api/pdf` がある配り先でだけ。false に畳まれると MinitypeButton ごと落ちる */
const hasMinitype = import.meta.env.DEV || import.meta.env.VITE_MINITYPE === "1";

/** 打つたびに書かない。手が止まってから */
const SAVE_DELAY = 400;

/** どのページも中身はこれ。違うのは渡すエディタだけ */
export function EditorPage({ editor: spec, onReset }: { editor: Editor; onReset: () => void }) {
  const store = spec.store ?? spec.id;
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
      // 書いたものがあればそれ、無ければ既定
      doc: (schema: Schema) => load(store, schema) ?? spec.doc(schema),
      onCreate(view) {
        view.focus();
      },
    },
    [spec.id],
  );

  const doc = useEditorState(editor, (state) => state.doc);
  // 開いたときの doc は書き戻さない。既定を差し替えたとき古い方が居座らないため。
  // **回数ではなく同一性で見る** — StrictMode は effect を 2 回走らせるので、
  // 「初回だけ飛ばす」フラグでは 2 回目に保存が走ってしまう
  const opened = useRef<Plot | null>(null);
  useEffect(() => {
    opened.current ??= doc;
    if (opened.current === doc) return;
    const timer = setTimeout(() => save(store, doc), SAVE_DELAY);
    return () => clearTimeout(timer);
  }, [store, doc]);

  // 段組みでページに割るときだけ、紙の高さを測って決める
  const paginated = spec.layout === "paginated";
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
          <div className={styles.tools}>
            {spec.print && hasMinitype && <MinitypeButton doc={doc} print={spec.print} />}
            <button type="button" className={styles.reset} onClick={onReset}>
              リセット
            </button>
          </div>
        </div>
        {/* 選択したときだけ浮く。ブロックの型はキャレットだけで押せるので外す */}
        <BubbleMenu editor={editor} className={styles.bubble}>
          <Toolbar
            editor={editor}
            items={(spec.toolbar ?? []).filter((item) => inlineItems.includes(item))}
          />
        </BubbleMenu>
        <section className={paneClass(spec)} style={gridVars(spec)}>
          <EditorContent editor={editor} className={styles.host} />
          <PageNumbers count={pages} />
        </section>
      </div>
    </main>
  );
}

/** 画面が紙と合わせるのは**字数と行数だけ**。級数・行送り・余白は組版側が使う */
function gridVars(spec: Editor): React.CSSProperties | undefined {
  if (!spec.print) return undefined;
  return {
    "--chars": spec.print.chars,
    "--lines": spec.print.lines,
  } as React.CSSProperties;
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
