import { useState } from "react";
import type { Plot } from "tatefude";
import type { PrintSpec } from "../editors/types";
import styles from "./MinitypeButton.module.css";

/**
 * 同じ doc を minitype (組版エンジン) で組んで PDF にする。**ローカルの実験用**で、
 * experiments/minitype のサーバー (`pnpm dev:minitype`) が立っていないと失敗する。
 *
 * 変換はサーバーが持つ。デモは doc の JSON と組みの数字を渡すだけなので、
 * ライブラリ本体はクライアントのバンドルに入らない (PolyForm Strict は再配布を許さない)。
 */
export function MinitypeButton({ doc, print }: { doc: Plot; print: PrintSpec }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<string | null>(null);

  async function run(): Promise<void> {
    setBusy(true);
    setError(null);
    setLink(null);
    // **押した時点で開く。**組み上がってから開くと、待っている間にクリックの
    // ユーザー操作が切れてポップアップとして塞がれることがある
    const tab = window.open("", "_blank");
    try {
      const response = await fetch("/api/pdf", {
        method: "POST",
        // 組みはそのまま渡す。ここで計算しない — 紙の数字は spec が全部持っている
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ doc: doc.toJSON(), ...print }),
      });
      if (!response.ok) throw new Error(await response.text());
      // 開いたタブが使い続けるので revoke はしない
      const url = URL.createObjectURL(await response.blob());
      if (tab) tab.location.href = url;
      // ポップアップを塞ぐ環境では自分では開けない。リンクなら本人のクリックで開ける
      else setLink(url);
    } catch (cause) {
      tab?.close();
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className={styles.button} onClick={run} disabled={busy}>
        {busy ? "組版中…" : "minitype (実験)"}
      </button>
      {error && <span className={styles.error}>{error}</span>}
      {link && (
        <a className={styles.link} href={link} target="_blank" rel="noreferrer">
          PDF を開く
        </a>
      )}
    </>
  );
}
