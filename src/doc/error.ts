/** スキーマの組み立て方が壊れている */
export class SchemaError extends Error {
  override name = "SchemaError";
}

/** ドキュメントがスキーマに合っていない */
export class ValidationError extends Error {
  override name = "ValidationError";
}
