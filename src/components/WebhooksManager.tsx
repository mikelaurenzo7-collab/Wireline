/* eslint-disable @typescript-eslint/no-explicit-any -- API response shapes vary by endpoint and aren't shared as client types yet. */
import { WL_APP_CLASSES } from "../lib/wireline-design-system";
import React, { useState, useEffect, useCallback } from "react";
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
import { useToast } from "../contexts/ToastContext";
import { cn } from "../lib/utils";
import { formatDateTime, formatTime } from "../lib/safe-date";
import { PanelSkeleton } from "./Skeleton";
import { Input } from "./ui/shadcn/Input";
import { EmptyState } from "./ui/EmptyState";
import { ShadButton } from "./ui/shadcn/ShadButton";

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
  "task.created": "Agent task created (follow-up, outreach, compliance, etc.)",
  "compliance.flagged": "Call flagged for human compliance review",
  knowledge_updated: "Training entry created, updated, or deleted",
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
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const { error: toastError } = useToast();

  const refresh = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const r = await authFetch("/api/webhooks");
      if (!r.ok) {
        const d = (await r.json().catch(() => null)) as { error?: string } | null;
        throw new Error(d?.error || "Couldn't load webhooks.");
      }
      const d = await r.json();
      setHooks(d.webhooks || []);
      setAvailableEvents(d.available_events || []);
    } catch (e) {
      setHooks([]);
      setAvailableEvents([]);
      const message = e instanceof Error ? e.message : "Couldn't load webhooks.";
      setLoadError(message);
      toastError("Webhooks unavailable", message);
    } finally {
      setLoading(false);
    }
  }, [toastError]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <div className={WL_APP_CLASSES.settingsPanel}>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className={WL_APP_CLASSES.settingsIcon}>
            <Webhook className="w-5 h-5" />
          </div>
          <h4 className="font-display text-2xl text-foreground leading-tight">Webhooks</h4>
        </div>
        <ShadButton
          type="button"
          variant={showForm ? "outline" : "editorial"}
          size="sm"
          disableAnimations
          onClick={() => setShowForm(!showForm)}
          className="!py-2.5 !px-5 !text-[length:var(--wireline-typography-overline-size)] !tracking-[0.3em] uppercase"
        >
          {showForm ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
          {showForm ? "Cancel" : "Add Webhook"}
        </ShadButton>
      </div>

      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
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

      <div className="space-y-2">
        {loading ? (
          <PanelSkeleton rows={3} />
        ) : loadError ? (
          <EmptyState
            icon={AlertTriangle}
            title="Couldn't load webhooks"
            description={loadError}
            actions={[{ label: "Retry", onClick: () => void refresh(), primary: true }]}
          />
        ) : hooks.length === 0 ? (
          <EmptyState
            icon={Webhook}
            title="No webhooks"
            actions={[{ label: "Add webhook", onClick: () => setShowForm(true), primary: true }]}
          />
        ) : (
          hooks.map((h) => <HookRow key={h.id} hook={h} onChanged={refresh} />)
        )}
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
      const d = await r.json().catch(() => ({}) as { error?: string });
      if (!r.ok) {
        throw new Error(
          d.error || `Failed to create webhook (HTTP ${r.status}). Check the URL and try again.`,
        );
      }
      onCreated();
    } catch (e: any) {
      setErr(e?.message || "Failed to create webhook. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-md bg-muted/10 border border-border p-5 space-y-4 mt-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="app-section-title">Name</label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Slack #sales channel"
            className="w-full h-11 px-3 rounded-md bg-muted/10 border border-border text-foreground text-sm outline-none focus:border-brand/60"
          />
        </div>
        <div className="space-y-1.5">
          <label className="app-section-title">URL</label>
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://hooks.slack.com/services/..."
            className="w-full h-11 px-3 rounded-md bg-muted/10 border border-border text-foreground text-sm font-mono outline-none focus:border-brand/60"
          />
        </div>
      </div>

      <div className="space-y-2">
        <label className="app-section-title">Events</label>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-1.5">
          {events.map((e) => {
            const on = picked.has(e);
            return (
              <ShadButton
                key={e}
                type="button"
                variant={on ? "default" : "outline"}
                disableAnimations
                onClick={() =>
                  setPicked((s) => {
                    const ns = new Set(s);
                    if (ns.has(e)) ns.delete(e);
                    else ns.add(e);
                    return ns;
                  })
                }
                className={cn(
                  "h-auto w-full text-left rounded-md p-2.5 flex items-start gap-2 whitespace-normal",
                  on
                    ? "bg-brand/10 border-brand/40"
                    : "bg-muted/20 border-border hover:border-border/60",
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
                  <div className="text-xs font-mono text-foreground/90">{e}</div>
                  <div className="wl-micro-meta opacity-90 leading-snug">
                    {EVENT_DESCRIPTIONS[e]}
                  </div>
                </div>
              </ShadButton>
            );
          })}
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="app-section-title">
          Signing Secret{" "}
          <span className="text-muted/70">
            (optional — when set, body is signed as X-Wireline-Signature: sha256=&lt;hex&gt;)
          </span>
        </label>
        <Input
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          placeholder="long-random-string-only-you-and-the-receiver-know"
          className="w-full h-11 px-3 rounded-md bg-muted/10 border border-border text-foreground text-sm font-mono outline-none focus:border-brand/60"
        />
      </div>

      {err && (
        <div
          role="alert"
          className="rounded-md bg-rose-500/10 border border-rose-500/30 p-3 text-rose-500 text-xs flex items-center gap-2"
        >
          <AlertTriangle className="w-3.5 h-3.5" />
          {err}
        </div>
      )}
      <ShadButton
        type="button"
        variant="editorial"
        disableAnimations
        onClick={submit}
        disabled={busy || !name || !url || picked.size === 0}
        className="w-full !py-3 !text-[length:var(--wireline-typography-overline-size)] !tracking-[0.3em] uppercase"
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
      </ShadButton>
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
  const { success: toastSuccess, error: toastError } = useToast();
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
      const res = await authFetch(`/api/webhooks/deliveries/${id}/retry`, { method: "POST" });
      if (!res.ok) throw new Error(`Retry failed (${res.status})`);
      // Give the inline attempt a moment, then refresh.
      setTimeout(() => loadDeliveries(), 600);
    } catch (e) {
      toastError("Retry failed", e instanceof Error ? e.message : "Please try again.");
    } finally {
      setDeliveryBusy(null);
    }
  };

  const discardDelivery = async (id: number) => {
    setDeliveryBusy(id);
    try {
      const res = await authFetch(`/api/webhooks/deliveries/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`Discard failed (${res.status})`);
      setDeliveries((prev) => (prev ? prev.filter((d) => d.id !== id) : prev));
    } catch (e) {
      toastError("Couldn't discard delivery", e instanceof Error ? e.message : "Please try again.");
    } finally {
      setDeliveryBusy(null);
    }
  };

  const test = async () => {
    setBusy("test");
    try {
      const res = await authFetch(`/api/webhooks/${hook.id}/test`, { method: "POST" });
      if (!res.ok) throw new Error(`Test failed (${res.status})`);
      toastSuccess("Test event sent", "Check the delivery log for the result.");
      onChanged();
      if (showDeliveries) setTimeout(() => loadDeliveries(), 600);
    } catch (e) {
      toastError("Test failed", e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy(null);
    }
  };
  const remove = async () => {
    setBusy("delete");
    try {
      const res = await authFetch(`/api/webhooks/${hook.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`Delete failed (${res.status})`);
      toastSuccess("Webhook deleted", `“${hook.name}” was removed.`);
      onChanged();
    } catch (e) {
      toastError("Couldn't delete webhook", e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy(null);
    }
  };
  const toggleActive = async () => {
    const next = !hook.active;
    try {
      const res = await authFetch(`/api/webhooks/${hook.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: next }),
      });
      if (!res.ok) throw new Error(`Update failed (${res.status})`);
      toastSuccess(next ? "Webhook enabled" : "Webhook paused", `“${hook.name}” updated.`);
      onChanged();
    } catch (e) {
      toastError("Couldn't update webhook", e instanceof Error ? e.message : "Please try again.");
    }
  };

  return (
    <div className={cn(WL_APP_CLASSES.settingsRow, hook.active ? "opacity-100" : "opacity-60")}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
            <span className="font-medium text-foreground">{hook.name}</span>
            <ShadButton
              type="button"
              variant="ghost"
              size="sm"
              disableAnimations
              onClick={toggleActive}
              className={cn(
                "h-auto px-2 py-0.5 rounded-full wl-label border",
                hook.active ? WL_APP_CLASSES.statusActive : "bg-muted/15 text-muted border-border",
              )}
            >
              {hook.active ? "Active" : "Paused"}
            </ShadButton>
            {hook.last_status !== null && (
              <span
                className={cn(
                  "px-2 py-0.5 rounded-full wl-label border flex items-center gap-1",
                  hook.last_status >= 200 && hook.last_status < 300
                    ? WL_APP_CLASSES.statusOk
                    : "bg-destructive/10 text-destructive border-destructive/20",
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
          <div className="text-xs font-mono text-foreground/70 truncate">{hook.url}</div>
          <div className="flex items-center gap-2 flex-wrap mt-2">
            {hook.events.map((e) => (
              <span
                key={e}
                className="px-1.5 py-0.5 rounded wl-label bg-brand/10 text-brand border border-brand/20 font-mono"
              >
                {e}
              </span>
            ))}
          </div>
          {hook.last_triggered_at && (
            <div className="wl-label-muted mt-2 flex items-center gap-2">
              <span>Last fired: {formatDateTime(hook.last_triggered_at)}</span>
              {hook.delivery_count !== null && hook.delivery_count > 0 && (
                <span>· {hook.delivery_count} deliveries</span>
              )}
              {hook.last_error && <span className="text-rose-500">· {hook.last_error}</span>}
            </div>
          )}
          {hook.secret_last_four && (
            <div className="flex items-center gap-2 mt-2 wl-micro-meta--muted">
              <span className="uppercase tracking-[0.3em]">Secret</span>
              <code className="font-mono text-foreground/70">
                {"•".repeat(12)}
                {hook.secret_last_four}
              </code>
              <span className="uppercase tracking-[0.3em] text-muted/70">· last 4</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <ShadButton
            type="button"
            variant={showDeliveries ? "secondary" : "outline"}
            size="sm"
            disableAnimations
            onClick={toggleDeliveries}
            className={cn(
              "rounded-full wl-label",
              showDeliveries && "bg-brand/15 border-brand/40 text-brand",
            )}
          >
            <History className="w-3 h-3" /> Deliveries
            <ChevronDown
              className={cn("w-3 h-3 transition-transform", showDeliveries && "rotate-180")}
            />
          </ShadButton>
          <ShadButton
            type="button"
            variant="outline"
            size="sm"
            disableAnimations
            onClick={test}
            disabled={busy !== null}
            className="rounded-full wl-label hover:border-brand/40 hover:text-brand"
          >
            {busy === "test" ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Send className="w-3 h-3" />
            )}
            Test
          </ShadButton>
          {confirmDelete ? (
            <>
              <ShadButton
                type="button"
                variant="destructive"
                size="sm"
                disableAnimations
                onClick={remove}
                disabled={busy !== null}
                className="rounded-full wl-label"
              >
                {busy === "delete" ? <Loader2 className="w-3 h-3 animate-spin" /> : "Confirm"}
              </ShadButton>
              <ShadButton
                type="button"
                variant="outline"
                size="sm"
                disableAnimations
                onClick={() => setConfirmDelete(false)}
                className="rounded-full wl-label"
              >
                Cancel
              </ShadButton>
            </>
          ) : (
            <ShadButton
              type="button"
              variant="outline"
              size="icon"
              disableAnimations
              onClick={() => setConfirmDelete(true)}
              className="w-8 h-8 rounded-full hover:border-rose-500/40 hover:text-rose-500"
              aria-label="Delete webhook"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </ShadButton>
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
                <div className="wl-label-muted">Recent deliveries</div>
                <ShadButton
                  type="button"
                  variant="ghost"
                  size="sm"
                  disableAnimations
                  onClick={loadDeliveries}
                  disabled={loadingDeliveries}
                  className="wl-label-muted hover:text-foreground"
                >
                  {loadingDeliveries ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <RotateCcw className="w-3 h-3" />
                  )}
                  Refresh
                </ShadButton>
              </div>
              {loadingDeliveries && !deliveries && (
                <div className="wl-micro-meta--muted italic py-3">Loading deliveries…</div>
              )}
              {deliveries && deliveries.length === 0 && (
                <div className="wl-micro-meta opacity-90 italic py-3">
                  No deliveries yet. Run Test, or trigger an event.
                </div>
              )}
              <div className="space-y-1.5">
                {(deliveries || []).map((d) => {
                  const isSuccess = d.status === "success";
                  const isDead = d.status === "dead";
                  const pillClass = isSuccess
                    ? WL_APP_CLASSES.statusOk
                    : isDead
                      ? WL_APP_CLASSES.statusDead
                      : WL_APP_CLASSES.statusPending;
                  return (
                    <div
                      key={d.id}
                      className="rounded-md bg-black/20 border border-white/5 px-3 py-2 flex items-center gap-3 flex-wrap text-[length:var(--wireline-typography-overline-size)]"
                    >
                      <span
                        className={cn(
                          "px-1.5 py-0.5 rounded wl-label border flex items-center gap-1",
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
                      <span className="font-mono text-foreground/80">{d.event}</span>
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
                          <ShadButton
                            type="button"
                            variant="outline"
                            size="sm"
                            disableAnimations
                            onClick={() => retryDelivery(d.id)}
                            disabled={deliveryBusy === d.id}
                            className="h-auto px-2 py-0.5 rounded wl-label bg-brand/15 border-brand/40 text-brand hover:bg-brand/25"
                          >
                            {deliveryBusy === d.id ? (
                              <Loader2 className="w-2.5 h-2.5 animate-spin" />
                            ) : (
                              <RotateCcw className="w-2.5 h-2.5" />
                            )}
                            Retry
                          </ShadButton>
                        )}
                        <ShadButton
                          type="button"
                          variant="outline"
                          size="icon"
                          disableAnimations
                          onClick={() => discardDelivery(d.id)}
                          disabled={deliveryBusy === d.id}
                          className="w-6 h-6 hover:border-rose-500/40 hover:text-rose-400"
                          title="Discard"
                          aria-label="Discard delivery"
                        >
                          <Trash2 className="w-2.5 h-2.5" />
                        </ShadButton>
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
