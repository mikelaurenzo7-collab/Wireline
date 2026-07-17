/**
 * EmailVerifyBanner — surfaces when the signed-in user's email is
 * not yet verified. Sits between the TrialBanner and the rest of the
 * console UI. Two states:
 *
 *   1. unverified, transport up   → "Check your inbox · Resend"
 *   2. unverified, last send failed → "Mail transport down · Retry"
 *
 * Verified users see nothing (component returns null).
 *
 * Reads verification state from /api/billing/status's `email_verified`
 * flag (added in the same commit). Resend hits POST
 * /api/auth/resend-verification.
 */

import React, { useState, useEffect } from "react";
import { motion } from "motion/react";
import { Mail, Loader2, Check, AlertTriangle } from "lucide-react";
import { authFetch } from "../../lib/api";
import { cn } from "../../lib/utils";
import { useToast } from "../../contexts/ToastContext";
import { Button } from "../atoms";
import type { BillingStatusResponse } from "../../types/api";

type SendOutcome = "idle" | "pending" | "sent" | "no-transport" | "error";

export default function EmailVerifyBanner() {
  const [verified, setVerified] = useState<boolean | null>(null);
  const [outcome, setOutcome] = useState<SendOutcome>("idle");
  const { success } = useToast();

  useEffect(() => {
    authFetch("/api/billing/status")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: BillingStatusResponse | null) => {
        if (d && typeof d.email_verified === "boolean") {
          setVerified(d.email_verified);
        }
      })
      .catch(() => {});

    // Listen for the "?verified=1" query param the verify-email route
    // redirects to so the banner immediately disappears without
    // needing a page reload after the user clicks the magic link.
    const params = new URLSearchParams(window.location.search);
    const verifiedParam = params.get("verified");
    if (verifiedParam === "1") {
      setVerified(true);
      // Celebratory moment for the "I just clicked the magic link"
      // user. Brand the trial start so they know what they unlocked.
      // Fires once; the dedupe in ToastContext catches accidental
      // double-fires from React StrictMode double-render in dev.
      success(
        "Email verified — trial started",
        "14 days · 1 AI employee · 25 outbound calls included. Pick a template to create your first one.",
      );
      // Strip the query param so refreshing the page doesn't re-fire
      // the toast. History API replace keeps scroll + state intact.
      try {
        const url = new URL(window.location.href);
        url.searchParams.delete("verified");
        window.history.replaceState({}, "", url.toString());
      } catch {
        // Ignore — non-browser context (SSR / tests) doesn't need this.
      }
    } else if (verifiedParam === "expired") {
      // Magic link was stale (>24h) or already used. Don't toast — banner
      // already says "transport down" if relevant; here the user just
      // needs to resend. Avoid a "Link expired" warning since it's
      // ambiguous (could mean phishing concern).
    }
  }, [success]);

  if (verified !== false) return null;

  async function resend() {
    setOutcome("pending");
    try {
      const r = await authFetch("/api/auth/resend-verification", { method: "POST" });
      const data = (await r.json().catch(() => ({}))) as {
        ok?: boolean;
        sent?: boolean;
        reason?: string;
      };
      if (data?.ok && data.sent) setOutcome("sent");
      else if (data?.reason === "transport_unavailable") setOutcome("no-transport");
      else setOutcome("error");
    } catch {
      setOutcome("error");
    }
  }

  // Informational — trial urgency uses wl-banner--warn in TrialBanner.
  const bannerTone =
    outcome === "no-transport" || outcome === "error" ? "wl-banner--warn" : "wl-banner--info";

  let buttonLabel: React.ReactNode = "Resend email";
  let buttonDisabled = false;
  if (outcome === "pending") {
    buttonLabel = (
      <span className="inline-flex items-center gap-1.5">
        <Loader2 className="w-3 h-3 animate-spin" />
        Sending
      </span>
    );
    buttonDisabled = true;
  } else if (outcome === "sent") {
    buttonLabel = (
      <span className="inline-flex items-center gap-1.5">
        <Check className="w-3 h-3" />
        Sent
      </span>
    );
    buttonDisabled = true;
  }

  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1 }}
      className={cn("wl-banner", bannerTone)}
    >
      <div className="wl-banner__body">
        <Mail className="wl-banner__icon" aria-hidden />
        <span>
          {outcome === "sent" ? (
            <>Verification email resent — check your inbox + spam folder.</>
          ) : outcome === "no-transport" ? (
            <>
              <AlertTriangle className="inline w-3.5 h-3.5 mb-0.5 mr-1" aria-hidden />
              Mail transport temporarily down. Try again in a few minutes — your trial isn&apos;t
              affected.
            </>
          ) : outcome === "error" ? (
            <>
              Couldn&apos;t send the verification email. Refresh and try again, or contact support.
            </>
          ) : (
            <>
              <strong>Verify your email</strong> to unlock outbound dialing and create more agents.
              Check your inbox for a link from Wireline.
            </>
          )}
        </span>
      </div>
      <Button
        type="button"
        variant={outcome === "sent" ? "secondary" : "default"}
        size="sm"
        disableAnimations
        onClick={resend}
        disabled={buttonDisabled}
        className={cn(
          "touch-press hover:scale-[1.02] shrink-0 app-micro-cta h-auto after:hidden border-0 shadow-none",
          outcome === "sent" && "opacity-70",
        )}
      >
        {buttonLabel}
      </Button>
    </motion.div>
  );
}
