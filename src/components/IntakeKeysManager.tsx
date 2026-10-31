/* eslint-disable @typescript-eslint/no-explicit-any -- API response shapes vary by endpoint and aren't shared as client types yet. */
import { WL_APP_CLASSES } from "../lib/wireline-design-system";
import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  KeyRound,
  Plus,
  Loader2,
  X,
  Trash2,
  Copy,
  Check,
  Eye,
  EyeOff,
  Inbox,
  PhoneOutgoing,
  Zap,
} from "lucide-react";
import { authFetch, readApiJson } from "../lib/api";
import { cn } from "../lib/utils";
import { formatDateTime } from "../lib/safe-date";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/shadcn/Select";
import { Input } from "./ui/shadcn/Input";
import { ShadButton } from "./ui/shadcn/ShadButton";

interface IntakeKey {
  id: string;
  name: string;
  key_prefix: string;
  default_agent_id: string | null;
  auto_dial: boolean;
  active: boolean;
  last_used_at: string | null;
  use_count: number | null;
  created_at: string;
}

export default function IntakeKeysManager() {
  const [keys, setKeys] = useState<IntakeKey[]>([]);
  const [agents, setAgents] = useState<{ id: string; name: string }[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [defaultAgentId, setDefaultAgentId] = useState("");
  const [autoDial, setAutoDial] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [justCreated, setJustCreated] = useState<{ id: string; plaintext: string } | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [actionError, setActionError] = useState<{ id: string; message: string } | null>(null);
  const mutationPending = useRef(false);

  const refresh = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [keysRes, agentsRes] = await Promise.all([
        authFetch("/api/intake/keys"),
        authFetch("/api/agents"),
      ]);
      if (!keysRes.ok) {
        const body = (await keysRes.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error || "Couldn't load intake keys.");
      }
      const keysJson = await keysRes.json();
      const agentsJson = agentsRes.ok ? await agentsRes.json() : null;
      if (!Array.isArray(keysJson?.keys)) throw new Error("Couldn't load intake keys.");
      setKeys(keysJson.keys);
      setAgents(Array.isArray(agentsJson?.agents) ? agentsJson.agents : []);
      if (!agentsRes.ok) {
        setLoadError("Intake keys loaded, but agents could not be refreshed.");
      }
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Couldn't load intake keys.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const create = async () => {
    if (!name.trim()) return;
    setCreating(true);
    setCreateError(null);
    try {
      const r = await authFetch("/api/intake/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          default_agent_id: defaultAgentId || null,
          auto_dial: autoDial && !!defaultAgentId,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Create failed");
      setJustCreated({ id: d.key.id, plaintext: d.plaintext });
      setRevealed(true);
      setName("");
      setDefaultAgentId("");
      setAutoDial(false);
      setShowForm(false);
      refresh();
    } catch (e: any) {
      setCreateError(e?.message || "Create failed");
    } finally {
      setCreating(false);
    }
  };

  const updateKey = async (id: string, patch?: { active?: boolean; auto_dial?: boolean }) => {
    if (mutationPending.current || loading || creating) return;
    mutationPending.current = true;
    setPendingKey(id);
    setActionError(null);
    try {
      const response = await authFetch(`/api/intake/keys/${id}`, {
        method: patch ? "PATCH" : "DELETE",
        ...(patch && {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        }),
      });
      const result = await readApiJson<{ key?: IntakeKey; success?: boolean }>(response);
      if (!result.ok) throw new Error(result.error);
      if (patch) {
        const updated = result.data?.key;
        if (
          updated?.id !== id ||
          typeof updated.active !== "boolean" ||
          typeof updated.auto_dial !== "boolean"
        ) {
          throw new Error("Couldn't confirm the change. Try again.");
        }
        setKeys((current) => current.map((key) => (key.id === id ? updated : key)));
      } else {
        if (result.data?.success !== true) {
          throw new Error("Couldn't confirm deletion. Try again.");
        }
        setKeys((current) => current.filter((key) => key.id !== id));
        setConfirmDelete(null);
        if (justCreated?.id === id) setJustCreated(null);
      }
    } catch (error) {
      setActionError({
        id,
        message: error instanceof Error ? error.message : "Couldn't update this key. Try again.",
      });
    } finally {
      mutationPending.current = false;
      setPendingKey(null);
    }
  };

  const copyKey = async () => {
    if (!justCreated) return;
    try {
      await navigator.clipboard.writeText(justCreated.plaintext);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard API may be unavailable; user can copy manually */
    }
  };

  return (
    <div className={WL_APP_CLASSES.settingsPanel}>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className={WL_APP_CLASSES.settingsIcon}>
            <Inbox className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-base font-semibold text-foreground leading-tight">
              Lead Intake Keys
            </h4>
          </div>
        </div>
        <ShadButton
          type="button"
          variant={showForm ? "outline" : "editorial"}
          size="sm"
          disableAnimations
          disabled={pendingKey !== null || creating}
          onClick={() => {
            setShowForm(!showForm);
            setCreateError(null);
          }}
          className="!px-5 !py-2.5"
        >
          {showForm ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
          {showForm ? "Cancel" : "New Key"}
        </ShadButton>
      </div>

      {loadError ? (
        <p className="mt-3 text-sm text-[var(--wireline-color-status-error)]" role="alert">
          {loadError}{" "}
          <button
            type="button"
            className="underline underline-offset-2"
            disabled={loading || pendingKey !== null || creating}
            onClick={() => void refresh()}
          >
            Retry
          </button>
        </p>
      ) : null}

      {/* One-time plaintext reveal */}
      <AnimatePresence>
        {justCreated && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className={WL_APP_CLASSES.successReveal}
          >
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="app-section-title flex items-center gap-2 text-brand">
                <Check className="w-3.5 h-3.5" /> Save This Key Now. It Will Not Be Shown Again
              </div>
              <ShadButton
                type="button"
                variant="ghost"
                size="icon"
                disableAnimations
                onClick={() => setJustCreated(null)}
                className="text-brand/70 hover:text-brand"
                aria-label="Dismiss key reveal"
              >
                <X className="w-4 h-4" />
              </ShadButton>
            </div>
            <div className="flex items-center gap-2">
              <Input
                readOnly
                value={revealed ? justCreated.plaintext : "•".repeat(justCreated.plaintext.length)}
                className="flex-1 h-10 px-3 rounded-md bg-background border border-brand/30 outline-none text-foreground text-xs font-mono select-all"
              />
              <ShadButton
                type="button"
                variant="outline"
                size="icon"
                disableAnimations
                onClick={() => setRevealed((r) => !r)}
                title={revealed ? "Hide" : "Show"}
                className="h-10 w-10 bg-brand/10 border-brand/30 hover:bg-brand/20 text-brand"
                aria-label={revealed ? "Hide key" : "Show key"}
              >
                {revealed ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </ShadButton>
              <ShadButton
                type="button"
                variant="outline"
                disableAnimations
                onClick={copyKey}
                className="h-10 px-3 bg-brand/10 border-brand/30 hover:bg-brand/20 text-brand text-xs font-medium"
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copied ? "Copied" : "Copy"}
              </ShadButton>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Create form */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="rounded-md bg-muted/10 border border-border p-4 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <label className="space-y-1.5">
                  <span className="wl-label-muted">Key name</span>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Webflow Demo Form"
                    className="w-full h-11 px-4 rounded-md bg-muted/10 border border-border outline-none text-foreground text-sm focus:border-brand/60 transition-all"
                  />
                </label>
                <label className="space-y-1.5">
                  <span className="wl-label-muted">Default agent (optional)</span>
                  <Select
                    value={defaultAgentId || "__none__"}
                    onValueChange={(v) => {
                      const next = v === "__none__" ? "" : v;
                      setDefaultAgentId(next);
                      if (!next) setAutoDial(false);
                    }}
                  >
                    <SelectTrigger
                      aria-label="Default agent"
                      className="w-full h-11 px-3 rounded-md bg-muted/10 border border-border text-foreground text-sm"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">None</SelectItem>
                      {agents.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>
              </div>
              <ShadButton
                type="button"
                variant={autoDial && defaultAgentId ? "secondary" : "outline"}
                disableAnimations
                onClick={() => defaultAgentId && setAutoDial(!autoDial)}
                disabled={!defaultAgentId}
                className={cn(
                  "h-auto w-full px-4 py-3 rounded-md flex items-start gap-3 text-left whitespace-normal justify-start",
                  !defaultAgentId
                    ? "bg-muted border-border text-muted-foreground"
                    : autoDial
                      ? "bg-[var(--wireline-color-action-primary-container)] border-primary/40 text-primary"
                      : "bg-muted/10 border-border text-foreground/80 hover:border-border/60",
                )}
              >
                <div
                  className={cn(
                    "shrink-0 w-4 h-4 rounded border-2 flex items-center justify-center mt-0.5",
                    autoDial && defaultAgentId
                      ? "bg-primary border-primary text-primary-foreground"
                      : "border-border",
                  )}
                >
                  {autoDial && defaultAgentId && <Check className="w-2.5 h-2.5" strokeWidth={4} />}
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-medium flex items-center gap-2">
                    <Zap className="w-3 h-3" /> Auto-dial inbound leads
                  </div>
                  <div className="wl-micro-meta leading-snug mt-0.5 text-foreground/65">
                    {defaultAgentId
                      ? "Every lead pushed via this key triggers an outbound call from the selected agent. Subscription must be active."
                      : "Pick a default agent above to enable auto-dial."}
                  </div>
                </div>
              </ShadButton>
              {createError && <div className="text-xs text-rose-600">{createError}</div>}
              <div className="flex justify-end">
                <ShadButton
                  type="button"
                  variant="default"
                  disableAnimations
                  onClick={create}
                  disabled={creating || pendingKey !== null || !name.trim()}
                  className="touch-press h-11 px-5 rounded-md text-xs uppercase tracking-[0.25em] font-medium bg-gradient-to-r from-brand to-brand-deep text-on-brand hover:opacity-90"
                >
                  {creating ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <KeyRound className="w-3.5 h-3.5" />
                  )}
                  {creating ? "Creating" : "Create key"}
                </ShadButton>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Key list */}
      <div className="space-y-2">
        {loading && (
          <div className="flex items-center gap-2 text-muted-foreground text-xs">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…
          </div>
        )}
        {!loading && !loadError && keys.length === 0 && (
          <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center">
            <p className="text-sm font-medium text-foreground">No Intake Keys Yet</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Receive leads from forms and tools. Auto-dial stays off until you assign a Bot.
            </p>
          </div>
        )}
        {keys.map((k) => {
          const agent = agents.find((a) => a.id === k.default_agent_id);
          return (
            <div
              key={k.id}
              aria-busy={pendingKey === k.id}
              className={cn(
                WL_APP_CLASSES.settingsRow,
                "flex items-center justify-between gap-4 flex-wrap",
                !k.active && "opacity-60",
              )}
            >
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="text-sm text-foreground font-medium">{k.name}</div>
                  <span
                    className={cn(
                      "wl-label px-2 py-0.5 rounded-full border",
                      k.active
                        ? WL_APP_CLASSES.statusActive
                        : "bg-muted/10 border-border text-muted-foreground",
                    )}
                  >
                    {k.active ? "Active" : "Paused"}
                  </span>
                  {agent && (
                    <span className="wl-label px-2 py-0.5 rounded-full bg-[var(--wireline-color-action-primary-container)] border border-primary/30 text-primary">
                      Agent · {agent.name}
                    </span>
                  )}
                  {k.auto_dial && k.default_agent_id && (
                    <span className="wl-label px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/40 text-amber-600 flex items-center gap-1">
                      <Zap className="w-2.5 h-2.5" /> Auto-dial
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 flex-wrap text-[length:var(--wireline-typography-overline-size)] text-muted-foreground">
                  <span className="font-mono">{k.key_prefix}…</span>
                  <span>{k.use_count || 0} uses</span>
                  {k.last_used_at && <span>last {formatDateTime(k.last_used_at)}</span>}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <ShadButton
                  type="button"
                  variant="outline"
                  size="sm"
                  disableAnimations
                  onClick={() => k.default_agent_id && updateKey(k.id, { auto_dial: !k.auto_dial })}
                  disabled={!k.default_agent_id || pendingKey !== null || loading || creating}
                  aria-pressed={k.auto_dial && !!k.default_agent_id}
                  title={
                    k.default_agent_id
                      ? "Toggle auto-dial"
                      : "Set a default agent before enabling auto-dial."
                  }
                  className={cn(
                    "h-9 px-3 wl-label",
                    !k.default_agent_id
                      ? "border-border text-muted-foreground"
                      : k.auto_dial
                        ? "bg-brand/15 border-brand/40 text-brand hover:bg-brand/25"
                        : "border-border text-muted-foreground hover:text-brand hover:border-brand/40",
                  )}
                >
                  <PhoneOutgoing className="w-3 h-3" />
                  {k.auto_dial && k.default_agent_id ? "Auto-dial: ON" : "Auto-dial: OFF"}
                </ShadButton>
                <ShadButton
                  type="button"
                  variant="outline"
                  size="sm"
                  disableAnimations
                  onClick={() => updateKey(k.id, { active: !k.active })}
                  disabled={pendingKey !== null || loading || creating}
                  className="h-9 px-3 wl-micro-meta hover:text-foreground border-border hover:border-border/60"
                >
                  {k.active ? "Pause" : "Resume"}
                </ShadButton>
                {confirmDelete === k.id ? (
                  <>
                    <ShadButton
                      type="button"
                      variant="destructive"
                      size="sm"
                      disableAnimations
                      onClick={() => updateKey(k.id)}
                      disabled={pendingKey !== null || loading || creating}
                      className="h-9 px-3 wl-label"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Confirm
                    </ShadButton>
                    <ShadButton
                      type="button"
                      variant="outline"
                      size="sm"
                      disableAnimations
                      onClick={() => setConfirmDelete(null)}
                      disabled={pendingKey !== null || loading || creating}
                      className="h-9 px-3 wl-micro-meta border-border"
                    >
                      Cancel
                    </ShadButton>
                  </>
                ) : (
                  <ShadButton
                    type="button"
                    variant="outline"
                    size="sm"
                    disableAnimations
                    onClick={() => setConfirmDelete(k.id)}
                    disabled={pendingKey !== null || loading || creating}
                    className="h-9 px-3 wl-micro-meta hover:text-rose-600 hover:border-rose-500/40"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Delete
                  </ShadButton>
                )}
              </div>
              {actionError?.id === k.id && (
                <p className="w-full text-sm text-destructive" role="alert">
                  {actionError.message}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* Quick-start example */}
      <details
        className={cn(
          WL_APP_CLASSES.settingsRow,
          "text-[length:var(--wireline-typography-overline-size)] text-muted-foreground leading-relaxed overflow-x-auto bg-muted/5",
        )}
      >
        <summary className="cursor-pointer list-none font-sans text-xs font-semibold text-foreground marker:hidden [&::-webkit-details-marker]:hidden">
          Developer Quick Start
        </summary>
        <div className="mt-3 font-mono">
          <div className="wl-label text-primary mb-2">Quick start · curl</div>
          <pre className="whitespace-pre-wrap break-all">{`curl -X POST https://botbound.app/api/intake/lead \\
  -H "Content-Type: application/json" \\
  -H "X-BotBound-Key: wlk_..." \\
  -H "Idempotency-Key: form-submission-12345" \\
  -d '{"customer_name":"Jane Doe","customer_number":"+15551234567","context":"Filled out demo form","metadata":{"utm_source":"newsletter"}}'`}</pre>
        </div>
        <div className="mt-3 wl-micro-meta opacity-90 leading-relaxed font-sans space-y-1.5">
          <div>
            <span className="text-primary font-mono uppercase tracking-wider">Idempotency-Key</span>
            : optional, any string ≤ 255 chars. Same key + same Account Holder returns the original{" "}
            <code className="text-foreground/80">lead_id</code> with{" "}
            <code className="text-foreground/80">idempotent_replay: true</code>. Safe for
            form-submission retries.
          </div>
          <div>
            <span className="text-primary font-mono uppercase tracking-wider">Rate limit</span>: 60
            requests / minute per intake key. Excess returns{" "}
            <code className="text-foreground/80">HTTP 429</code> with{" "}
            <code className="text-foreground/80">Retry-After</code>.
          </div>
          <div>
            <span className="text-primary font-mono uppercase tracking-wider">Auto-dial</span>: when
            on, the response includes{" "}
            <code className="text-foreground/80">auto_dial_initiated: true</code> and the call is
            dispatched in the background; the lead row gets{" "}
            <code className="text-foreground/80">call_id</code> +{" "}
            <code className="text-foreground/80">status: "Dialing"</code> on success.
          </div>
        </div>
      </details>
    </div>
  );
}
