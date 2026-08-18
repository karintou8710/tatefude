import {
  boutenExtension,
  docExtension,
  type EditorState,
  type Extension,
  type Plot,
  rubyExtension,
  strongExtension,
  tcyExtension,
} from "tatefude";
import type { ToolbarItem } from "../../components/Toolbar";
import { rubyItem } from "../common";
import { tcyItem } from "../vertical";
import { Action, actionExtension, setAction } from "./action";
import { Dialogue, dialogueExtension, setDialogue } from "./dialogue";
import { SceneHeading, sceneHeadingExtension, setSceneHeading } from "./scene-heading";
import { speakerExtension } from "./speaker";

// 映像台本のスキーマ。既定のスキーマと入れ替えるだけで別の書式になる、という例。
//
// ノード 1 個ぶんを Extension にして並べる。型・不変条件・コマンド・キー割り当てが
// ひとまとまりで動くので、correction の登録を忘れる、という事故が起きない。
// 見た目 (字下げ・罫線・番号) は class を通して styles.module.css が持つ。

/** 既定のスキーマから持ってくるぶん。本文の型だけ入れ替えるので、それ以外は拾って並べる */
const sharedExtension: Extension = [
  docExtension,
  rubyExtension,
  strongExtension,
  boutenExtension,
  tcyExtension,
];

export function scriptSchema(): Extension {
  return [
    sharedExtension,
    sceneHeadingExtension,
    actionExtension,
    dialogueExtension,
    speakerExtension,
  ];
}

/** ツールバーの並び。ノード側が export したコマンドを繋ぐだけ */
export const scriptToolbar: readonly ToolbarItem[] = [
  { label: "柱", command: setSceneHeading, isActive: blockIs(SceneHeading) },
  { label: "ト書き", command: setAction, isActive: blockIs(Action) },
  { label: "セリフ", command: setDialogue, isActive: blockIs(Dialogue) },
  rubyItem,
  tcyItem,
];

function blockIs(tag: Plot.Tag): (state: EditorState) => boolean {
  return (state) => state.selection.$from.parent.type === tag.type;
}
