/**
 * Persistent activation banner until the tenant completes a useful production call.
 */
import { useEffect, useState } from "react";
import { Phone, X } from "lucide-react";
import { authFetch } from "../lib/api";
import { formatPhone } from "../lib/safe-number";
import { fetchAssistantSetupProgress } from "../lib/fleet-setup-progress";
import {
  fetchActivationStatusFull,
  isActivationCelebrated,
  isPostSignupFlowActive,
  isFreshSignupSession,
} from "../lib/post-signup-onboarding";
import { ACTIVATION_NUDGE_COPY } from "../lib/wireline-onboarding-copy";
import { emitProductEventOnce } from "../lib/product-event-client";
import { ShadButton } from "./ui/shadcn/ShadButton";
import { cn } from "../lib/utils";
import { useAccount } from "../contexts/AccountContext";
import { useAuth } from "../contexts/AuthContext";

const DISMISS_KEY = "wireline_activation_nudge_dismissed";

function isRecentActivation(activatedAt: string | null | undefined): boolean {
  if (!activatedAt) return false;
  const ts = new Date(activatedAt).getTime();
  if (Number.isNaN(ts)) return false;
  // Only attribute conversions for activations in the last 48h — avoids backfill noise.
  return Date.now() - ts < 48 * 60 * 60 * 1000;
}

function formatTel(number: string): string {
  const digits = number.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return `tel:+${digits}`;
  if (digits.length === 10) return `tel:+1${digits}`;
  return `tel:${number}`;
}

function dismissalStorageKey(scopeId: string): string {
  return `${DISMISS_KEY}:${scopeId}`;
}

function readDismissed(scopeId: string | null): boolean {
  if (!scopeId) return false;
  try {
    return localStorage.getItem(dismissalStorageKey(scopeId)) === "true";
  } catch {
    return false;
  }
}

function writeDismissed(scopeId: string | null): void {
  if (!scopeId) return;
  try {
    localStorage.setItem(dismissalStorageKey(scopeId), "true");
  } catch {
    /* storage can be unavailable in private or embedded browser contexts */
  }
}

function shouldYieldToFirstSession(): boolean {
  if (typeof window === "undefined") return false;
  return window.location.pathname === "/overview";
}

export default function ActivationNudge({ className }: { className?: string }) {
  const { user } = useAuth();
  const { activeAccount } = useAccount();
  const activationScope = activeAccount?.id ?? user?.id ?? null;
  const [visible, setVisible] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setDismissed(readDismissed(activationScope));
  }, [activationScope]);

  useEffect(() => {
    // Once the Account Holder dismisses the nudge (or it was already dismissed
    // this scope), stop polling entirely. Without this the 30s interval keeps
    // firing ~7 authenticated requests/cycle for the life of the tab until the
    // tenant activates, even though the banner is hidden.
    // Read storage directly rather than trusting the `dismissed` state: the
    // effect that seeds it runs in the same commit, so on mount this closure
    // still sees `false` and would fire one full request burst before the state
    // lands — on every mount, forever, for someone who dismissed long ago.
    if (dismissed || readDismissed(activationScope)) return;

    let cancelled = false;
    let stopped = false;
    let interval: ReturnType<typeof setInterval> | undefined;

    const refresh = async () => {
      if (
        cancelled ||
        stopped ||
        !activationScope ||
        shouldYieldToFirstSession() ||
        isPostSignupFlowActive() ||
        isFreshSignupSession()
      )
        return;

      // Every read in this 30s poll must be defended: one thrown fetch or
      // non-JSON body otherwise surfaces as a recurring unhandled rejection
      // while the banner silently freezes on stale state.
      const [activation, progress] = await Promise.all([
        fetchActivationStatusFull().catch(() => null),
        fetchAssistantSetupProgress().catch(() => null),
      ]);

      if (cancelled) return;
      if (activation?.activated || isActivationCelebrated(activationScope)) {
        if (activation?.activated && isRecentActivation(activation.activatedAt)) {
          emitProductEventOnce({
            event: "live_call_completed",
            accountId: activeAccount?.id,
            metadata: {
              scope: activationScope,
              channel: activation.activationChannel ?? "unknown",
              call_id: activation.firstActivationCallId ?? null,
            },
          });
          emitProductEventOnce({
            event: "first_call_completed",
            accountId: activeAccount?.id,
            metadata: {
              scope: activationScope,
              channel: activation.activationChannel ?? "unknown",
              call_id: activation.firstActivationCallId ?? null,
            },
          });
        }
        setVisible(false);
        stopped = true;
        if (interval) clearInterval(interval);
        return;
      }
      if (!progress || progress.agents === 0) {
        setVisible(false);
        return;
      }

      const numbersRes = await authFetch("/api/phone-numbers").catch(() => null);
      const numbersJson = numbersRes?.ok ? await numbersRes.json().catch(() => null) : null;
      const firstNumber = numbersJson?.numbers?.[0]?.phone_number as string | undefined;

      if (cancelled) return;
      setPhoneNumber(firstNumber ?? null);
      setVisible(Boolean(firstNumber));
    };

    void refresh();
    interval = setInterval(() => void refresh(), 30_000);

    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
    };
  }, [activationScope, activeAccount?.id, dismissed]);

  const dismiss = () => {
    writeDismissed(activationScope);
    setDismissed(true);
  };

  if (dismissed || !visible || !phoneNumber || shouldYieldToFirstSession()) return null;

  return (
    <div
      className={cn(
        "relative mx-3 mt-1.5 mb-1 rounded-xl border border-border/80 bg-card/95 px-3.5 py-3 pr-12 text-[length:var(--wireline-typography-caption-size)] shadow-sm sm:mx-6 sm:flex sm:items-center sm:gap-3 sm:px-4 sm:py-3 sm:pr-12",
        className,
      )}
      role="status"
      aria-live="polite"
    >
      <div className="min-w-0 flex-1">
        <p className="wl-label mb-1 text-primary">{ACTIVATION_NUDGE_COPY.eyebrow}</p>
        <p className="max-w-[62ch] text-xs leading-relaxed text-foreground/75">
          {ACTIVATION_NUDGE_COPY.body}
        </p>
        <p className="mt-1 font-mono text-[length:var(--wireline-typography-caption-size)] tabular-nums text-[var(--wireline-color-text-secondary)]">
          {formatPhone(phoneNumber)}
        </p>
      </div>
      <a
        href={formatTel(phoneNumber)}
        className="mt-2 inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded bg-brand px-4 py-1.5 wl-label text-on-brand transition-opacity hover:opacity-95 active:scale-[0.98] sm:mt-0"
      >
        <Phone className="size-3.5" />
        {ACTIVATION_NUDGE_COPY.cta}
      </a>
      <ShadButton
        type="button"
        variant="ghost"
        size="icon"
        disableAnimations
        onClick={dismiss}
        aria-label="Dismiss activation reminder"
        className="absolute right-1 top-1 size-11 rounded text-muted hover:text-foreground active:scale-[0.98]"
      >
        <X className="size-3.5" />
      </ShadButton>
    </div>
  );
}
