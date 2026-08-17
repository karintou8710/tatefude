import { horizontal } from "./horizontal";
import { novel } from "./novel";
import { script } from "./script";
import type { Editor } from "./types";

export { horizontal } from "./horizontal";
export { novel } from "./novel";
export { script } from "./script";
export type { Editor } from "./types";

/** ナビの並び順 */
export const editors: readonly Editor[] = [horizontal, novel, script];
