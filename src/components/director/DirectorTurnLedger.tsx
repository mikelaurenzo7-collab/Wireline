/**
 * DirectorTurnLedger — the structured turn anatomy at the top of every
 * Director message: an activity summary strip ("Reasoned 4.2s · 2 actions ·
 * 3 sources · 1 proposal") whose chips toggle independently collapsible
 * strata for reasoning, the mission log (actions), and grounded sources.
 *
 * The same component renders live (streaming) and persisted turns so the
 * live session and the final message share one visual language.
 */
import React, { useCallback, useMemo, useState } from "react";
import { Brain, Clock, Globe, ListChecks, Sparkles } from "lucide-react";
import { cn } from "../../lib/utils";
import { DIRECTOR_TURN_LEDGER_COPY, WL_DIRECTOR_CLASSES } from "../../lib/wireline-director-design";
import { ShadButton } from "../ui/shadcn/ShadButton";
import { parseReasoningSteps, summarizeReasoning } from "../ui/ThinkingDisplay";
import { TurnStratum, loadStratumPreference, type TurnStratumKind } from "./TurnStratum";
import { DirectorTurnActions, type TurnActionItem } from "./DirectorTurnActions";
import { ResearchSourceList, type ResearchSource } from "./DirectorResearchSources";

export interface DirectorTurnLedgerProps {
  reasoning?: string;
  thinkingDurationMs?: number;
  isDeep?: boolean;
  actions?: TurnActionItem[];
  sources?: ResearchSource[];
  /** Count of pending approval cards rendered below the answer. */
  proposalCount?: number;
  /** While streaming, the actions stratum auto-expands. */
  live?: boolean;
  className?: string;
}

function formatSeconds(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
}

