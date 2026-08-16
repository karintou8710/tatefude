import { type Selection, TextSelection } from "../state/selection";
import { blockOffsetToDOMPoint, domPointToBlockOffset } from "./coords";
import type { EditorView } from "./view";

/** model の選択を DOM に書き込む。キャレットの描画はブラウザに任せる。 */
export function writeDOMSelection(view: EditorView): void {
  // ブロックを跨ぐ選択を進めている間は、ブラウザ側の選択に触らない
  // (どうせ編集ホストの境界で丸められるし、ドラッグ中に書き戻すと競合する)
  if (view.suppressSelectionSync) return;
  const selection = view.state.selection;
  const anchorBlock = view.blockAt(selection.anchor);
  const headBlock = view.blockAt(selection.head);
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

  // キャレット側のブロックにフォーカスを移す = アクティブな EditContext が決まる
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

  view.updatingSelection = true;
  try {
    domSelection.setBaseAndExtent(
      anchorPoint.node,
      anchorPoint.offset,
      headPoint.node,
      headPoint.offset,
    );
  } finally {
    view.updatingSelection = false;
  }
}

/** DOM の選択を model の選択に読み替える。読めなければ null。 */
export function readDOMSelection(view: EditorView): Selection | null {
  const domSelection = document.getSelection();
  if (!domSelection?.anchorNode || !domSelection.focusNode) return null;
  const anchorBlock = view.blockForDOM(domSelection.anchorNode);
  const headBlock = view.blockForDOM(domSelection.focusNode);
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
