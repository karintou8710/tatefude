import { type Command, deleteSelection, joinBackward, joinForward } from "../commands/base";
import { redo, undo } from "../state/history";
import type { EditorView } from "../view/view";

/**
 * keymap で捕まえたものはここに来ない (preventDefault 済み)。残すのは keymap に書けない
 * ものだけ — 境界の削除と、macOS の Ctrl-H / Ctrl-D / Ctrl-O のように OS ごとに割り当ての
 * 違うキー。キーではなく意図で受けるので、OS 別の割り当てを並べなくて済む。keymap に
 * 割り当てがあるものは、入口が 2 つできるのでここには書かない。
 *
 * 取り消しだけは例外で、メニューや右クリックから**キーを伴わずに**飛んでくる。
 */
export function handleBeforeInput(view: EditorView, event: InputEvent): boolean {
  switch (event.inputType) {
    // メニューや右クリックからの取り消しはキーを伴わないので、keymap では拾えない
    case "historyUndo":
      return run(view, undo);
    case "historyRedo":
      return run(view, redo);
    case "insertLineBreak":
      // 雛形に hard break が無いので握りつぶす (M1)
      return true;
    case "deleteContentBackward":
    case "deleteWordBackward":
      return run(view, crossesBlocks(view) ? deleteSelection : joinBackward);
    case "deleteContentForward":
    case "deleteWordForward":
      return run(view, crossesBlocks(view) ? deleteSelection : joinForward);
    default:
      return false;
  }
}

function run(view: EditorView, command: Command): boolean {
  const spec = command(view.state);
  if (!spec) return false;
  view.dispatch(spec);
  return true;
}

/** 跨いでいたら EditContext には任せられない */
function crossesBlocks(view: EditorView): boolean {
  const { from, to, empty } = view.state.selection;
  if (empty) return false;
  const fromBlock = view.textblockAt(from);
  const toBlock = view.textblockAt(to);
  return !fromBlock || !toBlock || fromBlock !== toBlock;
}
