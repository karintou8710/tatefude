import type { Extension, Plot, Schema } from "tatefude";
import type { ToolbarItem } from "../components/Toolbar";
import type { Grid, Sheet } from "../export/grid";

/**
 * 紙に出すときの組み。**字数・行数は画面の段組みにも同じ値を渡す**ので、
 * グリッドの出どころはここ 1 つ。無ければ書き出しのボタンを出さない。
 */
export interface PrintSpec extends Grid {
  sheet: Sheet;
}

/**
 * デモの 1 ページ分。**スキーマ・書字方向・スタイルの組**で、
 * 同じエンジンがどこまで違う書式になるかを見るためのもの。
 */
export interface Editor {
  id: string;
  name: string;
  description: string;
  /**
   * ペインの組み方。
   * - `horizontal` 横書き
   * - `vertical`   縦書き。行が左へ伸びるので横スクロール
   * - `paginated`  縦書きを段組みでページに割る。段が下へ積まれるので縦スクロール
   */
  layout: "horizontal" | "vertical" | "paginated";
  /** そのエディタ固有の書式。CSS Module のクラス */
  className?: string;
  config: Extension;
  /** ツールバーの並び。無ければ出さない */
  toolbar?: readonly ToolbarItem[];
  /** 紙の組み。無ければ書き出せない */
  print?: PrintSpec;
  doc: (schema: Schema) => Plot;
}
