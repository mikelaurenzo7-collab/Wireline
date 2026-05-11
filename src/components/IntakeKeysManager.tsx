import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  KeyRound, Plus, Loader2, X, Trash2, Copy, Check, Eye, EyeOff, Inbox,
  PhoneOutgoing, Zap,
} from "lucide-react";
import { authFetch } from "../lib/api";
import { cn } from "../lib/utils";
import { formatDateTime } from "../lib/safe-date";

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

  const refresh = async () => {
    setLoading(true);
    try {
      const [keysRes, agentsRes] = await Promise.all([
        authFetch("/api/intake/keys").then(r => r.json()),
        authFetch("/api/agents").then(r => r.json()).catch(() => ({ agents: [] })),
      ]);
      setKeys(keysRes.keys || []);
      setAgents(agentsRes.agents || []);
    } finally { setLoading(false); }
  };

  useEffect(() => { refresh(); }, []);

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

  const toggleActive = async (k: IntakeKey) => {
    await authFetch(`/api/intake/keys/${k.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !k.active }),
    });
    refresh();
  };

  const toggleAutoDial = async (k: IntakeKey) => {
    if (!k.default_agent_id) return; // can't auto-dial without an agent
    await authFetch(`/api/intake/keys/${k.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ auto_dial: !k.auto_dial }),
    });
    refresh();
  };

  const remove = async (id: string) => {
    await authFetch(`/api/intake/keys/${id}`, { method: "DELETE" });
    setConfirmDelete(null);
    if (justCreated?.id === id) setJustCreated(null);
    refresh();
  };

  const copyKey = async () => {
    if (!justCreated) return;
    try {
      await navigator.clipboard.writeText(justCreated.plaintext);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard API may be unavailable; user can copy manually */ }
  };

  return (
    <div className="relative aurora-ring rounded-2xl mt-8">
      <div className="relative rounded-2xl glass border border-white/10 p-6 space-y-5 overflow-hidden">
        <div className="absolute -top-12 -right-12 w-40 h-40 rounded-full opacity-25 blur-3xl pointer-events-none" style={{ background: "radial-gradient(circle, #9B59F5, transparent)" }} />

        <div className="relative z-10 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "linear-gradient(135deg, #9B59F5, #E040C0)" }}>
              <Inbox className="w-5 h-5 text-paper" />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-[0.4em] text-brand-2">Inbound Intake API</div>
              <h4 className="font-display italic text-2xl text-ink leading-tight mt-1">Capture leads from anywhere</h4>
              <p className="text-[11px] text-ink/55 mt-1">Issue an API key, point your form / CRM / Zapier at <span className="font-mono text-ink/80">POST /api/intake/lead</span>, and leads land straight in Outbound + Triage. Fires <span className="font-mono text-ink/80">lead.received</span> webhook events.</p>
            </div>
          </div>
          <button
            onClick={() => { setShowForm(!showForm); setCreateError(null); }}
            className="brutal-btn !py-2.5 !px-5 !text-[11px] !tracking-[0.3em]"
          >
            {showForm ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
            {showForm ? "Cancel" : "New Key"}
          </button>
        </div>

        {/* One-time plaintext reveal */}
        <AnimatePresence>
          {justCreated && (
            <motion.div
              initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
              className="relative z-10 rounded-xl bg-emerald-500/10 border border-emerald-500/40 p-4 space-y-3"
            >
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="text-[10px] uppercase tracking-[0.3em] text-emerald-400 flex items-center gap-2">
                  <Check className="w-3.5 h-3.5" /> Save this key now — it will not be shown again
                </div>
                <button onClick={() => setJustCreated(null)} className="text-emerald-300/70 hover:text-emerald-300">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={revealed ? justCreated.plaintext : "•".repeat(justCreated.plaintext.length)}
                  className="flex-1 h-10 px-3 rounded-lg bg-black/40 border border-emerald-500/30 outline-none text-ink text-xs font-mono select-all"
                />
                <button
                  onClick={() => setRevealed(r => !r)}
                  title={revealed ? "Hide" : "Show"}
                  className="h-10 px-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 hover:bg-emerald-500/20 text-emerald-300"
                >
                  {revealed ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
                <button
                  onClick={copyKey}
                  className="h-10 px-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 hover:bg-emerald-500/20 text-emerald-300 flex items-center gap-2 text-xs font-medium"
                >
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Create form */}
        <AnimatePresence>
          {showForm && (
            <motion.div
              initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
              className="relative z-10 overflow-hidden"
            >
              <div className="rounded-xl bg-black/5 border border-black/10 p-4 space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <label className="space-y-1.5">
                    <span className="text-[10px] uppercase tracking-[0.3em] text-muted">Key name</span>
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Webflow Demo Form"
                      className="w-full h-11 px-4 rounded-xl bg-black/5 border border-black/10 outline-none text-ink text-sm focus:border-brand/60 transition-all"
                    />
                  </label>
                  <label className="space-y-1.5">
                    <span className="text-[10px] uppercase tracking-[0.3em] text-muted">Default agent (optional)</span>
                    <select
                      value={defaultAgentId}
                      onChange={(e) => { setDefaultAgentId(e.target.value); if (!e.target.value) setAutoDial(false); }}
                      className="w-full h-11 px-3 rounded-xl bg-black/5 border border-black/10 outline-none text-ink text-sm focus:border-brand/60 transition-all"
                    >
                      <option value="">— None —</option>
                      {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                  </label>
                </div>
                <button
                  type="button"
                  onClick={() => defaultAgentId && setAutoDial(!autoDial)}
                  disabled={!defaultAgentId}
                  className={cn(
                    "w-full px-4 py-3 rounded-xl border flex items-start gap-3 text-left transition-all",
                    !defaultAgentId
                      ? "bg-black/20 border-white/5 text-muted/50 cursor-not-allowed"
                      : autoDial
                        ? "bg-brand-2/15 border-brand-2/40 text-brand-2"
                        : "bg-black/5 border-black/10 text-ink/80 hover:border-black/20",
                  )}
                >
                  <div className={cn(
                    "shrink-0 w-4 h-4 rounded border-2 flex items-center justify-center mt-0.5",
                    autoDial && defaultAgentId ? "bg-brand-2 border-brand-2 text-paper" : "border-white/30",
                  )}>
                    {autoDial && defaultAgentId && <Check className="w-2.5 h-2.5" strokeWidth={4} />}
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-medium flex items-center gap-2">
                      <Zap className="w-3 h-3" /> Auto-dial inbound leads
                    </div>
                    <div className="text-[10px] leading-snug mt-0.5 text-ink/55">
                      {defaultAgentId
                        ? "Every lead pushed via this key triggers an outbound call from the selected agent. Subscription must be active."
                        : "Pick a default agent above to enable auto-dial."}
                    </div>
                  </div>
                </button>
                {createError && <div className="text-xs text-rose-400">{createError}</div>}
                <div className="flex justify-end">
                  <button
                    onClick={create}
                    disabled={creating || !name.trim()}
                    className="h-11 px-5 rounded-xl bg-brand text-paper text-xs uppercase tracking-[0.25em] font-medium flex items-center gap-2 disabled:opacity-50 hover:opacity-90 transition-all"
                  >
                    {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <KeyRound className="w-3.5 h-3.5" />}
                    {creating ? "Creating" : "Create key"}
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Key list */}
        <div className="relative z-10 space-y-2">
          {loading && <div className="flex items-center gap-2 text-muted text-xs"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…</div>}
          {!loading && keys.length === 0 && (
            <div className="text-xs text-ink/50 italic">No keys yet. Create one to start accepting inbound leads.</div>
          )}
          {keys.map((k) => {
            const agent = agents.find(a => a.id === k.default_agent_id);
            return (
              <div key={k.id} className={cn("rounded-xl border p-4 flex items-center justify-between gap-4 flex-wrap", k.active ? "bg-black/20 border-white/10" : "bg-black/10 border-white/5 opacity-60")}>
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="text-sm text-ink font-medium">{k.name}</div>
                    <span className={cn(
                      "text-[9px] uppercase tracking-[0.3em] px-2 py-0.5 rounded-full border",
                      k.active ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-400" : "bg-white/5 border-white/10 text-muted",
                    )}>
                      {k.active ? "Active" : "Paused"}
                    </span>
                    {agent && (
                      <span className="text-[9px] uppercase tracking-[0.3em] px-2 py-0.5 rounded-full bg-brand-2/10 border border-brand-2/30 text-brand-2">
                        Agent · {agent.name}
                      </span>
                    )}
                    {k.auto_dial && k.default_agent_id && (
                      <span className="text-[9px] uppercase tracking-[0.3em] px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/40 text-amber-400 flex items-center gap-1">
                        <Zap className="w-2.5 h-2.5" /> Auto-dial
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 flex-wrap text-[11px] text-muted">
                    <span className="font-mono">{k.key_prefix}…</span>
                    <span>{k.use_count || 0} uses</span>
                    {k.last_used_at && <span>last {formatDateTime(k.last_used_at)}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => toggleAutoDial(k)}
                    disabled={!k.default_agent_id}
                    title={k.default_agent_id ? "Toggle auto-dial" : "Set a default agent before enabling auto-dial."}
                    className={cn(
                      "h-9 px-3 rounded-lg text-[10px] uppercase tracking-[0.25em] flex items-center gap-1.5 transition-all",
                      !k.default_agent_id
                        ? "glass border border-white/5 text-muted/40 cursor-not-allowed"
                        : k.auto_dial
                          ? "bg-amber-500/15 border border-amber-500/40 text-amber-300 hover:bg-amber-500/25"
                          : "glass border border-white/10 text-ink/70 hover:text-amber-300 hover:border-amber-500/40",
                    )}
                  >
                    <PhoneOutgoing className="w-3 h-3" />
                    {k.auto_dial && k.default_agent_id ? "Auto-dial: ON" : "Auto-dial: OFF"}
                  </button>
                  <button
                    onClick={() => toggleActive(k)}
                    className="h-9 px-3 rounded-lg glass border border-white/10 text-[10px] uppercase tracking-[0.25em] text-ink/70 hover:text-ink hover:border-white/30"
                  >
                    {k.active ? "Pause" : "Resume"}
                  </button>
                  {confirmDelete === k.id ? (
                    <>
                      <button onClick={() => remove(k.id)} className="h-9 px-3 rounded-lg bg-rose-500/15 border border-rose-500/40 text-rose-300 text-[10px] uppercase tracking-[0.25em] flex items-center gap-1">
                        <Trash2 className="w-3.5 h-3.5" /> Confirm
                      </button>
                      <button onClick={() => setConfirmDelete(null)} className="h-9 px-3 rounded-lg glass border border-white/10 text-[10px] uppercase tracking-[0.25em] text-ink/70">
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => setConfirmDelete(k.id)}
                      className="h-9 px-3 rounded-lg glass border border-white/10 text-[10px] uppercase tracking-[0.25em] text-ink/70 hover:text-rose-300 hover:border-rose-500/40 flex items-center gap-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Delete
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Quick-start example */}
        <div className="relative z-10 rounded-xl bg-black/40 border border-white/10 p-4 text-[11px] text-ink/70 font-mono leading-relaxed overflow-x-auto space-y-3">
          <div>
            <div className="text-[9px] uppercase tracking-[0.3em] text-brand-2 mb-2">Quick start · curl</div>
            <pre className="whitespace-pre-wrap break-all">{`curl -X POST $WIRELINE_URL/api/intake/lead \\
  -H "Content-Type: application/json" \\
  -H "X-Wireline-Key: wlk_..." \\
  -H "Idempotency-Key: form-submission-12345" \\
  -d '{"customer_name":"Jane Doe","customer_number":"+15551234567","context":"Filled out demo form","metadata":{"utm_source":"newsletter"}}'`}</pre>
          </div>
          <div className="text-[10px] text-ink/55 leading-relaxed font-sans space-y-1.5">
            <div><span className="text-brand-2 font-mono uppercase tracking-wider">Idempotency-Key</span> — optional, any string ≤ 255 chars. Same key + same operator returns the original <code className="text-ink/80">lead_id</code> with <code className="text-ink/80">idempotent_replay: true</code>. Safe for form-submission retries.</div>
            <div><span className="text-brand-2 font-mono uppercase tracking-wider">Rate limit</span> — 60 requests / minute per intake key. Excess returns <code className="text-ink/80">HTTP 429</code> with <code className="text-ink/80">Retry-After</code>.</div>
            <div><span className="text-brand-2 font-mono uppercase tracking-wider">Auto-dial</span> — when on, the response includes <code className="text-ink/80">auto_dial_initiated: true</code> and the call is dispatched in the background; the lead row gets <code className="text-ink/80">call_id</code> + <code className="text-ink/80">status: "Dialing"</code> on success.</div>
          </div>
        </div>
      </div>
    </div>
  );
}
