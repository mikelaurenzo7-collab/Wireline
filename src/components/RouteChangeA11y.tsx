import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router";

import { addTemporaryTabIndex } from "../lib/temporary-tab-index";

function labelFromPath(pathname: string) {
  const segment = pathname.split("/").filter(Boolean)[0];
  if (!segment) return "Home";
  return segment.replace(/[-_]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function RouteChangeA11y() {
  const location = useLocation();
  const first = useRef(true);
  const label = useMemo(() => labelFromPath(location.pathname), [location.pathname]);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let restoreTabIndex: (() => void) | null = null;

    let observer: MutationObserver | null = null;
    let finished = false;
    let deadline: number | undefined;
    const stopWaiting = () => {
      finished = true;
      observer?.disconnect();
      window.clearTimeout(deadline);
      document.removeEventListener("pointerdown", stopWaiting, true);
      document.removeEventListener("keydown", stopWaiting, true);
    };
    const focusPage = () => {
      if (finished) return;
      if (document.querySelector("[data-route-loading]")) return;
      let target: HTMLElement | null = null;
      if (location.hash) {
        let targetId = "";
        try {
          targetId = decodeURIComponent(location.hash.slice(1));
        } catch {
          targetId = location.hash.slice(1);
        }
        target = targetId ? document.getElementById(targetId) : null;
      } else {
        target = document.querySelector<HTMLElement>("main h1, h1, main");
      }
      // A lazy route may still be showing its fallback when the location commits.
      // Wait for real content instead of announcing a page that is still loading.
      if (
        !target ||
        target.closest('[aria-busy="true"]') ||
        target.querySelector('[aria-busy="true"]')
      )
        return;
      stopWaiting();
      restoreTabIndex = addTemporaryTabIndex(target);
      if (location.hash) target.scrollIntoView({ block: "start" });
      else window.scrollTo({ top: 0, left: 0 });
      target.focus({ preventScroll: true });
      if (first.current) {
        first.current = false;
        return;
      }
      setMessage(`${label} loaded`);
    };
    setMessage("");
    const id = window.setTimeout(() => {
      observer = new MutationObserver(focusPage);
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["aria-busy"],
      });
      // Do not steal focus if the user has already started interacting while a
      // slow route is loading, and bound observation for invalid fragment links.
      document.addEventListener("pointerdown", stopWaiting, true);
      document.addEventListener("keydown", stopWaiting, true);
      deadline = window.setTimeout(stopWaiting, 10_000);
      focusPage();
    }, 0);

    return () => {
      window.clearTimeout(id);
      stopWaiting();
      restoreTabIndex?.();
    };
    // Section switches and filters update the query within the current page.
    // Preserve their control's focus so keyboard navigation can continue.
  }, [label, location.hash, location.pathname]);

  return (
    <div aria-live="polite" className="sr-only" data-testid="route-announcer" role="status">
      {message}
    </div>
  );
}
