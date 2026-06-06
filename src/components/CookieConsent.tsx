import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Cookie, X } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { ShadButton } from "./ui/shadcn/ShadButton";
import { isMarketingStickyCtaRoute, MARKETING_STICKY_CTA_BOTTOM } from "../lib/marketing-mobile";
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
          className="fixed z-[9999] left-3 right-3 sm:left-5 sm:right-auto sm:max-w-[320px]"
          role="dialog"
          aria-label="Cookie notice"
          style={
            onAuthRoute
              ? {
                  // Auth CTAs sit at the bottom — pin the notice to the top on sign-in.
                  top: "max(0.75rem, env(safe-area-inset-top, 0))",
                }
              : {
                  // Sit just above the bottom edge (and the iOS home bar). When the
                  // marketing sticky CTA is present, ride above it instead.
                  bottom: clearMarketingSticky
                    ? MARKETING_STICKY_CTA_BOTTOM
                    : "max(0.75rem, env(safe-area-inset-bottom, 0))",
                }
          }
        >
          {/* Compact contained card — bottom-left, never spans the screen or
              overlaps a centered CTA. */}
          <div
            className="rounded-md border border-black/10 backdrop-blur-xl shadow-lg shadow-black/5 px-3.5 py-3 flex items-start gap-2.5"
            style={{ background: "rgba(245,240,232,0.94)" }}
          >
            {/* Icon */}
            <div
              className="w-7 h-7 rounded-md flex items-center justify-center shrink-0 mt-0.5"
              style={{
                background: "rgba(107, 43, 153 ,0.12)",
                border: "1px solid rgba(107, 43, 153 ,0.22)",
              }}
            >
              <Cookie className="w-3.5 h-3.5 text-brand" />
            </div>

            {/* Copy */}
            <p className="text-[12px] leading-relaxed flex-1 min-w-0 text-ink/80">
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
              className="shrink-0 w-9 h-9 -mt-1 -mr-1.5 text-muted hover:text-ink"
            >
              <X className="w-4 h-4" />
            </ShadButton>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
