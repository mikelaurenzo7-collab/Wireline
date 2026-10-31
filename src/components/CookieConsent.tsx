import { useCallback, useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "motion/react";
import { Cookie, X } from "lucide-react";
import { Link, useLocation } from "react-router";
import { ShadButton } from "./ui/shadcn/ShadButton";
import { cn } from "../lib/utils";
import { isAuthPortalPath, isMarketingHomePath, isMarketingPublicPath } from "../lib/public-routes";

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
  const [_hasSession, setHasSession] = useState(false);
  const privacySignalEnabled = globalPrivacyControlEnabled();
  const privacyPanelRef = useRef<HTMLDivElement>(null);
  const [narrowViewport, setNarrowViewport] = useState(false);
  const [mobileInlineHost, setMobileInlineHost] = useState<HTMLElement | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  // For a first visit on phones, insert the consent notice into normal page
  // flow before the app. A fixed bottom notice previously covered pricing CTAs
  // and homepage cards at 390px. Explicitly reopened choices remain floating
  // so they are reachable from the footer or an authenticated workspace.
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(max-width: 639px)");
    const sync = () => setNarrowViewport(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (!narrowViewport || typeof document.createElement !== "function") return;
    const host = document.createElement("div");
    host.className = "wl-mobile-privacy-host";
    const appRoot = document.getElementById("root");
    if (appRoot?.parentNode) appRoot.parentNode.insertBefore(host, appRoot);
    else document.body.prepend(host);
    setMobileInlineHost(host);
    return () => host.remove();
  }, [narrowViewport]);

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

  // The consent panel is a labelled region, not a modal dialog. It must still
  // be announced and immediately reachable: move focus into it whenever it
  // appears (auto-invited or reopened from the footer) unless a real dialog is
  // already open. The previous implementation only moved focus for an explicit
  // re-open, leaving the first-visit notice far down the tab order.
  useEffect(() => {
    if (!visible) return;
    const frame = window.requestAnimationFrame(() => {
      if (
        typeof document.querySelector === "function" &&
        document.querySelector('[aria-modal="true"], dialog[open]')
      ) {
        return;
      }
      privacyPanelRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [visible, mobileInlineHost]);

  // While the notice floats over the page, reserve the same space at the end of
  // the document so visitors can still scroll the last content (e.g. a plan
  // card on mobile pricing) fully above it.
  useEffect(() => {
    const root = typeof document === "undefined" ? null : document.documentElement;
    const panel = privacyPanelRef.current;
    if (!visible || !root?.style || !panel || typeof ResizeObserver === "undefined") return;
    const inlineOnPhone = narrowViewport && !explicitlyOpened;
    const reserve = () =>
      root.style.setProperty(
        "--wl-privacy-choices-space",
        inlineOnPhone ? "0px" : `${Math.ceil(panel.getBoundingClientRect().height)}px`,
      );
    reserve();
    const observer = new ResizeObserver(reserve);
    observer.observe(panel);
    root.setAttribute("data-privacy-choices", inlineOnPhone ? "inline" : "open");
    return () => {
      observer.disconnect();
      root.removeAttribute("data-privacy-choices");
      root.style.removeProperty("--wl-privacy-choices-space");
    };
  }, [visible, mobileInlineHost, narrowViewport, explicitlyOpened]);

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

  // The homepage is the marketing surface most first-time visitors see; it is
  // intentionally not part of the broader marketing set because it must not
  // wait on session hydration. Consent is a separate concern, and omitting the
  // home path meant the notice never appeared there.
  const onPublicSurface =
    isMarketingHomePath(location.pathname) || isMarketingPublicPath(location.pathname);
  if (!onPublicSurface && !explicitlyOpened) return null;

  const inlineOnPhone = narrowViewport && !explicitlyOpened;
  const portalTarget = inlineOnPhone ? mobileInlineHost : document.body;
  if (!portalTarget) return null;

  return createPortal(
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: 24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 24, opacity: 0 }}
          transition={{ type: "spring", stiffness: 400, damping: 36 }}
          className="fixed z-[9999] box-border wl-privacy-choices left-2 right-2 sm:left-auto sm:right-4 w-[calc(100vw-1rem)] sm:w-[720px] max-w-[calc(100vw-1rem)] sm:max-w-[calc(100vw-2rem)] max-lg:bottom-[calc(var(--wl-fixed-overlay-bottom,0px)+0.5rem)] lg:bottom-4 max-h-[calc(100dvh-var(--wl-fixed-overlay-bottom,0px)-1rem)] lg:max-h-[calc(100dvh-2.5rem)] overflow-y-auto overscroll-contain rounded-xl shadow-xl"
          role="region"
          aria-label="Privacy Choices"
          tabIndex={-1}
          ref={privacyPanelRef}
        >
          <div
            className={cn(
              "relative rounded-xl border border-border bg-background/95 backdrop-blur-xl shadow-lg flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3 p-2.5 sm:px-4 sm:py-3",
            )}
          >
            <div className="hidden sm:flex w-7 h-7 rounded-md items-center justify-center shrink-0 wl-cookie-icon">
              <Cookie className="w-3.5 h-3.5 text-brand" />
            </div>

            <div className="flex-1 min-w-0 flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3">
              <h2 className="sr-only">Privacy Choices</h2>
              <p className="wl-balance break-words text-xs sm:text-sm leading-normal text-foreground/80 flex-1 pr-6 sm:pr-0">
                Analytics are off by default.{" "}
                <Link
                  to="/privacy"
                  className="text-brand hover:text-brand/80 underline font-medium"
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
                <div className="flex items-center gap-1.5 shrink-0 w-full sm:w-auto">
                  <ShadButton
                    type="button"
                    variant="outline"
                    size="sm"
                    disableAnimations
                    onClick={() => saveChoice("denied")}
                    className="flex-1 sm:flex-initial h-8 px-2.5 text-xs font-medium sm:min-w-[110px]"
                  >
                    Essential Only
                  </ShadButton>
                  <ShadButton
                    type="button"
                    size="sm"
                    disableAnimations
                    onClick={() => saveChoice("granted")}
                    className="flex-1 sm:flex-initial h-8 px-2.5 text-xs font-medium sm:min-w-[120px]"
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
              className="absolute right-1 top-1 sm:static shrink-0 w-7 h-7 text-muted-foreground hover:text-foreground touch-press"
            >
              <X className="w-3.5 h-3.5" />
            </ShadButton>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    portalTarget,
  );
}
