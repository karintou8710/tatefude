import { describe, expect, it } from "vitest";
import { buildTextblockMap } from "../../src/doc";
import { doc, p, ruby, strong } from "./doc";

function firstBlock(node: ReturnType<typeof doc>, index = 0) {
  const block = node.child(index);
  if (!block.isPlot) throw new Error("plot ではない");
  return block;
}

describe("TextblockMap", () => {
  it("ブロックのフラット文字列を作る", () => {
    const d = doc(p("ab", strong("cd")));
    const map = buildTextblockMap(firstBlock(d), 0);
    expect(map.text).toBe("abcd");
    expect(map.contentStart).toBe(1);
  });

  it("doc 位置とオフセットを往復できる", () => {
    const d = doc(p("ab", strong("cd")));
    const map = buildTextblockMap(firstBlock(d), 0);
    expect(map.posToOffset(1)).toBe(0);
    expect(map.posToOffset(3)).toBe(2);
    expect(map.posToOffset(5)).toBe(4);
    expect(map.offsetToPos(0)).toBe(1);
    expect(map.offsetToPos(2)).toBe(3);
    expect(map.offsetToPos(4)).toBe(5);
  });

  it("2 つ目のブロックでも位置がずれない", () => {
    const d = doc(p("abc"), p("de"));
    const map = buildTextblockMap(firstBlock(d, 1), 5);
    expect(map.text).toBe("de");
    expect(map.contentStart).toBe(6);
    expect(map.offsetToPos(0)).toBe(6);
    expect(map.offsetToPos(2)).toBe(8);
    expect(map.posToOffset(7)).toBe(1);
  });

  // Doc(Paragraph("あ", Ruby(RubyBase("漢"), RubyText("かん")), "い")) の位置:
  //   "あ" = 1..2 / Ruby = 2..11 (RubyBase の "漢" = 4..5、RubyText の "かん" = 7..9) / "い" = 11..12
  describe("インラインブロック", () => {
    const d = doc(p("あ", ruby("漢", "かん"), "い"));
    const map = buildTextblockMap(firstBlock(d), 0);

    it("中身は展開され、開き / 閉じは 0 文字になる", () => {
      expect(map.text).toBe("あ漢かんい");
    });

    it("インラインブロックの中の位置もオフセットに写る", () => {
      expect(map.posToOffset(4)).toBe(1); // "漢" の手前
      expect(map.posToOffset(5)).toBe(2); // "漢" の後ろ
      expect(map.posToOffset(7)).toBe(2); // 読みの手前
      expect(map.posToOffset(11)).toBe(4); // ルビを抜けた後
    });

    it("0 文字の境界に挟まれた位置は、手前の断片の端に寄る", () => {
      // 3 = RubyBase の開きの直後、6 = RubyBase の閉じの直後。どちらも文字を持たない
      expect(map.posToOffset(3)).toBe(1);
      expect(map.posToOffset(6)).toBe(2);
    });

    it("オフセットからは既定で外側の位置を返す", () => {
      // 1 文字目の後ろは「ルビの手前」と「RubyBase の中の先頭」の両方に当たる。外を採る
      expect(map.offsetToPos(1)).toBe(2);
      expect(map.offsetToPos(2)).toBe(5);
    });

    it("bias を正にすると内側の位置になる", () => {
      expect(map.offsetToPos(1, 1)).toBe(4); // RubyBase の中の "漢" の手前
      expect(map.offsetToPos(2, 1)).toBe(7); // RubyText の中の "かん" の手前
      // 内側と外側で挟むと、バッファ上の [1, 2) がちょうど "漢" の範囲になる
      expect([map.offsetToPos(1, 1), map.offsetToPos(2, -1)]).toEqual([4, 5]);
    });

    it("ルビの直後の位置を bias 1 で引ける", () => {
      // Paragraph( Ruby( rb"漢字" 3..5, rt"かんじ" 7..10 ) ) → ruby の閉じの直後が 12
      const only = buildTextblockMap(firstBlock(doc(p(ruby("漢字", "かんじ")))), 0);
      expect(only.text).toBe("漢字かんじ");
      expect(only.posToOffset(12)).toBe(5);
      // 同じオフセットに rt の末尾 (10) と ruby の直後 (12) が当たる
      expect(only.offsetToPos(5, -1)).toBe(10);
      expect(only.offsetToPos(5, 1)).toBe(12);
    });

    it("境界の無いブロックでは bias で変わらない", () => {
      const plain = buildTextblockMap(firstBlock(doc(p("ab", strong("cd")))), 0);
      for (let offset = 0; offset <= 4; offset++) {
        expect(plain.offsetToPos(offset, 1)).toBe(plain.offsetToPos(offset, -1));
      }
    });
  });

  it("空ブロックは空文字列", () => {
    const d = doc(p());
    const map = buildTextblockMap(firstBlock(d), 0);
    expect(map.text).toBe("");
    expect(map.offsetToPos(0)).toBe(1);
    expect(map.posToOffset(1)).toBe(0);
  });
});
