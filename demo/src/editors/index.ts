import { horizontal } from "./horizontal";
import { novel, novelScroll } from "./novel";
import { script, scriptScroll } from "./script";
import type { Editor } from "./types";

export type { Editor } from "./types";

/** ナビとルートの唯一の出どころ。並び順もこれ */
export const editors: readonly Editor[] = [horizontal, novel, novelScroll, script, scriptScroll];

/** 入口。id を持たない URL はここへ送る */
export const home = `/${editors[0].id}`;
