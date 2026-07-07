import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Loader2,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  Phone,
  Wallet,
  Users,
} from "lucide-react";
import { authFetch } from "../lib/api";
import { MetricStatTile } from "./ui/MetricStatTile";
import { ShadButton } from "./ui/shadcn/ShadButton";
import { cn } from "../lib/utils";

type CockpitPayload = {
  ok: boolean;
  acquiring: {
    new_users_7d: number;
    demo_calls_7d: number;
    demo_recaps_7d: number;
    demo_signups_7d: number;
  };
  activating: {
    activated_total: number;
    activation_rate_pct: number;
    median_time_to_activation_seconds: number | null;
    activated_last_7d: number;
  };
  calls_working: {
    voice_healthy: boolean;
    demo_canary_healthy: boolean | null;
  };
  costs_controlled: {
    economics_at_risk_count: number;
  };
  retained: {
    trialing_expired_7d: number;
    zero_calls_14d: number;
    activated_not_paying: number;
  };
  launch_readiness: {
    campaign_ready: boolean;
    overall_score: number;
    launch_blockers: string[];
  };
};

function QuestionCard({
  title,
  icon: Icon,
  ok,
  children,
  href,
}: {
  title: string;
  icon: typeof Users;
  ok: boolean;
  children: React.ReactNode;
  href?: string;
}) {
  return (
    <div className="wl-panel border border-border rounded-md p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-md",
              ok ? "bg-brand/12 text-brand" : "bg-rose-500/10 text-rose-600",
            )}
          >
            <Icon className="w-4 h-4" />
          </span>
          <h3 className="text-sm font-display italic text-foreground">{title}</h3>
        </div>
        {ok ? (
          <CheckCircle2 className="w-4 h-4 text-[color:var(--wireline-color-action-primary-default)] shrink-0" />
        ) : (
          <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />
        )}
      </div>
      <div className="text-xs text-muted leading-relaxed space-y-1">{children}</div>
      {href ? (
        <Link
          to={href}
          className="wl-label text-brand text-[var(--wireline-typography-overline-size)] hover:underline mt-auto touch-press inline-block"
        >
          Drill down →
        </Link>
      ) : null}
    </div>
  );
}

export default function FounderOperatingCockpit() {
  const [data, setData] = useState<CockpitPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await authFetch("/api/admin/operating-cockpit");
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Failed to load cockpit");
        if (!cancelled) setData(json);
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Load failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted text-sm py-4">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading operating cockpit…
      </div>
    );
  }

  if (error || !data?.ok) {
    return <p className="text-sm text-rose-600 py-2">{error ?? "Cockpit unavailable"}</p>;
  }

  const acquiringOk = data.acquiring.new_users_7d > 0 || data.acquiring.demo_calls_7d > 0;
  const activatingOk = data.activating.activation_rate_pct >= 20;
  const callsOk =
    data.calls_working.voice_healthy && data.calls_working.demo_canary_healthy !== false;
  const costsOk = data.costs_controlled.economics_at_risk_count === 0;
  const retainedOk =
    data.retained.trialing_expired_7d < 5 &&
    data.retained.zero_calls_14d < data.activating.activated_total;

  return (
    <section className="mb-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div>
          <p className="app-section-title mb-0.5">Operating cockpit</p>
          <p className="text-[var(--wireline-typography-caption-size)] text-muted">
            Launch readiness {data.launch_readiness.overall_score}% ·{" "}
            {data.launch_readiness.campaign_ready ? "Campaign ready" : "Not campaign ready"}
          </p>
        </div>
        {!data.launch_readiness.campaign_ready ? (
          <div className="flex items-center gap-2 text-[var(--wireline-typography-overline-size)] text-amber-800 bg-amber-500/10 border border-amber-500/25 rounded-full px-3 py-1.5">
            <AlertTriangle className="w-3.5 h-3.5" />
            {data.launch_readiness.launch_blockers.slice(0, 2).join(", ") ||
              "Check launch readiness"}
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
        <QuestionCard title="Acquiring?" icon={TrendingUp} ok={acquiringOk} href="/help">
          <p>{data.acquiring.new_users_7d} signups (7d)</p>
          <p>
            {data.acquiring.demo_calls_7d} demo calls · {data.acquiring.demo_signups_7d} converted
          </p>
        </QuestionCard>
        <QuestionCard title="Activating?" icon={Users} ok={activatingOk} href="/insights">
          <p>{data.activating.activation_rate_pct}% activation rate</p>
          <p>
            Median TTV{" "}
            {data.activating.median_time_to_activation_seconds != null
              ? `${Math.round(data.activating.median_time_to_activation_seconds / 60)}m`
              : "—"}
          </p>
        </QuestionCard>
        <QuestionCard
          title="Calls working?"
          icon={Phone}
          ok={callsOk}
          href="/insights?tab=reliability"
        >
          <p>Voice reliability {data.calls_working.voice_healthy ? "healthy" : "degraded"}</p>
          <p>
            Demo canary{" "}
            {data.calls_working.demo_canary_healthy == null
              ? "—"
              : data.calls_working.demo_canary_healthy
                ? "healthy"
                : "failing"}
          </p>
        </QuestionCard>
        <QuestionCard title="Costs controlled?" icon={Wallet} ok={costsOk}>
          <p>{data.costs_controlled.economics_at_risk_count} tenants at margin risk</p>
        </QuestionCard>
        <QuestionCard title="Retained?" icon={Users} ok={retainedOk}>
          <p>{data.retained.trialing_expired_7d} trials expired (7d)</p>
          <p>{data.retained.zero_calls_14d} tenants with zero calls (14d)</p>
        </QuestionCard>
      </div>

      <div className="flex flex-wrap gap-2">
        <MetricStatTile
          label="Demo recaps (7d)"
          value={data.acquiring.demo_recaps_7d}
          tone="brand"
        />
        <MetricStatTile
          label="Activated (7d)"
          value={data.activating.activated_last_7d}
          tone="ink"
        />
        <MetricStatTile
          label="Stuck activated"
          value={data.retained.activated_not_paying}
          tone={data.retained.activated_not_paying > 0 ? "rose" : "muted"}
        />
        <ShadButton type="button" variant="outline" size="sm" disableAnimations asChild>
          <Link to="/admin?tab=cockpit">Launch checklist</Link>
        </ShadButton>
      </div>
    </section>
  );
}
