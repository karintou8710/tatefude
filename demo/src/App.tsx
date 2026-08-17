import { Navigate, NavLink, type NavLinkRenderProps, Route, Routes } from "react-router";
import { isEditContextSupported } from "tatefude";
import styles from "./App.module.css";
import { DebugOpenProvider } from "./components/DebugOpen";
import { editors } from "./editors";
import { HorizontalPage } from "./pages/HorizontalPage";
import { NovelPage } from "./pages/NovelPage";
import { ScriptPage } from "./pages/ScriptPage";

const home = "/horizontal";

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
      <DebugOpenProvider>
        <Routes>
          <Route path="/horizontal" element={<HorizontalPage />} />
          <Route path="/novel" element={<NovelPage />} />
          <Route path="/script" element={<ScriptPage />} />
          {/* / と知らない URL は先頭のページへ */}
          <Route path="*" element={<Navigate to={home} replace />} />
        </Routes>
      </DebugOpenProvider>
    </>
  );
}
