import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Cookie, X } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { isMarketingStickyCtaRoute, MARKETING_STICKY_CTA_BOTTOM } from "../lib/marketing-mobile";

const STORAGE_KEY = "wireline_cookie_consent";

export default function CookieConsent() {
  const [visible, setVisible] = useState(false);
  const location = useLocation();
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    // Only show if not already acknowledged
    if (!localStorage.getItem(STORAGE_KEY)) {
      setHasSession(!!localStorage.getItem("wireline_session"));
      // Small delay so it doesn't compete with page load
      const t = setTimeout(() => setVisible(true), 1200);
      return () => clearTimeout(t);
    }
  }, []);

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
          initial={{ y: 64, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 64, opacity: 0 }}
          transition={{ type: "spring", stiffness: 400, damping: 36 }}
          className="fixed bottom-0 left-0 right-0 z-[9999]"
          role="dialog"
          aria-label="Cookie notice"
          style={{
            // iOS home-bar / dynamic island clearance — push the
            // banner up above the bottom safe area on iPhone X+.
            paddingBottom: "env(safe-area-inset-bottom, 0)",
            bottom: clearMarketingSticky ? MARKETING_STICKY_CTA_BOTTOM : 0,
          }}
        >
          {/* Slim bottom bar — full width, never overlaps content columns */}
          <div
            className="border-t border-black/8 backdrop-blur-xl px-3 sm:px-4 py-3 flex items-center gap-3"
            style={{ background: "rgba(245,240,232,0.92)" }}
          >
            {/* Icon */}
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
              style={{
                background:
                  "linear-gradient(135deg, rgba(79, 30, 123 ,0.12), rgba(79, 30, 123 ,0.12))",
                border: "1px solid rgba(79, 30, 123 ,0.22)",
              }}
            >
              <Cookie className="w-3.5 h-3.5 text-brand" />
            </div>

            {/* Copy */}
            <p className="text-caption leading-relaxed flex-1 min-w-0">
              We use only essential cookies to keep you signed in — no advertising or cross-site
              tracking.{" "}
              <Link
                to="/privacy"
                className="text-brand hover:text-brand/80 underline"
                onClick={dismiss}
              >
                Privacy policy
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
            <button
              type="button"
              onClick={dismiss}
              aria-label="Dismiss cookie notice"
              className="shrink-0 w-11 h-11 sm:w-9 sm:h-9 rounded-lg flex items-center justify-center hover:bg-black/8 transition-colors text-muted hover:text-ink"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
