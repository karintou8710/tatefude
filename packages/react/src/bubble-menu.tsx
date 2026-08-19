import { autoUpdate, computePosition, flip, offset, type Placement, shift } from "@floating-ui/dom";
import { type ReactNode, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { EditorState } from "tatefude";
import type { EditorHandle } from "./use-editor";
import { useEditorState } from "./use-editor-state";

export interface BubbleMenuProps {
  editor: EditorHandle;
  children: ReactNode;
  /** 出す条件。既定は「範囲を選んでいる」 */
  shouldShow?: (state: EditorState) => boolean;
  /** 出す向き。既定は書字方向から決める (横書きは上、縦書きは行の始まる側) */
  placement?: Placement;
  /** 選択との間隔 */
  offset?: number;
  className?: string;
}

const hasRange = (state: EditorState): boolean => !state.selection.empty;

/**
 * 選択の上に浮く道具箱。
 *
 * `strategy: "fixed"` で body へ出すのは、エディタの箱が `overflow` を持つと (縦書きの紙が
 * そう) 中に置いた吹き出しが切られるため。はみ出しの判定と追従は Floating UI に任せる —
 * クリップする祖先・`transform` された祖先・祖先のスクロールまで見る必要がある。
 */
export function BubbleMenu({
  editor,
  children,
  shouldShow = hasRange,
  placement,
  offset: gap = 8,
  className,
}: BubbleMenuProps) {
  const visible = useEditorState(editor, shouldShow);
  const selection = useEditorState(editor, (state) => state.selection);
  const [menu, setMenu] = useState<HTMLElement | null>(null);
  const [placed, setPlaced] = useState(false);

  useEffect(() => {
    const view = editor.view;
    if (!visible || !menu || !view) return setPlaced(false);

    // 参照は要素ではなく矩形。選択は DOM の 1 要素に対応しないので virtual element を使う
    const reference = {
      getBoundingClientRect: () => view.selectionRect() ?? new DOMRect(),
      contextElement: view.dom,
    };
    const side = placement ?? defaultPlacement(view.dom);

    const update = async () => {
      const { x, y } = await computePosition(reference, menu, {
        strategy: "fixed",
        placement: side,
        middleware: [offset(gap), flip(), shift({ padding: 8 })],
      });
      menu.style.left = `${x}px`;
      menu.style.top = `${y}px`;
      setPlaced(true);
    };
    // 祖先のスクロール・リサイズ・レイアウトの変化まで見る
    return autoUpdate(reference.contextElement, menu, update);
  }, [editor, visible, selection, menu, placement, gap]);

  if (!visible) return null;
  return createPortal(
    <div
      ref={setMenu}
      className={className}
      style={{
        position: "fixed",
        left: 0,
        top: 0,
        // 置き場所が決まる前に見えると、左上から飛んでくる
        visibility: placed ? "visible" : "hidden",
        zIndex: 10,
      }}
      // これが無いと押した時点で EditContext から焦点が外れ、選択が消える
      onMouseDown={(event) => event.preventDefault()}
    >
      {children}
    </div>,
    document.body,
  );
}

/** 横書きは行の上、縦書きは行の始まる側 (vertical-rl なら右) */
function defaultPlacement(dom: HTMLElement): Placement {
  const mode = getComputedStyle(dom).writingMode;
  if (!mode.startsWith("vertical") && !mode.startsWith("sideways")) return "top";
  return mode.endsWith("-lr") ? "left" : "right";
}
