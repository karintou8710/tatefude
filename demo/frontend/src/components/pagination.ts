import { type RefObject, useLayoutEffect, useRef, useState } from "react";
import type { EditorHandle } from "tatefude-react";

/** 万一収束しないときの打ち切り */
const MAX_PAGES = 500;

/**
 * 段組みでページに割るときの、紙の高さ (= ページ数) を決める。
 *
 * 段組みは**使える高さで段の数を決める**ので、高さを内容から決めようとすると
 * 「高さが段数を決め、段数が高さを決める」の循環になり、段が割れないか数が暴れる。
 * ページ数を 1 から増やし、中身が収まったところで止める。単調なので必ず収束する。
 */
export function usePageCount(editor: EditorHandle, enabled: boolean, doc: unknown): number {
  const [pages, setPages] = useState(1);

  // biome-ignore lint/correctness/useExhaustiveDependencies: doc は「中身が変わったら測り直す」合図。効果の中では読まない
  useLayoutEffect(() => {
    const dom = editor.view?.dom;
    if (!enabled || !dom) return;

    const fit = (): void => {
      // 数え直しは 1 ページから試すので、途中で文書が今より縮む。**その瞬間にブラウザが
      // スクロール位置を切り詰め、高さが戻っても位置は戻らない** — 一番下に居ると
      // 打つたびに少しずつ上へ持っていかれるので、自分で戻す
      const scroll = window.scrollY;
      for (let count = 1; count <= MAX_PAGES; count++) {
        dom.style.setProperty("--page-count", String(count));
        // setProperty のあとに矩形を読むとレイアウトが確定する
        if (contentBottom(dom) <= dom.getBoundingClientRect().bottom + 1) {
          setPages(count);
          break;
        }
      }
      if (window.scrollY !== scroll) window.scrollTo({ top: scroll });
    };

    fit();

    // 紙の幅が変われば 1 ページの行数が変わる。**幅の変化だけを見る** —
    // fit() は観測対象の高さを変えるので、素直に測り直すと自分の変更でまた発火する。
    // 再入は ResizeObserver のループ判定に当たり、そこから先の通知が捨てられる
    let lastWidth = dom.clientWidth;
    const observer = new ResizeObserver(() => {
      if (dom.clientWidth === lastWidth) return;
      lastWidth = dom.clientWidth;
      fit();
    });
    observer.observe(dom);
    return () => observer.disconnect();
  }, [editor, enabled, doc]);

  return enabled ? pages : 0;
}

/** いちばん下にある中身の下端。段を跨ぐブロックがあるので断片まで見る */
function contentBottom(dom: HTMLElement): number {
  let bottom = Number.NEGATIVE_INFINITY;
  for (const block of dom.querySelectorAll("[data-tf-textblock]")) {
    for (const rect of block.getClientRects()) bottom = Math.max(bottom, rect.bottom);
  }
  return bottom;
}

/**
 * キャレットが別のページへ移ったら、そのページ全体が見えるところまで送る。
 *
 * ライブラリの自動スクロールは「キャレットが見えるまで」の最小移動なので、ページの
 * 切り替わりが分からない。ページ単位で送ると、紙をめくったように見える。
 */
export function usePageScroll(
  editor: EditorHandle,
  enabled: boolean,
  selection: unknown,
  offsetRef: RefObject<HTMLElement | null>,
  skipRef: RefObject<boolean>,
): void {
  const shown = useRef(-1);

  // biome-ignore lint/correctness/useExhaustiveDependencies: selection は「動いたら測り直す」合図。効果の中では読まない
  useLayoutEffect(() => {
    const dom = editor.view?.dom;
    if (!enabled || !dom) return;
    const caret = dom.querySelector<HTMLElement>(".tf-caret");
    if (!caret || caret.style.display === "none") return;

    // --page-length は calc のまま返ってくるので、同じ変数で測定用の箱を作って解かせる
    const period = resolveLength(dom, "calc(var(--page-length) + var(--gutter))");
    if (!period) return;

    const contentTop =
      dom.getBoundingClientRect().top + Number.parseFloat(getComputedStyle(dom).paddingTop);
    // **下端で見る** — キャレットは行の縁を跨いで描かれるので、ページの先頭では
    // 上端が紙から半分はみ出す。上端で割るとひとつ前のページと判定され、
    // 行頭で Enter を押すたびに紙が 1 枚戻ってしまう。
    // 紙の終わりには地の余白があるので、下端がページを跨ぐことはない
    const page = Math.floor((caret.getBoundingClientRect().bottom - contentTop) / period);
    if (page === shown.current) return;
    const first = shown.current < 0;
    shown.current = page;
    // 開いた直後と、クリックで選んだときは動かさない。
    // 見えているところを押したのに紙が飛ぶのは操作として気持ち悪い
    if (first || skipRef.current) return;

    // 張り付いた帯のぶん下げて、ページの上端がその真下に来るようにする
    const offset = offsetRef.current?.getBoundingClientRect().height ?? 0;
    window.scrollTo({ top: window.scrollY + contentTop + page * period - offset });
  }, [editor, enabled, selection, offsetRef, skipRef]);
}

/** calc や min を含む長さを解かせる。測定用の箱に入れて使われた値を読む */
function resolveLength(host: HTMLElement, expression: string): number {
  const probe = document.createElement("div");
  probe.style.cssText = `position:absolute;visibility:hidden;width:0;height:${expression}`;
  host.appendChild(probe);
  const length = probe.getBoundingClientRect().height;
  probe.remove();
  return length;
}
