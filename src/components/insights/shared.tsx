/**
 * Shared helpers for the Insights domain folder.
 *
 * Extracted from the monolithic InsightsView.tsx during the 2026 audit
 * god-file slicing pass. Every tab-view imports these rather than
 * duplicating spinner / empty / error chrome.
 */
import { WL_BRAND, WL_APP_CLASSES } from "../../lib/wireline-design-system";
import React from "react";
import { cn } from "../../lib/utils";
import { BarChart3, CheckCircle2 as CheckCircle2Icon, AlertOctagon, RotateCw } from "lucide-react";
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

/* ── Spinner ────────────────────────────────────────────────────── */

export function Spinner() {
  return (
    <div className="py-16 flex flex-col items-center gap-4">
      <div className="relative w-12 h-12">
        <div className="absolute inset-0 rounded-full opacity-40 wl-insight-spinner-ring" />
        <div className="absolute inset-1.5 rounded-full bg-card" />
        <div className="absolute inset-3 rounded-full wl-panel flex items-center justify-center">
          <div className="w-3 h-3 rounded-full wl-insight-spinner-core" data-circular />
        </div>
      </div>
      <p className={cn(WL_OPS_CLASSES.insightLabel, "animate-pulse")}>Computing…</p>
    </div>
  );
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
import { OPS_INSIGHTS_EMPTY, WL_OPS_CLASSES } from "../../lib/wireline-ops-design";

type InsightEmptyKey = keyof typeof OPS_INSIGHTS_EMPTY;

export function InsightEmpty({
  configKey,
  icon,
  titleOverride,
  actionsOverride,
  success,
  fill = false,
  framed = true,
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
  const { agents, loading: agentsLoading } = useAgents();
  const config = OPS_INSIGHTS_EMPTY[configKey];
  const prerequisiteActions =
    actionsOverride ??
    (agentsLoading
      ? []
      : agents.length === 0
        ? [{ label: "Create AI employee", to: "/studio?create=1", primary: true }]
        : !agents.some((agent) => agent.phone_number)
          ? [
              { label: "Connect phone", to: "/settings/phone", primary: true },
              { label: "Test employee", to: "/studio?section=test" },
            ]
          : [...config.actions]);

  return (
    <EmptyState
      framed={framed}
      fill={fill}
      density="compact"
      titleTone="ui"
      withHalo={false}
      icon={icon}
      title={titleOverride ?? config.title}
      actions={prerequisiteActions}
      accent={success ? WL_BRAND.accent : undefined}
    />
  );
}

/** @deprecated Prefer InsightEmpty with OPS_INSIGHTS_EMPTY keys */
export function Empty({ label, green }: { label: string; green?: boolean }) {
  const Icon = green ? CheckCircle2Icon : BarChart3;
  return (
    <EmptyState
      framed
      fill
      density="compact"
      titleTone="ui"
      withHalo={false}
      icon={Icon}
      title={green ? "All clear" : "No data"}
      description={label}
      accent={green ? WL_BRAND.accent : undefined}
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
            <RotateCw className="w-3.5 h-3.5" /> Try again
          </Button>
        )}
      </div>
    </div>
  );
}

/* ── Stat tile ──────────────────────────────────────────────────── */

export function Stat({
  label,
  value,
  accent,
  highlight,
}: {
  label: string;
  value: React.ReactNode;
  accent?: string;
  /** Emphasize a hero metric (e.g. total calls) in the insights stat row. */
  highlight?: boolean;
}) {
  return (
    <article className="wl-metric-tile px-4 py-3.5" data-tone={highlight ? "primary" : undefined}>
      <p className="wl-metric-tile__label">{label}</p>
      <div
        className={cn("wl-metric-tile__value mt-3 tabular-nums", accent && "wl-accent-text")}
        data-accent={accent}
      >
        {value}
      </div>
    </article>
  );
}

/* ── Spend stat (icon variant) ──────────────────────────────────── */

export function SpendStat({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  accent: string;
}) {
  return (
    <div className={WL_APP_CLASSES.insightStatCard + " p-5"} data-accent={accent}>
      <div className="absolute -top-10 -right-10 w-32 h-32 rounded-full opacity-25 blur-3xl pointer-events-none wl-accent-halo" />
      <div className="relative z-10">
        <div className="flex items-center justify-between mb-3">
          <p className={WL_OPS_CLASSES.insightLabel}>{label}</p>
          <Icon className="w-4 h-4 wl-accent-text" />
        </div>
        <p className="font-display italic text-3xl text-foreground leading-none">{value}</p>
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
