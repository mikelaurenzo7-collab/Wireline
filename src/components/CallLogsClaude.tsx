import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Download, Phone, RefreshCw } from "lucide-react";

import { authFetch } from "../lib/api";
import { formatPhone } from "../lib/safe-number";
import { Button, EmptyState, Skeleton } from "./atoms";
import OutboundDialDialog from "./OutboundDialDialog";
import { StatusNotice } from "./molecules";

type Call = {
  id: string;
  agent_id?: string | null;
  agent_name?: string | null;
  direction?: string | null;
  customer_number?: string | null;
  duration_seconds?: number | null;
  summary?: string | null;
  transcript?: string | null;
  recording_url?: string | null;
  sentiment?: string | null;
  outcome_tag?: string | null;
  intent_label?: string | null;
  lead_score?: number | null;
  qa_score?: number | null;
  coaching_note?: string | null;
  demo?: boolean | null;
  created_at?: string | null;
};

type CallsResponse = {
  calls?: Call[];
  total?: number;
  hasMore?: boolean;
};

function formatDuration(seconds: number | null | undefined): string {
  if (!seconds || seconds < 0) return "";
  const minutes = Math.floor(seconds / 60);
  const rest = Math.floor(seconds % 60);
  return minutes > 0 ? `${minutes}m ${rest}s` : `${rest}s`;
}

