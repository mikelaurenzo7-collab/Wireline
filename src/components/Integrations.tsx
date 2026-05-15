import { useState, useEffect } from "react";
import {
  Mail,
  CheckCircle2,
  Plus,
  Trash2,
  Webhook,
  Loader2,
  Bot,
  ChevronDown,
  RotateCw,
  Terminal,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { authFetch } from "../lib/api";
import PageShell, { Panel } from "./PageShell";
import { useToast } from "../contexts/ToastContext";
import ConfirmModal from "./ConfirmModal";

type ConfirmState = { open: boolean; onConfirm: () => void };
const CLOSED_CONFIRM: ConfirmState = { open: false, onConfirm: () => {} };

// Provider badge metadata
const PROVIDER_META: Record<string, { label: string; color: string }> = {
  google: { label: "Google Workspace", color: "text-brand" },
  microsoft: { label: "Microsoft / Outlook", color: "text-blue-600" },
};

export default function Integrations() {
  const { error: toastError, warning: toastWarning, success: toastSuccess } = useToast();
  const [confirmState, setConfirmState] = useState<ConfirmState>(CLOSED_CONFIRM);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [agents, setAgents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showTechnical, setShowTechnical] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const fetchAccounts = async () => {
    try {
      const res = await authFetch("/api/emails/accounts");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setAccounts(data.accounts || []);
    } catch (e: any) {
      toastError(
        "Could not load connected accounts",
        e?.message || "Check your connection and refresh.",
      );
    }
  };

  const fetchAgents = async () => {
    try {
      const res = await authFetch("/api/agents");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setAgents(data.agents || []);
    } catch (e: any) {
      toastError("Could not load agents", e?.message || "Check your connection and refresh.");
    }
  };

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await Promise.all([fetchAccounts(), fetchAgents()]);
      setLoading(false);
    };
    init();

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === "OAUTH_AUTH_SUCCESS") {
        fetchAccounts();
        toastSuccess("Account linked", `${event.data.email} connected successfully.`);
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  const openOAuthPopup = (url: string) => {
    const win = window.open(url, "oauth_popup", "width=600,height=700");
    if (!win) toastWarning("Popup blocked", "Allow popups for this site to connect your account.");
  };

  const handleConnectGmail = async () => {
    try {
      const res = await authFetch("/api/oauth/google/url");
      const { url, error } = await res.json();
      if (error) throw new Error(error);
      openOAuthPopup(url);
    } catch (e: any) {
      toastError("Gmail connection failed", e?.message || "Could not start Gmail OAuth.");
    }
  };

  const handleConnectOutlook = async () => {
    try {
      const res = await authFetch("/api/oauth/microsoft/url");
      const { url, error } = await res.json();
      if (error) throw new Error(error);
      const win = window.open(url, "oauth_popup", "width=600,height=820");
      if (!win)
        toastWarning("Popup blocked", "Allow popups for this site to connect your account.");
    } catch (e: any) {
      toastError("Outlook connection failed", e?.message || "Could not start Microsoft OAuth.");
    }
  };

  const handleDisconnect = (id: string) => {
    setConfirmState({
      open: true,
      onConfirm: async () => {
        setConfirmState(CLOSED_CONFIRM);
        try {
          await authFetch(`/api/emails/accounts/${id}`, { method: "DELETE" });
          fetchAccounts();
        } catch (e) {
          console.error(e);
          toastError("Disconnect failed", "Could not disconnect this account. Please try again.");
        }
      },
    });
  };

  const updateAccountAgent = async (accountId: string, agentId: string) => {
    try {
      await authFetch(`/api/emails/accounts/${accountId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent_id: agentId === "none" ? null : agentId }),
      });
      fetchAccounts();
    } catch (e) {
      console.error(e);
      toastError("Assignment failed", "Could not update the agent for this account.");
    }
  };

  const syncAll = async () => {
    setSyncing(true);
    try {
      const res = await authFetch("/api/emails/sync", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        accounts?: number;
        message?: string;
        error?: string;
        code?: string;
      };

      if (!res.ok || data.ok === false) {
        // No-account case is informational — point the operator at the
        // OAuth buttons immediately below this banner.
        if (data.code === "EMAIL_ACCOUNT_NOT_CONNECTED") {
          toastError(
            "No email accounts connected",
            data.error ?? "Connect Gmail or Outlook below to start syncing.",
          );
        } else {
          toastError("Sync failed", data.error ?? `HTTP ${res.status}`);
        }
        return;
      }

      toastSuccess(
        "Sync queued",
        data.message ??
          `${data.accounts ?? 0} account${data.accounts === 1 ? "" : "s"} refreshing.`,
      );
    } catch {
      toastError("Sync failed", "Could not sync email accounts.");
    } finally {
      setSyncing(false);
    }
  };

  const syncAction = (
    <button
      onClick={syncAll}
      disabled={syncing}
      className="inline-flex items-center gap-2 px-3.5 py-2 rounded-full glass border border-white/10 text-ink text-[11px] uppercase tracking-[0.22em] hover:border-brand/40 transition-colors disabled:opacity-50"
    >
      <RotateCw className={`w-3 h-3 text-brand ${syncing ? "animate-spin" : ""}`} />
      {syncing ? "Syncing…" : "Sync all"}
    </button>
  );

  return (
    <>
      <PageShell
        title="Carrier Bridge"
        eyebrow="Intelligence · Integrations"
        subtitle="Bridge external data streams and carrier protocols into the fleet."
        actions={syncAction}
      >
        <div className="h-full flex flex-col gap-3 min-h-0">
          <Panel
            title="email carriers"
            hint="GMAIL · OUTLOOK"
            icon={Mail}
            scroll
            flush
            actions={
              <div className="flex items-center gap-2">
                <button
                  onClick={handleConnectGmail}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-brand/15 border border-brand/40 text-brand text-[10px] uppercase tracking-[0.25em] hover:bg-brand/25 transition-colors"
                >
                  <Plus className="w-3 h-3" />
                  Gmail
                </button>
                <button
                  onClick={handleConnectOutlook}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/30 text-blue-400 text-[10px] uppercase tracking-[0.25em] hover:bg-blue-500/20 transition-colors"
                >
                  <Plus className="w-3 h-3" />
                  Outlook
                </button>
              </div>
            }
          >
            {loading ? (
              <div className="h-full flex flex-col items-center justify-center gap-3 py-16">
                <Loader2 className="w-5 h-5 animate-spin text-brand" />
                <span className="text-[10px] uppercase tracking-[0.4em] text-muted/70">
                  Loading integrations
                </span>
              </div>
            ) : accounts.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center gap-6 py-16 text-center px-6">
                <div className="w-14 h-14 rounded-2xl glass border border-white/10 flex items-center justify-center text-muted">
                  <Mail className="w-6 h-6" />
                </div>
                <div className="space-y-1.5">
                  <h3 className="font-display italic lowercase text-2xl text-ink">
                    no carriers linked
                  </h3>
                  <p className="text-[10px] uppercase tracking-[0.4em] text-muted/70 max-w-sm">
                    Connect Gmail or Outlook to route inbound conversations to fleet agents.
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleConnectGmail}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-brand/15 border border-brand/40 text-brand text-[10px] uppercase tracking-[0.25em] hover:bg-brand/25 transition-colors"
                  >
                    <Plus className="w-3 h-3" /> Connect Gmail
                  </button>
                  <button
                    onClick={handleConnectOutlook}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-500/10 border border-blue-500/30 text-blue-400 text-[10px] uppercase tracking-[0.25em] hover:bg-blue-500/20 transition-colors"
                  >
                    <Plus className="w-3 h-3" /> Connect Outlook
                  </button>
                </div>
              </div>
            ) : (
              <div className="divide-y divide-white/6">
                {accounts.map((acc) => {
                  const meta = PROVIDER_META[acc.provider] || PROVIDER_META.google;
                  return (
                    <motion.div
                      layout
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      key={acc.id}
                      className="px-4 py-3.5 flex flex-col xl:flex-row xl:items-center gap-4 hover:bg-white/3 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div
                          className={`w-10 h-10 rounded-xl glass border border-white/10 flex items-center justify-center shrink-0 ${meta.color}`}
                        >
                          <Mail className="w-4 h-4" />
                        </div>
                        <div className="min-w-0 space-y-1">
                          <div className="font-display italic text-lg text-ink leading-none truncate">
                            {acc.email_address}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-500 text-[9px] uppercase tracking-[0.3em]">
                              <CheckCircle2 className="w-2.5 h-2.5" /> Synced
                            </span>
                            <span
                              className={`text-[9px] uppercase tracking-[0.3em] font-mono ${meta.color}`}
                            >
                              {meta.label}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <label className="text-[9px] uppercase tracking-[0.3em] text-muted/70 inline-flex items-center gap-1.5">
                          <Bot className="w-3 h-3 text-brand" /> Route to
                        </label>
                        <div className="relative">
                          <select
                            value={acc.agent_id || "none"}
                            onChange={(e) => updateAccountAgent(acc.id, e.target.value)}
                            className="text-xs bg-black/5 border border-black/10 rounded-lg pl-3 pr-8 py-1.5 outline-none focus:border-brand/50 appearance-none cursor-pointer text-ink"
                          >
                            <option value="none">Unassigned</option>
                            {agents.map((agent) => (
                              <option key={agent.id} value={agent.id}>
                                {agent.name}
                              </option>
                            ))}
                          </select>
                          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted pointer-events-none" />
                        </div>

                        <button
                          onClick={() => handleDisconnect(acc.id)}
                          className="w-8 h-8 rounded-lg glass border border-white/10 text-muted hover:text-rose-500 hover:border-rose-500/30 transition-all flex items-center justify-center"
                          title="Disconnect"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </Panel>

          {/* OAuth diagnostics */}
          <div className="shrink-0">
            <button
              onClick={() => setShowTechnical(!showTechnical)}
              className="text-[10px] uppercase tracking-[0.4em] text-muted/70 hover:text-ink transition-colors flex items-center gap-2"
            >
              <Terminal className="w-3 h-3" />
              {showTechnical ? "Hide" : "Show"} OAuth diagnostics
              <ChevronDown
                className={`w-3 h-3 transition-transform ${showTechnical ? "rotate-180" : ""}`}
              />
            </button>

            <AnimatePresence>
              {showTechnical && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="mt-3 overflow-hidden"
                >
                  <div className="rounded-2xl glass border border-white/8 p-4 space-y-4">
                    {/* Google */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Webhook className="w-3.5 h-3.5 text-brand" />
                        <h4 className="font-display italic lowercase text-sm text-ink">
                          google oauth redirect uri
                        </h4>
                      </div>
                      <code className="block w-full px-3 py-2 rounded-lg bg-black/40 border border-white/8 font-mono text-[11px] text-brand select-all break-all">
                        {window.location.origin}/api/oauth/google/callback
                      </code>
                      <p className="text-[10px] text-muted/80 leading-relaxed">
                        Add this to your Google Cloud Console → OAuth credentials → Authorized
                        redirect URIs.
                      </p>
                    </div>

                    {/* Microsoft */}
                    <div className="space-y-2 pt-2 border-t border-white/8">
                      <div className="flex items-center gap-2">
                        <Webhook className="w-3.5 h-3.5 text-blue-600" />
                        <h4 className="font-display italic lowercase text-sm text-ink">
                          microsoft oauth redirect uri
                        </h4>
                      </div>
                      <code className="block w-full px-3 py-2 rounded-lg bg-black/40 border border-black/10 font-mono text-[11px] text-blue-600 select-all break-all">
                        {window.location.origin}/api/oauth/microsoft/callback
                      </code>
                      <p className="text-[10px] text-muted/80 leading-relaxed">
                        Add this to Azure portal → App registrations → Authentication → Redirect
                        URIs.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2 pt-2 border-t border-white/8">
                      {[
                        { label: "Encryption", value: "Bearer tokens over TLS 1.2+" },
                        { label: "Rotation", value: "Auto-refresh before expiry" },
                        { label: "Scopes", value: "read · send · modify" },
                      ].map((item) => (
                        <div
                          key={item.label}
                          className="rounded-lg glass border border-white/8 p-2.5"
                        >
                          <p className="text-[9px] uppercase tracking-[0.3em] text-brand mb-1">
                            {item.label}
                          </p>
                          <p className="text-[10px] text-muted/80">{item.value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </PageShell>

      <ConfirmModal
        open={confirmState.open}
        title="Disconnect carrier?"
        message="This email account will be unlinked and its threads will no longer be processed by your agents."
        danger
        onConfirm={confirmState.onConfirm}
        onCancel={() => setConfirmState(CLOSED_CONFIRM)}
      />
    </>
  );
}
