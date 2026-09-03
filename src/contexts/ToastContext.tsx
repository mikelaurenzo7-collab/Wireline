import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useMemo,
  useEffect,
} from "react";

export type ToastType = "success" | "error" | "warning" | "info";

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface Toast {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number; // ms; 0 = persist until dismissed
  /** Optional inline action (e.g. Undo) — dismisses the toast when clicked. */
  action?: ToastAction;
}

export const MAX_VISIBLE_TOASTS = 3;

export function mergeToastQueue(
  prev: Toast[],
  nextToast: Toast,
  maxVisible: number = MAX_VISIBLE_TOASTS,
): {
  queue: Toast[];
  duplicateId?: string;
  evictedIds: string[];
} {
  const duplicate = prev.find(
    (toast) =>
      toast.type === nextToast.type &&
      toast.title === nextToast.title &&
      (toast.message ?? "") === (nextToast.message ?? ""),
  );

  if (duplicate) {
    return { queue: prev, duplicateId: duplicate.id, evictedIds: [] };
  }

  const queue = [...prev, nextToast];
  const evictedIds =
    queue.length > maxVisible ? queue.slice(0, queue.length - maxVisible).map((t) => t.id) : [];

  return {
    queue: queue.slice(-maxVisible),
    evictedIds,
  };
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
  // Mirror of `toasts` kept in sync so `toast`/`dismiss` can read the current
  // queue synchronously without running side effects inside a state updater.
  const toastsRef = useRef<Toast[]>([]);
  const dismissRef = useRef<(id: string) => void>(() => {});

  const clearTimer = useCallback((id: string) => {
    const t = timers.current.get(id);
    if (t) {
      clearTimeout(t);
      timers.current.delete(id);
    }
  }, []);

  const commitToasts = useCallback((next: Toast[]) => {
    toastsRef.current = next;
    setToasts(next);
  }, []);

  const dismiss = useCallback(
    (id: string) => {
      clearTimer(id);
      commitToasts(toastsRef.current.filter((t) => t.id !== id));
    },
    [clearTimer, commitToasts],
  );

  useEffect(() => {
    dismissRef.current = dismiss;
  }, [dismiss]);

  const toast = useCallback(
    (opts: Omit<Toast, "id">): string => {
      const duration = opts.duration ?? 4500;
      const id =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

      const { queue, duplicateId, evictedIds } = mergeToastQueue(toastsRef.current, {
        ...opts,
        id,
      });

      for (const evictedId of evictedIds) {
        clearTimer(evictedId);
      }

      const resolvedId = duplicateId ?? id;
      if (duration > 0) {
        clearTimer(resolvedId);
        timers.current.set(
          resolvedId,
          setTimeout(() => dismissRef.current(resolvedId), duration),
        );
      } else {
        clearTimer(resolvedId);
      }

      commitToasts(queue);
      return resolvedId;
    },
    [clearTimer, commitToasts],
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

  const value = useMemo(
    () => ({ toasts, toast, dismiss, success, error, warning, info }),
    [toasts, toast, dismiss, success, error, warning, info],
  );

  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}
