/**
 * Copy is balanced so a sentence never ends with one word stranded on its
 * own line (src/styles/botbound-master-polish.css). Browsers only balance
 * short blocks: past about six lines `balance` falls back to plain wrapping,
 * while `pretty` handles exactly those long blocks. This marks long blocks so
 * the stylesheet switches them to `pretty`; short copy stays balanced.
 */
const LONG_COPY_SELECTOR = "p, li, dd, blockquote";
const LONG_COPY_LINES = 6;
const SETTLE_MS = 200;

export function markLongCopy(root: ParentNode = document): number {
  let marked = 0;
  for (const element of root.querySelectorAll<HTMLElement>(LONG_COPY_SELECTOR)) {
    const style = getComputedStyle(element);
    const lineHeight = Number.parseFloat(style.lineHeight);
    if (!Number.isFinite(lineHeight) || lineHeight <= 0) continue;
    const height =
      element.getBoundingClientRect().height -
      (Number.parseFloat(style.paddingTop) || 0) -
      (Number.parseFloat(style.paddingBottom) || 0);
    if (height <= 0) continue;
    const long = height / lineHeight > LONG_COPY_LINES + 0.5;
    if (long && element.dataset.wlLongCopy !== "true") {
      element.dataset.wlLongCopy = "true";
      marked += 1;
    } else if (!long && element.dataset.wlLongCopy === "true") {
      // Wider viewports re-flow long copy into fewer lines: balance again.
      delete element.dataset.wlLongCopy;
    }
  }
  return marked;
}

/** Re-marks after content changes, resizes, and web-font loads, debounced. */
export function installLongCopyWrap(): () => void {
  if (typeof window === "undefined" || typeof MutationObserver === "undefined") {
    return () => undefined;
  }
  let timer: number | undefined;
  const schedule = () => {
    if (timer !== undefined) window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      timer = undefined;
      markLongCopy();
    }, SETTLE_MS);
  };
  const observer = new MutationObserver(schedule);
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  window.addEventListener("resize", schedule, { passive: true });
  void document.fonts?.ready.then(schedule);
  schedule();
  return () => {
    observer.disconnect();
    window.removeEventListener("resize", schedule);
    if (timer !== undefined) window.clearTimeout(timer);
  };
}
