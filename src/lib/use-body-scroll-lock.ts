import { useEffect } from "react";

type BodyStyleSnapshot = {
  body: HTMLBodyElement;
  overflow: string;
  paddingRight: string;
};

let activeLocks = 0;
let snapshot: BodyStyleSnapshot | null = null;

function acquireBodyLock() {
  const body = document.body;
  if (activeLocks === 0) {
    const scrollbarWidth = Math.max(0, window.innerWidth - document.documentElement.clientWidth);
    const currentPadding = Number.parseFloat(window.getComputedStyle(body).paddingRight) || 0;
    snapshot = {
      body,
      overflow: body.style.overflow,
      paddingRight: body.style.paddingRight,
    };
    body.style.overflow = "hidden";
    if (scrollbarWidth > 0) body.style.paddingRight = `${currentPadding + scrollbarWidth}px`;
    body.dataset.wirelineScrollLocked = "true";
  }
  activeLocks += 1;
}

function releaseBodyLock() {
  if (activeLocks === 0) return;
  activeLocks -= 1;
  if (activeLocks > 0 || !snapshot) return;

  snapshot.body.style.overflow = snapshot.overflow;
  snapshot.body.style.paddingRight = snapshot.paddingRight;
  delete snapshot.body.dataset.wirelineScrollLocked;
  snapshot = null;
}

/**
 * Lock document scrolling while an overlay is active.
 *
 * The module-level reference count keeps stacked overlays correct regardless of
 * close order. The first lock snapshots body styles and compensates for the
 * missing scrollbar without discarding existing padding; the last lock restores
 * the exact inline styles it inherited.
 */
export function useBodyScrollLock(active: boolean) {
  useEffect(() => {
    if (!active || typeof window === "undefined" || typeof document === "undefined") return;
    acquireBodyLock();
    return releaseBodyLock;
  }, [active]);
}
