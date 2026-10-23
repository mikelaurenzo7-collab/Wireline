import { useCallback, useLayoutEffect, useRef } from "react";

/** Reveal the selected browser tab without scrolling its page or conversation. */
export default function useActiveBrowserTab(
  activeTabId: string | null | undefined,
  tabLayoutKey = "",
): (node: HTMLDivElement | null) => void {
  const cleanup = useRef<() => void>(() => undefined);
  const revealActive = useRef<() => void>(() => undefined);
  // Server labels/count can change while selection stays the same. A stable
  // caller key avoids treating every status poll as a new layout.
  useLayoutEffect(() => revealActive.current(), [activeTabId, tabLayoutKey]);

  return useCallback(
    (row: HTMLDivElement | null) => {
      cleanup.current();
      cleanup.current = () => undefined;
      revealActive.current = () => undefined;
      if (!row || !activeTabId) return;
      let disposed = false;
      const reveal = () => {
        if (disposed || row.clientWidth <= 0) return;
        const active = row.querySelector<HTMLElement>('[data-browser-tab-active="true"]');
        if (!active) return;
        const bounds = row.getBoundingClientRect();
        const selected = active.getBoundingClientRect();
        const gutter = Math.min(12, row.clientWidth / 4);
        const left = bounds.left + row.clientLeft + gutter;
        const right = bounds.left + row.clientLeft + row.clientWidth - gutter;
        let next = row.scrollLeft;
        // An over-wide tab cannot fit both edges: anchor its leading edge so
        // repeated resize notifications do not oscillate between its ends.
        if (selected.width > right - left || selected.left < left) next += selected.left - left;
        else if (selected.right > right) next += selected.right - right;
        const max = Math.max(0, row.scrollWidth - row.clientWidth);
        next = Math.max(0, Math.min(max, next));
        if (Math.abs(next - row.scrollLeft) > 0.5) row.scrollLeft = next;
      };
      revealActive.current = reveal;
      const resize = typeof ResizeObserver !== "undefined" ? new ResizeObserver(reveal) : null;
      const observeChildren = () => {
        if (disposed || !resize) return;
        resize.disconnect();
        resize.observe(row);
        // A preceding label/font/close-button change can move the selected tab
        // without resizing the row or the selected tab itself.
        for (const child of Array.from(row.children)) resize.observe(child);
      };
      const mutation =
        typeof MutationObserver !== "undefined"
          ? new MutationObserver(() => {
              if (disposed) return;
              observeChildren();
              reveal();
            })
          : null;
      mutation?.observe(row, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ["data-browser-tab-active"],
      });
      observeChildren();
      reveal();
      cleanup.current = () => {
        disposed = true;
        resize?.disconnect();
        mutation?.disconnect();
      };
    },
    [activeTabId],
  );
}
