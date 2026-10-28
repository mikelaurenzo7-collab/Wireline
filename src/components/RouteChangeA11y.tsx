import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router";

import { addTemporaryTabIndex } from "../lib/temporary-tab-index";
import { workspaceRouteMeta } from "../constants/navigation";

function labelFromPath(pathname: string) {
  const workspaceRoute = workspaceRouteMeta(pathname);
  if (workspaceRoute) return workspaceRoute.title;
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

    const id = window.setTimeout(() => {
      // A deep link can open a dialog as the lazy page commits. Its own focus
      // handling must win over page entry, including on slower route loads.
      // Closing sheets may remain mounted for their exit animation.
      const openModal = Array.from(
        document.querySelectorAll<HTMLElement>(
          'dialog[open], [aria-modal="true"][role="dialog"], [aria-modal="true"][role="alertdialog"]',
        ),
      ).some(
        (modal) =>
          !modal.closest('[hidden], [inert], [aria-hidden="true"], [data-state="closed"]') &&
          modal.getClientRects().length > 0,
      );
      if (openModal) {
        first.current = false;
        return;
      }

      if (location.hash) {
        let targetId = "";
        try {
          targetId = decodeURIComponent(location.hash.slice(1));
        } catch {
          targetId = location.hash.slice(1);
        }
        const target = targetId ? document.getElementById(targetId) : null;
        if (target) {
          restoreTabIndex = addTemporaryTabIndex(target);
          target.scrollIntoView({ block: "start" });
          target.focus({ preventScroll: true });
        }
      } else {
        window.scrollTo({ top: 0, left: 0 });

        // A selector list returns document order, so including `main` in the
        // same query always selects the ancestor before its page heading.
        const target =
          document.querySelector<HTMLElement>("main h1, h1") ??
          document.querySelector<HTMLElement>("main");
        if (target) {
          restoreTabIndex = addTemporaryTabIndex(target);
          target.focus({ preventScroll: true });
        }
      }

      if (first.current) {
        first.current = false;
        return;
      }
      setMessage(`${label} loaded`);
    }, 0);

    return () => {
      window.clearTimeout(id);
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
