/* eslint-disable @typescript-eslint/no-explicit-any -- API response shapes vary by endpoint and aren't shared as client types yet. */
import { useState, useEffect } from "react";
import { Mail, CheckCircle2, Plus, Trash2, Bot, RotateCw, Phone, Zap } from "lucide-react";
import { motion } from "motion/react";
import { authFetch, readApiJson } from "../lib/api";
import PageShell, { Panel } from "./PageShell";
import AdminHubViewport from "./layout/AdminHubViewport";
import { useToast } from "../contexts/ToastContext";
import ConfirmModal from "./ConfirmModal";
import CrmConnectionCard from "./CrmConnectionCard";
import { EMAIL_INBOUND_TASKS } from "../lib/integration-playbooks";
import { OPS_CHANNEL_EMPTY, OPS_CHANNEL_TOOLBAR } from "../lib/wireline-ops-design";
import ClientToolbar from "./layout/ClientToolbar";
import ClientRouteLoading from "./layout/ClientRouteLoading";
import { getIntegrationLogo } from "./layout/IntegrationLogos";
import { ShadButton } from "./ui/shadcn/ShadButton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/shadcn/Select";
import { Label } from "./ui/shadcn/Label";
import { EmptyState } from "./ui/EmptyState";
import CertifiedIntegrationsStrip from "./CertifiedIntegrationsStrip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/shadcn/Dialog";
import { Input } from "./ui/shadcn/Input";

type ConfirmState = { open: boolean; onConfirm: () => void };
const CLOSED_CONFIRM: ConfirmState = { open: false, onConfirm: () => {} };

// Provider badge metadata
const PROVIDER_META: Record<string, { label: string; color: string; logoName: string }> = {
  google: { label: "Google Workspace", color: "text-brand", logoName: "Google" },
  microsoft: { label: "Microsoft / Outlook", color: "text-brand", logoName: "Microsoft" },
  yahoo: { label: "Yahoo Mail", color: "text-brand-deep", logoName: "Yahoo" },
  icloud: { label: "iCloud Mail", color: "text-brand", logoName: "iCloud" },
};

