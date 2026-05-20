import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Radio, Users, PhoneCall, ShieldAlert, Loader2, Activity, Headphones } from "lucide-react";
import { authFetch } from "../lib/api";
import { cn } from "../lib/utils";
import PageShell, { Panel } from "./PageShell";
import { useToast } from "../contexts/ToastContext";

interface LiveCall {
  id: string;
  agent_id: string;
  customer_number: string;
  started_at: string;
  sentiment_label: string;
  urgency: number;
  status: "active" | "escalated";
}

interface Agent {
  id: string;
  name: string;
  role: string;
  channel: string;
}

/**
 * Supervisor Cockpit — call-center monitoring surface. Aggregates the
 * live monitor's call grid with per-agent availability, queue depth,
 * and SLA flags so a floor supervisor can scan the room at a glance.
 *
 * Mounted at /cockpit and gated to Business+ tiers in nav. For tonight
 * the "listen in" button is UI-only — actual WebRTC audio streaming
 * via Vapi's assistant API is a separate slice (logged as P3 risk).
 */
export default function SupervisorCockpit() {
  const { info } = useToast();
  const [calls, setCalls] = useState<LiveCall[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      try {
        const [presenceRes, agentsRes] = await Promise.all([
          authFetch("/api/fleet/presence").then((r) => r.json()),
          authFetch("/api/agents").then((r) => r.json()),
        ]);
        if (!alive) return;
        const signals = presenceRes.signals || [];
        setCalls(
          signals.map((s: any) => ({
            id: s.id,
            agent_id: s.agent_id || "",
            customer_number: s.customer_number || "",
            started_at: s.started_at || new Date().toISOString(),
            sentiment_label: s.label || "Connected",
            urgency: s.urgency || 0,
            status: s.status === "escalated" ? "escalated" : "active",
          })),
        );
        setAgents(agentsRes.agents || []);
      } catch {
        // best-effort, retry on next tick
      } finally {
        if (alive) setLoading(false);
      }
    };
    refresh();
    const t = setInterval(refresh, 5000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const busyAgentIds = new Set(calls.map((c) => c.agent_id).filter(Boolean));
  const availableAgents = agents.filter((a) => !busyAgentIds.has(a.id));
  const escalations = calls.filter((c) => c.status === "escalated");

  return (
    <PageShell
      eyebrow="Operations · Supervisor"
      title="Cockpit"
      subtitle="Live call floor — who's on what, where it's spicy, and what needs a human. Refreshes every 5 seconds."
      actions={
        <div className="inline-flex items-center gap-2 px-3 h-9 rounded-full glass border border-brand/30">
          <span className="w-2 h-2 rounded-full bg-brand animate-pulse" />
          <span className="text-[10px] uppercase tracking-[0.3em] text-brand">
            Live · {calls.length} active
          </span>
        </div>
      }
    >
      <div className="h-full grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 min-h-0">
        {/* Live calls — biggest column */}
        <div className="lg:col-span-2">
          <Panel title="Active Calls" hint={`${calls.length} on the floor`} icon={Radio} scroll>
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-5 h-5 animate-spin text-muted" />
              </div>
            ) : calls.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Activity className="w-8 h-8 text-muted/40 mb-3" />
                <p className="text-sm text-ink/80">Floor is quiet</p>
                <p className="text-[11px] text-muted/70 mt-1 max-w-xs">
                  Live calls appear here as agents pick up. SLA flags + sentiment update in real
                  time.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {calls.map((c) => {
                  const agent = agents.find((a) => a.id === c.agent_id);
                  return (
                    <motion.div
                      key={c.id}
                      initial={{ opacity: 0, scale: 0.97 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className={cn(
                        "rounded-xl p-3.5 border space-y-2",
                        c.status === "escalated"
                          ? "border-rose-500/40 bg-rose-500/5"
                          : "border-white/12 bg-white/[0.02]",
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <p className="font-mono text-sm text-ink">{c.customer_number}</p>
                        {c.status === "escalated" && (
                          <span className="text-[9px] uppercase tracking-[0.3em] text-rose-500 inline-flex items-center gap-1">
                            <ShieldAlert className="w-3 h-3" />
                            Escalated
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[9px] uppercase tracking-[0.25em] text-muted/70">
                          {agent?.name || "—"}
                        </span>
                        <span className="text-[9px] text-muted/50">·</span>
                        <span className="text-[9px] uppercase tracking-[0.25em] text-brand">
                          {c.sentiment_label}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-1.5">
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              const r = await authFetch("/api/supervisor/subscribe", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ callId: c.id, mode: "listen" }),
                              });
                              const d = await r.json();
                              info(
                                "Subscribed to call",
                                d?.message || "Bookmarked for live review.",
                              );
                            } catch {
                              info("Subscription failed", "Try again in a moment.");
                            }
                          }}
                          className="text-[10px] uppercase tracking-[0.24em] px-2 py-1.5 rounded-full glass border border-white/10 text-muted hover:text-brand hover:border-brand/40 transition-colors flex items-center justify-center gap-1.5"
                        >
                          <Headphones className="w-3 h-3" />
                          Listen
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              const r = await authFetch("/api/supervisor/subscribe", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ callId: c.id, mode: "whisper" }),
                              });
                              const d = await r.json();
                              info(
                                "Whisper coach queued",
                                d?.message || "Coaching intent captured for the agent.",
                              );
                            } catch {
                              info("Subscription failed", "Try again in a moment.");
                            }
                          }}
                          className="text-[10px] uppercase tracking-[0.24em] px-2 py-1.5 rounded-full glass border border-white/10 text-muted hover:text-violet-500 hover:border-violet-500/40 transition-colors flex items-center justify-center gap-1.5"
                        >
                          <Headphones className="w-3 h-3" />
                          Whisper
                        </button>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </Panel>
        </div>

        {/* Right rail — agent availability + escalations */}
        <div className="flex flex-col gap-3 min-h-0">
          <Panel title="Available Agents" hint={`${availableAgents.length} idle`} icon={Users}>
            {agents.length === 0 ? (
              <p className="text-[11px] text-muted py-3">
                No agents in this workspace yet — head to /agents to deploy one.
              </p>
            ) : (
              <div className="space-y-1.5 max-h-[280px] overflow-y-auto">
                {agents.map((a) => {
                  const busy = busyAgentIds.has(a.id);
                  return (
                    <div
                      key={a.id}
                      className={cn(
                        "flex items-center justify-between rounded-lg px-2.5 py-1.5 border",
                        busy ? "bg-brand/8 border-brand/30" : "bg-white/[0.02] border-white/10",
                      )}
                    >
                      <span className="text-sm text-ink truncate">{a.name}</span>
                      <span
                        className={cn(
                          "text-[9px] uppercase tracking-[0.3em]",
                          busy ? "text-brand" : "text-muted/70",
                        )}
                      >
                        {busy ? "On call" : "Idle"}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </Panel>

          <Panel title="Escalations" hint={`${escalations.length} pending`} icon={ShieldAlert}>
            {escalations.length === 0 ? (
              <p className="text-[11px] text-muted py-3">
                Nothing in escalation right now. Agents will flag urgent calls automatically via the
                escalate-to-human tool.
              </p>
            ) : (
              <div className="space-y-1.5">
                {escalations.map((e) => (
                  <div
                    key={e.id}
                    className="rounded-lg p-2.5 bg-rose-500/8 border border-rose-500/30"
                  >
                    <p className="font-mono text-sm text-ink">{e.customer_number}</p>
                    <p className="text-[10px] text-rose-500 mt-1">{e.sentiment_label}</p>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel title="Call Center" hint="HEALTH" icon={PhoneCall}>
            <div className="space-y-2 text-[11px]">
              <div className="flex justify-between">
                <span className="text-muted">Total agents</span>
                <span className="text-ink font-mono">{agents.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">On call</span>
                <span className="text-ink font-mono">{busyAgentIds.size}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Available</span>
                <span className="text-ink font-mono">{availableAgents.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Escalations</span>
                <span
                  className={cn("font-mono", escalations.length > 0 ? "text-rose-500" : "text-ink")}
                >
                  {escalations.length}
                </span>
              </div>
            </div>
          </Panel>
        </div>
      </div>
    </PageShell>
  );
}
