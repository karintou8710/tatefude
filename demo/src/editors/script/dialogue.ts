import {
  type Command,
  correction,
  type Extension,
  keymap,
  Node,
  Plot,
  Selection,
  schemaElement,
  setBlockType,
  sliceDoc,
  TextSelection,
} from "tatefude";
import { text } from "../content";
import { Speaker } from "./speaker";

/** セリフ。`Speaker` + 発話。カギ括弧は CSS で出すので文字としては持たない */
export const Dialogue = Plot.define("Dialogue", {
  inlineContent: true,
  group: Node.Group.Content,
  // 先頭は人物名のインラインブロックで固定。その手前は名前の内側の先頭と同じ点に描かれる余りで、
  // そこで打つと名前の手前に文字が入り、dialogueCorrection が 2 つ目の名前欄を生やす
  cursorAtContentStart: false,
  shape: { element: "p", attrs: { class: "script-dialogue" } },
});

/** ドキュメントを組み立てる用。人物名を書き忘れられない形にしておく */
export function dialogue(speaker: string, ...speech: Node[]): Plot {
  return Dialogue.create([Speaker.create([text(speaker)]), ...speech]);
}

/** 人物名の欄は correction が挿すので、型を変えるだけでよい */
export const setDialogue: Command = setBlockType(Dialogue);

/** セリフは必ず人物名から始まる。分割や削除で欠けたら空の名前欄を挿し直す */
const dialogueCorrection: Extension = correction({
  node: Dialogue,
  correct({ node, pos }) {
    const first = node.firstChild;
    if (first?.isPlot && first.type === Speaker.type) return null;
    const changes = { from: pos + 1, insert: [Speaker.create([])] };
    // 中身が無い = Enter で割った直後。次に打つのは名前なので、キャレットを欄の中へ入れる。
    // 挿しただけだとキャレットは欄の外に押し出され、名前のつもりがセリフに入る
    if (node.contentLength) return changes;
    return { changes, selection: (doc) => TextSelection.create(doc, pos + 2) };
  },
});

/**
 * 鉤括弧の先頭 (人物名のインラインブロックの直後) での Backspace。前のブロックと繋ぎ、人物名は捨てる。
 *
 * 既定の joinBackward は**中身の先頭**でしか効かない。セリフの先頭は人物名のインラインブロックが埋めていて
 * キャレットが来ないので (cursorAtContentStart: false)、その 1 つ内側を入口にする。
 */
const joinDialogueBackward: Command = (state) => {
  const selection = state.selection;
  if (!selection.empty) return false;
  const $from = selection.$from;
  const depth = $from.depth;
  if ($from.parent.type !== Dialogue.type) return false;
  const speaker = $from.parent.firstChild;
  if (!speaker?.isPlot || speaker.type !== Speaker.type) return false;
  const speechFrom = $from.start(depth) + speaker.length;
  if (selection.from !== speechFrom) return false;

  // 同じ親の中に手前がいなければ繋ぐ相手がいない
  const index = $from.index(depth - 1);
  if (index === 0) return false;
  const prev = $from.node(depth - 1).child(index - 1);
  if (!prev.isPlot || !prev.isTextblock) return false;

  // 前のブロックの閉じ・セリフの開き・人物名を消し、発話だけを前へ送る。
  // セリフの閉じが残って前のブロックを閉じ直すので、トークンの釣り合いは取れている
  const joint = $from.before(depth) - 1;
  const after = $from.after(depth);
  return {
    changes: { from: joint, to: after, insert: sliceDoc(state.doc, speechFrom, after), fit: true },
    selection: (doc) => Selection.near(doc, joint, -1),
    userEvent: "delete.backward",
  };
};

export const dialogueExtension: Extension = [
  schemaElement.of(Dialogue),
  dialogueCorrection,
  // Enter は末尾ならト書きになるので、セリフを作る入口を別に置く。
  // 既にセリフなら setDialogue が false を返し、Tab は次の割り当てへ落ちる
  keymap.of([
    { key: "Tab", run: setDialogue },
    // 位置が合わなければ false を返して EditContext の削除に譲る
    { key: "Backspace", run: joinDialogueBackward },
  ]),
];
