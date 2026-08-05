import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router";

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
    const id = window.setTimeout(() => {
      if (!location.hash) {
        window.scrollTo({ top: 0, left: 0 });

        const target = document.querySelector<HTMLElement>("main h1, h1, main");
        if (target) {
          if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
          target.focus({ preventScroll: true });
        }
      }

      if (first.current) {
        first.current = false;
        return;
      }

      setMessage(`${label} loaded`);
    }, 0);

    return () => window.clearTimeout(id);
  }, [label, location.hash, location.pathname, location.search]);

  return (
    <div aria-live="polite" className="sr-only" data-testid="route-announcer" role="status">
      {message}
    </div>
  );
}
