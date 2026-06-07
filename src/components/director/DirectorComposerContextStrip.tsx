/**
 * Composer context strip — active coaching target pill.
 */
import { Bot, LayoutTemplate, X } from "lucide-react";
import { cn } from "../../lib/utils";
import { ShadButton } from "../ui/shadcn/ShadButton";
import {
  DIRECTOR_COMPOSER_CONTEXT,
  WIRELINE_STITCH_UI,
  WL_DIRECTOR_CLASSES,
} from "../../lib/wireline-director-design";

export interface DirectorComposerContextStripProps {
  focusAgentName?: string;
  onClearCoach?: () => void;
  designModeActive?: boolean;
  onClearDesignMode?: () => void;
  className?: string;
}

export function DirectorComposerContextStrip({
  focusAgentName,
  onClearCoach,
  designModeActive,
  onClearDesignMode,
  className,
}: DirectorComposerContextStripProps) {
  if (!focusAgentName && !designModeActive) return null;

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
      {designModeActive && (
        <div className={WL_DIRECTOR_CLASSES.composerContextPill}>
          <LayoutTemplate className="w-3 h-3 shrink-0 ml-0.5" aria-hidden />
          <span className="font-semibold">{WIRELINE_STITCH_UI.designModeContextLabel}</span>
          {onClearDesignMode && (
            <ShadButton
              type="button"
              variant="ghost"
              size="icon"
              disableAnimations
              onClick={onClearDesignMode}
              aria-label={WIRELINE_STITCH_UI.clearDesignModeLabel}
              className={cn(
                "wl-composer-context-clear shrink-0 h-8 w-8 rounded-full text-brand/70 hover:text-brand hover:bg-brand/10 touch-press",
              )}
            >
              <X className="w-3 h-3" />
            </ShadButton>
          )}
        </div>
      )}
      {focusAgentName && (
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
      )}
    </div>
  );
}
