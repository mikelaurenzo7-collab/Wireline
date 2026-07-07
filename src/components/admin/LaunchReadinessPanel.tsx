import { useEffect, useState } from "react";
import { Rocket, AlertTriangle, CheckCircle2 } from "lucide-react";
import { authFetch } from "../../lib/api";
import { cn } from "../../lib/utils";

type Capability = {
  id: string;
  label: string;
  level: "ready" | "degraded" | "blocked";
  blockers: string[];
};

type LaunchReport = {
  ok: boolean;
  overall_score: number;
  campaign_ready: boolean;
  hard_gate_enabled: boolean;
  capabilities: Capability[];
  launch_blockers: string[];
};

const LEVEL_STYLE: Record<Capability["level"], string> = {
  ready: "text-[color:var(--wireline-color-action-primary-default)]",
  degraded: "text-amber-600",
  blocked: "text-rose-600",
};

export default function LaunchReadinessPanel() {
  const [report, setReport] = useState<LaunchReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    authFetch("/api/founder/launch-readiness")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled) setReport(data);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return <div className="wl-panel h-24 rounded-md animate-pulse mb-5" />;
  }
  if (!report) return null;

  return (
    <div className="wl-panel border border-border rounded-md p-4 mb-6 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="app-section-title flex items-center gap-2 mb-1">
            <Rocket className="w-3.5 h-3.5 text-brand" />
            Launch readiness
          </p>
          <p className="text-[var(--wireline-typography-caption-size)] text-muted leading-relaxed">
            Soft gate for campaigns — hard gate {report.hard_gate_enabled ? "enabled" : "off"} (
            <code className="text-[var(--wireline-typography-overline-size)]">
              LAUNCH_HARD_GATE
            </code>
            ).
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-lg font-semibold text-foreground tabular-nums">
            {report.overall_score}%
          </p>
          <p className="wl-micro-meta text-muted">overall</p>
        </div>
      </div>

      <div
        className={cn(
          "rounded-md border px-3 py-2 flex items-center gap-2 text-[var(--wireline-typography-caption-size)]",
          report.campaign_ready
            ? "border-brand/25 bg-brand/8 text-foreground"
            : "border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-100",
        )}
      >
        {report.campaign_ready ? (
          <CheckCircle2 className="w-4 h-4 text-brand shrink-0" />
        ) : (
          <AlertTriangle className="w-4 h-4 shrink-0" />
        )}
        {report.campaign_ready
          ? "Campaign-ready — voice and billing stacks configured."
          : `Blockers: ${report.launch_blockers.join(", ") || "review capabilities below"}`}
      </div>

      <ul className="grid gap-2 sm:grid-cols-2">
        {report.capabilities.map((cap) => (
          <li
            key={cap.id}
            className="rounded-md border border-border px-3 py-2 text-[var(--wireline-typography-caption-size)] bg-surface/30"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-foreground">{cap.label}</span>
              <span className={cn("wl-label capitalize", LEVEL_STYLE[cap.level])}>{cap.level}</span>
            </div>
            {cap.blockers.length > 0 && (
              <p className="wl-micro-meta text-muted mt-1">{cap.blockers.join(" · ")}</p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
