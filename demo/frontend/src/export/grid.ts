/**
 * 組みのグリッド。**紙の数字をそのまま持つ** — 判型・余白・送りを与えたうえで字数・行数が
 * 決まっているのが本の組みで、級数を字数から逆算すると判型に引きずられる。
 *
 * 画面が受け取るのは字数と行数だけ。行送りは画面の都合で決める (注記の逃げ場が要る)。
 */
export interface Grid {
  /** 1 行の字数 */
  chars: number;
  /** 1 ページの行数 */
  lines: number;
  /** 字送り (pt)。全角 1 文字の送り */
  charAdvance: number;
  /** 行送り (pt) */
  lineAdvance: number;
}

/** 判型 (mm) */
export interface Sheet {
  width: number;
  height: number;
  /** 余白 (mm)。地はノンブルが入るので天と分けるが、**小口とノドは同じ**に取る */
  margin: {
    top: number;
    bottom: number;
    /** 左右 = 行の積み方向 */
    side: number;
  };
}
