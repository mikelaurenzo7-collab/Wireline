import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { GripVertical } from "lucide-react";

import { cn } from "../../lib/utils";

type WorkspaceResizablePanelRenderState = {
  collapsed: boolean;
  size: number;
  toggleCollapsed: () => void;
  resetSize: () => void;
};

type WorkspaceResizablePanelProps = {
  storageKey: string;
  side?: "left" | "right";
  defaultSize: number;
  minSize: number;
  maxSize: number;
  collapsedSize?: number;
  defaultCollapsed?: boolean;
  className?: string;
  resizeHandleLabel: string;
  children: (state: WorkspaceResizablePanelRenderState) => ReactNode;
};

type StoredPanelState = {
  size?: number;
  collapsed?: boolean;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function readStoredState(storageKey: string): StoredPanelState {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as StoredPanelState;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Shared desktop panel primitive for workspace chrome and inspectors.
 *
 * - Click-collapse and drag-resize are persisted locally per panel.
 * - The resize separator is keyboard operable (arrow keys, Home, End).
 * - Double-clicking the separator restores the panel's authored default width.
 * - Pointer listeners are attached only for the duration of the drag.
 */
export default function WorkspaceResizablePanel({
  storageKey,
  side = "left",
  defaultSize,
  minSize,
  maxSize,
  collapsedSize = 0,
  defaultCollapsed = false,
  className,
  resizeHandleLabel,
  children,
}: WorkspaceResizablePanelProps) {
  const initial = readStoredState(storageKey);
  const [size, setSize] = useState(() =>
    clamp(typeof initial.size === "number" ? initial.size : defaultSize, minSize, maxSize),
  );
  const [collapsed, setCollapsed] = useState(
    typeof initial.collapsed === "boolean" ? initial.collapsed : defaultCollapsed,
  );
  const [resizing, setResizing] = useState(false);
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify({ size, collapsed }));
    } catch {
      // Storage may be unavailable in private browsing or hardened webviews.
    }
  }, [collapsed, size, storageKey]);

  useEffect(
    () => () => {
      cleanupRef.current?.();
      cleanupRef.current = null;
    },
    [],
  );

  const resetSize = useCallback(() => {
    setSize(clamp(defaultSize, minSize, maxSize));
    setCollapsed(false);
  }, [defaultSize, maxSize, minSize]);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((current) => !current);
  }, []);

  const resizeBy = useCallback(
    (delta: number) => {
      setCollapsed(false);
      setSize((current) => clamp(current + delta, minSize, maxSize));
    },
    [maxSize, minSize],
  );

  const stopResize = useCallback(() => {
    const cleanup = cleanupRef.current;
    cleanupRef.current = null;
    cleanup?.();
  }, []);

  const startResize = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      event.preventDefault();
      stopResize();

      const startX = event.clientX;
      const startSize = collapsed ? defaultSize : size;
      const direction = side === "left" ? 1 : -1;
      setCollapsed(false);
      setResizing(true);

      const previousUserSelect = document.body.style.userSelect;
      const previousCursor = document.body.style.cursor;
      document.body.style.userSelect = "none";
      document.body.style.cursor = "col-resize";

      const onMove = (moveEvent: PointerEvent) => {
        const next = startSize + (moveEvent.clientX - startX) * direction;
        setSize(clamp(next, minSize, maxSize));
      };

      const cleanup = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", cleanup);
        window.removeEventListener("pointercancel", cleanup);
        if (cleanupRef.current === cleanup) cleanupRef.current = null;
        document.body.style.userSelect = previousUserSelect;
        document.body.style.cursor = previousCursor;
        setResizing(false);
      };

      cleanupRef.current = cleanup;
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", cleanup, { once: true });
      window.addEventListener("pointercancel", cleanup, { once: true });
    },
    [collapsed, defaultSize, maxSize, minSize, side, size, stopResize],
  );

  const handleResizeKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      const logicalLeft = side === "left" ? -1 : 1;
      const logicalRight = side === "left" ? 1 : -1;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        resizeBy(16 * logicalLeft);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        resizeBy(16 * logicalRight);
      } else if (event.key === "Home") {
        event.preventDefault();
        setCollapsed(false);
        setSize(minSize);
      } else if (event.key === "End") {
        event.preventDefault();
        setCollapsed(false);
        setSize(maxSize);
      }
    },
    [maxSize, minSize, resizeBy, side],
  );

  const renderedSize = collapsed ? collapsedSize : size;
  const edgeClass = side === "left" ? "right-0 translate-x-1/2" : "left-0 -translate-x-1/2";

  return (
    <div
      data-wireline-resizable-panel={side}
      data-collapsed={collapsed ? "true" : "false"}
      data-resizing={resizing ? "true" : undefined}
      className={cn("relative h-full min-h-0 shrink-0", className)}
      style={{ width: renderedSize }}
    >
      {children({ collapsed, size, toggleCollapsed, resetSize })}
      {!collapsed ? (
        <div
          role="separator"
          aria-label={resizeHandleLabel}
          aria-orientation="vertical"
          aria-valuemin={minSize}
          aria-valuemax={maxSize}
          aria-valuenow={Math.round(size)}
          tabIndex={0}
          onPointerDown={startResize}
          onKeyDown={handleResizeKeyDown}
          onDoubleClick={resetSize}
          className={cn(
            "group absolute top-0 z-30 hidden h-full w-3 cursor-col-resize touch-none items-center justify-center outline-none lg:flex",
            edgeClass,
          )}
        >
          <span className="h-full w-px bg-transparent transition-colors group-hover:bg-primary/35 group-focus-visible:bg-primary/55" />
          <span className="absolute grid h-10 w-3 place-items-center rounded-full text-transparent transition-colors group-hover:bg-card group-hover:text-muted-foreground group-focus-visible:bg-card group-focus-visible:text-primary">
            <GripVertical className="size-3" aria-hidden="true" />
          </span>
        </div>
      ) : null}
    </div>
  );
}