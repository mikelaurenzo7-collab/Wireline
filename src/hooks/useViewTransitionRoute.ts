import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

/**
 * Cross-fade between signed-in routes when the browser supports the
 * View Transitions API (Safari 18+, Chrome 111+). No-op elsewhere.
 */
export function useViewTransitionRoute() {
  const { pathname } = useLocation();
  const isFirst = useRef(true);

  useEffect(() => {
    if (isFirst.current) {
      isFirst.current = false;
      return;
    }
    if (typeof document.startViewTransition !== "function") return;
    document.startViewTransition(() => {});
  }, [pathname]);
}
