import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// @types/node を入れずに env だけ読む
declare const process: { env: Record<string, string | undefined> };

export default defineConfig({
  plugins: [react()],
  // 既定は 5180。並行して立てたいときだけ PORT で上書きする
  server: { port: Number(process.env.PORT) || 5180 },
});
