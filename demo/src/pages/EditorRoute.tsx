import { Navigate, useParams } from "react-router";
import { EditorPage } from "../components/EditorPage";
import { editors, home } from "../editors";

/**
 * URL の id でエディタを引く。ページごとに同じ形の部品を並べるより、
 * 一覧が唯一の出どころになるほうが足し忘れが起きない。
 */
export function EditorRoute() {
  const { id } = useParams();
  const editor = editors.find((spec) => spec.id === id);
  if (!editor) return <Navigate to={home} replace />;
  // 切り替えは作り直し。view は命令的なので、状態を持ち越さない
  return <EditorPage key={editor.id} editor={editor} />;
}
