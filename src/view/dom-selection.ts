import { type Selection, TextSelection } from "../state/selection";
import { blockOffsetToDOMPoint, domPointToBlockOffset } from "./coords";
import type { EditorView } from "./view";

/** キャレットの描画はブラウザに任せる */
export function writeDOMSelection(view: EditorView): void {
  // 跨ぐ選択の最中は触らない。どうせ境界で丸められるし、書き戻すとドラッグと競合する
  if (view.suppressSelectionSync) return;
  const selection = view.state.selection;
  const anchorBlock = view.textblockAt(selection.anchor);
  const headBlock = view.textblockAt(selection.head);
  if (!anchorBlock || !headBlock) return;
  const domSelection = document.getSelection();
  if (!domSelection) return;

  const anchorPoint = blockOffsetToDOMPoint(
    anchorBlock.contentDOM,
    anchorBlock.text.posToOffset(selection.anchor),
  );
  const headPoint = blockOffsetToDOMPoint(
    headBlock.contentDOM,
    headBlock.text.posToOffset(selection.head),
  );

  // フォーカスの移動でアクティブな EditContext が決まる
  if (document.activeElement !== headBlock.dom) {
    headBlock.dom.focus({ preventScroll: true });
  }

  if (
    domSelection.anchorNode === anchorPoint.node &&
    domSelection.anchorOffset === anchorPoint.offset &&
    domSelection.focusNode === headPoint.node &&
    domSelection.focusOffset === headPoint.offset
  ) {
    return;
  }

  // ここで発火する selectionchange は非同期に届くが、読み戻すと現在の model と
  // 一致するので EditorView 側で no-op になる
  domSelection.setBaseAndExtent(
    anchorPoint.node,
    anchorPoint.offset,
    headPoint.node,
    headPoint.offset,
  );
}

export function readDOMSelection(view: EditorView): Selection | null {
  const domSelection = document.getSelection();
  if (!domSelection?.anchorNode || !domSelection.focusNode) return null;
  const anchorBlock = view.textblockForDOM(domSelection.anchorNode);
  const headBlock = view.textblockForDOM(domSelection.focusNode);
  if (!anchorBlock || !headBlock) return null;

  const anchor = anchorBlock.text.offsetToPos(
    domPointToBlockOffset(
      anchorBlock.contentDOM,
      domSelection.anchorNode,
      domSelection.anchorOffset,
    ),
  );
  const head = headBlock.text.offsetToPos(
    domPointToBlockOffset(headBlock.contentDOM, domSelection.focusNode, domSelection.focusOffset),
  );
  return TextSelection.create(view.state.doc, anchor, head);
}
