import { AlertTriangle } from "lucide-react";
import { Link } from "react-router-dom";

import { voiceRoutingHint } from "../../lib/voice-catalog";
import { cn } from "../../lib/utils";

type PresenterPstnVoiceNoticeProps = {
  /** Agent has a provisioned PSTN line. */
  hasLiveLine?: boolean;
  className?: string;
  voiceEditHref?: string;
};

/**
 * Surfaces honest routing when presenter lip-sync voice is selected but PSTN
 * calls use a voice-library substitute on the telephony path.
 */
export function PresenterPstnVoiceNotice({
  hasLiveLine = false,
  className,
  voiceEditHref,
}: PresenterPstnVoiceNoticeProps) {
  const hint = voiceRoutingHint("presenter");
  if (!hint) return null;

  return (
    <div
      role="status"
      className={cn(
        "rounded-xl border border-[var(--wireline-color-feedback-warning-border)] bg-[var(--wireline-color-feedback-warning-surface)] px-4 py-3",
        className,
      )}
    >
      <div className="flex gap-3">
        <AlertTriangle
          size={16}
          className="mt-0.5 shrink-0 text-[var(--wireline-color-status-warning)]"
          aria-hidden="true"
        />
        <div className="min-w-0 space-y-2">
          <p className="text-sm font-semibold text-foreground">
            {hasLiveLine
              ? "Phone calls use a different voice"
              : "Presenter voice is preview-only on phone"}
          </p>
          <p className="text-xs leading-relaxed text-muted-foreground">{hint}</p>
          {voiceEditHref ? (
            <Link
              to={voiceEditHref}
              className="inline-flex min-h-[36px] items-center text-xs font-semibold text-primary underline-offset-2 hover:underline"
            >
              Pick a phone voice in Training
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}
