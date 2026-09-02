import { useState } from "react";
import type { Plot } from "tatefude";
import type { PrintSpec } from "../editors/types";
import styles from "./MinitypeButton.module.css";

/** 組んでいるエンジンの紹介記事 (作者による公開告知) */
const ARTICLE = "https://zenn.dev/inaniwaudon/articles/62f1def4bad627";

/** 待っている間の見た目。色はデモ本体に合わせる */
const WAITING_STYLE = `body{margin:0;min-height:100vh;display:grid;place-items:center;align-content:center;
gap:16px;background:#f6f6f7;color:#1c1c1e;font:13px system-ui,sans-serif}
.koma{display:grid;gap:3px}
.koma i{width:15px;height:15px;border:1px solid #c9c7c3;animation:fill 1.8s ease-in-out infinite}
.koma i:nth-child(2){animation-delay:.15s}.koma i:nth-child(3){animation-delay:.3s}
.koma i:nth-child(4){animation-delay:.45s}
@keyframes fill{0%,55%,100%{background:transparent}20%,35%{background:#1c1c1e}}
@media(prefers-reduced-motion:reduce){.koma i{animation:none;background:#e2e0dc}}
p{margin:0;opacity:.7}`;

/** 原稿用紙のマスが上から埋まる。組版が進んでいるように見せるだけのもの */
function showWaiting(tab: Window): void {
  const view = tab.document;
  view.documentElement.lang = "ja";
  view.title = "組版中…";
  const style = view.createElement("style");
  style.textContent = WAITING_STYLE;
  view.head.append(style);
  view.body.innerHTML = '<div class="koma"><i></i><i></i><i></i><i></i></div><p>組版中…</p>';
}

/**
 * 同じ doc を minitype で組んで PDF にする。変換はサーバー (demo/server) が持つので、
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
    // **押した時点で開く。**クリックの効力は数秒で切れるので、組み上がってから開くと
    // コールドスタートを挟んだ回はポップアップとして塞がれる。空のまま待たせないよう、
    // 先に断りを書いておいて、組み上がったら中身を差し替える
    const tab = window.open("", "_blank");
    if (tab) showWaiting(tab);
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
      // ポップアップを塞ぐ設定では自分では開けない。リンクなら本人のクリックで開ける
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
      {/* button の中に a は置けないので、下に並べる */}
      <span className={styles.export}>
        <button type="button" className={styles.button} onClick={run} disabled={busy}>
          {busy ? "組版中…" : "PDF 出力"}
        </button>
        <span className={styles.engine}>
          <a href={ARTICLE} target="_blank" rel="noreferrer">
            minitype
          </a>
        </span>
      </span>
      {error && <span className={styles.error}>{error}</span>}
      {link && (
        <a className={styles.link} href={link} target="_blank" rel="noreferrer">
          PDF を開く
        </a>
      )}
    </>
  );
}
