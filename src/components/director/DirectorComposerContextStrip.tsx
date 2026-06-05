/**
 * Composer context strip — active coaching target pill.
 */
import { Bot, X } from "lucide-react";
import { cn } from "../../lib/utils";
import { ShadButton } from "../ui/shadcn/ShadButton";
import { DIRECTOR_COMPOSER_CONTEXT, WL_DIRECTOR_CLASSES } from "../../lib/wireline-director-design";

export interface DirectorComposerContextStripProps {
  focusAgentName?: string;
  onClearCoach?: () => void;
  className?: string;
}

export function DirectorComposerContextStrip({
  focusAgentName,
  onClearCoach,
  className,
}: DirectorComposerContextStripProps) {
  if (!focusAgentName) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        WL_DIRECTOR_CLASSES.composerContextStrip,
        "flex flex-wrap items-center gap-2 px-4 pt-3 pb-1",
        className,
      )}
    >
      <div className={WL_DIRECTOR_CLASSES.composerContextPill}>
        <Bot className="w-3 h-3 shrink-0 ml-0.5" aria-hidden />
        <span>
          {DIRECTOR_COMPOSER_CONTEXT.coachingPrefix}{" "}
          <span className="font-semibold">{focusAgentName}</span>
        </span>
        {onClearCoach && (
          <ShadButton
            type="button"
            variant="ghost"
            size="icon"
            disableAnimations
            onClick={onClearCoach}
            aria-label={DIRECTOR_COMPOSER_CONTEXT.clearCoachLabel}
            className={cn(
              "wl-composer-context-clear shrink-0 h-8 w-8 rounded-full text-brand/70 hover:text-brand hover:bg-brand/10 touch-press",
            )}
          >
            <X className="w-3 h-3" />
          </ShadButton>
        )}
      </div>
    </div>
  );
}
