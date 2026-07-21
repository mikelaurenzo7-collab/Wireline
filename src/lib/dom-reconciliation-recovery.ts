const DOM_RECONCILIATION_RE =
  /(?:removeChild|insertBefore).*(?:not a child|reference node is not a child)/i;
const RECOVERY_KEY = "wireline:dom-reconciliation-recovery";
const RELOAD_GUARD_MS = 5 * 60_000;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error || "");
}

export function isDomReconciliationError(error: unknown): boolean {
  return DOM_RECONCILIATION_RE.test(errorMessage(error));
}

/**
 * A browser extension, translation layer, or interrupted transition can mutate
 * React-owned DOM between render and cleanup. One clean reload restores root
 * ownership. A session guard prevents a bad page from entering a reload loop.
 */
export function requestDomReconciliationReload(error: unknown, source: string): boolean {
  if (typeof window === "undefined" || !isDomReconciliationError(error)) return false;

  try {
    const previous = Number(window.sessionStorage.getItem(RECOVERY_KEY) || 0);
    if (previous > 0 && Date.now() - previous < RELOAD_GUARD_MS) return false;
    window.sessionStorage.setItem(RECOVERY_KEY, String(Date.now()));
    window.setTimeout(() => window.location.reload(), 150);
    console.error("[wireline] recovering React DOM ownership", { source });
    return true;
  } catch {
    return false;
  }
}

/** Clear the loop guard only after the new page has remained healthy. */
export function clearDomReconciliationReloadGuardAfterStableRender(delayMs = 30_000): void {
  if (typeof window === "undefined") return;
  window.setTimeout(() => {
    try {
      window.sessionStorage.removeItem(RECOVERY_KEY);
    } catch {
      // Storage may be unavailable in hardened browser modes.
    }
  }, delayMs);
}
