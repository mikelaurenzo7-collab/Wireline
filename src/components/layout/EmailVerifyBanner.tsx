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

type SendOutcome = "idle" | "pending" | "sent" | "no-transport" | "error";

export default function EmailVerifyBanner() {
  const [verified, setVerified] = useState<boolean | null>(null);
  const [outcome, setOutcome] = useState<SendOutcome>("idle");

  useEffect(() => {
    authFetch("/api/billing/status")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d && typeof d.email_verified === "boolean") {
          setVerified(d.email_verified);
        }
      })
      .catch(() => {});

    // Listen for the "?verified=1" query param the verify-email route
    // redirects to so the banner immediately disappears without
    // needing a page reload after the user clicks the magic link.
    const params = new URLSearchParams(window.location.search);
    if (params.get("verified") === "1") {
      setVerified(true);
    }
  }, []);

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

  // Color always amber here — verification is informational, not
  // urgent. Trial-expiry gets the rose treatment in TrialBanner.
  const containerCls = "bg-amber-500/10 border-b border-amber-500/30";
  const textCls = "text-amber-700";
  const iconCls = "text-amber-500";
  const buttonCls =
    "bg-amber-500/20 border border-amber-500/40 text-amber-700 hover:bg-amber-500/30";

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
      className={`${containerCls} px-6 py-2.5 flex items-center justify-between gap-4 flex-wrap`}
    >
      <div className={`flex items-center gap-2.5 text-xs ${textCls}`}>
        <Mail className={`w-3.5 h-3.5 shrink-0 ${iconCls}`} />
        <span>
          {outcome === "sent" ? (
            <>Verification email resent — check your inbox + spam folder.</>
          ) : outcome === "no-transport" ? (
            <>
              <AlertTriangle className="inline w-3.5 h-3.5 mb-0.5 mr-1" />
              Mail transport temporarily down. Try again in a few minutes — your trial isn't
              affected.
            </>
          ) : outcome === "error" ? (
            <>Couldn't send the verification email. Refresh and try again, or contact support.</>
          ) : (
            <>
              <strong>Verify your email</strong> to unlock outbound dialing and create more agents.
              Check your inbox for a link from Wireline.
            </>
          )}
        </span>
      </div>
      <button
        type="button"
        onClick={resend}
        disabled={buttonDisabled}
        className={`shrink-0 px-3 py-1.5 rounded-full text-[10px] uppercase tracking-[0.3em] transition-all ${buttonCls} disabled:opacity-60 disabled:cursor-not-allowed`}
      >
        {buttonLabel}
      </button>
    </motion.div>
  );
}
