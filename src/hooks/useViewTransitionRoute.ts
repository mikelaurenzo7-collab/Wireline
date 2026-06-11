import { useEffect, useMemo, useRef } from "react";
import { useLocation } from "react-router-dom";

/**
 * Cross-fade between signed-in routes when the browser supports the
 * View Transitions API (Safari 18+, Chrome 111+). No-op elsewhere.
 */
export function useViewTransitionRoute() {
  const { pathname } = useLocation();
  const isFirst = useRef(true);
  const canUseViewTransitions = useMemo(() => {
    if (typeof document === "undefined") return false;
    if (typeof document.startViewTransition !== "function") return false;
    if (typeof navigator === "undefined") return false;
    const ua = navigator.userAgent.toLowerCase();
    // Firefox still shows root-snapshot artifacts on the authenticated shell
    // (brown side slabs / stale tab captures). Keep route changes on the
    // Motion cross-fade there until its View Transitions implementation settles.
    if (ua.includes("firefox") || ua.includes("fxios")) return false;
    return true;
  }, []);

  useEffect(() => {
    if (isFirst.current) {
      isFirst.current = false;
      return;
    }
    if (!canUseViewTransitions) return;
    document.startViewTransition(() => {});
  }, [pathname, canUseViewTransitions]);
}
