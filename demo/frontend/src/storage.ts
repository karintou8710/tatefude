import type { Plot, Schema } from "tatefude";

const key = (id: string) => `tatefude-demo:${id}`;

/**
 * 書いたものを取り戻す。**読めなければ捨てて null を返す** —
 * スキーマを変えると前の形が通らなくなるので、そのときは既定の doc に戻す。
 * `EditorState` に JSON をそのまま渡すと落ちるので、ここで受け止める。
 */
export function load(id: string, schema: Schema): Plot | null {
  const saved = read(key(id));
  if (!saved) return null;
  try {
    return schema.docFromJSON(JSON.parse(saved));
  } catch {
    clear(id);
    return null;
  }
}

export function save(id: string, doc: Plot): void {
  try {
    localStorage.setItem(key(id), JSON.stringify(doc.toJSON()));
  } catch {
    // 容量切れや書けない設定。保存できなくても編集は続けられる
  }
}

export function clear(id: string): void {
  try {
    localStorage.removeItem(key(id));
  } catch {
    // 同上
  }
}

/** プライベートウィンドウでは localStorage に触るだけで投げる */
function read(name: string): string | null {
  try {
    return localStorage.getItem(name);
  } catch {
    return null;
  }
}
