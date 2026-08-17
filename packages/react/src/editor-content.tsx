import type { HTMLAttributes } from "react";
import type { EditorHandle } from "./use-editor";

/** view が中身の DOM を全部持つので、React はマウント先の要素を貸すだけ */
export function EditorContent({
  editor,
  ...props
}: { editor: EditorHandle } & HTMLAttributes<HTMLDivElement>) {
  return <div {...props} ref={editor.ref} />;
}
