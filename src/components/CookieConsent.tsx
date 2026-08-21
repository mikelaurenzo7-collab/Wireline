import { useCallback, useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "motion/react";
import { Cookie, X } from "lucide-react";
import { Link, useLocation } from "react-router";
import { ShadButton } from "./ui/shadcn/ShadButton";
import { WirelineWordmark } from "./brand/WirelineBrand";
import { cn } from "../lib/utils";
import { isMarketingStickyCtaRoute } from "../lib/marketing-mobile";
import { isAuthPortalPath, isMarketingPublicPath } from "../lib/public-routes";

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
    // eligible to render while the measurement runtime independently defaults
    // to off unless it can read an explicit grant.
    return false;
  }
}

export default function CookieConsent() {
  const [visible, setVisible] = useState(false);
  const [explicitlyOpened, setExplicitlyOpened] = useState(false);
  const location = useLocation();
  const [hasSession, setHasSession] = useState(false);
  const privacySignalEnabled = globalPrivacyControlEnabled();
  const privacyPanelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (noticeAcknowledged()) return;
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    void (async () => {
      let sessionPresent = false;
      try {
        const sessionRes = await fetch("/api/auth/session", { credentials: "include" });
        if (cancelled) return;
        if (sessionRes.ok) {
          const body = (await sessionRes.json().catch(() => null)) as { user?: unknown } | null;
          sessionPresent = Boolean(body?.user);
        }
        setHasSession(sessionPresent);
      } catch {
        /* Session probe failed — treat as signed out so EU/UK visitors still get a consent choice. */
      }

      if (sessionPresent) return;

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
    const openPrivacyChoices = () => {
      setExplicitlyOpened(true);
      setVisible(true);
    };
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

  useEffect(() => {
    if (!visible || !explicitlyOpened) return;
    const frame = window.requestAnimationFrame(() => privacyPanelRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [explicitlyOpened, visible]);

  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dismiss, visible]);

  const createFlowOpen =
    new URLSearchParams(location.search).get("create") === "1" ||
    new URLSearchParams(location.search).get("create") === "true";
  if (isAuthPortalPath(location.pathname) || createFlowOpen) return null;

  const onPublicSurface = isMarketingPublicPath(location.pathname);
  if (!onPublicSurface && !explicitlyOpened) return null;

  return createPortal(
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: 24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 24, opacity: 0 }}
          transition={{ type: "spring", stiffness: 400, damping: 36 }}
          className={cn(
            "fixed z-[9999] left-3 right-3 sm:left-auto sm:right-4 sm:w-[420px] sm:max-w-[calc(100vw-2rem)]",
            clearMarketingSticky
              ? "bottom-[calc(5.5rem+env(safe-area-inset-bottom,0px))]"
              : hasSession
                ? "bottom-[calc(5.75rem+env(safe-area-inset-bottom,0px))]"
                : "bottom-[calc(3.5rem+env(safe-area-inset-bottom,0px))] lg:bottom-[calc(3.75rem+env(safe-area-inset-bottom,0px))]",
          )}
          role="region"
          aria-label="Privacy choices"
          tabIndex={-1}
          ref={privacyPanelRef}
        >
          <div
            className={cn(
              "rounded-md border border-border bg-background/95 backdrop-blur-xl shadow-lg flex items-start gap-2.5 lg:items-center lg:px-4 lg:py-2.5",
              hasSession ? "px-3 py-2.5" : "px-3.5 py-3",
            )}
          >
            <div className="w-7 h-7 rounded-md flex items-center justify-center shrink-0 mt-0.5 wl-cookie-icon">
              <Cookie className="w-3.5 h-3.5 text-brand" />
            </div>

            <div className="flex-1 min-w-0 space-y-2 lg:flex lg:items-center lg:gap-4 lg:space-y-0">
              <p
                className={cn(
                  "leading-relaxed text-foreground/80 lg:flex-1",
                  hasSession
                    ? "text-[11px] sm:text-[length:var(--wireline-typography-caption-size)]"
                    : "text-[length:var(--wireline-typography-caption-size)]",
                )}
              >
                Essential storage keeps <WirelineWordmark inline /> working. Optional ad measurement
                stays off unless you allow it.{" "}
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
                <p className="text-[length:var(--wireline-typography-caption-size)] leading-relaxed text-muted-foreground">
                  Your browser privacy signal is active, so advertising measurement remains off.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2 lg:flex-nowrap lg:shrink-0">
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
