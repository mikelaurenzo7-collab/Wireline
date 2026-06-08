/**
 * Persistent activation banner until the tenant completes a useful production call.
 */
import { useEffect, useState } from "react";
import { Phone, X } from "lucide-react";
import { authFetch } from "../lib/api";
import { fetchFleetSetupProgress } from "../lib/fleet-setup-progress";
import {
  fetchActivationStatusFull,
  isActivationCelebrated,
  isPostSignupFlowActive,
  isFreshSignupSession,
} from "../lib/post-signup-onboarding";
import { ACTIVATION_NUDGE_COPY } from "../lib/wireline-onboarding-copy";
import { WL_OPS_CLASSES } from "../lib/wireline-ops-design";
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
        fetchFleetSetupProgress().catch(() => null),
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
        WL_OPS_CLASSES.setupNudge,
        "flex flex-col sm:flex-row sm:items-center gap-3 mx-4 mt-3 mb-1",
        className,
      )}
      role="status"
      aria-live="polite"
    >
      <div className="flex-1 min-w-0 pl-1">
        <p className="wl-label text-brand mb-1">{ACTIVATION_NUDGE_COPY.eyebrow}</p>
        <p className="text-xs text-ink/75 leading-relaxed">{ACTIVATION_NUDGE_COPY.body}</p>
        {phoneNumber ? (
          <p className="text-[11px] font-mono text-muted mt-1 tabular-nums">{phoneNumber}</p>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2 shrink-0 sm:pl-2">
        {phoneNumber ? (
          <a
            href={formatTel(phoneNumber)}
            className="touch-press inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-brand text-on-brand wl-label min-h-[36px] hover:opacity-95 transition-opacity"
          >
            <Phone className="w-3.5 h-3.5" />
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
          className="touch-press h-9 w-9 rounded-full text-muted hover:text-ink"
        >
          <X className="w-3.5 h-3.5" />
        </ShadButton>
      </div>
    </div>
  );
}