export default function Integrations() {
  const { error: toastError, warning: toastWarning, success: toastSuccess } = useToast();
  const [confirmState, setConfirmState] = useState<ConfirmState>(CLOSED_CONFIRM);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [agents, setAgents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [icloudOpen, setIcloudOpen] = useState(false);
  const [icloudEmail, setIcloudEmail] = useState("");
  const [icloudPassword, setIcloudPassword] = useState("");
  const [icloudConnecting, setIcloudConnecting] = useState(false);

  const fetchAccounts = async () => {
    try {
      const res = await authFetch("/api/emails/accounts");
      const out = await readApiJson<{ accounts?: typeof accounts }>(res);
      if (out.ok === false) throw new Error(out.error);
      setAccounts(out.data.accounts || []);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Check your connection and refresh.";
      if (!msg.includes("temporarily unavailable")) {
        toastError("Could not load connected accounts", msg);
      }
    }
  };

  const fetchAgents = async () => {
    try {
      const res = await authFetch("/api/agents");
      const out = await readApiJson<{ agents?: typeof agents }>(res);
      if (out.ok === false) throw new Error(out.error);
      setAgents(out.data.agents || []);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Check your connection and refresh.";
      if (!msg.includes("temporarily unavailable")) {
        toastError("Could not load agents", msg);
      }
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
      if (event.origin !== window.location.origin) return;
      if (event.data?.type === "OAUTH_AUTH_SUCCESS") {
        fetchAccounts();
        toastSuccess("Account linked", `${event.data.email} connected successfully.`);
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only effect; functions are stable within the component lifecycle.
  }, []);

  const openOAuthPopup = (url: string) => {
    const width = Math.min(600, window.innerWidth * 0.9);
    const height = Math.min(700, window.innerHeight * 0.8);
    const left = (window.innerWidth - width) / 2;
    const top = (window.innerHeight - height) / 2;
    const win = window.open(
      url,
      "oauth_popup",
      `width=${width},height=${height},left=${left},top=${top}`,
    );
    if (!win) toastWarning("Popup blocked", "Allow popups for this site to connect your account.");
  };

  const handleConnectGmail = async () => {
    try {
      const res = await authFetch("/api/oauth/google/url");
      const out = await readApiJson<{ url?: string; error?: string }>(res);
      if (out.ok === false) throw new Error(out.error);
      if (out.data.error) throw new Error(out.data.error);
      const url = out.data.url;
      if (!url) throw new Error("OAuth URL missing");
      openOAuthPopup(url);
    } catch (e: any) {
      toastError("Gmail connection failed", e?.message || "Could not start Gmail OAuth.");
    }
  };

  const handleConnectOutlook = async () => {
    try {
      const res = await authFetch("/api/oauth/microsoft/url");
      const out = await readApiJson<{ url?: string; error?: string }>(res);
      if (out.ok === false) throw new Error(out.error);
      if (out.data.error) throw new Error(out.data.error);
      const url = out.data.url;
      if (!url) throw new Error("OAuth URL missing");
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
      const out = await readApiJson<{ url?: string; error?: string }>(res);
      if (out.ok === false) throw new Error(out.error);
      if (out.data.error) throw new Error(out.data.error);
      const url = out.data.url;
      if (!url) throw new Error("OAuth URL missing");
      openOAuthPopup(url);
    } catch (e: any) {
      toastError("Yahoo Mail connection failed", e?.message || "Could not start Yahoo OAuth.");
    }
  };

  const handleConnectIcloud = async () => {
    const email = icloudEmail.trim().toLowerCase();
    const appPassword = icloudPassword.replace(/\s+/g, "");
    if (!email || !appPassword) {
      toastWarning("Missing details", "Enter your iCloud email and app-specific password.");
      return;
    }

    setIcloudConnecting(true);
    try {
      const res = await authFetch("/api/integrations/icloud/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email_address: email, app_password: appPassword }),
      });
      const out = await readApiJson<{ ok?: boolean; email?: string; error?: string }>(res);
      if (out.ok === false) throw new Error(out.error);
      setIcloudOpen(false);
      setIcloudEmail("");
      setIcloudPassword("");
      await fetchAccounts();
      toastSuccess("iCloud Mail connected", `${out.data.email ?? email} is ready for inbox sync.`);
    } catch (e: unknown) {
      const msg =
        e instanceof Error
          ? e.message
          : "Could not connect iCloud Mail. Check your app-specific password.";
      toastError("iCloud connection failed", msg);
    } finally {
      setIcloudConnecting(false);
    }
  };

  const handleDisconnect = (id: string) => {
    setConfirmState({
      open: true,
      onConfirm: async () => {
        setIsDisconnecting(true);
        try {
          await authFetch(`/api/emails/accounts/${id}`, { method: "DELETE" });
          fetchAccounts();
          setConfirmState(CLOSED_CONFIRM);
        } catch {
          toastError("Disconnect failed", "Could not disconnect this account. Please try again.");
        } finally {
          setIsDisconnecting(false);
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
    } catch {
      toastError("Assignment failed", "Could not update the agent for this account.");
    }
  };

  const syncAll = async () => {
    setSyncing(true);
    try {
      const res = await authFetch("/api/emails/sync", { method: "POST" });
      const out = await readApiJson<{
        ok?: boolean;
        accounts?: number;
        message?: string;
        error?: string;
        code?: string;
      }>(res);

      if (out.ok === false) {
        // Handle HTTP error response
        if (out.code === "EMAIL_ACCOUNT_NOT_CONNECTED") {
          toastError(
            "No email accounts connected",
            out.error ?? "Connect Gmail or Outlook below to start syncing.",
          );
        } else {
          toastError("Sync failed", out.error ?? `HTTP ${res.status}`);
        }
        return;
      }

      const data = out.data;
      if (data.ok === false) {
        // Handle application-level error
        if (data.code === "EMAIL_ACCOUNT_NOT_CONNECTED") {
          toastError(
            "No email accounts connected",
            data.error ?? "Connect Gmail or Outlook below to start syncing.",
          );
        } else {
          toastError("Sync failed", data.error ?? "Sync failed");
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
    <ShadButton
      onClick={syncAll}
      disabled={syncing}
      variant="outline"
      className="inline-flex items-center gap-2 px-3.5 py-2 rounded-full wl-panel border border-input text-foreground text-[var(--wireline-typography-overline-size)] uppercase tracking-[0.22em] hover:border-brand/40 transition-colors disabled:opacity-50 touch-press"
    >
      <RotateCw className={`w-3 h-3 text-brand ${syncing ? "animate-spin" : ""}`} />
      {syncing ? "Syncing…" : OPS_CHANNEL_TOOLBAR.integrations.sync}
    </ShadButton>
  );

  return (
    <>
      <AdminHubViewport scroll>
        <ClientToolbar
          left={
            <span className="app-toolbar-stat">
              {loading
                ? OPS_CHANNEL_TOOLBAR.integrations.loading
                : OPS_CHANNEL_TOOLBAR.integrations.stat(accounts.length)}
            </span>
          }
          actions={syncAction}
        />
        {loading ? (
          <ClientRouteLoading
            icon={<Zap className="w-7 h-7" />}
            label={OPS_CHANNEL_TOOLBAR.integrations.loading}
            className="flex-1 min-h-0"
          />
        ) : (
          <PageShell scrollable>
            <div className="flex flex-col gap-3">
              <CertifiedIntegrationsStrip />
              <Panel
                title="Email carriers"
                hint="GMAIL · OUTLOOK · ICLOUD"
                icon={Mail}
                autoHeight
                flush
                actions={
                  accounts.length > 0 ? (
                    <div className="hidden sm:flex items-center gap-2">
                      <ShadButton
                        onClick={handleConnectGmail}
                        variant="outline"
                        className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full app-primary-action text-[var(--wireline-typography-overline-size)] uppercase tracking-[0.22em] touch-press"
                      >
                        <Plus className="w-3 h-3" />
                        Gmail
                      </ShadButton>
                      <ShadButton
                        onClick={handleConnectOutlook}
                        variant="outline"
                        className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full app-primary-action text-[var(--wireline-typography-overline-size)] uppercase tracking-[0.22em] touch-press"
                      >
                        <Plus className="w-3 h-3" />
                        Outlook
                      </ShadButton>
                      <ShadButton
                        onClick={handleConnectYahoo}
                        variant="outline"
                        className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full app-primary-action text-[var(--wireline-typography-overline-size)] uppercase tracking-[0.22em] touch-press"
                      >
                        <Plus className="w-3 h-3" />
                        Yahoo
                      </ShadButton>
                      <ShadButton
                        onClick={() => setIcloudOpen(true)}
                        variant="outline"
                        className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full app-primary-action text-[var(--wireline-typography-overline-size)] uppercase tracking-[0.22em] touch-press"
                      >
                        <Plus className="w-3 h-3" />
                        iCloud
                      </ShadButton>
                    </div>
                  ) : undefined
                }
              >
                {accounts.length === 0 ? (
                  <EmptyState
                    icon={Mail}
                    density="compact"
                    withHalo={false}
                    title={OPS_CHANNEL_EMPTY.integrations.title}
                    className="py-8"
                    actions={[
                      {
                        label: "Connect Gmail",
                        onClick: handleConnectGmail,
                        primary: true,
                      },
                      {
                        label: "Connect Outlook",
                        onClick: handleConnectOutlook,
                      },
                      {
                        label: "Connect Yahoo",
                        onClick: handleConnectYahoo,
                      },
                      {
                        label: "Connect iCloud",
                        onClick: () => setIcloudOpen(true),
                      },
                    ]}
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-left stagger-children">
                      {EMAIL_INBOUND_TASKS.map((task) => (
                        <div
                          key={task.id}
                          className="rounded-md border border-brand/8 bg-brand/[0.02] px-3 py-2"
                        >
                          <p className="text-[var(--wireline-typography-caption-size)] text-foreground font-medium leading-snug text-pretty">
                            {task.callerMoment}
                          </p>
                          <p className="chrome-subtle mt-1 leading-snug text-pretty">
                            {task.agentAction}
                          </p>
                        </div>
                      ))}
                    </div>
                  </EmptyState>
                ) : (
                  <>
                    <div className="px-4 py-3 border-b border-white/6 bg-brand/5">
                      <p className="wl-label text-brand mb-2">When email arrives</p>
                      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-2">
                        {EMAIL_INBOUND_TASKS.map((task) => (
                          <div
                            key={task.id}
                            className="rounded-md border border-input bg-card/80 px-3 py-2.5"
                          >
                            <div className="flex items-start gap-2 mb-1.5">
                              <Phone className="w-3 h-3 text-brand shrink-0 mt-0.5" />
                              <p className="text-[var(--wireline-typography-caption-size)] text-foreground font-medium leading-snug text-pretty">
                                {task.callerMoment}
                              </p>
                            </div>
                            <div className="flex items-start gap-2">
                              <Zap className="w-3 h-3 text-brand/80 shrink-0 mt-0.5" />
                              <p className="text-[var(--wireline-typography-caption-size)] text-muted leading-relaxed text-pretty">
                                {task.agentAction}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="divide-y divide-border stagger-children">
                      {accounts.map((acc) => {
                        const meta = PROVIDER_META[acc.provider] || PROVIDER_META.google;
                        return (
                          <motion.div
                            layout
                            initial={{ opacity: 0, y: 4 }}
                            animate={{ opacity: 1, y: 0 }}
                            key={acc.id}
                            className="px-3 py-2 flex flex-col xl:flex-row xl:items-center gap-3 wl-row-hover transition-colors group touch-press"
                          >
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                              <div
                                className={`w-10 h-10 rounded-md wl-panel border border-input flex items-center justify-center shrink-0 overflow-hidden ${meta.color}`}
                              >
                                {getIntegrationLogo(meta.logoName) ?? <Mail className="w-4 h-4" />}
                              </div>
                              <div className="min-w-0 space-y-1">
                                <div className="font-display italic text-lg text-foreground leading-none truncate">
                                  {acc.email_address}
                                </div>
                                <div className="flex items-center gap-2">
                                  {acc.provider === "yahoo" ? (
                                    <span
                                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-brand/10 border border-brand/30 text-brand wl-label"
                                      title="Yahoo inbox sync is coming soon — OAuth connection is stored"
                                    >
                                      Connected · Inbox soon
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-brand/10 border border-brand/30 text-brand wl-label">
                                      <CheckCircle2 className="w-2.5 h-2.5" /> Synced
                                    </span>
                                  )}
                                  <span className={`wl-label font-mono ${meta.color}`}>
                                    {meta.label}
                                  </span>
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <Label className="wl-label-muted-foreground inline-flex items-center gap-1.5">
                                <Bot className="w-3 h-3 text-brand" /> Route to
                              </Label>
                              <div className="relative">
                                <Select
                                  value={acc.agent_id || "none"}
                                  onValueChange={(v) => updateAccountAgent(acc.id, v)}
                                >
                                  <SelectTrigger
                                    aria-label="Route to agent"
                                    className="text-xs bg-black/5 border border-input rounded-md pl-3 py-1.5 text-foreground h-auto"
                                  >
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="none">Unassigned</SelectItem>
                                    {agents.map((agent) => (
                                      <SelectItem key={agent.id} value={agent.id}>
                                        {agent.name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>

                              <ShadButton
                                onClick={() => handleDisconnect(acc.id)}
                                variant="outline"
                                className="w-8 h-8 rounded-md wl-panel border border-input text-muted hover:text-destructive hover:border-destructive/30 transition-all flex items-center justify-center p-0 touch-press hover:scale-[1.05]"
                                title="Disconnect"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </ShadButton>
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  </>
                )}
              </Panel>

              <div>
                <CrmConnectionCard />
              </div>
            </div>
          </PageShell>
        )}
      </AdminHubViewport>

      <Dialog open={icloudOpen} onOpenChange={setIcloudOpen}>
        <DialogContent className="wl-modal-surface border-border sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Connect iCloud Mail</DialogTitle>
            <DialogDescription>
              Apple does not offer mailbox OAuth for third-party apps. Generate an app-specific
              password at{" "}
              <a
                href="https://appleid.apple.com/account/manage"
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand underline underline-offset-2"
              >
                appleid.apple.com
              </a>{" "}
              (Sign-In and Security → App-Specific Passwords), then paste it here.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label htmlFor="icloud-email">iCloud email</Label>
              <Input
                id="icloud-email"
                type="email"
                autoComplete="username"
                placeholder="you@icloud.com"
                value={icloudEmail}
                onChange={(e) => setIcloudEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="icloud-app-password">App-specific password</Label>
              <Input
                id="icloud-app-password"
                type="password"
                autoComplete="off"
                placeholder="xxxx-xxxx-xxxx-xxxx"
                value={icloudPassword}
                onChange={(e) => setIcloudPassword(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <ShadButton variant="outline" onClick={() => setIcloudOpen(false)}>
                Cancel
              </ShadButton>
              <ShadButton onClick={handleConnectIcloud} disabled={icloudConnecting}>
                {icloudConnecting ? "Connecting…" : "Connect iCloud"}
              </ShadButton>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmModal
        open={confirmState.open}
        title="Disconnect carrier?"
        message="This email account will be unlinked and its threads will no longer be processed by your agents."
        danger
        loading={isDisconnecting}
        onConfirm={confirmState.onConfirm}
        onCancel={() => setConfirmState(CLOSED_CONFIRM)}
      />
    </>
  );
}
