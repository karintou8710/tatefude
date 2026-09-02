import { useState } from "react";
import { Navigate, useParams } from "react-router";
import { EditorPage } from "../components/EditorPage";
import { editors, home } from "../editors";
import { clear } from "../storage";

/**
 * URL の id でエディタを引く。ページごとに同じ形の部品を並べるより、
 * 一覧が唯一の出どころになるほうが足し忘れが起きない。
 */
export function EditorRoute() {
  const { id } = useParams();
  // リセットは key を変えて丸ごと作り直す。書き戻しの判定も一緒に初期化される
  const [generation, setGeneration] = useState(0);
  const editor = editors.find((spec) => spec.id === id);
  if (!editor) return <Navigate to={home} replace />;
  // 切り替えは作り直し。view は命令的なので、状態を持ち越さない
  return (
    <EditorPage
      key={`${editor.id}:${generation}`}
      editor={editor}
      onReset={() => {
        if (!window.confirm("書いたものを消して、はじめの文章に戻します。")) return;
        clear(editor.store ?? editor.id);
        setGeneration((n) => n + 1);
      }}
    />
  );
}
