import React, { createContext, useContext, useState, useCallback, useRef } from "react";

export type ToastType = "success" | "error" | "warning" | "info";

export interface Toast {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number; // ms; 0 = persist until dismissed
}

interface ToastContextValue {
  toasts: Toast[];
  toast: (opts: Omit<Toast, "id">) => string;
  dismiss: (id: string) => void;
  success: (title: string, message?: string) => string;
  error: (title: string, message?: string) => string;
  warning: (title: string, message?: string) => string;
  info: (title: string, message?: string) => string;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: string) => {
    const t = timers.current.get(id);
    if (t) {
      clearTimeout(t);
      timers.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (opts: Omit<Toast, "id">): string => {
      const duration = opts.duration ?? 4500;
      let existingId: string | null = null;

      // Dedupe — if an identical toast (same type + title + message)
      // is already showing, bump its timer instead of stacking a
      // duplicate. Prevents the "fetch retry fired 5 times → 5
      // identical errors visible" UX failure mode.
      setToasts((prev) => {
        const dup = prev.find(
          (t) =>
            t.type === opts.type &&
            t.title === opts.title &&
            (t.message ?? "") === (opts.message ?? ""),
        );
        if (dup) {
          existingId = dup.id;
          return prev;
        }
        return prev;
      });

      if (existingId) {
        // Reset the dismiss timer on the existing toast so re-firing
        // an error keeps the message visible for the full duration
        // rather than letting the original time out.
        const prevTimer = timers.current.get(existingId);
        if (prevTimer) clearTimeout(prevTimer);
        if (duration > 0) {
          const id = existingId;
          timers.current.set(
            id,
            setTimeout(() => dismiss(id), duration),
          );
        }
        return existingId;
      }

      const id =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      setToasts((prev) => [...prev, { ...opts, id }]);
      if (duration > 0) {
        const t = setTimeout(() => dismiss(id), duration);
        timers.current.set(id, t);
      }
      return id;
    },
    [dismiss],
  );

  const success = useCallback(
    (title: string, message?: string) => toast({ type: "success", title, message }),
    [toast],
  );
  const error = useCallback(
    (title: string, message?: string) => toast({ type: "error", title, message, duration: 6000 }),
    [toast],
  );
  const warning = useCallback(
    (title: string, message?: string) => toast({ type: "warning", title, message, duration: 5500 }),
    [toast],
  );
  const info = useCallback(
    (title: string, message?: string) => toast({ type: "info", title, message }),
    [toast],
  );

  return (
    <ToastContext.Provider value={{ toasts, toast, dismiss, success, error, warning, info }}>
      {children}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}
