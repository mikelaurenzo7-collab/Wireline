/**
 * Vertical feed of integration live-action boxes — each action drops in as the
 * Director works, Claude-style partner integration choreography.
 */
import React from "react";
import { motion, AnimatePresence } from "motion/react";
import { Plug } from "lucide-react";
import { cn } from "../../../lib/utils";
import type { IntegrationLiveAction } from "../../../lib/integration-live-scripts";
import { LIVE_FEED_LABELS, WL_DIRECTOR_CLASSES } from "../../../lib/wireline-director-design";
import IntegrationLiveActionCard from "./IntegrationLiveActionCard";

export default function IntegrationLiveFeed({
  actions,
  className,
}: {
  actions: IntegrationLiveAction[];
  className?: string;
}) {
  if (actions.length === 0) return null;

  const activeCount = actions.filter((a) => a.status === "active").length;
  const doneCount = actions.filter((a) => a.status === "success").length;
  const isProposalFeed = actions.some((a) => a.source === "proposal");

  return (
    <div className={cn("relative", className)}>
      <div className="flex items-center justify-between mb-2 px-0.5">
        <div className="flex items-center gap-1.5">
          <Plug className="w-3 h-3 text-brand/60" />
          <span
            className={cn(
              "text-[9px] uppercase tracking-[0.18em] font-semibold text-muted",
              WL_DIRECTOR_CLASSES.liveFeedHeader,
            )}
          >
            {isProposalFeed ? LIVE_FEED_LABELS.proposal : LIVE_FEED_LABELS.scripted}
          </span>
        </div>
        <span className="text-[9px] font-mono text-muted/60 tabular-nums">
          {doneCount}/{actions.length}
          {activeCount > 0 ? ` · ${activeCount} running` : ""}
        </span>
      </div>

      {isProposalFeed && (
        <p className="mb-2.5 text-[10px] text-muted/70 italic px-0.5">
          {LIVE_FEED_LABELS.proposalHint}
        </p>
      )}

      {/* Connecting thread behind cards */}
      <div
        className="absolute left-[19px] top-8 bottom-4 w-px bg-gradient-to-b from-brand/20 via-brand/10 to-transparent pointer-events-none"
        aria-hidden
      />

      <div className="space-y-2.5">
        <AnimatePresence mode="popLayout" initial={false}>
          {actions.map((action, index) => (
            <IntegrationLiveActionCard key={action.id} action={action} index={index} />
          ))}
        </AnimatePresence>
      </div>

      {activeCount > 0 && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mt-2 text-[10px] text-muted/70 italic pl-1"
        >
          Next action queues when the current step completes…
        </motion.p>
      )}
    </div>
  );
}
