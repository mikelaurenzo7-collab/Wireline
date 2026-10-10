/**
 * EmailVerifyBanner — surfaces when the signed-in user's email is
 * not yet verified, or a verification return cannot be confirmed.
 *
 * Verified users see nothing (component returns null). Session dismiss
 * hides the nag for this browser tab without clearing the requirement.
 *
 * Reads verification state from /api/billing/status's `email_verified`
 * flag (added in the same commit). Resend hits POST
 * /api/auth/resend-verification.
 */

import React, { useState, useEffect, useRef } from "react";
import { useLocation } from "react-router";
import { motion } from "motion/react";
import { Mail, Loader2, Check, AlertTriangle, X } from "lucide-react";
import { authFetch } from "../../lib/api";
import { cn } from "../../lib/utils";
import { useToast } from "../../contexts/ToastContext";
import { useAuth } from "../../contexts/AuthContext";
import { readEmailVerificationReturn } from "../../lib/email-verification-return";
import { Button } from "../atoms";
import type { BillingStatusResponse } from "../../types/api";

type SendOutcome = "idle" | "pending" | "sent" | "no-transport" | "error";

const DISMISS_SESSION_KEY = "wireline.email_verify_banner.dismissed";

type VerificationView = {
  ownerId: string;
  verified: boolean | null;
  unavailable: boolean;
  checking: boolean;
  outcome: SendOutcome;
  dismissed: boolean;
};

function initialView(ownerId: string): VerificationView {
  let dismissed = false;
  try {
    dismissed = sessionStorage.getItem(`${DISMISS_SESSION_KEY}:${ownerId}`) === "1";
  } catch {
    // Optional storage must not prevent verification or account access.
  }
  return {
    ownerId,
    verified: null,
    unavailable: false,
    checking: false,
    outcome: "idle",
    dismissed,
  };
}