export function DirectorTurnLedger({
  reasoning,
  thinkingDurationMs,
  isDeep = false,
  actions = [],
  sources = [],
  proposalCount = 0,
  live = false,
  className,
}: DirectorTurnLedgerProps) {
  const hasReasoning = Boolean(reasoning?.trim());
  const hasActions = actions.length > 0;
  const hasSources = sources.length > 0;

  const [openMap, setOpenMap] = useState<Record<TurnStratumKind, boolean>>(() => ({
    reasoning: loadStratumPreference("reasoning") ?? false,
    actions: loadStratumPreference("actions") ?? false,
    sources: loadStratumPreference("sources") ?? false,
  }));

  const setStratumOpen = useCallback((kind: TurnStratumKind, open: boolean) => {
    setOpenMap((prev) => (prev[kind] === open ? prev : { ...prev, [kind]: open }));
  }, []);

  const toggleStratum = useCallback(
    (kind: TurnStratumKind) => setOpenMap((prev) => ({ ...prev, [kind]: !prev[kind] })),
    [],
  );

  const reasoningSteps = useMemo(
    () => (hasReasoning ? parseReasoningSteps(reasoning as string) : []),
    [hasReasoning, reasoning],
  );
  const reasoningSummary = useMemo(
    () => (hasReasoning ? summarizeReasoning(reasoning as string) : ""),
    [hasReasoning, reasoning],
  );

  if (!hasReasoning && !hasActions && !hasSources && proposalCount === 0) return null;

  const actionsOpen = live ? true : openMap.actions;
  const durationLabel =
    typeof thinkingDurationMs === "number" && thinkingDurationMs > 0
      ? formatSeconds(thinkingDurationMs)
      : null;

  const summaryChips: { key: TurnStratumKind | "proposals"; label: string }[] = [];
  if (hasReasoning) {
    summaryChips.push({
      key: "reasoning",
      label: durationLabel
        ? DIRECTOR_TURN_LEDGER_COPY.summaryReasoned(durationLabel)
        : DIRECTOR_TURN_LEDGER_COPY.reasoningEyebrow,
    });
  }
  if (hasActions) {
    summaryChips.push({
      key: "actions",
      label: DIRECTOR_TURN_LEDGER_COPY.summaryActions(actions.length),
    });
  }
  if (hasSources) {
    summaryChips.push({
      key: "sources",
      label: DIRECTOR_TURN_LEDGER_COPY.summarySources(sources.length),
    });
  }
  if (proposalCount > 0) {
    summaryChips.push({
      key: "proposals",
      label: DIRECTOR_TURN_LEDGER_COPY.summaryProposals(proposalCount),
    });
  }

  return (
    <div className={cn("mb-2 pb-2 border-b border-brand/10 space-y-1.5", className)}>
      {summaryChips.length > 0 && (
        <div className={WL_DIRECTOR_CLASSES.turnSummaryStrip}>
          {summaryChips.map((chip) =>
            chip.key === "proposals" ? (
              <span
                key={chip.key}
                className={cn(WL_DIRECTOR_CLASSES.turnSummaryChip, "inline-flex items-center")}
              >
                {chip.label}
              </span>
            ) : (
              <ShadButton
                key={chip.key}
                type="button"
                variant="ghost"
                size="sm"
                disableAnimations
                onClick={() => toggleStratum(chip.key as TurnStratumKind)}
                aria-expanded={
                  chip.key === "actions" ? actionsOpen : openMap[chip.key as TurnStratumKind]
                }
                className={WL_DIRECTOR_CLASSES.turnSummaryChip}
              >
                {chip.label}
              </ShadButton>
            ),
          )}
        </div>
      )}

      {hasReasoning && (
        <TurnStratum
          kind="reasoning"
          icon={
            isDeep ? (
              <Brain className="w-3.5 h-3.5 text-brand/70" />
            ) : (
              <Sparkles className="w-3 h-3 text-brand/60" />
            )
          }
          label={
            isDeep
              ? DIRECTOR_TURN_LEDGER_COPY.deepReasoningEyebrow
              : DIRECTOR_TURN_LEDGER_COPY.reasoningEyebrow
          }
          badge={
            durationLabel ? (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-brand/8 wl-micro-meta text-brand/70 font-mono tabular-nums">
                <Clock aria-hidden className="w-2.5 h-2.5" />
                {durationLabel}
              </span>
            ) : undefined
          }
          summary={reasoningSummary}
          deep={isDeep}
          open={openMap.reasoning}
          onOpenChange={(next) => setStratumOpen("reasoning", next)}
        >
          <div className="px-3 pb-2.5 pt-0.5">
            <div className="pl-2 border-l-2 border-brand/15 space-y-1.5">
              {reasoningSteps.map((step, i) => (
                <div key={i} className="relative">
                  <span
                    aria-hidden
                    className="absolute -left-[9px] top-1.5 w-2 h-2 rounded-full border-2 border-brand/40 bg-brand/20"
                  />
                  <p className="text-[11px] text-muted leading-relaxed pl-2">{step}</p>
                </div>
              ))}
            </div>
          </div>
        </TurnStratum>
      )}

      {hasActions && (
        <TurnStratum
          kind="actions"
          icon={<ListChecks className="w-3.5 h-3.5 text-brand/70" />}
          label={DIRECTOR_TURN_LEDGER_COPY.actionsEyebrow}
          badge={
            <span className="wl-micro-badge font-mono text-muted/60 tabular-nums">
              {actions.length}
            </span>
          }
          summary={actions[actions.length - 1]?.label}
          open={actionsOpen}
          onOpenChange={(next) => setStratumOpen("actions", next)}
        >
          <DirectorTurnActions actions={actions} className="pt-0.5" />
        </TurnStratum>
      )}

      {hasSources && (
        <TurnStratum
          kind="sources"
          icon={<Globe className="w-3.5 h-3.5 text-brand/70" />}
          label={DIRECTOR_TURN_LEDGER_COPY.sourcesEyebrow}
          badge={
            <span className="wl-micro-badge font-mono text-muted/60 tabular-nums">
              {sources.length}
            </span>
          }
          summary={sources[0]?.title || sources[0]?.uri}
          open={openMap.sources}
          onOpenChange={(next) => setStratumOpen("sources", next)}
        >
          <div className="px-3 pb-2.5 pt-0.5">
            <ResearchSourceList sources={sources} />
          </div>
        </TurnStratum>
      )}
    </div>
  );
}
