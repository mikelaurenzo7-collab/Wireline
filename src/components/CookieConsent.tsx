import { useCallback, useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "motion/react";
import { Cookie, X } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { ShadButton } from "./ui/shadcn/ShadButton";
import { cn } from "../lib/utils";
import { isMarketingStickyCtaRoute } from "../lib/marketing-mobile";
import { isAuthPortalPath, isMarketingPublicPath } from "../lib/public-routes";
import { useModalFocusTrap } from "../lib/use-modal-focus-trap";

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
  const [explicitlyOpened, setExplicitlyOpened] = useState(false);
  const location = useLocation();
  const [hasSession, setHasSession] = useState(false);
  const privacySignalEnabled = globalPrivacyControlEnabled();
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (noticeAcknowledged()) return;
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    void (async () => {
      let sessionPresent = false;
      try {
        const sessionRes = await fetch("/api/auth/session", { credentials: "include" });
        if (cancelled) return;
        // Anonymous visitors now get 200 `{ user: null }` — only a real user
        // counts as a session for suppressing the public consent auto-open.
        if (sessionRes.ok) {
          const body = (await sessionRes.json().catch(() => null)) as { user?: unknown } | null;
          sessionPresent = Boolean(body?.user);
        }
        setHasSession(sessionPresent);
      } catch {
        /* Session probe failed — treat as signed out so EU/UK visitors still
           get a consent choice. */
      }

      // A signed-in visitor reached the app through the public site, where the
      // notice already had its chance. Auto-opening it again inside the
      // workspace is both late and intrusive: it is bottom-anchored, so it
      // lands on top of the Overview onboarding card and the Billing
      // subscription panel, and on phone it covers the primary next action.
      //
      // Suppressing the AUTO-open is not a bypass. Optional measurement stays
      // off until an explicit grant, so silence is the privacy-preserving
      // state, and "Privacy choices" in the footer still opens this card on
      // demand from anywhere (the listener below is unconditional).
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
    // Deliberately session- and route-agnostic: "Privacy choices" must work
    // everywhere, including inside the workspace where the auto-open is
    // suppressed. explicitlyOpened is what lets the render guard below know
    // the card was asked for rather than volunteered.
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

  useModalFocusTrap(dialogRef, {
    active: visible,
    onEscape: dismiss,
  });

  // Escape chooses the privacy-preserving default and dismisses the notice.
  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dismiss, visible]);

  // Never render over the auth portal: at phone/tablet widths the 283px card
  // physically cannot fit beside the auth form, and wherever it sits it
  // intercepts taps on either the OAuth buttons (top) or the submit button
  // (bottom) — a first-visit mobile user literally could not tap "Sign in".
  // Consent stays reachable on every marketing/app surface and via /privacy,
  // and no optional measurement fires without an explicit grant, so skipping
  // the notice here is the privacy-preserving default, not a bypass.
  //
  // Same rule for Fast Start (?create=1): the create CTA sits at the bottom of
  // a full-viewport dialog; the consent card covered the primary create action and
  // made first-agent creation untappable on phone.
  // (After all hooks — rules-of-hooks.)
  const createFlowOpen =
    new URLSearchParams(location.search).get("create") === "1" ||
    new URLSearchParams(location.search).get("create") === "true";
  if (isAuthPortalPath(location.pathname) || createFlowOpen) return null;

  // The session probe above only runs once, at mount. The most common real
  // path defeats it: land on marketing signed out, leave the notice sitting
  // there, sign in — and the card rides into the workspace, where it is
  // bottom-anchored on top of the Overview onboarding card. Caught by watching
  // the walkthrough recording, where exactly that happened.
  //
  // Gate on the ROUTE as well, so placement never depends on probe timing.
  // Auto-opening belongs to the public site; inside the app the notice is
  // reachable only through the explicit "Privacy choices" control, which is
  // why that path stays session-agnostic.
  const onPublicSurface = isMarketingPublicPath(location.pathname);
  if (!onPublicSurface && !explicitlyOpened) return null;

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
            // Bottom placement everywhere. Authenticated app shell has a
            // mobile bottom nav (~4.25rem); clear it so Overview CTAs stay
            // tappable. Marketing sticky CTAs need a taller offset.
            clearMarketingSticky
              ? "bottom-[calc(5.5rem+env(safe-area-inset-bottom,0px))]"
              : hasSession
                ? "bottom-[calc(5.75rem+env(safe-area-inset-bottom,0px))]"
                : "bottom-[calc(4.25rem+env(safe-area-inset-bottom,0px))]",
          )}
          role="dialog"
          aria-modal="true"
          aria-label="Privacy choices"
          ref={dialogRef}
        >
          {/* bg-background/95 is load-bearing: the legacy class
              has no CSS definition, so without an explicit background the card
              was transparent-with-blur and page text ghosted through it. */}
          <div
            className={cn(
              "rounded-md border border-border bg-background/95 backdrop-blur-xl shadow-lg flex items-start gap-2.5",
              hasSession ? "px-3 py-2.5" : "px-3.5 py-3",
            )}
          >
            <div className="w-7 h-7 rounded-md flex items-center justify-center shrink-0 mt-0.5 wl-cookie-icon">
              <Cookie className="w-3.5 h-3.5 text-brand" />
            </div>

            <div className="flex-1 min-w-0 space-y-2">
              <p
                className={cn(
                  "leading-relaxed text-foreground/80",
                  hasSession
                    ? "text-[11px] sm:text-[length:var(--wireline-typography-caption-size)]"
                    : "text-[length:var(--wireline-typography-caption-size)]",
                )}
              >
                {hasSession ? (
                  <>
                    Essential storage keeps Wireline working. Optional ad measurement stays off
                    unless you allow it.{" "}
                  </>
                ) : (
                  <>
                    Essential storage and privacy-friendly product analytics help Wireline operate.
                    Optional advertising measurement stays off unless you allow it.{" "}
                  </>
                )}
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
