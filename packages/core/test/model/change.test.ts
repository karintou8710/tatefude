import { describe, expect, it } from "vitest";
import { ChangeSet, Close, fitChange, Leaf, Slice, sliceDoc } from "../../src/doc";
import { blockTexts, doc, p, schema } from "./doc";

const text = (value: string) => Slice.of([Leaf.text(value)]);

describe("ChangeSet の基本", () => {
  it("置換を適用する", () => {
    const start = doc(p("abc"));
    const changes = ChangeSet.of({ from: 2, to: 3, insert: text("XY") }, start.contentLength);
    expect(blockTexts(changes.apply(start))).toEqual(["aXYc"]);
    expect(changes.length).toBe(start.contentLength);
    expect(changes.newLength).toBe(start.contentLength + 1);
  });

  it("何も変えない変更", () => {
    const start = doc(p("abc"));
    const changes = ChangeSet.empty(start.contentLength);
    expect(changes.empty).toBe(true);
    expect(changes.apply(start)).toBe(start);
  });

  it("位置を写す", () => {
    const start = doc(p("abcde"));
    // "bc" を "Z" に置き換える
    const changes = ChangeSet.of({ from: 2, to: 4, insert: text("Z") }, start.contentLength);
    expect(changes.mapPos(1)).toBe(1);
    expect(changes.mapPos(2)).toBe(2);
    expect(changes.mapPos(3, -1)).toBe(2);
    expect(changes.mapPos(3, 1)).toBe(3);
    expect(changes.mapPos(4)).toBe(3);
    expect(changes.mapPos(5)).toBe(4);
  });

  it("変わった区間と変わらない区間を数えられる", () => {
    const start = doc(p("abcde"));
    const changes = ChangeSet.of({ from: 2, to: 4, insert: text("Z") }, start.contentLength);
    const changed: number[][] = [];
    changes.iterChanges((fromA, toA, fromB, toB) => changed.push([fromA, toA, fromB, toB]));
    expect(changed).toEqual([[2, 4, 2, 3]]);

    const gaps: number[][] = [];
    changes.iterGaps((fromA, fromB, length) => gaps.push([fromA, fromB, length]));
    expect(gaps).toEqual([
      [0, 0, 2],
      [4, 3, 3],
    ]);

    expect(changes.touchesRange(0, 1)).toBe(false);
    expect(changes.touchesRange(3, 3)).toBe(true);
  });

  it("逆向きの変更でもとに戻せる", () => {
    const start = doc(p("abcde"));
    const changes = ChangeSet.of({ from: 2, to: 4, insert: text("Z") }, start.contentLength);
    const after = changes.apply(start);
    expect(changes.invert(start).apply(after).eq(start)).toBe(true);
  });
});

describe("ChangeSet の合成", () => {
  it("2 つの変更を 1 つにまとめられる", () => {
    const start = doc(p("abcde"));
    const first = ChangeSet.of({ from: 1, to: 2, insert: text("X") }, start.contentLength);
    const middle = first.apply(start);
    const second = ChangeSet.of({ from: 3, to: 4, insert: text("Y") }, middle.contentLength);

    const composed = first.compose(second);
    expect(composed.apply(start).eq(second.apply(middle))).toBe(true);
    expect(composed.length).toBe(start.contentLength);
    expect(composed.newLength).toBe(second.newLength);
  });

  it("後の変更が前の挿入を消す場合", () => {
    const start = doc(p("ab"));
    const first = ChangeSet.of({ from: 2, to: 2, insert: text("XYZ") }, start.contentLength);
    const middle = first.apply(start);
    expect(blockTexts(middle)).toEqual(["aXYZb"]);
    const second = ChangeSet.of({ from: 2, to: 5, insert: Slice.empty }, middle.contentLength);

    const composed = first.compose(second);
    expect(blockTexts(composed.apply(start))).toEqual(["ab"]);
    expect(composed.empty).toBe(true);
  });
});

