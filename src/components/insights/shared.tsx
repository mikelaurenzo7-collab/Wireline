/**
 * Shared helpers for the Insights domain folder.
 *
 * Extracted from the monolithic InsightsView.tsx during the 2026 audit
 * god-file slicing pass. Every tab-view imports these rather than
 * duplicating spinner / empty / error chrome.
 */
import { WL_BRAND } from "../../lib/wireline-design-system";
import { AlertOctagon, RotateCw } from "lucide-react";
import { authFetch, readApiJson } from "../../lib/api";

import { BRAND } from "../../constants/brand-colors";
import { Skeleton } from "../ui/shadcn/Skeleton";
import { Button } from "../atoms";
import { useAgents } from "../../contexts/AgentsContext";

/* ── Data fetching ──────────────────────────────────────────────── */

/** Loads an insights API route; never throws JSON parse errors. */
export async function fetchInsight<T>(url: string): Promise<T> {
  const res = await authFetch(url);
  const out = await readApiJson<T>(res);
  if (out.ok === false) throw new Error(out.error);
  return out.data;
}

/* ── Skeleton (layout-matched loading) ──────────────────────────── */

/**
 * Layout-matched loading placeholder for an insight view — a hero stat
 * row plus two chart blocks. Replaces the centered Spinner so the panel
 * doesn't shift when real data lands. Mirrors the shared insight grid
 * (4 stat tiles → 2 chart panels) used by most views.
 */
export function InsightSkeleton() {
  return (
    <div className="space-y-4 pb-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading insights…</span>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-md wl-panel border border-border p-4 space-y-3">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-7 w-16" />
          </div>
        ))}
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="rounded-md wl-panel border border-border p-5 space-y-3">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-40 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Empty state ────────────────────────────────────────────────── */

import type { LucideIcon } from "lucide-react";
import { EmptyState } from "../ui/EmptyState";
import { OPS_INSIGHTS_EMPTY } from "../../lib/wireline-ops-design";

type InsightEmptyKey = keyof typeof OPS_INSIGHTS_EMPTY;

export function InsightEmpty({
  configKey,
  icon,
  titleOverride,
  actionsOverride,
  success,
  // A "no data yet" panel reads better as a message centered in the empty
  // space than as a small bordered card parked at the top of a tall column.
  // Center it in the available height and drop the frame; views that supply
  // their own panel chrome (e.g. AI Spend) still pass framed/fill explicitly.
  fill = true,
  framed = false,
}: {
  configKey: InsightEmptyKey;
  icon: LucideIcon;
  /** Replaces the config title — e.g. a one-line API status. */
  titleOverride?: string;
  actionsOverride?: Array<{
    label: string;
    to?: string;
    onClick?: () => void;
    primary?: boolean;
  }>;
  success?: boolean;
  /** Keep empty insight panels in the visible page rhythm unless a view explicitly opts into centering. */
  fill?: boolean;
  /** Panel chrome — off when the parent already supplies a frame. */
  framed?: boolean;
}) {
  const {
    agents,
    loading: agentsLoading,
    degraded: agentsDegraded,
    phoneLookupDegraded,
    refresh: refreshAgents,
  } = useAgents();
  const config = OPS_INSIGHTS_EMPTY[configKey];
  const prerequisiteActions =
    actionsOverride ??
    (agentsLoading
      ? []
      : (agentsDegraded && agents.length === 0) || (phoneLookupDegraded && agents.length > 0)
        ? [{ label: "Retry Bot Status", onClick: refreshAgents, primary: true }]
        : agents.length === 0
          ? [{ label: "Open Workspace", to: "/studio", primary: true }]
          : !agents.some((agent) => agent.phone_number)
            ? [
                { label: "Connect Phone", to: "/phone?tab=lines", primary: true },
                { label: "Call History", to: "/phone" },
              ]
            : [...config.actions]);

  const firstRun = !agentsLoading && agents.length === 0 && !agentsDegraded;
  const title = titleOverride ?? (firstRun ? "No Conversations Yet" : config.title);
  const description =
    firstRun && !titleOverride ? "Activity appears once your Bot starts taking calls." : undefined;

  return (
    <EmptyState
      framed={framed}
      fill={fill}
      density="compact"
      titleTone="ui"
      withHalo={false}
      icon={icon}
      title={title}
      description={description}
      actions={prerequisiteActions}
      accent={success ? WL_BRAND.accent : undefined}
    />
  );
}

/* ── Error card ─────────────────────────────────────────────────── */

export function ErrCard({ error, onRetry }: { error: string; onRetry?: () => void }) {
  return (
    <div
      role="alert"
      className="rounded-md bg-destructive/10 border border-destructive/30 p-6 text-destructive text-sm flex items-start gap-3"
    >
      <AlertOctagon className="w-5 h-5 shrink-0 mt-0.5" aria-hidden />
      <div className="flex-1 min-w-0 space-y-3">
        <span className="block">{error}</span>
        {onRetry && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disableAnimations
            onClick={onRetry}
            className="border-destructive/40 text-destructive hover:bg-destructive/10"
          >
            <RotateCw className="w-3.5 h-3.5" /> Try Again
          </Button>
        )}
      </div>
    </div>
  );
}

/* ── QA colour helper ───────────────────────────────────────────── */

export function qaColor(score: number) {
  if (score >= 90) return WL_BRAND.accentHex;
  if (score >= 75) return BRAND.colors.primary;
  if (score >= 60) return BRAND.colors.onSurfaceMuted;
  if (score >= 40) return BRAND.colors.error;
  return BRAND.colors.error;
}
