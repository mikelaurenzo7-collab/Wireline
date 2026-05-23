/* eslint-disable @typescript-eslint/no-explicit-any -- API response shapes vary by endpoint and aren't shared as client types yet. */
import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Webhook,
  Plus,
  Loader2,
  Check,
  X,
  Trash2,
  Send,
  AlertTriangle,
  CircleAlert,
  CheckCircle2,
  Sparkles,
  History,
  ChevronDown,
  RotateCcw,
  Skull,
} from "lucide-react";
import { authFetch } from "../lib/api";
import { cn } from "../lib/utils";
import { formatDateTime, formatTime } from "../lib/safe-date";
import { PanelSkeleton } from "./Skeleton";

interface WebhookRow {
  id: string;
  name: string;
  url: string;
  events: string[];
  /** Trailing 4 chars of the signing secret; full secret is never returned by the API. */
  secret_last_four: string | null;
  active: boolean;
  last_triggered_at: string | null;
  last_status: number | null;
  last_error: string | null;
  delivery_count: number | null;
  created_at: string;
}

const EVENT_DESCRIPTIONS: Record<string, string> = {
  "call.completed":
    "After each voice call — includes lead scores, extracted data, and CRM-ready payload",
  "call.escalated": "Call flagged as angry or requiring human escalation",
  "lead.received": "New lead pushed via your inbound intake API key",
  "lead.hot": "Lead score crossed 70 — high intent detected",
  "email.received": "Inbound email synced from a connected Gmail or Outlook account",
  "appointment.booked": "New appointment booked by an agent or via API",
  "slack.message_sent":
    "A notification was posted to your connected Slack workspace (includes booking alerts when configured)",
  "task.created": "Fleet task created (follow-up, outreach, compliance, etc.)",
  "compliance.flagged": "Call flagged for human compliance review",
  knowledge_updated: "Knowledge base entry created, updated, or deleted",
  "spend.warning": "Month-to-date AI spend crossed your warning threshold",
  "spend.exceeded": "Month-to-date AI spend hit 100% of monthly limit",
  "subscription.changed": "Subscription status, plan, or renewal date changed",
  "slo.jobs.critical": "Job queue backlog exceeded critical threshold (>200 pending)",
  "slo.webhooks.degraded": "Webhook delivery success rate dropped below target",
  "slo.enrichment.dead": "Post-call enrichment jobs reached dead-letter status",
};

