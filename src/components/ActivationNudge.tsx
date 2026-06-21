/**
 * Persistent activation banner until the tenant completes a useful production call.
 */
import { useEffect, useState } from "react";
import { Phone, X } from "lucide-react";
import { authFetch } from "../lib/api";
import { fetchAssistantSetupProgress } from "../lib/fleet-setup-progress";
import {
  fetchActivationStatusFull,
  isActivationCelebrated,
  isPostSignupFlowActive,
  isFreshSignupSession,
} from "../lib/post-signup-onboarding";
import { ACTIVATION_NUDGE_COPY } from "../lib/wireline-onboarding-copy";
import { ShadButton } from "./ui/shadcn/ShadButton";
import { cn } from "../lib/utils";

const DISMISS_KEY = "wireline_activation_nudge_dismissed";

function formatTel(number: string): string {
  const digits = number.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return `tel:+${digits}`;
  if (digits.length === 10) return `tel:+1${digits}`;
  return `tel:${number}`;
}

export default function ActivationNudge({ className }: { className?: string }) {
  const [visible, setVisible] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(DISMISS_KEY) === "true") setDismissed(true);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | undefined;

    const refresh = async () => {
      if (isPostSignupFlowActive() || isFreshSignupSession()) return;

      const [activation, progress] = await Promise.all([
        fetchActivationStatusFull(),
        fetchAssistantSetupProgress().catch(() => null),
      ]);

      if (cancelled) return;
      if (activation?.activated || isActivationCelebrated()) {
        setVisible(false);
        return;
      }
      if (!progress || progress.agents === 0) {
        setVisible(false);
        return;
      }

      const numbersRes = await authFetch("/api/phone-numbers").catch(() => null);
      const numbersJson = numbersRes?.ok ? await numbersRes.json() : null;
      const firstNumber = numbersJson?.numbers?.[0]?.phone_number as string | undefined;

      if (cancelled) return;
      setPhoneNumber(firstNumber ?? null);
      setVisible(true);
    };

    void refresh();
    interval = setInterval(() => void refresh(), 30_000);

    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
    };
  }, []);

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, "true");
    setDismissed(true);
  };

  if (dismissed || !visible) return null;

  return (
    <div
      className={cn(
        "mx-4 mt-2 mb-0.5 flex flex-col gap-2 border border-border bg-card px-3 py-2 text-[12px] sm:flex-row sm:items-center",
        className,
      )}
      role="status"
      aria-live="polite"
    >
      <div className="min-w-0 flex-1 pl-1">
        <p className="wl-label mb-1 text-brand">{ACTIVATION_NUDGE_COPY.eyebrow}</p>
        <p className="text-xs leading-relaxed text-foreground/75">{ACTIVATION_NUDGE_COPY.body}</p>
        {phoneNumber ? (
          <p className="mt-1 font-mono text-[11px] tabular-nums text-muted">{phoneNumber}</p>
        ) : null}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2 sm:pl-2">
        {phoneNumber ? (
          <a
            href={formatTel(phoneNumber)}
            className="inline-flex min-h-9 items-center gap-1.5 rounded bg-brand px-4 py-2 wl-label text-on-brand transition-opacity hover:opacity-95 active:scale-[0.98]"
          >
            <Phone className="size-3.5" />
            {ACTIVATION_NUDGE_COPY.cta}
          </a>
        ) : null}
        <ShadButton
          type="button"
          variant="ghost"
          size="icon"
          disableAnimations
          onClick={dismiss}
          aria-label="Dismiss activation reminder"
          className="size-9 rounded text-muted hover:text-foreground active:scale-[0.98]"
        >
          <X className="size-3.5" />
        </ShadButton>
      </div>
    </div>
  );
}
