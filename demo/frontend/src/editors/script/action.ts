import {
  type Command,
  type Extension,
  Leaf,
  Node,
  Plot,
  Ruby,
  schemaElement,
  setBlockType,
  Tcy,
} from "tatefude";

/** ト書き。動作や情景。Enter で作られる既定のブロック */
export const Action = Plot.define("Action", {
  // 文とルビと縦中横だけ。人物名 (Speaker) のインラインブロックはセリフのもの
  inlineContent: [Leaf.Text, Ruby, Tcy],
  group: Node.Group.Content,
  defaultBlock: true,
  placeholder: "ト書き",
  shape: { element: "p", attrs: { class: "script-action" } },
});

export const setAction: Command = setBlockType(Action);

export const actionExtension: Extension = [schemaElement.of(Action)];
