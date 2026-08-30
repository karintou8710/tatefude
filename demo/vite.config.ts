import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// @types/node を入れずに env だけ読む
declare const process: { env: Record<string, string | undefined> };

export default defineConfig({
  plugins: [react()],
  // GitHub Pages は /<リポジトリ名>/ の下に置かれるので、資産の URL に接頭辞が要る。
  // BrowserRouter の basename も import.meta.env.BASE_URL から同じ値を読む
  base: process.env.BASE_PATH || "/",
  // 既定は 5180。並行して立てたいときだけ PORT で上書きする
  server: {
    port: Number(process.env.PORT) || 5180,
    // minitype の実験サーバー (experiments/minitype)。立っていなければ失敗するだけ
    proxy: { "/api": { target: "http://localhost:8787", rewrite: (path) => path.slice(4) } },
  },
});
