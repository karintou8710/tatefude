import type { Extension, Plot, Schema } from "tatefude";
import type { ToolbarItem } from "../components/Toolbar";

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
  doc: (schema: Schema) => Plot;
}