function formatTime(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function humanize(value: string | null | undefined, fallback = "Completed") {
  const text = value?.trim();
  if (!text || /^(unknown|other)$/i.test(text)) return fallback;
  return text
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function statusTone(value: string | null | undefined) {
  const normalized = String(value || "").toLowerCase();
  if (/booked|qualified|success|completed/.test(normalized)) return "text-[var(--wireline-color-status-success)]";
  if (/failed|busy|unreachable|voicemail|escalat|handoff|transfer/.test(normalized)) return "text-[var(--wireline-color-status-warning)]";
  return "text-muted-foreground";
}

export default function CallLogsClaude({ agentId }: { agentId?: string | null }) {
  const [calls, setCalls] = useState<Call[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showOutboundDial, setShowOutboundDial] = useState(false);

  const loadCalls = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams({ limit: "100", offset: "0" });
      if (agentId) query.set("agent_id", agentId);
      const response = await authFetch(`/api/calls?${query.toString()}`);
      if (!response.ok) throw new Error("Could not load calls.");
      const body = (await response.json()) as CallsResponse;
      const nextCalls = Array.isArray(body.calls) ? body.calls : [];
      setCalls(nextCalls);
      setSelectedId((current) =>
        current && nextCalls.some((call) => call.id === current) ? current : null,
      );
    } catch (reason) {
      setCalls([]);
      setError(reason instanceof Error ? reason.message : "Could not load calls.");
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    setSelectedId(null);
    void loadCalls();
  }, [loadCalls]);

  const selected = useMemo(
    () => calls.find((call) => call.id === selectedId) || null,
    [calls, selectedId],
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5 sm:px-5">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">History</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {agentId ? "This Bot" : `${calls.length} calls`}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <Button type="button" variant="ghost" size="sm" onClick={() => void loadCalls()} disabled={loading} aria-label="Refresh calls">
            <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} aria-hidden="true" />
          </Button>
          <a
            href="/api/export/calls.csv"
            download
            aria-label="Export calls as CSV"
            className="inline-flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Download className="size-4" aria-hidden="true" />
          </a>
          <Button type="button" size="sm" onClick={() => setShowOutboundDial(true)}>
            <Phone className="size-4" aria-hidden="true" />
            Dial
          </Button>
        </div>
      </div>

      {error ? (
        <StatusNotice tone="destructive" title="Call history unavailable" className="m-3 sm:m-4">
          {error}
        </StatusNotice>
      ) : null}

      <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(18rem,0.8fr)_minmax(0,1.2fr)]">
        <section
          className={`${selected ? "hidden lg:block" : "block"} min-h-0 overflow-y-auto border-r border-border`}
          aria-label="Calls"
        >
          {loading && !calls.length ? (
            <div className="space-y-1 p-3" aria-busy="true">
              {Array.from({ length: 6 }, (_, index) => (
                <div key={index} className="rounded-xl border border-border p-3">
                  <Skeleton shape="text" className="h-4 w-32" />
                  <Skeleton shape="text" className="mt-2 h-3 w-20" />
                </div>
              ))}
            </div>
          ) : !calls.length && !error ? (
            <EmptyState
              icon={<Phone className="size-5" aria-hidden="true" />}
              title={agentId ? "No calls for this Bot" : "No calls yet"}
              density="compact"
              action={
                <Button type="button" size="sm" onClick={() => setShowOutboundDial(true)}>
                  Dial
                </Button>
              }
            />
          ) : (
            <ul className="divide-y divide-border">
              {calls.map((call) => {
                const active = call.id === selectedId;
                const meta = [call.agent_name, formatDuration(call.duration_seconds)]
                  .filter(Boolean)
                  .join(" · ");
                return (
                  <li key={call.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(call.id)}
                      aria-pressed={active}
                      className={`w-full px-4 py-3.5 text-left transition-colors ${
                        active ? "bg-primary/7" : "hover:bg-muted/45"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <strong className="block truncate font-mono text-sm font-semibold text-foreground">
                            {formatPhone(call.customer_number, "Unknown caller")}
                          </strong>
                          <span className="mt-1 block truncate text-xs text-muted-foreground">
                            {meta || humanize(call.direction, "Call")}
                          </span>
                        </div>
                        <div className="shrink-0 text-right">
                          <span className="block text-[10px] text-muted-foreground">{formatTime(call.created_at)}</span>
                          <span className={`mt-1 block text-[10px] font-semibold ${statusTone(call.outcome_tag)}`}>
                            {humanize(call.outcome_tag)}
                          </span>
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className={`${selected ? "block" : "hidden lg:block"} min-h-0 overflow-y-auto`} aria-label="Call report">
          {!selected ? (
            <EmptyState title="Select a call" density="compact" />
          ) : (
            <div className="mx-auto w-full max-w-3xl p-4 sm:p-6">
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-primary lg:hidden"
              >
                <ArrowLeft className="size-4" aria-hidden="true" />
                Calls
              </button>

              <header className="border-b border-border pb-4">
                <p className="text-xs font-semibold text-primary">Call report</p>
                <h3 className="mt-1 font-mono text-xl font-semibold text-foreground">
                  {formatPhone(selected.customer_number, "Unknown caller")}
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  {[selected.agent_name, formatTime(selected.created_at), formatDuration(selected.duration_seconds)]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </header>

              <div className="space-y-5 py-5">
                <section>
                  <h4 className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Summary</h4>
                  <p className="mt-2 text-sm leading-6 text-foreground">
                    {selected.summary || "No summary is available for this call yet."}
                  </p>
                </section>

                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {[
                    ["Outcome", humanize(selected.outcome_tag)],
                    ["Intent", humanize(selected.intent_label, "Unclassified")],
                    ["Lead", typeof selected.lead_score === "number" ? String(selected.lead_score) : "—"],
                    ["Quality", typeof selected.qa_score === "number" ? String(selected.qa_score) : "—"],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-xl border border-border bg-card p-3">
                      <span className="block text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{label}</span>
                      <strong className="mt-1.5 block truncate text-sm font-semibold text-foreground">{value}</strong>
                    </div>
                  ))}
                </div>

                {selected.coaching_note ? (
                  <section>
                    <h4 className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Follow-up</h4>
                    <p className="mt-2 text-sm leading-6 text-foreground">{selected.coaching_note}</p>
                  </section>
                ) : null}

                {selected.transcript ? (
                  <details className="rounded-xl border border-border bg-card">
                    <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-foreground">Transcript</summary>
                    <div className="border-t border-border px-4 py-4 text-sm leading-6 text-muted-foreground whitespace-pre-wrap">
                      {selected.transcript}
                    </div>
                  </details>
                ) : null}

                {selected.recording_url ? (
                  <Button asChild variant="secondary" size="sm">
                    <a href={selected.recording_url} target="_blank" rel="noreferrer">Recording</a>
                  </Button>
                ) : null}
              </div>
            </div>
          )}
        </section>
      </div>

      <OutboundDialDialog open={showOutboundDial} onClose={() => setShowOutboundDial(false)} />
    </div>
  );
}
