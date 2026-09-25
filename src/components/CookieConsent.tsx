import { useCallback, useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "motion/react";
import { Cookie, X } from "lucide-react";
import { Link, useLocation } from "react-router";
import { ShadButton } from "./ui/shadcn/ShadButton";
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

function privacyDockRoot(): HTMLElement | null {
  const root = typeof document === "undefined" ? null : document.documentElement;
  if (!root || !("dataset" in root) || !root.dataset) return null;
  return root;
}

export default function CookieConsent() {
  const [visible, setVisible] = useState(false);
  const [explicitlyOpened, setExplicitlyOpened] = useState(false);
  const location = useLocation();
  const [hasSession, setHasSession] = useState(false);
  const [stickyCtaMounted, setStickyCtaMounted] = useState(false);
  const privacySignalEnabled = globalPrivacyControlEnabled();
  const privacyPanelRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

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
      const activeElement = document.activeElement;
      if (
        activeElement instanceof HTMLElement &&
        activeElement !== document.body &&
        !privacyPanelRef.current?.contains(activeElement)
      ) {
        returnFocusRef.current = activeElement;
      }
      setExplicitlyOpened(true);
      setVisible(true);
    };
    window.addEventListener(OPEN_PRIVACY_CHOICES_EVENT, openPrivacyChoices);
    return () => window.removeEventListener(OPEN_PRIVACY_CHOICES_EVENT, openPrivacyChoices);
  }, []);

  useEffect(() => {
    try {
      const doc = typeof document === "undefined" ? null : document;
      if (!doc?.querySelector || !doc.body) return;
      const syncStickyCta = () => {
        setStickyCtaMounted(Boolean(doc.querySelector(".marketing-sticky-cta")));
      };
      syncStickyCta();
      if (typeof MutationObserver !== "function") return;
      const observer = new MutationObserver(syncStickyCta);
      observer.observe(doc.body, { childList: true, subtree: true });
      return () => observer.disconnect();
    } catch {
      return;
    }
  }, [location.pathname]);

  const clearMarketingSticky =
    stickyCtaMounted &&
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
      const returnTarget = returnFocusRef.current;
      if (
        privacyPanelRef.current?.contains(document.activeElement) &&
        returnTarget?.isConnected &&
        !returnTarget.closest("[hidden], [inert]")
      ) {
        returnTarget.focus({ preventScroll: true });
      }
      returnFocusRef.current = null;
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
      if (e.key === "Escape" && !e.defaultPrevented) dismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dismiss, visible]);

  const createFlowOpen =
    new URLSearchParams(location.search).get("create") === "1" ||
    new URLSearchParams(location.search).get("create") === "true";
  const hideForAuth = isAuthPortalPath(location.pathname) || createFlowOpen;
  const onPublicSurface = isMarketingPublicPath(location.pathname);
  const suppressDock = hideForAuth || (!onPublicSurface && !explicitlyOpened);

  useEffect(() => {
    const root = privacyDockRoot();
    if (!root) return;
    const open = visible && !suppressDock;
    if (open) {
      root.dataset.wlPrivacyDock = "open";
      if (clearMarketingSticky) root.dataset.wlPrivacySticky = "1";
      else delete root.dataset.wlPrivacySticky;
    } else {
      delete root.dataset.wlPrivacyDock;
      delete root.dataset.wlPrivacySticky;
    }
    return () => {
      delete root.dataset.wlPrivacyDock;
      delete root.dataset.wlPrivacySticky;
    };
  }, [clearMarketingSticky, suppressDock, visible]);

  if (isAuthPortalPath(location.pathname) || createFlowOpen) return null;
  if (!onPublicSurface && !explicitlyOpened) return null;

  return createPortal(
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: 16, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 16, opacity: 0 }}
          transition={{ type: "spring", stiffness: 400, damping: 36 }}
          className={cn(
            "wl-privacy-dock",
            clearMarketingSticky && "wl-privacy-dock--above-sticky",
            hasSession && "wl-privacy-dock--session",
          )}
          data-above-sticky={clearMarketingSticky ? "true" : "false"}
          role="region"
          aria-label="Privacy choices"
          tabIndex={-1}
          ref={privacyPanelRef}
        >
          <div className="wl-privacy-dock__bar">
            <div className="w-7 h-7 rounded-md flex items-center justify-center shrink-0 wl-cookie-icon">
              <Cookie className="w-3.5 h-3.5 text-brand" />
            </div>

            <div className="flex-1 min-w-0 space-y-3 sm:flex sm:items-center sm:gap-3 sm:space-y-0">
              <p
                className={cn(
                  "leading-relaxed text-foreground/80 sm:flex-1",
                  hasSession
                    ? "text-[11px] sm:text-[length:var(--wireline-typography-caption-size)]"
                    : "text-[length:var(--wireline-typography-caption-size)]",
                )}
              >
                Essential storage keeps{" "}
                <span className="font-semibold text-foreground">BotBound</span> working. Optional
                measurement stays off until you allow it.{" "}
                <Link
                  to="/privacy"
                  className="text-brand hover:text-brand/80 underline"
                  onClick={() => {
                    // The destination page owns focus after navigation.
                    returnFocusRef.current = null;
                    dismiss();
                  }}
                >
                  Privacy
                </Link>
              </p>

              {privacySignalEnabled ? (
                <p className="text-[length:var(--wireline-typography-caption-size)] leading-relaxed text-muted-foreground">
                  Your privacy signal keeps measurement off.
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-2 sm:flex sm:shrink-0">
                  <ShadButton
                    type="button"
                    variant="outline"
                    size="sm"
                    disableAnimations
                    onClick={() => saveChoice("denied")}
                    className="min-w-0 sm:min-w-[132px]"
                  >
                    Essential only
                  </ShadButton>
                  <ShadButton
                    type="button"
                    size="sm"
                    disableAnimations
                    onClick={() => saveChoice("granted")}
                    className="min-w-0 sm:min-w-[148px]"
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
              className="shrink-0 w-9 h-9 text-muted hover:text-foreground touch-press hover:scale-[1.05]"
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
