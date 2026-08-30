import { type Selection, TextSelection } from "../state/selection";
import { blockPosToDOMPoint, domPointToBlockPos } from "./dom-point";
import type { EditorView } from "./view";

/**
 * model の選択を DOM にも書く。キャレットも選択も描画は自前なので、こちらは
 * 支援技術とネイティブのコンテキストメニューのために保つ。
 */
export function writeDOMSelection(view: EditorView): void {
  const selection = view.state.selection;
  const anchorBlock = view.textblockAt(selection.anchor);
  const headBlock = view.textblockAt(selection.head);
  if (!anchorBlock || !headBlock) return;
  const domSelection = document.getSelection();
  if (!domSelection) return;

  const anchorPoint = blockPosToDOMPoint(anchorBlock, selection.anchor);
  const headPoint = blockPosToDOMPoint(headBlock, selection.head);

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

  const anchor = domPointToBlockPos(
    anchorBlock,
    domSelection.anchorNode,
    domSelection.anchorOffset,
  );
  const head = domPointToBlockPos(headBlock, domSelection.focusNode, domSelection.focusOffset);
  return TextSelection.create(view.state.doc, anchor, head);
}
