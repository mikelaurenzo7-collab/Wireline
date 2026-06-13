/* eslint-disable @typescript-eslint/no-explicit-any -- agent + agentConfig are the
 * untyped snake_case API rows mirrored from FleetSettings. */
/**
 * AgentReadinessStage — the focal center of the Studio canvas.
 *
 * Sits between the identity hero and the docked co-pilot. Where there used to
 * be one muted sentence (hidden entirely on mobile), this gives the operator a
 * calm, always-visible read on where the focused agent stands: how close it is
 * to going live, the one thing to do next, and a nudge that the co-pilot below
 * can do it in plain English. Readiness comes from the shared
 * `computeAgentReadiness` helper, so it always matches the rail's X/6 score.
 */
import { ArrowDown, Check, Sparkles } from "lucide-react";
import { computeAgentReadiness } from "./agent-readiness";
import { cn } from "../../lib/utils";

interface AgentReadinessStageProps {
  agent: any;
  agentConfig: any;
  integrationStatus: Record<string, { connected: boolean }> | null;
}

export default function AgentReadinessStage({
  agent,
  agentConfig,
  integrationStatus,
}: AgentReadinessStageProps) {
  const { score, total, checks, nextStep, ready } = computeAgentReadiness(
    agent,
    agentConfig,
    integrationStatus,
  );
  const name = agent?.name || "this agent";

  return (
    <div className="flex flex-1 min-h-0 flex-col items-center justify-center gap-5 px-6 py-6 text-center">
      {/* Focal readiness — the one number that matters, with a calm segmented
          bar instead of a heavy progress ring. */}
      <div className="w-full max-w-sm">
        <div className="flex items-baseline justify-center gap-2">
          <span className="font-display text-4xl leading-none text-ink/90 tabular-nums">
            {score}
          </span>
          <span className="text-sm text-muted/70">of {total} ready to go live</span>
        </div>

        <div
          className="mt-3 flex items-center justify-center gap-1.5"
          role="img"
          aria-label={`${score} of ${total} launch checks complete`}
        >
          {checks.map((c) => (
            <span
              key={c.id}
              className={cn(
                "h-1.5 flex-1 rounded-full transition-colors duration-300",
                c.done ? "bg-brand" : "bg-ink/[0.1]",
              )}
            />
          ))}
        </div>
      </div>

      {ready ? (
        // Fully armed — a confident, earned moment rather than a chore list.
        <div className="flex flex-col items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-brand/12 text-brand">
            <Check className="h-4 w-4" />
          </span>
          <p className="max-w-xs text-sm leading-relaxed text-ink/75">
            <span className="text-ink/90">{name}</span> is fully configured and ready to take
            live calls.
          </p>
        </div>
      ) : (
        // Next best action — names the single thing to do, and points at the
        // co-pilot that can do it in plain English.
        <div className="flex flex-col items-center gap-2.5">
          {nextStep && (
            <div className="inline-flex items-center gap-2 rounded-md border border-brand/20 bg-brand/[0.05] px-3 py-1.5">
              <span className="wl-label text-brand">Next</span>
              <span className="text-sm text-ink/85">{nextStep.todo}</span>
            </div>
          )}
          <p className="flex max-w-sm items-center justify-center gap-1.5 text-sm leading-relaxed text-muted/75">
            <Sparkles className="h-3.5 w-3.5 shrink-0 text-brand/60" />
            Tell your co-pilot
            <ArrowDown className="h-3.5 w-3.5 shrink-0 text-muted/50" />
            or fine-tune in the rail
          </p>
        </div>
      )}
    </div>
  );
}
