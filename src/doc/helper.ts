export const none: readonly never[] = [];

export function eqArray<T extends { eq(other: T): boolean }>(
  a: readonly T[],
  b: readonly T[],
): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  return a.every((value, i) => value.eq(b[i]));
}

/** 配列やオブジェクトも構造で比べる */
export function compareDeep(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a)) {
    return Array.isArray(b) && a.length === b.length && a.every((v, i) => compareDeep(v, b[i]));
  }
  if (Array.isArray(b)) return false;
  const keys = Object.keys(a as object);
  if (keys.length !== Object.keys(b as object).length) return false;
  return keys.every((key) =>
    compareDeep((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]),
  );
}