export default function WebhooksManager() {
  const [hooks, setHooks] = useState<WebhookRow[]>([]);
  const [availableEvents, setAvailableEvents] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const r = await authFetch("/api/webhooks");
      const d = await r.json();
      setHooks(d.webhooks || []);
      setAvailableEvents(d.available_events || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  return (
    <div className="relative aurora-ring rounded-2xl mt-8">
      <div className="relative rounded-2xl glass border border-white/10 p-6 space-y-5 overflow-hidden">
        <div
          className="absolute -top-12 -right-12 w-40 h-40 rounded-full opacity-25 blur-3xl pointer-events-none"
          style={{ background: "radial-gradient(circle, #10B981, transparent)" }}
        />

        <div className="relative z-10 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: "linear-gradient(135deg, #10B981, #4F1E7B)" }}
            >
              <Webhook className="w-5 h-5 text-paper" />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-[0.4em] text-brand">
                Outbound Webhooks
              </div>
              <h4 className="font-display italic text-2xl text-ink leading-tight mt-1">
                Push events anywhere
              </h4>
              <p className="text-[11px] text-ink/55 mt-1">
                Connect Wireline to Slack, Discord, your CRM, Zapier, n8n, or any HTTPS endpoint.
                Signed with HMAC-SHA256.
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            className="brutal-btn !py-2.5 !px-5 !text-[11px] !tracking-[0.3em]"
          >
            {showForm ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
            {showForm ? "Cancel" : "Add Webhook"}
          </button>
        </div>

        <AnimatePresence>
          {showForm && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="relative z-10 overflow-hidden"
            >
              <CreateForm
                events={availableEvents}
                onCreated={() => {
                  setShowForm(false);
                  refresh();
                }}
              />
            </motion.div>
          )}
        </AnimatePresence>

        <div className="relative z-10 space-y-2">
          {loading ? (
            <PanelSkeleton rows={3} />
          ) : hooks.length === 0 ? (
            <div className="rounded-xl bg-black/20 border border-dashed border-white/10 p-6 text-center space-y-2">
              <Webhook className="w-8 h-8 text-muted/40 mx-auto" />
              <p className="text-[11px] uppercase tracking-[0.4em] text-muted">
                No webhooks configured
              </p>
              <p className="text-xs text-ink/55">
                Click <span className="text-brand">Add Webhook</span> to push events to Slack, CRM,
                or Zapier.
              </p>
            </div>
          ) : (
            hooks.map((h) => <HookRow key={h.id} hook={h} onChanged={refresh} />)
          )}
        </div>
      </div>
    </div>
  );
}

function CreateForm({ events, onCreated }: { events: string[]; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [secret, setSecret] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set(events));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await authFetch("/api/webhooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, url, events: [...picked], secret: secret || undefined }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      onCreated();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl bg-black/5 border border-black/10 p-5 space-y-4 mt-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-[10px] uppercase tracking-[0.4em] text-muted">Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Slack #sales channel"
            className="w-full h-11 px-3 rounded-lg bg-black/5 border border-black/10 text-ink text-sm outline-none focus:border-brand/60"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-[10px] uppercase tracking-[0.4em] text-muted">URL</label>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://hooks.slack.com/services/..."
            className="w-full h-11 px-3 rounded-lg bg-black/5 border border-black/10 text-ink text-sm font-mono outline-none focus:border-brand/60"
          />
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-[10px] uppercase tracking-[0.4em] text-muted">Events</label>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
          {events.map((e) => {
            const on = picked.has(e);
            return (
              <button
                key={e}
                type="button"
                onClick={() =>
                  setPicked((s) => {
                    const ns = new Set(s);
                    if (ns.has(e)) ns.delete(e);
                    else ns.add(e);
                    return ns;
                  })
                }
                className={cn(
                  "text-left rounded-lg p-2.5 border transition-all flex items-start gap-2",
                  on
                    ? "bg-brand/10 border-brand/40"
                    : "bg-black/20 border-white/8 hover:border-white/20",
                )}
              >
                <div
                  className={cn(
                    "shrink-0 w-4 h-4 rounded border-2 flex items-center justify-center mt-0.5 transition-all",
                    on ? "bg-brand border-brand text-on-brand" : "border-white/30",
                  )}
                >
                  {on && <Check className="w-2.5 h-2.5" strokeWidth={4} />}
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-mono text-ink/90">{e}</div>
                  <div className="text-[10px] text-ink/55 leading-snug">
                    {EVENT_DESCRIPTIONS[e]}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-[10px] uppercase tracking-[0.4em] text-muted">
          Signing Secret{" "}
          <span className="text-muted/60">
            (optional — when set, body is signed as X-Wireline-Signature: sha256=&lt;hex&gt;)
          </span>
        </label>
        <input
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          placeholder="long-random-string-only-you-and-the-receiver-know"
          className="w-full h-11 px-3 rounded-lg bg-black/5 border border-black/10 text-ink text-sm font-mono outline-none focus:border-brand/60"
        />
      </div>

      {err && (
        <div className="rounded-lg bg-rose-500/10 border border-rose-500/30 p-3 text-rose-500 text-xs flex items-center gap-2">
          <AlertTriangle className="w-3.5 h-3.5" />
          {err}
        </div>
      )}
      <button
        onClick={submit}
        disabled={busy || !name || !url || picked.size === 0}
        className="disabled:opacity-50 disabled:cursor-not-allowed brutal-btn w-full !py-3 !text-[11px] !tracking-[0.3em]"
      >
        {busy ? (
          <>
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving…
          </>
        ) : (
          <>
            <Sparkles className="w-3.5 h-3.5" /> Create Webhook
          </>
        )}
      </button>
    </div>
  );
}

interface DeliveryRow {
  id: number;
  event: string;
  attempts: number;
  max_attempts: number;
  status: "pending" | "success" | "dead";
  last_status_code: number | null;
  last_error: string | null;
  next_attempt_at: string | null;
  delivered_at: string | null;
  created_at: string;
}

const HookRow: React.FC<{ hook: WebhookRow; onChanged: () => void }> = ({ hook, onChanged }) => {
  const [busy, setBusy] = useState<"test" | "delete" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showDeliveries, setShowDeliveries] = useState(false);
  const [deliveries, setDeliveries] = useState<DeliveryRow[] | null>(null);
  const [loadingDeliveries, setLoadingDeliveries] = useState(false);
  const [deliveryBusy, setDeliveryBusy] = useState<number | null>(null);

  const loadDeliveries = async () => {
    setLoadingDeliveries(true);
    try {
      const r = await authFetch(`/api/webhooks/${hook.id}/deliveries`);
      const d = await r.json();
      setDeliveries(d.deliveries || []);
    } finally {
      setLoadingDeliveries(false);
    }
  };

  const toggleDeliveries = async () => {
    const next = !showDeliveries;
    setShowDeliveries(next);
    if (next && !deliveries) await loadDeliveries();
  };

  const retryDelivery = async (id: number) => {
    setDeliveryBusy(id);
    try {
      await authFetch(`/api/webhooks/deliveries/${id}/retry`, { method: "POST" });
      // Give the inline attempt a moment, then refresh.
      setTimeout(() => loadDeliveries(), 600);
    } finally {
      setDeliveryBusy(null);
    }
  };

  const discardDelivery = async (id: number) => {
    setDeliveryBusy(id);
    try {
      await authFetch(`/api/webhooks/deliveries/${id}`, { method: "DELETE" });
      setDeliveries((prev) => (prev ? prev.filter((d) => d.id !== id) : prev));
    } finally {
      setDeliveryBusy(null);
    }
  };

  const test = async () => {
    setBusy("test");
    try {
      await authFetch(`/api/webhooks/${hook.id}/test`, { method: "POST" });
      onChanged();
      if (showDeliveries) setTimeout(() => loadDeliveries(), 600);
    } finally {
      setBusy(null);
    }
  };
  const remove = async () => {
    setBusy("delete");
    try {
      await authFetch(`/api/webhooks/${hook.id}`, { method: "DELETE" });
      onChanged();
    } finally {
      setBusy(null);
    }
  };
  const toggleActive = async () => {
    await authFetch(`/api/webhooks/${hook.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !hook.active }),
    });
    onChanged();
  };

  return (
    <div
      className={cn(
        "rounded-xl glass border p-4 transition-all",
        hook.active ? "border-white/10" : "border-white/5 opacity-60",
      )}
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
            <span className="font-medium text-ink">{hook.name}</span>
            <button
              onClick={toggleActive}
              className={cn(
                "px-2 py-0.5 rounded-full text-[9px] uppercase tracking-[0.3em] border",
                hook.active
                  ? "bg-emerald-500/15 text-emerald-500 border-emerald-500/30"
                  : "bg-zinc-500/15 text-zinc-300 border-zinc-500/30",
              )}
            >
              {hook.active ? "Active" : "Paused"}
            </button>
            {hook.last_status !== null && (
              <span
                className={cn(
                  "px-2 py-0.5 rounded-full text-[9px] uppercase tracking-[0.3em] border flex items-center gap-1",
                  hook.last_status >= 200 && hook.last_status < 300
                    ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                    : "bg-rose-500/10 text-rose-500 border-rose-500/20",
                )}
              >
                {hook.last_status >= 200 && hook.last_status < 300 ? (
                  <CheckCircle2 className="w-2.5 h-2.5" />
                ) : (
                  <CircleAlert className="w-2.5 h-2.5" />
                )}
                {hook.last_status === 0 ? "ERR" : hook.last_status}
              </span>
            )}
          </div>
          <div className="text-xs font-mono text-ink/60 truncate">{hook.url}</div>
          <div className="flex items-center gap-2 flex-wrap mt-2">
            {hook.events.map((e) => (
              <span
                key={e}
                className="px-1.5 py-0.5 rounded text-[9px] uppercase tracking-[0.2em] bg-brand/10 text-brand border border-brand/20 font-mono"
              >
                {e}
              </span>
            ))}
          </div>
          {hook.last_triggered_at && (
            <div className="text-[10px] uppercase tracking-[0.3em] text-muted mt-2 flex items-center gap-2">
              <span>Last fired: {formatDateTime(hook.last_triggered_at)}</span>
              {hook.delivery_count !== null && hook.delivery_count > 0 && (
                <span>· {hook.delivery_count} deliveries</span>
              )}
              {hook.last_error && <span className="text-rose-500">· {hook.last_error}</span>}
            </div>
          )}
          {hook.secret_last_four && (
            <div className="flex items-center gap-2 mt-2 text-[10px] text-muted">
              <span className="uppercase tracking-[0.3em]">Secret</span>
              <code className="font-mono text-ink/70">
                {"•".repeat(12)}
                {hook.secret_last_four}
              </code>
              <span className="uppercase tracking-[0.3em] text-muted/60">· last 4</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={toggleDeliveries}
            className={cn(
              "px-3 py-1.5 rounded-full text-[10px] uppercase tracking-[0.3em] flex items-center gap-1.5 transition-all",
              showDeliveries
                ? "bg-brand-2/15 border border-brand-2/40 text-brand-2"
                : "glass border border-white/10 hover:border-brand-2/40 hover:text-brand-2",
            )}
          >
            <History className="w-3 h-3" /> Deliveries
            <ChevronDown
              className={cn("w-3 h-3 transition-transform", showDeliveries && "rotate-180")}
            />
          </button>
          <button
            onClick={test}
            disabled={busy !== null}
            className="px-3 py-1.5 rounded-full text-[10px] uppercase tracking-[0.3em] glass border border-white/10 hover:border-brand/40 hover:text-brand transition-all flex items-center gap-1.5 disabled:opacity-50"
          >
            {busy === "test" ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Send className="w-3 h-3" />
            )}
            Test
          </button>
          {confirmDelete ? (
            <>
              <button
                onClick={remove}
                disabled={busy !== null}
                className="disabled:opacity-50 disabled:cursor-not-allowed px-3 py-1.5 rounded-full text-[10px] uppercase tracking-[0.3em] bg-rose-500 text-on-brand hover:bg-rose-500/80 transition-all"
              >
                {busy === "delete" ? <Loader2 className="w-3 h-3 animate-spin" /> : "Confirm"}
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="px-3 py-1.5 rounded-full text-[10px] uppercase tracking-[0.3em] glass border border-white/10 hover:text-ink transition-all"
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="w-8 h-8 rounded-full glass border border-white/10 hover:border-rose-500/40 hover:text-rose-500 flex items-center justify-center transition-all"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      <AnimatePresence>
        {showDeliveries && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-4 pt-4 border-t border-white/10 space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-[10px] uppercase tracking-[0.3em] text-muted">
                  Recent deliveries
                </div>
                <button
                  onClick={loadDeliveries}
                  disabled={loadingDeliveries}
                  className="disabled:opacity-50 disabled:cursor-not-allowed text-[10px] uppercase tracking-[0.3em] text-muted hover:text-ink flex items-center gap-1.5"
                >
                  {loadingDeliveries ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <RotateCcw className="w-3 h-3" />
                  )}
                  Refresh
                </button>
              </div>
              {loadingDeliveries && !deliveries && (
                <div className="text-[10px] text-muted italic py-3">Loading deliveries…</div>
              )}
              {deliveries && deliveries.length === 0 && (
                <div className="text-[10px] text-ink/40 italic py-3">
                  No deliveries yet. Hit Test or trigger an event.
                </div>
              )}
              <div className="space-y-1.5">
                {(deliveries || []).map((d) => {
                  const isSuccess = d.status === "success";
                  const isDead = d.status === "dead";
                  const pillClass = isSuccess
                    ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                    : isDead
                      ? "bg-rose-500/15 text-rose-400 border-rose-500/30"
                      : "bg-amber-500/15 text-amber-400 border-amber-500/30";
                  return (
                    <div
                      key={d.id}
                      className="rounded-lg bg-black/20 border border-white/5 px-3 py-2 flex items-center gap-3 flex-wrap text-[11px]"
                    >
                      <span
                        className={cn(
                          "px-1.5 py-0.5 rounded text-[9px] uppercase tracking-[0.25em] border flex items-center gap-1",
                          pillClass,
                        )}
                      >
                        {isSuccess ? (
                          <CheckCircle2 className="w-2.5 h-2.5" />
                        ) : isDead ? (
                          <Skull className="w-2.5 h-2.5" />
                        ) : (
                          <Loader2 className="w-2.5 h-2.5 animate-spin" />
                        )}
                        {d.status}
                      </span>
                      <span className="font-mono text-ink/80">{d.event}</span>
                      <span className="text-muted">
                        try {d.attempts}/{d.max_attempts}
                      </span>
                      {d.last_status_code !== null && d.last_status_code > 0 && (
                        <span className="font-mono text-muted">HTTP {d.last_status_code}</span>
                      )}
                      <span className="text-muted">{formatDateTime(d.created_at)}</span>
                      {d.last_error && (
                        <span
                          className="text-rose-400/80 font-mono truncate max-w-[40ch]"
                          title={d.last_error}
                        >
                          {d.last_error}
                        </span>
                      )}
                      {d.next_attempt_at && d.status === "pending" && (
                        <span className="text-amber-400/80">
                          next {formatTime(d.next_attempt_at)}
                        </span>
                      )}
                      <div className="ml-auto flex items-center gap-1">
                        {!isSuccess && (
                          <button
                            onClick={() => retryDelivery(d.id)}
                            disabled={deliveryBusy === d.id}
                            className="px-2 py-0.5 rounded text-[9px] uppercase tracking-[0.25em] bg-brand/15 border border-brand/40 text-brand hover:bg-brand/25 flex items-center gap-1 disabled:opacity-50"
                          >
                            {deliveryBusy === d.id ? (
                              <Loader2 className="w-2.5 h-2.5 animate-spin" />
                            ) : (
                              <RotateCcw className="w-2.5 h-2.5" />
                            )}
                            Retry
                          </button>
                        )}
                        <button
                          onClick={() => discardDelivery(d.id)}
                          disabled={deliveryBusy === d.id}
                          className="disabled:opacity-50 disabled:cursor-not-allowed w-6 h-6 rounded glass border border-white/10 hover:border-rose-500/40 hover:text-rose-400 flex items-center justify-center"
                          title="Discard"
                        >
                          <Trash2 className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
