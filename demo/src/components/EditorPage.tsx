import { useCallback, useState } from "react";
import { EditorContent, useEditor } from "tatefude-react";
import type { Editor } from "../editors";
import { useDebugOpen } from "./DebugOpen";
import { type DebugEvent, DebugPanel } from "./DebugPanel";
import styles from "./EditorPage.module.css";
import { Toolbar } from "./Toolbar";

const MAX_EVENTS = 25;

/** どのページも中身はこれ。違うのは渡すエディタだけ */
export function EditorPage({ editor: spec }: { editor: Editor }) {
  const [events, setEvents] = useState<readonly DebugEvent[]>([]);
  const debug = useDebugOpen();

  const push = useCallback((event: DebugEvent) => {
    setEvents((current) => [event, ...current].slice(0, MAX_EVENTS));
  }, []);

  const editor = useEditor(
    {
      config: spec.config,
      doc: spec.doc,
      // デバッグパネル用の計測。ここだけは view を直に触る必要がある
      onCreate(view) {
        view.ime.debug = (type, detail) => push({ type, detail });
        const onKeyDown = (event: KeyboardEvent) =>
          push({
            type: "keydown",
            // isComposing は EditContext 経路では常に false。IME が処理したキーかどうかは
            // keyCode 229 でしか分からないので、並べて出しておく
            detail: {
              key: event.key,
              keyCode: event.keyCode,
              isComposing: event.isComposing,
              composing: view.ime.composing,
            },
          });
        view.dom.addEventListener("keydown", onKeyDown, true);
        view.focus();
        return () => view.dom.removeEventListener("keydown", onKeyDown, true);
      },
    },
    [spec.id],
  );

  return (
    <main className={styles.main}>
      <div>
        <Toolbar editor={editor} items={spec.toolbar ?? []} />
        <section className={paneClass(spec)}>
          <EditorContent editor={editor} className={styles.host} />
        </section>
      </div>
      <DebugPanel editor={editor} events={events} open={debug.open} onToggle={debug.toggle} />
    </main>
  );
}

/** ペインの見た目は「共通 + 縦書き + そのエディタ固有」の重ね合わせ */
function paneClass(spec: Editor): string {
  return [styles.pane, spec.vertical && styles.vertical, spec.className].filter(Boolean).join(" ");
}
