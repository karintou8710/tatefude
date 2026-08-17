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

/**
 * 柱。シーンの場所。番号と一緒に右端の欄に立つ見出し。
 *
 * シーンを内包するノードではなく、シーンの頭に立つ 1 ブロック。汎用スキーマの見出し
 * (レベルを持つ h1〜h6) とは別物なので、`Heading` ではなくこの名前にしている。
 */
export const SceneHeading = Plot.define("SceneHeading", {
  // 場所の名前とルビだけ。人物名 (Speaker) の箱はセリフのもの
  inlineContent: [Leaf.Text, Ruby, Tcy],
  group: Node.Group.Content,
  shape: { element: "h2", attrs: { class: "script-scene-heading" } },
});

export const setSceneHeading: Command = setBlockType(SceneHeading);

/** この型を使うのに要るもの一式。型・不変条件・コマンド・キー割り当てが一緒に旅をする */
export const sceneHeadingExtension: Extension = [schemaElement.of(SceneHeading)];
