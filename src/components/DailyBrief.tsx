import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowRight, Loader2, Phone, Sparkles } from "lucide-react";

import { authFetch } from "../lib/api";
import type { CallLog } from "../types/api";

type DigestState =
  | { status: "loading" }
  | { status: "ready"; logs: CallLog[] }
  | { status: "unavailable" };

const INTENT_LABELS: Record<NonNullable<CallLog["intent_label"]>, string> = {
  low: "Low intent",
  medium: "Medium intent",
  high: "High intent",
  escalation: "Escalation",
};

function localDateKey(value: Date) {
  if (Number.isNaN(value.getTime())) return "";
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function timeLabel(value?: string | null) {
  if (!value) return "Logged";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Logged";
  return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function callDateKey(value?: string | null) {
  return value ? localDateKey(new Date(value)) : "";
}

function callTitle(call: CallLog) {
  const summary = call.summary?.trim();
  if (summary) return summary;
  if (call.intent_label) return INTENT_LABELS[call.intent_label];
  return call.customer_number || "Call logged";
}

function callDetail(call: CallLog) {
  const agent = call.agent_name?.trim();
  const direction = call.direction === "outbound" ? "Outbound" : "Inbound";
  return [agent, direction, timeLabel(call.created_at)].filter(Boolean).join(" · ");
}

export default function DailyBrief() {
  const [state, setState] = useState<DigestState>({ status: "loading" });
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadDigest() {
      try {
        const response = await authFetch("/api/dashboard/stats");
        if (!response.ok) throw new Error("Dashboard stats unavailable");
        const payload = await response.json();
        const logs = Array.isArray(payload?.recentLogs) ? (payload.recentLogs as CallLog[]) : [];
        if (!cancelled && mountedRef.current) setState({ status: "ready", logs: logs.slice(0, 6) });
      } catch {
        if (!cancelled && mountedRef.current) setState({ status: "unavailable" });
      }
    }

    void loadDigest();
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === "unavailable") return null;

  const logs = state.status === "ready" ? state.logs : [];
  const today = localDateKey(new Date());
  const todaysCalls = logs.filter((log) => callDateKey(log.created_at) === today);
  const latest = logs[0];
  const hasCalls = logs.length > 0;

  return (
    <section
      className="wl-paper wl-paper-elevated overflow-hidden p-5 sm:p-6"
      aria-label="Workspace pulse"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-2">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            Workspace pulse
          </p>
          <div className="flex items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-[12px] bg-primary/10 text-primary">
              <Sparkles aria-hidden="true" size={18} />
            </span>
            <div className="min-w-0">
              <h2 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
                {state.status === "loading"
                  ? "Reading the room…"
                  : hasCalls
                    ? todaysCalls.length > 0
                      ? `${todaysCalls.length} call${todaysCalls.length === 1 ? "" : "s"} today.`
                      : "Line is quiet today."
                    : "Ready for the first call."}
              </h2>
              <p className="mt-1 line-clamp-2 text-sm leading-6 text-muted-foreground">
                {state.status === "loading"
                  ? "Checking recent workspace activity."
                  : hasCalls
                    ? latest
                      ? callTitle(latest)
                      : "Recent activity is available in call history."
                    : "Create or activate an agent, then calls will roll into this pulse."}
              </p>
            </div>
          </div>
        </div>

        <Link
          to="/phone?tab=logs"
          className="inline-flex min-h-[40px] shrink-0 items-center justify-center gap-2 rounded-[var(--wireline-radius-pill)] border border-border bg-background/50 px-4 text-sm font-semibold text-foreground wl-focus-ring-halo hover:border-primary/40"
        >
          Open calls
          <ArrowRight aria-hidden="true" size={14} />
        </Link>
      </div>

      {state.status === "loading" ? (
        <div className="mt-5 flex items-center gap-2 rounded-[12px] border border-border bg-muted/25 px-4 py-3 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          Loading live workspace signal…
        </div>
      ) : hasCalls ? (
        <div className="mt-5 grid gap-2">
          {logs.slice(0, 3).map((call) => (
            <Link
              key={call.id}
              to="/phone?tab=logs"
              className="wl-data-row wl-data-row--divided group"
            >
              <span className="wl-data-row__leading" aria-hidden="true">
                <span className="grid size-7 place-items-center rounded-full bg-primary/10 text-primary">
                  <Phone size={13} />
                </span>
              </span>
              <span className="wl-data-row__main">
                <span className="wl-data-row__title wl-data-row__title--multiline">
                  {callTitle(call)}
                </span>
                <span className="wl-data-row__detail">{callDetail(call)}</span>
              </span>
              <span className="wl-data-row__trailing">
                <ArrowRight
                  className="size-3.5 opacity-0 transition-opacity group-hover:opacity-100"
                  aria-hidden="true"
                />
              </span>
            </Link>
          ))}
        </div>
      ) : (
        <div className="mt-5 rounded-[12px] border border-dashed border-border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>This panel only shows live workspace data.</span>
          </div>
        </div>
      )}
    </section>
  );
}
