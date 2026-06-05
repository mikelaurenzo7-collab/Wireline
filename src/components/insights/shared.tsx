/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Shared helpers for the Insights domain folder.
 *
 * Extracted from the monolithic InsightsView.tsx during the 2026 audit
 * god-file slicing pass. Every tab-view imports these rather than
 * duplicating spinner / empty / error chrome.
 */
import React from "react";
import { cn } from "../../lib/utils";
import { BarChart3, CheckCircle2 as CheckCircle2Icon, AlertOctagon } from "lucide-react";
import { authFetch, readApiJson } from "../../lib/api";
import { WIRELINE_DIRECTOR_BRAND, WL_APP_CLASSES } from "../../lib/wireline-director-design";
import { BRAND } from "../../constants/brand-colors";

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
        <div
          className="absolute inset-0 rounded-full opacity-40"
          style={{
            background: `conic-gradient(from 0deg, ${WIRELINE_DIRECTOR_BRAND.violet}, ${WIRELINE_DIRECTOR_BRAND.violet}, ${WIRELINE_DIRECTOR_BRAND.violet}, ${WIRELINE_DIRECTOR_BRAND.violet}, ${WIRELINE_DIRECTOR_BRAND.violet})`,
            filter: "blur(1px)",
            animation: "spin 2s linear infinite",
          }}
        />
        <div className="absolute inset-1.5 rounded-full bg-paper" />
        <div className="absolute inset-3 rounded-full wl-panel flex items-center justify-center">
          <div
            className="w-3 h-3 rounded-full"
            style={{
              background: WIRELINE_DIRECTOR_BRAND.violet,
              boxShadow: `0 0 10px ${WIRELINE_DIRECTOR_BRAND.violet}`,
            }}
          />
        </div>
      </div>
      <p className={cn(WL_OPS_CLASSES.insightLabel, "text-[9px] tracking-[0.5em] animate-pulse")}>
        Computing…
      </p>
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
  descriptionOverride,
  actionsOverride,
  success,
}: {
  configKey: InsightEmptyKey;
  icon: LucideIcon;
  descriptionOverride?: string;
  actionsOverride?: Array<{
    label: string;
    to?: string;
    onClick?: () => void;
    primary?: boolean;
  }>;
  success?: boolean;
}) {
  const config = OPS_INSIGHTS_EMPTY[configKey];
  return (
    <EmptyState
      framed
      density="compact"
      icon={icon}
      eyebrow={config.eyebrow}
      title={config.title}
      description={descriptionOverride ?? config.description}
      actions={actionsOverride ?? [...config.actions]}
      accent={success ? WIRELINE_DIRECTOR_BRAND.violet : undefined}
    />
  );
}

/** @deprecated Prefer InsightEmpty with OPS_INSIGHTS_EMPTY keys */
export function Empty({ label, green }: { label: string; green?: boolean }) {
  const Icon = green ? CheckCircle2Icon : BarChart3;
  return (
    <EmptyState
      framed
      density="compact"
      icon={Icon}
      eyebrow={green ? "All clear" : "Insights"}
      title={green ? "Looking good" : "No data yet"}
      description={label}
      accent={green ? WIRELINE_DIRECTOR_BRAND.violet : undefined}
    />
  );
}

/* ── Error card ─────────────────────────────────────────────────── */

export function ErrCard({ error }: { error: string }) {
  return (
    <div
      role="alert"
      className="rounded-md bg-rose-500/10 border border-rose-500/30 p-6 text-rose-500 text-sm flex items-start gap-3"
    >
      <AlertOctagon className="w-5 h-5 shrink-0 mt-0.5" />
      <span>{error}</span>
    </div>
  );
}

/* ── Stat tile ──────────────────────────────────────────────────── */

export function Stat({ label, value, accent }: { label: string; value: any; accent?: string }) {
  return (
    <div>
      <div className={WL_OPS_CLASSES.insightLabel}>{label}</div>
      <div
        className="font-display italic text-xl text-ink mt-1"
        style={accent ? { color: accent } : {}}
      >
        {value}
      </div>
    </div>
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
    <div className={WL_APP_CLASSES.insightStatCard + " p-5"}>
      <div
        className="absolute -top-10 -right-10 w-32 h-32 rounded-full opacity-25 blur-3xl pointer-events-none"
        style={{ background: `radial-gradient(circle, ${accent}, transparent)` }}
      />
      <div className="relative z-10">
        <div className="flex items-center justify-between mb-3">
          <p className={WL_OPS_CLASSES.insightLabel}>{label}</p>
          <Icon className="w-4 h-4" style={{ color: accent }} />
        </div>
        <p className="font-display italic text-3xl text-ink leading-none">{value}</p>
      </div>
    </div>
  );
}

/* ── QA colour helper ───────────────────────────────────────────── */

export function qaColor(score: number) {
  if (score >= 90) return WIRELINE_DIRECTOR_BRAND.violet;
  if (score >= 75) return BRAND.purple;
  if (score >= 60) return BRAND.purpleMuted;
  if (score >= 40) return BRAND.rose;
  return BRAND.rose;
}