describe("編集を重ねた ChangeSet (性質テスト)", () => {
  const random = mulberry32(20260816);

  it("合成した変更を最初の doc に当てると、最後の doc と一致する", () => {
    for (let round = 0; round < 100; round++) {
      const start = doc(p("abcde"), p("fghij"), p("klmno"));
      const { changes, doc: final } = randomEdits(start, 5, random);
      expect(changes.apply(start).eq(final)).toBe(true);
    }
  });

  it("合成した変更の逆で、もとの doc に戻せる", () => {
    for (let round = 0; round < 100; round++) {
      const start = doc(p("abcde"), p("fghij"), p("klmno"));
      const { changes, doc: final } = randomEdits(start, 5, random);
      expect(changes.invert(start).apply(final).eq(start)).toBe(true);
    }
  });

  // 合成すると途中の区切りは失われるので、変更に掛かった位置の写像は
  // 1 つずつ写した結果と一致しない (CodeMirror と同じ性質)。
  // 一致が保証されるのは「変わらなかった区間」の中だけ。
  it("変わらなかった区間の位置はずれない", () => {
    for (let round = 0; round < 100; round++) {
      const start = doc(p("abcde"), p("fghij"));
      const { changes } = randomEdits(start, 4, random);
      changes.iterGaps((fromA: number, fromB: number, length: number) => {
        for (let k = 0; k <= length; k++) {
          // 区間の頭は挿入をまたぐ側 (+1)、それ以外は手前寄せ (-1) で見る
          expect(changes.mapPos(fromA + k, k === 0 ? 1 : -1)).toBe(fromB + k);
        }
      });
    }
  });

  it("写像は単調で、範囲に収まる", () => {
    for (let round = 0; round < 100; round++) {
      const start = doc(p("abcde"), p("fghij"));
      const { changes, doc: final } = randomEdits(start, 4, random);
      let previous = -1;
      for (let pos = 0; pos <= start.contentLength; pos++) {
        const mapped = changes.mapPos(pos, 1);
        expect(mapped).toBeGreaterThanOrEqual(previous);
        expect(mapped).toBeLessThanOrEqual(final.contentLength);
        previous = mapped;
      }
    }
  });
});

describe("fitChange", () => {
  it("ブロックを跨ぐ削除が結合になる", () => {
    const start = doc(p("abc"), p("def"));
    const changes = fitChange(schema, start, { from: 2, to: 7 });
    expect(blockTexts(changes.apply(start))).toEqual(["aef"]);
  });

  it("ブロックの外にインラインを入れると既定のブロックで包まれる", () => {
    const start = doc(p("abc"));
    const changes = fitChange(schema, start, { from: 0, to: 0, insert: text("new") });
    expect(blockTexts(changes.apply(start))).toEqual(["new", "abc"]);
  });

  it("釣り合っていないスライスを直す (閉じが余っている)", () => {
    const start = doc(p("abc"), p("def"));
    // 「テキスト + 余分な閉じ」を段落の途中に入れる
    const broken = Slice.of([...text("X").tokens, ...sliceDoc(start, 4, 5).tokens]);
    const changes = fitChange(schema, start, { from: 2, to: 2, insert: broken });
    const result = changes.apply(start);
    // 余分な閉じで段落が割れるが、木としては壊れない
    expect(result.content.every((node) => node.isPlot)).toBe(true);
    expect(result.textContent).toBe("aXbcdef");
  });

  it("置けない開きは、外側を閉じてから置かれる", () => {
    const start = doc(p("abc"));
    // 段落の中に段落は置けないので、段落を閉じてから開き直す
    const insert = Slice.of([p("zz").tag, Leaf.text("zz")]);
    const changes = fitChange(schema, start, { from: 2, to: 2, insert });
    expect(blockTexts(changes.apply(start))).toEqual(["a", "zzbc"]);
  });
});

/** 決まった種を持つ乱数 (毎回同じ列になるように) */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** ランダムな編集を count 回重ねる。通らない編集は飛ばす。 */
function randomEdits(start: ReturnType<typeof doc>, count: number, random: () => number) {
  let changes = ChangeSet.empty(start.contentLength);
  let current = start;
  for (let i = 0; i < count; i++) {
    const size = current.contentLength;
    const pick = Math.floor(random() * 4);
    const a = Math.floor(random() * (size + 1));
    const b = Math.floor(random() * (size + 1));
    const from = Math.min(a, b);
    const to = Math.max(a, b);
    try {
      const spec =
        pick === 0
          ? { from, to, insert: text("XY"), fit: true }
          : pick === 1
            ? { from, to, fit: true }
            : pick === 2
              ? { from, to: from, insert: Slice.of([Close, p("").tag]), fit: true }
              : {
                  // 大きくなりすぎないように、複製は doc が小さいときだけ
                  from,
                  to,
                  insert: size < 60 ? sliceDoc(current, from, to) : Slice.empty,
                  fit: true,
                };
      const next = fitChange(schema, current, spec);
      const applied = next.apply(current);
      schema.validate(applied);
      changes = changes.compose(next);
      current = applied;
    } catch {
      // スキーマや位置の都合で通らない編集は飛ばす
    }
  }
  return { changes, doc: current };
}
