/* eslint-disable @typescript-eslint/no-explicit-any -- agent + agentConfig are the
 * untyped snake_case API rows mirrored from AssistantSettings. */
/**
 * AgentReadinessStage — the launch-readiness ribbon at the top of the Studio
 * canvas.
 *
 * Sits between the identity hero and the docked Studio workroom. A calm, always-visible
 * read on where the focused agent stands: how close it is to going live, and the
 * single next thing to do — without stealing the vertical space Studio
 * needs to be the hero of the canvas. Readiness comes from the shared
 * `computeAgentReadiness` helper, so it always matches the rail's X/6 score.
 */
import { ArrowDown, Check, Smartphone, Sparkles } from "lucide-react";
import { computeAgentReadiness } from "./agent-readiness";
import { WiredEyebrow } from "../ui/WiredEyebrow";
import { cn } from "../../lib/utils";
import type { AccountType } from "../../lib/account-type";

interface AgentReadinessStageProps {
  agent: any;
  agentConfig: any;
  integrationStatus: Record<string, { connected: boolean }> | null;
  accountType?: AccountType;
}

export default function AgentReadinessStage({
  agent,
  agentConfig,
  integrationStatus,
  accountType = "personal",
}: AgentReadinessStageProps) {
  const isPersonal = accountType === "personal";
  const { score, total, checks, nextStep, ready, softNudges } = computeAgentReadiness(
    agent,
    agentConfig,
    integrationStatus,
    { accountType },
  );

  return (
    <div className="shrink-0 border-b border-border/50 bg-card/30 px-4 py-3 dark:bg-velvet/20">
      <WiredEyebrow className="mb-2.5">Launch readiness</WiredEyebrow>
      <div className="flex items-center gap-4">
        {/* The one number that matters. */}
        <div className="flex shrink-0 items-baseline gap-1.5">
          <span className="font-display text-2xl leading-none text-foreground/90 tabular-nums">
            {score}
          </span>
          <span className="text-[var(--wireline-typography-overline-size)] text-muted/70">
            / {total} ready
          </span>
        </div>

        {/* Calm segmented bar — one segment per launch check. */}
        <div
          className="flex min-w-0 flex-1 items-center gap-1"
          role="img"
          aria-label={`${score} of ${total} launch checks complete`}
        >
          {checks.map((c) => (
            <span
              key={c.id}
              className={cn(
                "h-1.5 flex-1 rounded-full transition-colors duration-300",
                c.done ? "bg-primary" : "bg-ink/[0.1]",
              )}
            />
          ))}
        </div>

        {/* Status / next best action. */}
        {ready ? (
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-primary/20 bg-primary/[0.06] px-2.5 py-1 wl-label text-primary">
            <Check className="h-3.5 w-3.5" />
            Ready to go live
          </span>
        ) : nextStep ? (
          <span className="inline-flex shrink-0 items-center gap-2 rounded-md border border-primary/20 bg-primary/[0.05] px-2.5 py-1">
            <span className="wl-label text-primary">Next</span>
            <span className="max-w-[220px] truncate text-[var(--wireline-typography-caption-size)] text-foreground/85">
              {nextStep.todo}
            </span>
          </span>
        ) : null}
      </div>

      {!ready ? (
        <p className="mt-2 flex items-center gap-1.5 text-[var(--wireline-typography-overline-size)] leading-relaxed text-muted/75">
          <Sparkles className="h-3 w-3 shrink-0 text-primary/60" />
          Ask Studio below to handle it
          <ArrowDown className="h-3 w-3 shrink-0 text-muted/50" />
          or fine-tune it yourself in the rail on the right.
        </p>
      ) : isPersonal ? (
        <p className="mt-2 flex items-center gap-1.5 text-[var(--wireline-typography-overline-size)] leading-relaxed text-muted/75">
          <Smartphone className="h-3 w-3 shrink-0 text-primary/60" />
          Use it from your phone — tap the widget, ask Siri, or route a live call to your agent.
        </p>
      ) : softNudges.length ? (
        <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[var(--wireline-typography-overline-size)] leading-relaxed text-muted/70">
          <Sparkles className="h-3 w-3 shrink-0 text-primary/50" />
          {softNudges.map((nudge) => (
            <span key={nudge.id} className="inline-flex items-center gap-1">
              <span className="font-medium text-foreground/75">{nudge.label}:</span>
              <span>{nudge.hint}</span>
            </span>
          ))}
        </p>
      ) : null}
    </div>
  );
}
