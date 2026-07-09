import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Cookie, X } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { ShadButton } from "./ui/shadcn/ShadButton";
import { cn } from "../lib/utils";
import { isMarketingStickyCtaRoute } from "../lib/marketing-mobile";
import { isAuthPortalPath } from "../lib/public-routes";

const STORAGE_KEY = "wireline_cookie_consent";

export default function CookieConsent() {
  const [visible, setVisible] = useState(false);
  const location = useLocation();
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(STORAGE_KEY)) return;
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    void (async () => {
      try {
        const sessionRes = await fetch("/api/auth/session", { credentials: "include" });
        if (cancelled) return;
        const sessionPresent = sessionRes.ok;
        setHasSession(sessionPresent);
        if (sessionPresent) return;
        timeoutId = setTimeout(() => {
          if (!cancelled) setVisible(true);
        }, 1200);
      } catch {
        if (!cancelled) {
          timeoutId = setTimeout(() => setVisible(true), 1200);
        }
      }
    })();

    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, []);

  const onAuthRoute = isAuthPortalPath(location.pathname);
  const clearMarketingSticky = !hasSession && isMarketingStickyCtaRoute(location.pathname);

  const dismiss = () => {
    localStorage.setItem(STORAGE_KEY, "acknowledged");
    setVisible(false);
  };

  // Escape dismisses the cookie notice — gives keyboard-only users a way out
  // without having to tab through the page to reach the X button.
  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visible]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: 24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 24, opacity: 0 }}
          transition={{ type: "spring", stiffness: 400, damping: 36 }}
          className={cn(
            // Mobile: slim full-width pill. ≥sm: bottom-right so it stays clear
            // of the centered hero CTAs.
            "fixed z-[9999] left-3 right-3 sm:right-5 sm:left-auto sm:max-w-[320px]",
            onAuthRoute
              ? "top-[max(0.75rem,env(safe-area-inset-top,0))]"
              : clearMarketingSticky
                ? "bottom-[calc(5.5rem+env(safe-area-inset-bottom,0px))]"
                : "bottom-[calc(4.25rem+env(safe-area-inset-bottom,0))]",
          )}
          role="dialog"
          aria-label="Cookie notice"
        >
          {/* Compact card — bottom-right, clear of centered hero CTAs. */}
          <div className="rounded-md border border-border backdrop-blur-xl shadow-lg px-3.5 py-3 flex items-start gap-2.5 wl-cookie-card">
            {/* Icon */}
            <div className="w-7 h-7 rounded-md flex items-center justify-center shrink-0 mt-0.5 wl-cookie-icon">
              <Cookie className="w-3.5 h-3.5 text-brand" />
            </div>

            {/* Copy */}
            <p className="text-[var(--wireline-typography-caption-size)] leading-relaxed flex-1 min-w-0 text-foreground/80">
              Essential cookies only — no ad or cross-site tracking.{" "}
              <Link
                to="/privacy"
                className="text-brand hover:text-brand/80 underline"
                onClick={dismiss}
              >
                Privacy
              </Link>
              {" · "}
              <Link
                to="/terms"
                className="text-brand hover:text-brand/80 underline"
                onClick={dismiss}
              >
                Terms
              </Link>
            </p>

            {/* Dismiss */}
            <ShadButton
              type="button"
              variant="ghost"
              size="icon"
              disableAnimations
              onClick={dismiss}
              aria-label="Dismiss cookie notice"
              className="shrink-0 w-9 h-9 -mt-1 -mr-1.5 text-muted hover:text-foreground touch-press hover:scale-[1.05]"
            >
              <X className="w-4 h-4" />
            </ShadButton>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
