import { Navigate, NavLink, type NavLinkRenderProps, Route, Routes } from "react-router";
import { isEditContextSupported } from "tatefude";
import styles from "./App.module.css";
import { editors, home } from "./editors";
import { EditorRoute } from "./pages/EditorRoute";

/** ヘッダとルート定義だけ。ページごとの中身は pages/ が持つ */
export function App() {
  return (
    <>
      <header className={styles.header}>
        <h1>tatefude</h1>
        <p>
          {isEditContextSupported()
            ? "EditContext: 使える"
            : "EditContext: このブラウザには無い (Chromium 121+ が必要)"}
        </p>
        <nav className={styles.editors}>
          {editors.map((editor) => (
            <NavLink
              key={editor.id}
              to={`/${editor.id}`}
              className={({ isActive }: NavLinkRenderProps) =>
                isActive ? `${styles.editorLink} ${styles.current}` : styles.editorLink
              }
            >
              <span className={styles.name}>{editor.name}</span>
              <span className={styles.description}>{editor.description}</span>
            </NavLink>
          ))}
        </nav>
      </header>
      <Routes>
        <Route path="/:id" element={<EditorRoute />} />
        {/* / と知らない URL は先頭のページへ */}
        <Route path="*" element={<Navigate to={home} replace />} />
      </Routes>
    </>
  );
}