export default function EmailVerifyBanner() {
  const { user } = useAuth();
  const ownerId = user?.id ?? "";
  const { search } = useLocation();
  const verificationReturn = readEmailVerificationReturn(search);
  const [view, setView] = useState(() => initialView(ownerId));
  const ownerRef = useRef(ownerId);
  ownerRef.current = ownerId;
  const confirmedRef = useRef<{ ownerId: string; verified: boolean | null }>({
    ownerId,
    verified: null,
  });
  const controlsRef = useRef<{
    check: () => Promise<void>;
    resend: () => Promise<void>;
  } | null>(null);
  const { success } = useToast();

  useEffect(() => {
    if (!ownerId) return;
    let active = true;
    let readVersion = 0;
    let activeCheck: Promise<void> | null = null;
    let refreshAfterCheck = false;
    let wasAway = document.visibilityState !== "visible";
    let resending = false;
    let confirmReturn = verificationReturn !== null;
    if (confirmedRef.current.ownerId !== ownerId) {
      confirmedRef.current = { ownerId, verified: null };
    }
    const current = () => active && ownerRef.current === ownerId;
    const update = (patch: Partial<VerificationView>) => {
      if (!current()) return;
      setView((previous) => ({
        ...(previous.ownerId === ownerId ? previous : initialView(ownerId)),
        ...patch,
      }));
    };
    // A changed return path retires the preceding request lifecycle. Keep
    // confirmed status, but never leave a retired resend showing "Sending".
    update({ outcome: "idle" });

    const confirm = (verified: boolean) => {
      const previous = confirmedRef.current.verified;
      confirmedRef.current = { ownerId, verified };
      update({ verified, unavailable: false, checking: false });
      if (!verified || (!confirmReturn && previous !== false)) return;
      confirmReturn = false;
      success(
        "Email verified",
        "Your account’s email is confirmed. You can continue in your workspace.",
      );
      try {
        const url = new URL(window.location.href);
        url.searchParams.delete("verified");
        window.history.replaceState(window.history.state, "", url.toString());
      } catch {
        // The server-confirmed result remains valid without History API access.
      }
    };

    const check = (): Promise<void> => {
      if (!current()) return Promise.resolve();
      // Returning to a tab can emit both visibilitychange and focus. Reuse
      // the same status/Stripe lookup until it settles instead of stacking reads.
      if (activeCheck) return activeCheck;
      const request = ++readVersion;
      update({ checking: true });
      const pending = (async () => {
        try {
          const response = await authFetch("/api/billing/status");
          const data: BillingStatusResponse | null = response.ok ? await response.json() : null;
          if (!current() || request !== readVersion) return;
          if (typeof data?.email_verified === "boolean") confirm(data.email_verified);
          else update({ unavailable: true, checking: false });
        } catch {
          if (current() && request === readVersion) update({ unavailable: true, checking: false });
        }
      })();
      activeCheck = pending;
      const release = () => {
        if (activeCheck !== pending) return;
        activeCheck = null;
        if (!refreshAfterCheck) return;
        refreshAfterCheck = false;
        if (
          current() &&
          document.visibilityState === "visible" &&
          !wasAway &&
          confirmedRef.current.verified !== true
        )
          void check();
      };
      void pending.then(release, release);
      return pending;
    };

    const resend = async () => {
      if (!current() || resending) return;
      resending = true;
      update({ outcome: "pending" });
      try {
        const response = await authFetch("/api/auth/resend-verification", { method: "POST" });
        const data = (await response.json().catch(() => null)) as {
          ok?: boolean;
          sent?: boolean;
          reason?: string;
        } | null;
        if (!current()) return;
        if (response.ok && data?.ok === true && data.reason === "already_verified") {
          // This authoritative response supersedes any older in-flight status read.
          readVersion++;
          confirm(true);
          update({ outcome: "idle" });
        } else if (response.ok && data?.ok === true && data.sent === true) {
          update({ outcome: "sent" });
        } else if (response.ok && data?.reason === "transport_unavailable") {
          update({ outcome: "no-transport" });
        } else update({ outcome: "error" });
      } catch {
        update({ outcome: "error" });
      } finally {
        resending = false;
      }
    };
    controlsRef.current = { check, resend };
    const markAway = () => {
      wasAway = true;
    };
    const refresh = () => {
      if (document.visibilityState !== "visible") {
        markAway();
        return;
      }
      const returnedToTab = wasAway;
      wasAway = false;
      if (confirmedRef.current.verified === true) return;
      // A read started before this return can still report the pre-verification
      // state. Queue one fresh read after it, shared by the paired return events.
      if (returnedToTab && activeCheck) refreshAfterCheck = true;
      void check();
    };
    void check();
    window.addEventListener("blur", markAway);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      active = false;
      controlsRef.current = null;
      window.removeEventListener("blur", markAway);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [ownerId, search, verificationReturn, success]);

  if (view.ownerId !== ownerId || view.verified === true || view.dismissed) return null;
  if (view.verified === null && !view.unavailable && !verificationReturn) return null;
  const { outcome } = view;

  function dismissForSession() {
    if (ownerRef.current !== ownerId) return;
    try {
      sessionStorage.setItem(`${DISMISS_SESSION_KEY}:${ownerId}`, "1");
    } catch {
      // sessionStorage may be blocked; still hide for this mount.
    }
    setView((previous) => ({ ...previous, dismissed: true }));
  }

  // Informational — trial urgency uses wl-banner--warn in TrialBanner.
  const bannerTone =
    outcome === "no-transport" ||
    outcome === "error" ||
    view.unavailable ||
    verificationReturn === "expired" ||
    verificationReturn === "error"
      ? "wl-banner--warn"
      : "wl-banner--info";

  let buttonLabel: React.ReactNode = view.verified === null ? "Check Status" : "Resend Email";
  let buttonDisabled = view.verified === null && view.checking;
  if (buttonDisabled || outcome === "pending") {
    buttonLabel = (
      <span className="inline-flex items-center gap-1.5">
        <Loader2 className="w-3 h-3 animate-spin" />
        {outcome === "pending" ? "Sending" : "Checking"}
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
      role="status"
      aria-live="polite"
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1 }}
      className={cn("wl-banner flex-col gap-3 sm:flex-row sm:items-center sm:gap-3", bannerTone)}
    >
      <div className="wl-banner__body w-full min-w-0">
        <Mail className="wl-banner__icon" aria-hidden />
        <span className="min-w-0 text-left">
          {outcome === "sent" ? (
            <>Verification email resent. Check your inbox + spam folder.</>
          ) : outcome === "no-transport" ? (
            <>
              <AlertTriangle className="inline w-3.5 h-3.5 mb-0.5 mr-1" aria-hidden />
              Mail transport temporarily down. Try again in a few minutes. Your account isn&apos;t
              affected.
            </>
          ) : outcome === "error" ? (
            <>
              Couldn&apos;t send the verification email. Refresh and try again, or contact support.
            </>
          ) : view.unavailable ? (
            <>
              Couldn&apos;t check your email status.{" "}
              {view.verified === false
                ? "You can still request another verification email."
                : "Try checking again."}
            </>
          ) : verificationReturn === "expired" ? (
            <>
              This link may have expired or already been used. Request another verification email
              below.
            </>
          ) : verificationReturn === "error" ? (
            <>
              We couldn&apos;t finish checking that link. Request another verification email below.
            </>
          ) : view.verified === null ? (
            <>Checking your email verification…</>
          ) : verificationReturn === "1" ? (
            <>
              This account&apos;s email is not yet confirmed. Check that you signed in to the
              account from the email, or request another link.
            </>
          ) : (
            <>
              <strong>Verify your email</strong> to secure your account.{" "}
              {"A live plan and compliant number are still required before outbound dialing."}
            </>
          )}
        </span>
      </div>
      <div className="flex w-full shrink-0 flex-col gap-2 self-stretch sm:w-auto sm:flex-row sm:items-center sm:self-center">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disableAnimations
          onClick={() => {
            if (ownerRef.current !== ownerId) return;
            return view.verified === null
              ? controlsRef.current?.check()
              : controlsRef.current?.resend();
          }}
          disabled={buttonDisabled}
          className={cn(
            "touch-press hover:scale-[1.02] w-full shrink-0 app-micro-cta h-auto after:hidden shadow-none sm:w-auto",
            outcome === "sent" && "opacity-70",
          )}
        >
          {buttonLabel}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disableAnimations
          onClick={dismissForSession}
          aria-label="Dismiss email verification reminder for this session"
          className="touch-press w-full shrink-0 gap-1.5 text-muted-foreground sm:w-auto"
        >
          <X className="size-3.5" aria-hidden="true" />
          Dismiss
        </Button>
      </div>
    </motion.div>
  );
}
