import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
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
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  /** Take all remaining width (an expanded panel). The drag handle hides and the saved width returns on exit. */
  fill?: boolean;
  className?: string;
  /** Name the panel as a landmark when its resize handle sits outside another landmark. */
  landmarkLabel?: string;
  resizeHandleLabel: string;
  /** Existing panel content region controlled by the separator. */
  controlsId?: string;
  children: (state: WorkspaceResizablePanelRenderState) => ReactNode;
};

type StoredPanelState = {
  size?: number;
  collapsed?: boolean;
};

// Only one divider can own the document's resize cursor/selection lock.
let activeResizeCleanup: (() => void) | null = null;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function readStoredState(storageKey: string): StoredPanelState {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as StoredPanelState;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
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
  collapsed: controlledCollapsed,
  onCollapsedChange,
  fill = false,
  className,
  landmarkLabel,
  resizeHandleLabel,
  controlsId,
  children,
}: WorkspaceResizablePanelProps) {
  const initial = readStoredState(storageKey);
  const [size, setSize] = useState(() =>
    clamp(
      typeof initial.size === "number" && Number.isFinite(initial.size)
        ? initial.size
        : defaultSize,
      minSize,
      maxSize,
    ),
  );
  const [uncontrolledCollapsed, setUncontrolledCollapsed] = useState(
    typeof initial.collapsed === "boolean" ? initial.collapsed : defaultCollapsed,
  );
  const collapsed = controlledCollapsed ?? uncontrolledCollapsed;
  const setCollapsed = useCallback(
    (next: boolean) => {
      if (controlledCollapsed === undefined) setUncontrolledCollapsed(next);
      onCollapsedChange?.(next);
    },
    [controlledCollapsed, onCollapsedChange],
  );
  const [resizing, setResizing] = useState(false);
  const cleanupRef = useRef<((notify?: boolean) => void) | null>(null);
  const helpId = `${encodeURIComponent(storageKey)}-resize-help`;
  const stopResize = useCallback((notify = true) => {
    const cleanup = cleanupRef.current;
    cleanupRef.current = null;
    cleanup?.(notify);
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify({ size, collapsed }));
    } catch {
      // Storage may be unavailable in private browsing or hardened webviews.
    }
  }, [collapsed, size, storageKey]);

  useEffect(
    () => () => {
      stopResize(false);
    },
    [stopResize],
  );

  useEffect(() => {
    if (collapsed || fill) stopResize();
    // A changed layout invalidates the drag's starting geometry and bounds.
    return () => stopResize();
  }, [collapsed, fill, maxSize, minSize, side, stopResize, storageKey]);

  const resetSize = useCallback(() => {
    stopResize();
    setSize(clamp(defaultSize, minSize, maxSize));
    setCollapsed(false);
  }, [defaultSize, maxSize, minSize, setCollapsed, stopResize]);

  const toggleCollapsed = useCallback(() => {
    setCollapsed(!collapsed);
  }, [collapsed, setCollapsed]);

  const resizeBy = useCallback(
    (delta: number) => {
      setCollapsed(false);
      setSize((current) => clamp(clamp(current, minSize, maxSize) + delta, minSize, maxSize));
    },
    [maxSize, minSize, setCollapsed],
  );

  const startResize = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0 || event.isPrimary === false || !Number.isFinite(event.clientX))
        return;
      event.preventDefault();
      activeResizeCleanup?.();
      stopResize();

      const startX = event.clientX;
      const startSize = clamp(collapsed ? defaultSize : size, minSize, maxSize);
      const originalSize = size;
      const pointerId = event.pointerId;
      const handle = event.currentTarget;
      const direction = side === "left" ? 1 : -1;
      handle.focus({ preventScroll: true });
      setCollapsed(false);
      setResizing(true);

      const previousUserSelect = document.body.style.userSelect;
      const previousCursor = document.body.style.cursor;
      document.body.style.userSelect = "none";
      document.body.style.cursor = "col-resize";

      const onMove = (moveEvent: PointerEvent) => {
        if (moveEvent.pointerId !== pointerId || !Number.isFinite(moveEvent.clientX)) return;
        const next = startSize + (moveEvent.clientX - startX) * direction;
        setSize(clamp(next, minSize, maxSize));
      };

      let finished = false;
      const cleanup = (notify = true) => {
        if (finished) return;
        finished = true;
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onEnd);
        window.removeEventListener("pointercancel", onEnd);
        window.removeEventListener("blur", onBlur);
        window.removeEventListener("keydown", onKeyDown, true);
        document.removeEventListener("visibilitychange", onVisibilityChange);
        handle.removeEventListener("lostpointercapture", onEnd);
        if (cleanupRef.current === cleanup) cleanupRef.current = null;
        if (activeResizeCleanup === cleanup) activeResizeCleanup = null;
        try {
          if (handle.hasPointerCapture?.(pointerId)) handle.releasePointerCapture(pointerId);
        } catch {
          // Detached handles and webviews may no longer own pointer capture.
        }
        document.body.style.userSelect = previousUserSelect;
        document.body.style.cursor = previousCursor;
        if (notify) setResizing(false);
      };
      const onEnd = (endEvent: PointerEvent) => {
        if (endEvent.pointerId === pointerId) cleanup();
      };
      const onBlur = () => cleanup();
      const onVisibilityChange = () => {
        if (document.visibilityState === "hidden") cleanup();
      };
      const onKeyDown = (keyEvent: globalThis.KeyboardEvent) => {
        if (keyEvent.key !== "Escape") return;
        keyEvent.preventDefault();
        keyEvent.stopPropagation();
        cleanup();
        setSize(originalSize);
      };

      cleanupRef.current = cleanup;
      activeResizeCleanup = cleanup;
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onEnd);
      window.addEventListener("pointercancel", onEnd);
      window.addEventListener("blur", onBlur);
      window.addEventListener("keydown", onKeyDown, true);
      document.addEventListener("visibilitychange", onVisibilityChange);
      handle.addEventListener("lostpointercapture", onEnd);
      try {
        handle.setPointerCapture?.(pointerId);
      } catch {
        // Global listeners still finish the drag when capture is unavailable.
      }
    },
    [collapsed, defaultSize, maxSize, minSize, setCollapsed, side, size, stopResize],
  );

  const handleResizeKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      stopResize();
      const logicalLeft = side === "left" ? -1 : 1;
      const logicalRight = side === "left" ? 1 : -1;
      const step = event.shiftKey ? 64 : 16;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        resizeBy(step * logicalLeft);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        resizeBy(step * logicalRight);
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
    [maxSize, minSize, resizeBy, setCollapsed, side, stopResize],
  );

  // A narrower window can lower maxSize below a saved width; render within bounds.
  const renderedSize = collapsed ? collapsedSize : clamp(size, minSize, maxSize);
  const edgeClass = side === "left" ? "right-0 translate-x-1/2" : "left-0 -translate-x-1/2";

  return (
    <div
      role={landmarkLabel ? "region" : undefined}
      aria-label={landmarkLabel}
      data-wireline-resizable-panel={side}
      data-collapsed={collapsed ? "true" : "false"}
      data-resizing={resizing ? "true" : undefined}
      data-fill={fill ? "true" : undefined}
      className={cn("relative h-full min-h-0", fill ? "min-w-0 flex-1" : "shrink-0", className)}
      style={fill ? undefined : { width: renderedSize }}
    >
      {children({ collapsed, size, toggleCollapsed, resetSize })}
      {!collapsed && !fill ? (
        <div
          role="separator"
          aria-label={resizeHandleLabel}
          aria-controls={controlsId}
          aria-describedby={helpId}
          aria-orientation="vertical"
          aria-valuemin={minSize}
          aria-valuemax={maxSize}
          aria-valuenow={Math.round(renderedSize)}
          aria-valuetext={`${Math.round(renderedSize)} pixels wide`}
          title="Drag to resize. Double-click to reset."
          tabIndex={0}
          onPointerDown={startResize}
          onKeyDown={handleResizeKeyDown}
          onDoubleClick={resetSize}
          onBlur={() => stopResize()}
          className={cn(
            "group absolute top-0 z-30 hidden h-full w-3 cursor-col-resize touch-none items-center justify-center outline-none lg:flex",
            edgeClass,
          )}
        >
          <span className="h-full w-px bg-transparent transition-colors group-hover:bg-foreground/20 group-focus-visible:bg-ring/60" />
          <span
            aria-hidden="true"
            className={cn(
              "absolute h-8 w-0.5 rounded-full bg-muted-foreground/25 transition-colors group-hover:bg-muted-foreground/60 group-focus-visible:bg-ring",
              resizing && "bg-muted-foreground/60",
            )}
          />
        </div>
      ) : null}
      <span id={helpId} className="sr-only">
        Drag to resize. Left and Right arrows move the divider; hold Shift for larger steps. Home
        and End set the limits. Double-click to reset. Escape cancels a drag.
      </span>
    </div>
  );
}
