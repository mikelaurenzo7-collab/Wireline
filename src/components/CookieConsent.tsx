import { useCallback, useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "motion/react";
import { Cookie, X } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { ShadButton } from "./ui/shadcn/ShadButton";
import { cn } from "../lib/utils";
import { isMarketingStickyCtaRoute } from "../lib/marketing-mobile";
import { isAuthPortalPath } from "../lib/public-routes";

const NOTICE_STORAGE_KEY = "wireline_cookie_consent";
const MEASUREMENT_STORAGE_KEY = "wireline_marketing_measurement_consent";
const MEASUREMENT_CONSENT_EVENT = "wireline:marketing-measurement-consent";
const OPEN_PRIVACY_CHOICES_EVENT = "wireline:open-privacy-choices";

type MeasurementConsent = "granted" | "denied";

type PrivacyAwareNavigator = Navigator & {
  globalPrivacyControl?: boolean;
};

function globalPrivacyControlEnabled(): boolean {
  if (typeof navigator === "undefined") return false;
  return (navigator as PrivacyAwareNavigator).globalPrivacyControl === true;
}

function noticeAcknowledged(): boolean {
  try {
    return localStorage.getItem(NOTICE_STORAGE_KEY) !== null;
  } catch {
    // Hardened/private contexts may block storage entirely. Keep the notice
    // available while the measurement loader independently defaults to off.
    return false;
  }
}

export default function CookieConsent() {
  const [visible, setVisible] = useState(false);
  const location = useLocation();
  const [hasSession, setHasSession] = useState(false);
  const privacySignalEnabled = globalPrivacyControlEnabled();

  useEffect(() => {
    if (noticeAcknowledged()) return;
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    void (async () => {
      try {
        const sessionRes = await fetch("/api/auth/session", { credentials: "include" });
        if (cancelled) return;
        const sessionPresent = sessionRes.ok;
        setHasSession(sessionPresent);
      } catch {
        /* Session probe failed — still show the notice so EU/UK visitors get a
           consent choice regardless of auth state. */
      }
      if (!cancelled) {
        timeoutId = setTimeout(() => {
          if (!cancelled) setVisible(true);
        }, 1200);
      }
    })();

    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, []);

  useEffect(() => {
    const openPrivacyChoices = () => setVisible(true);
    window.addEventListener(OPEN_PRIVACY_CHOICES_EVENT, openPrivacyChoices);
    return () => window.removeEventListener(OPEN_PRIVACY_CHOICES_EVENT, openPrivacyChoices);
  }, []);

  const clearMarketingSticky =
    !hasSession &&
    isMarketingStickyCtaRoute(location.pathname) &&
    !isAuthPortalPath(location.pathname);

  const saveChoice = useCallback(
    (choice: MeasurementConsent) => {
      const effectiveChoice = privacySignalEnabled ? "denied" : choice;
      try {
        localStorage.setItem(NOTICE_STORAGE_KEY, "acknowledged");
        localStorage.setItem(MEASUREMENT_STORAGE_KEY, effectiveChoice);
      } catch {
        // Storage can be unavailable in hardened/private browser contexts. The
        // measurement loader defaults to off when it cannot read an explicit grant.
      }
      window.dispatchEvent(
        new CustomEvent(MEASUREMENT_CONSENT_EVENT, {
          detail: effectiveChoice,
        }),
      );
      setVisible(false);
    },
    [privacySignalEnabled],
  );

  const dismiss = useCallback(() => saveChoice("denied"), [saveChoice]);

  // Escape chooses the privacy-preserving default and dismisses the notice.
  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dismiss, visible]);

  // Portal to <body>: rendered inside the app tree, the fixed box stretched
  // to the full viewport height (an app-shell ancestor perturbs fixed-child
  // sizing), painting the card at the TOP of the screen over the sign-in
  // brand header and OAuth buttons. Portaling out of the tree — the same
  // pattern the toast stack uses — restores true viewport anchoring.
  return createPortal(
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: 24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 24, opacity: 0 }}
          transition={{ type: "spring", stiffness: 400, damping: 36 }}
          className={cn(
            "fixed z-[9999] left-3 right-3 sm:right-5 sm:left-auto sm:max-w-[390px]",
            // Bottom placement everywhere. The old auth-route top pin (written
            // while this component was unmounted) covered the brand header,
            // tab switcher, and OAuth buttons on mobile sign-in; the auth
            // portal has no bottom-fixed elements, so the standard bottom
            // offset sits over empty space below the card instead.
            clearMarketingSticky
              ? "bottom-[calc(5.5rem+env(safe-area-inset-bottom,0px))]"
              : "bottom-[calc(4.25rem+env(safe-area-inset-bottom,0px))]",
          )}
          role="dialog"
          aria-label="Privacy choices"
        >
          <div className="rounded-md border border-border backdrop-blur-xl shadow-lg px-3.5 py-3 flex items-start gap-2.5 wl-cookie-card">
            <div className="w-7 h-7 rounded-md flex items-center justify-center shrink-0 mt-0.5 wl-cookie-icon">
              <Cookie className="w-3.5 h-3.5 text-brand" />
            </div>

            <div className="flex-1 min-w-0 space-y-2.5">
              <p className="text-[var(--wireline-typography-caption-size)] leading-relaxed text-foreground/80">
                Essential storage and privacy-friendly product analytics help Wireline operate.
                Optional advertising measurement stays off unless you allow it.{" "}
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

              {privacySignalEnabled ? (
                <p className="text-[var(--wireline-typography-caption-size)] leading-relaxed text-muted-foreground">
                  Your browser privacy signal is active, so advertising measurement remains off.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <ShadButton
                    type="button"
                    variant="outline"
                    size="sm"
                    disableAnimations
                    onClick={() => saveChoice("denied")}
                  >
                    Essential only
                  </ShadButton>
                  <ShadButton
                    type="button"
                    size="sm"
                    disableAnimations
                    onClick={() => saveChoice("granted")}
                  >
                    Allow measurement
                  </ShadButton>
                </div>
              )}
            </div>

            <ShadButton
              type="button"
              variant="ghost"
              size="icon"
              disableAnimations
              onClick={dismiss}
              aria-label="Keep advertising measurement off and dismiss"
              className="shrink-0 w-9 h-9 -mt-1 -mr-1.5 text-muted hover:text-foreground touch-press hover:scale-[1.05]"
            >
              <X className="w-4 h-4" />
            </ShadButton>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
