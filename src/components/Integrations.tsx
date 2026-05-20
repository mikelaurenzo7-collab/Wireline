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
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { authFetch } from "../lib/api";
import PageShell, { Panel } from "./PageShell";
import { useToast } from "../contexts/ToastContext";
import ConfirmModal from "./ConfirmModal";
import CrmConnectionCard from "./CrmConnectionCard";

type ConfirmState = { open: boolean; onConfirm: () => void };
const CLOSED_CONFIRM: ConfirmState = { open: false, onConfirm: () => {} };

// Provider badge metadata
const PROVIDER_META: Record<string, { label: string; color: string }> = {
  google: { label: "Google Workspace", color: "text-brand" },
  microsoft: { label: "Microsoft / Outlook", color: "text-blue-600" },
  yahoo: { label: "Yahoo Mail", color: "text-purple-600" },
};

/**
 * Plan-tier required to access each integration class. Personal/Starter
 * see locked cards with upgrade CTA; Pro+ see the live connector. Keeps
 * the page honest about what's available + drives upgrade conversion
 * instead of letting low-tier customers click into silent failures.
 */
const PLAN_RANK: Record<string, number> = {
  personal: 0,
  starter: 1,
  pro: 2,
  business: 3,
  enterprise: 4,
};

function planMeetsRequirement(currentPlan: string | null, required: string): boolean {
  const current = PLAN_RANK[currentPlan || "personal"] ?? 0;
  const need = PLAN_RANK[required] ?? 0;
  return current >= need;
}

export default function Integrations() {
  const { error: toastError, warning: toastWarning, success: toastSuccess } = useToast();
  const [confirmState, setConfirmState] = useState<ConfirmState>(CLOSED_CONFIRM);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [agents, setAgents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  // Subscription tier — drives the plan-gated UI on each connector card.
  // Falls back to "personal" so locked cards render even before the
  // billing/status round-trip completes.
  const [planId, setPlanId] = useState<string | null>(null);

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

  // Fetch current plan tier so CRM / messaging connectors can render
  // their gated state (locked + upsell, or live). Falls back to
  // "personal" on error so we never accidentally expose Pro+ cards
  // to a free user.
  const fetchPlan = async () => {
    try {
      const r = await authFetch("/api/billing/status");
      if (!r.ok) return;
      const d = await r.json();
      setPlanId(d.subscription?.plan_id || d.subscription?.plan || "personal");
    } catch {
      setPlanId("personal");
    }
  };

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await Promise.all([fetchAccounts(), fetchAgents(), fetchPlan()]);
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

  const handleConnectYahoo = async () => {
    try {
      const res = await authFetch("/api/oauth/yahoo/url");
      const { url, error } = await res.json();
      if (error) throw new Error(error);
      openOAuthPopup(url);
    } catch (e: any) {
      toastError("Yahoo Mail connection failed", e?.message || "Could not start Yahoo OAuth.");
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
        title="Integration Hub"
        eyebrow="Connections"
        subtitle="Connect your CRM, calendar, inbox, carrier, and Slack — your agents act through them in real time."
        actions={syncAction}
      >
        <div className="h-full flex flex-col gap-2 min-h-0">
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
                <button
                  onClick={handleConnectYahoo}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-purple-500/10 border border-purple-500/30 text-purple-500 text-[10px] uppercase tracking-[0.25em] hover:bg-purple-500/20 transition-colors"
                >
                  <Plus className="w-3 h-3" />
                  Yahoo
                </button>
              </div>
            }
          >
            {loading ? (
              <div className="h-full flex flex-col items-center justify-center gap-2 py-8">
                <Loader2 className="w-5 h-5 animate-spin text-brand" />
                <span className="text-[10px] uppercase tracking-[0.4em] text-muted/70">
                  Loading integrations
                </span>
              </div>
            ) : accounts.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center gap-4 py-8 text-center px-6">
                <div className="w-14 h-14 rounded-2xl glass border border-white/10 flex items-center justify-center text-muted">
                  <Mail className="w-6 h-6" />
                </div>
                <div className="space-y-1.5">
                  <h3 className="font-display italic lowercase text-2xl text-ink">
                    no carriers linked
                  </h3>
                  <p className="text-[10px] uppercase tracking-[0.4em] text-muted/70 max-w-sm">
                    Connect Gmail, Outlook, or Yahoo to route inbound conversations to fleet agents.
                  </p>
                </div>
                <div className="flex items-center gap-3 flex-wrap justify-center">
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
                  <button
                    onClick={handleConnectYahoo}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-purple-500/10 border border-purple-500/30 text-purple-500 text-[10px] uppercase tracking-[0.25em] hover:bg-purple-500/20 transition-colors"
                  >
                    <Plus className="w-3 h-3" /> Connect Yahoo
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
                      className="px-3 py-2 flex flex-col xl:flex-row xl:items-center gap-3 hover:bg-white/3 transition-colors"
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

          {/* CRM & messaging — HubSpot, Salesforce, Slack — surfaced here
              alongside email so operators find every external connector in
              one place instead of having to dig into Admin → Integrations.
              Plan-gated to Pro+ — Personal / Starter see an upgrade card
              instead of the live connectors. */}
          <div className="mt-3">
            {planMeetsRequirement(planId, "pro") ? (
              <CrmConnectionCard />
            ) : (
              <div className="rounded-2xl glass border border-white/10 p-4 relative overflow-hidden">
                <div
                  className="absolute -top-12 -right-12 w-40 h-40 rounded-full opacity-20 blur-3xl pointer-events-none"
                  style={{ background: "radial-gradient(circle, #4F1E7B, transparent)" }}
                />
                <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center gap-4">
                  <div
                    className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: "#4F1E7B" }}
                  >
                    <Webhook className="w-5 h-5 text-on-brand" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[9px] uppercase tracking-[0.32em] text-brand mb-1">
                      Pro plan or higher
                    </p>
                    <h3 className="font-display italic text-xl text-ink leading-tight">
                      CRM &amp; messaging connectors
                    </h3>
                    <p className="text-sm text-muted/80 mt-1 leading-relaxed">
                      HubSpot, Salesforce, and Slack sync — keep call notes, deals, and team alerts
                      in lockstep with every conversation.
                    </p>
                  </div>
                  <a
                    href="/pricing"
                    className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full bg-brand text-on-brand text-[10px] uppercase tracking-[0.3em] hover:bg-brand/90 transition-colors whitespace-nowrap"
                  >
                    Upgrade to Pro
                  </a>
                </div>
              </div>
            )}
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
