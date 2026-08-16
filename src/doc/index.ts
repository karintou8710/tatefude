// ドキュメントのデータモデル。Wordgard の doc パッケージに倣った構成。
//
// - Node は Plot (中身を持つ) か Leaf (持たない)。テキストは値が文字列の Leaf
// - Tag = 型 + パラメータ + マーク。Leaf は自分がタグ、Plot はタグを持つ
// - Shape がノードとマークの DOM での姿を決める
// - Schema が「何をどこに置けるか」を決め、validate で実際に検査する

export { SchemaError, ValidationError } from "./error";
export { Mark } from "./mark";
// Node は型の別名であると同時に Group / Role を持つ名前空間なので、値として再輸出する
export {
  appendContent,
  contentLength,
  cutContent,
  findIndex,
  joinText,
  Leaf,
  Node,
  Plot,
} from "./node";
export { Pos } from "./pos";
export { Schema } from "./schema";
export { type Attributes, Elt, type Shape } from "./shape";
export { ATOM_CHAR, buildTextblockMap, TextblockMap } from "./textblock";
