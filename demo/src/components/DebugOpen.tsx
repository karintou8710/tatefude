import { createContext, type ReactNode, useContext, useMemo, useState } from "react";

interface DebugOpen {
  open: boolean;
  toggle(): void;
}

const context = createContext<DebugOpen>({ open: true, toggle: () => {} });

/**
 * パネルの開閉だけはページを移っても保つ。ページごとにコンポーネントを分けると
 * ルートを移るたびに unmount されるので、状態はルートの外に置く。
 */
export function DebugOpenProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(true);
  const value = useMemo(() => ({ open, toggle: () => setOpen((v) => !v) }), [open]);
  return <context.Provider value={value}>{children}</context.Provider>;
}

export function useDebugOpen(): DebugOpen {
  return useContext(context);
}
