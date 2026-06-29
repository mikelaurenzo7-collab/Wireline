import { useCallback, useSyncExternalStore } from "react";

/**
 * useMediaQuery — render-time match for a CSS media query, backed by
 * useSyncExternalStore so React stays in sync with viewport changes without
 * the stale-state risk of a manual useEffect + matchMedia.addListener pair.
 *
 * Server side and pre-hydration: returns `false`. Consumers should treat
 * `false` as "the smaller side of the breakpoint" — for `(min-width: 1024px)`
 * that means rendering the mobile tree first, then upgrading on hydration.
 *
 * Why this exists: surfaces that show one composition on phones and a
 * different one on desktops (Studio chat + canvas split, Inbox list/detail)
 * were rendering BOTH compositions in the same React tree and toggling them
 * with Tailwind's `hidden` — display:none does not unmount, so every visit
 * mounted the offscreen tree's children, ran their effects, and fired their
 * API calls. Gate the render on this hook instead.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (notify: () => void) => {
      if (typeof window === "undefined" || !window.matchMedia) return () => {};
      const list = window.matchMedia(query);
      list.addEventListener("change", notify);
      return () => list.removeEventListener("change", notify);
    },
    [query],
  );

  const getSnapshot = useCallback(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia(query).matches;
  }, [query]);

  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

/** Convenience: matches the `lg:` Tailwind breakpoint (>= 1024px). */
export function useIsDesktop(): boolean {
  return useMediaQuery("(min-width: 1024px)");
}
