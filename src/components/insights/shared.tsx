/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Shared helpers for the Insights domain folder.
 *
 * Extracted from the monolithic InsightsView.tsx during the 2026 audit
 * god-file slicing pass. Every tab-view imports these rather than
 * duplicating spinner / empty / error chrome.
 */
import React from "react";
import { BarChart3, CheckCircle2 as CheckCircle2Icon, AlertOctagon } from "lucide-react";
import { cn } from "../../lib/utils";
import { authFetch, readApiJson } from "../../lib/api";

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
            background: "conic-gradient(from 0deg, #4F1E7B, #4F1E7B, #4F1E7B, #10B981, #4F1E7B)",
            filter: "blur(1px)",
            animation: "spin 2s linear infinite",
          }}
        />
        <div className="absolute inset-1.5 rounded-full bg-paper" />
        <div className="absolute inset-3 rounded-full glass flex items-center justify-center">
          <div
            className="w-3 h-3 rounded-full"
            style={{
              background: "#4F1E7B",
              boxShadow: "0 0 10px #4F1E7B",
            }}
          />
        </div>
      </div>
      <p className="text-[9px] uppercase tracking-[0.5em] text-muted/60 animate-pulse">
        Computing…
      </p>
    </div>
  );
}

/* ── Empty state ────────────────────────────────────────────────── */

export function Empty({ label, green }: { label: string; green?: boolean }) {
  return (
    <div className="relative aurora-ring rounded-3xl">
      <div className="relative rounded-3xl glass border border-white/10 p-12 text-center overflow-hidden">
        <div
          className="absolute -top-20 left-1/2 -translate-x-1/2 w-64 h-32 rounded-full opacity-20 blur-3xl pointer-events-none"
          style={{
            background: green
              ? "radial-gradient(circle, #10B981, transparent)"
              : "radial-gradient(circle, #4F1E7B, transparent)",
          }}
        />
        <div
          className={cn(
            "inline-flex items-center justify-center w-12 h-12 rounded-2xl glass border mb-4",
            green ? "border-emerald-500/30 text-emerald-500" : "border-brand/30 text-brand",
          )}
        >
          {green ? (
            <CheckCircle2Icon className="w-5 h-5" />
          ) : (
            <BarChart3 className="w-5 h-5 opacity-60" />
          )}
        </div>
        <p
          className={cn(
            "text-[11px] uppercase tracking-[0.4em]",
            green ? "text-emerald-500/80" : "text-muted",
          )}
        >
          {label}
        </p>
      </div>
    </div>
  );
}

/* ── Error card ─────────────────────────────────────────────────── */

export function ErrCard({ error }: { error: string }) {
  return (
    <div
      role="alert"
      className="rounded-2xl bg-rose-500/10 border border-rose-500/30 p-6 text-rose-500 text-sm flex items-start gap-3"
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
      <div className="app-section-title">{label}</div>
      <div
        className="font-display italic text-xl text-ink mt-0.5"
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
    <div className="relative aurora-ring rounded-2xl">
      <div className="relative rounded-2xl glass border border-white/10 p-5 overflow-hidden">
        <div
          className="absolute -top-10 -right-10 w-32 h-32 rounded-full opacity-25 blur-3xl pointer-events-none"
          style={{ background: `radial-gradient(circle, ${accent}, transparent)` }}
        />
        <div className="relative z-10">
          <div className="flex items-center justify-between mb-3">
            <p className="app-section-title">{label}</p>
            <Icon className="w-4 h-4" style={{ color: accent }} />
          </div>
          <p className="font-display italic text-3xl text-ink leading-none">{value}</p>
        </div>
      </div>
    </div>
  );
}

/* ── QA colour helper ───────────────────────────────────────────── */

export function qaColor(score: number) {
  if (score >= 90) return "#4F1E7B";
  if (score >= 75) return "#10B981";
  if (score >= 60) return "#FFD166";
  if (score >= 40) return "#FF9A5C";
  return "#4F1E7B";
}
