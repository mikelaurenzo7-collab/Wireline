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

let toleratingForeignMutations = false;

/**
 * Keeps the app standing when something outside it rewrites the page.
 *
 * A browser translating the page replaces the text nodes React created with
 * elements of its own, and some extensions move them. React then asks the
 * browser to insert before, or to remove, a node that is no longer where React
 * left it. The browser throws NotFoundError and an ordinary click, such as
 * Create Bot, takes the whole view down. The reload above cannot recover that:
 * the page is translated again and the same click fails again.
 *
 * These guards act only on a call that would have thrown, and pass every other
 * call straight through:
 * - Inserting before a node that is no longer a child of this parent inserts
 *   before whatever now holds that node here, or at the end when it is gone,
 *   so the new element still appears.
 * - Removing a node that is no longer a child of this parent removes it from
 *   where it really is, or does nothing when it is already gone.
 *
 * React's own bookkeeping is untouched. What can differ on a translated page
 * is the order of an icon and its label, or a label that keeps its old words.
 */
export function tolerateForeignDomMutations(): void {
  if (toleratingForeignMutations || typeof Node !== "function" || !Node.prototype) return;
  toleratingForeignMutations = true;

  const insertBefore = Node.prototype.insertBefore;
  const removeChild = Node.prototype.removeChild;
  let noted = false;
  const note = (operation: string) => {
    if (noted) return;
    noted = true;
    console.error(
      `[wireline] ${operation}: the page was changed outside the app (translation or an extension). Continuing.`,
    );
  };

  Node.prototype.insertBefore = function <T extends Node>(
    this: Node,
    node: T,
    reference: Node | null,
  ): T {
    if (!reference || reference.parentNode === this) {
      return insertBefore.call(this, node, reference) as T;
    }
    note("insertBefore");
    // The reference may have been wrapped rather than removed: keep the place.
    let holder: Node | null = reference;
    while (holder && holder.parentNode !== this) holder = holder.parentNode;
    return insertBefore.call(this, node, holder) as T;
  };

  Node.prototype.removeChild = function <T extends Node>(this: Node, child: T): T {
    if (!child || child.parentNode === this) return removeChild.call(this, child) as T;
    note("removeChild");
    const actualParent = child.parentNode;
    if (actualParent) removeChild.call(actualParent, child);
    return child;
  };
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
