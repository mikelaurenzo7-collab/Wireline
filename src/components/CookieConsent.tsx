import { useCallback, useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "motion/react";
import { Cookie, X } from "lucide-react";
import { Link, useLocation } from "react-router";
import { ShadButton } from "./ui/shadcn/ShadButton";
import { cn } from "../lib/utils";
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

  // While the notice floats over the page, reserve the same space at the end of
  // the document so visitors can still scroll the last content (e.g. a plan
  // card on mobile pricing) fully above it.
  useEffect(() => {
    const root = typeof document === "undefined" ? null : document.documentElement;
    const panel = privacyPanelRef.current;
    if (!visible || !root?.style || !panel || typeof ResizeObserver === "undefined") return;
    const reserve = () =>
      root.style.setProperty(
        "--wl-privacy-choices-space",
        `${Math.ceil(panel.getBoundingClientRect().height)}px`,
      );
    reserve();
    const observer = new ResizeObserver(reserve);
    observer.observe(panel);
    root.setAttribute("data-privacy-choices", "open");
    return () => {
      observer.disconnect();
      root.removeAttribute("data-privacy-choices");
      root.style.removeProperty("--wl-privacy-choices-space");
    };
  }, [visible]);

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
          className="fixed z-[9999] box-border wl-privacy-choices left-3 right-3 w-[calc(100vw-1.5rem)] max-w-[calc(100vw-1.5rem)] sm:left-auto sm:right-4 sm:w-[720px] sm:max-w-[calc(100vw-2rem)] max-lg:bottom-[var(--wl-fixed-overlay-bottom)] lg:bottom-5 max-h-[calc(100dvh-var(--wl-fixed-overlay-bottom)-1rem)] lg:max-h-[calc(100dvh-2.5rem)] overflow-y-auto overscroll-contain rounded-md"
          role="region"
          aria-label="Privacy Choices"
          tabIndex={-1}
          ref={privacyPanelRef}
        >
          <div
            className={cn(
              "relative rounded-md border border-border bg-background/95 backdrop-blur-xl shadow-lg flex items-start gap-2.5 sm:items-center",
              hasSession ? "px-3 py-2.5" : "px-3.5 py-3",
            )}
          >
            <div className="hidden sm:flex w-7 h-7 rounded-md items-center justify-center shrink-0 mt-0.5 wl-cookie-icon">
              <Cookie className="w-3.5 h-3.5 text-brand" />
            </div>

            <div className="flex-1 min-w-0 space-y-3 sm:flex sm:items-center sm:gap-3 sm:space-y-0">
              <h2 className="sr-only">Privacy Choices</h2>
              <p className="wl-balance break-words text-sm leading-relaxed text-foreground/80 sm:flex-1">
                Essential storage is required. Optional analytics stay off unless you allow them.{" "}
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
                <div className="grid [grid-template-columns:repeat(auto-fit,minmax(min(100%,8.5rem),1fr))] gap-2 sm:flex sm:shrink-0">
                  <ShadButton
                    type="button"
                    variant="outline"
                    size="sm"
                    disableAnimations
                    onClick={() => saveChoice("denied")}
                    className="min-w-0 sm:min-w-[132px]"
                  >
                    Essential Only
                  </ShadButton>
                  <ShadButton
                    type="button"
                    size="sm"
                    disableAnimations
                    onClick={() => saveChoice("granted")}
                    className="min-w-0 sm:min-w-[148px]"
                  >
                    Allow Optional
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
              className="absolute right-1 top-1 sm:static shrink-0 w-9 h-9 sm:-mt-1 sm:-mr-1.5 text-muted hover:text-foreground touch-press hover:scale-[1.05]"
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
