import { useEffect, useState } from "react";
import { MessageSquareText, ShieldCheck } from "lucide-react";
import { Link } from "react-router";
import LiveVoiceSandbox from "./LiveVoiceSandbox";
import WirelineLiveVoiceProfile from "./WirelineLiveVoiceProfile";
import { authFetch } from "../lib/api";

type SimulationAllowanceStatus = {
  month_to_date_usd: number;
  monthly_limit_usd: number;
  percent_used: number;
  warn_threshold_pct: number;
  hard_capped_now: boolean;
  simulation_allowance_enabled: boolean;
};

/**
 * Free Builder's simulation allowance meter. plan-catalog.ts names silent
 * mid-training depletion "the likeliest place a converting prospect churns" —
 * this makes the allowance visible before it runs out, warns near the
 * threshold, and gives the depleted state a plan path instead of a dead mic.
 * Renders nothing for paid tenants (their guard scope is not the simulation
 * allowance) and nothing while unknown, so it can never block testing.
 */
function SimulationAllowanceMeter() {
  const [status, setStatus] = useState<SimulationAllowanceStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    void authFetch("/api/spend/status")
      .then((response) => (response.ok ? response.json() : null))
      .then((body: SimulationAllowanceStatus | null) => {
        if (!cancelled && body?.simulation_allowance_enabled) setStatus(body);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  if (!status || !(status.monthly_limit_usd > 0)) return null;

  const percent = Math.max(0, Math.min(100, status.percent_used));
  const nearLimit = !status.hard_capped_now && percent >= status.warn_threshold_pct;

  return (
    <div
      className="rounded-xl border border-border bg-secondary px-4 py-3"
      data-testid="simulation-allowance-meter"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[length:var(--wireline-typography-caption-size)] font-semibold text-foreground">
          Private simulation allowance
        </p>
        <p className="font-mono text-[length:var(--wireline-typography-caption-size)] tabular-nums text-muted-foreground">
          ${status.month_to_date_usd.toFixed(2)} of ${status.monthly_limit_usd.toFixed(2)} used
        </p>
      </div>
      <div
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-label="Simulation allowance used"
        aria-valuenow={Math.round(percent)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={`h-full rounded-full transition-[width] duration-300 ${
            status.hard_capped_now
              ? "bg-destructive"
              : nearLimit
                ? "bg-[var(--wireline-color-feedback-warning-icon,#eab308)]"
                : "bg-primary"
          }`}
          style={{ width: `${percent}%` }}
        />
      </div>
      {status.hard_capped_now ? (
        <p className="mt-2 text-[length:var(--wireline-typography-caption-size)] leading-5 text-muted-foreground">
          This month's included simulation is used.{" "}
          <Link
            to="/settings/billing"
            className="font-semibold text-primary underline underline-offset-4"
          >
            Choose a plan
          </Link>{" "}
          to keep testing and go live.
        </p>
      ) : nearLimit ? (
        <p className="mt-2 text-[length:var(--wireline-typography-caption-size)] leading-5 text-muted-foreground">
          Running low — a paid plan removes the simulation ceiling and adds a live number.
        </p>
      ) : null}
    </div>
  );
}

export default function RoleplaySandbox({
  agentId,
  agentName = "your agent",
  onTestStarted,
  onTestCompleted,
}: {
  agentId: string;
  agentName?: string;
  onTestStarted?: () => void;
  onTestCompleted?: () => void;
}) {
  return (
    <div className="space-y-4">
      <WirelineLiveVoiceProfile agentId={agentId} />
      <LiveVoiceSandbox
        agentId={agentId}
        agentName={agentName}
        onTestStarted={onTestStarted}
        onTestCompleted={onTestCompleted}
      />
      <SimulationAllowanceMeter />
      <div className="grid gap-3 rounded-xl border border-border bg-secondary p-4 sm:grid-cols-2">
        <div className="flex gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-border bg-card text-primary">
            <MessageSquareText size={17} />
          </span>
          <div>
            <p className="text-[length:var(--wireline-typography-caption-size)] font-semibold text-foreground">
              Test realistic interruptions
            </p>
            <p className="mt-1 text-[length:var(--wireline-typography-caption-size)] leading-5 text-muted-foreground">
              Talk naturally, pause, change your mind, and interrupt the agent while it is speaking.
            </p>
          </div>
        </div>
        <div className="flex gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-border bg-card text-primary">
            <ShieldCheck size={17} />
          </span>
          <div>
            <p className="text-[length:var(--wireline-typography-caption-size)] font-semibold text-foreground">
              Safe test channel
            </p>
            <p className="mt-1 text-[length:var(--wireline-typography-caption-size)] leading-5 text-muted-foreground">
              Live testing may search approved Training context but cannot send, book, transfer, or
              change outside systems.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
