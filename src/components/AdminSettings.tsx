/* eslint-disable @typescript-eslint/no-explicit-any -- API response shapes vary by endpoint and aren't shared as client types yet. */
import React, { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Settings } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import ConfirmModal from "./ConfirmModal";
import { motion } from "motion/react";
import { authFetch, safeJson } from "../lib/api";
import { clientLog } from "../lib/client-log";
import IntegrationHealthBanner, { type IntegrationHealthPayload } from "./IntegrationHealthBanner";
import { WorkspacePageFrame } from "./layout/WorkspacePageFrame";
import { useToast } from "../contexts/ToastContext";
import { useBranding } from "../contexts/BrandingContext";
import AdminHubViewport from "./layout/AdminHubViewport";
import ClientRouteLoading from "./layout/ClientRouteLoading";
import { WorkspaceTabStrip } from "./layout/WorkspaceTabStrip";
import { OPS_ADMIN, type OpsAdminTab } from "../lib/wireline-ops-design";
import { BRAND } from "../constants/brand-colors";
import { VAPI_TENANT_DEFAULT_MODEL, VAPI_TENANT_DEFAULT_PROVIDER } from "../lib/ai-models";

// Modularized Panels
import { AccountsPanel } from "./admin/AccountsPanel";
import { BrandingPanel } from "./admin/BrandingPanel";
import { CarrierPanel } from "./admin/CarrierPanel";
import { SubscriptionPanel } from "./admin/SubscriptionPanel";
import { TeamPanel } from "./admin/TeamPanel";
import { GrowthPanel } from "./admin/GrowthPanel";
import { AuditActivityPanel } from "./admin/AuditActivityPanel";
import ComplianceChecklist from "./admin/ComplianceChecklist";
import { isLegacyAdminTabRedirect } from "../lib/admin-access";

type ConfirmState = { open: boolean; title: string; message: string; onConfirm: () => void };
const CLOSED_CONFIRM: ConfirmState = { open: false, title: "", message: "", onConfirm: () => {} };
const ADMIN_TAB_SHORT_LABELS: Record<string, string> = {
  accounts: "Acct",
  branding: "Brand",
  carrier: "Route",
  subscription: "Bill",
  team: "Team",
  flywheel: "Grow",
  activity: "Audit",
};

interface AdminSettingsState {
  vapi_phone_number_id: string;
  vapi_phone_inbound_agent_id: string;
  subscription_status: string;
  max_agents: number;
  voice_llm_provider: string;
  voice_llm_model: string;
  twilio_messaging_enabled: boolean;
  twilio_lookup_enabled: boolean;
  twilio_manager_alerts_enabled: boolean;
  twilio_messaging_service_sid: string;
  twilio_sms_from_number: string;
  twilio_whatsapp_from_number: string;
  twilio_manager_alert_number: string;
  prospecting_enabled: boolean;
  target_titles: string[];
  target_industries: string[];
  target_states: string[];
  target_employee_ranges: string[];
  brand_name: string;
  brand_logo_url: string;
  primary_color: string;
}

export default function AdminSettings() {
  const { success: toastSuccess, error: toastError } = useToast();
  const { signOut } = useAuth();
  const { updateBranding } = useBranding();
  const [confirmState, setConfirmState] = useState<ConfirmState>(CLOSED_CONFIRM);
  const [settings, setSettings] = useState<AdminSettingsState>({
    vapi_phone_number_id: "",
    vapi_phone_inbound_agent_id: "",
    subscription_status: "active",
    max_agents: 3,
    voice_llm_provider: VAPI_TENANT_DEFAULT_PROVIDER,
    voice_llm_model: VAPI_TENANT_DEFAULT_MODEL,
    twilio_messaging_enabled: false,
    twilio_lookup_enabled: false,
    twilio_manager_alerts_enabled: false,
    twilio_messaging_service_sid: "",
    twilio_sms_from_number: "",
    twilio_whatsapp_from_number: "",
    twilio_manager_alert_number: "",
    prospecting_enabled: false,
    target_titles: [] as string[],
    target_industries: [] as string[],
    target_states: [] as string[],
    target_employee_ranges: ["1,10", "11,50"] as string[],
    brand_name: "",
    brand_logo_url: "",
    primary_color: BRAND.colors.primary,
  });
  const [teamMembers, setTeamMembers] = useState<any[]>([]);
  const [agents, setAgents] = useState<any[]>([]);
  const [phoneNumbers, setPhoneNumbers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeletingNumber, setIsDeletingNumber] = useState<number | string | null>(null);
  const [integrationHealth, setIntegrationHealth] = useState<IntegrationHealthPayload | null>(null);

  type AdminTab =
    | "accounts"
    | "branding"
    | "carrier"
    | "subscription"
    | "team"
    | "flywheel"
    | "activity";
  const VALID_TABS: AdminTab[] = [
    "accounts",
    "branding",
    "carrier",
    "subscription",
    "team",
    "flywheel",
    "activity",
  ];
  // Honor ?tab=<name> in the URL so deep links (e.g. the TrialBanner
  // "Upgrade now" CTA pointing at /admin?tab=subscription) land on
  // the correct tab instead of bouncing to the default.
  const location = useLocation();
  const navigate = useNavigate();
  const activeTab: AdminTab = (() => {
    const qsRaw = new URLSearchParams(location.search).get("tab");
    // Legacy redirect: the voice tab moved out of Settings into each
    // agent's chat Training tab (it's agent identity, not tenant config).
    if (qsRaw === "voices") {
      // useNavigate inside a render branch is fine because navigate is
      // a stable callback and we run it once per matching render. The
      // redirect happens synchronously on the next tick. Voice tooling
      // lives on the Training Voice tab now.
      queueMicrotask(() => navigate("/knowledge?tab=voice", { replace: true }));
      return "branding";
    }
    // Legacy DNC / audit deep links: compliance checklist and the audit
    // trail both live on the Audit activity tab now.
    if (qsRaw === "dnc" || qsRaw === "audit") {
      return "activity";
    }
    if (isLegacyAdminTabRedirect(qsRaw ?? "")) {
      queueMicrotask(() => navigate("/overview", { replace: true }));
      return "accounts";
    }
    if (qsRaw === "growth") return "flywheel";
    const qs = qsRaw as AdminTab;
    return VALID_TABS.includes(qs) ? qs : "accounts";
  })();

  const [carrierNumbers, setCarrierNumbers] = useState<any[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);

  const fetchIntegrationHealth = async () => {
    try {
      const r = await authFetch("/api/oauth/integration-health");
      if (r.ok) setIntegrationHealth(await r.json());
      else setIntegrationHealth(null);
    } catch {
      setIntegrationHealth(null);
    }
  };

  useEffect(() => {
    fetchData();
    fetchIntegrationHealth();
    fetchTeam();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-time data load on mount
  }, []);

  const fetchTeam = async () => {
    try {
      const r = await authFetch("/api/team");
      if (r.ok) {
        const d = await r.json();
        setTeamMembers(d.members || []);
      }
    } catch {
      /* non-critical */
    }
  };

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [settingsRes, agentsRes, numbersRes] = await Promise.all([
        authFetch("/api/settings").then((r) => r.json()),
        authFetch("/api/agents").then((r) => r.json()),
        authFetch("/api/phone-numbers")
          .then((r) => r.json())
          .catch(() => ({ numbers: [] })),
      ]);

      if (settingsRes) {
        setSettings({
          vapi_phone_number_id: settingsRes.vapi_phone_number_id || "",
          vapi_phone_inbound_agent_id: settingsRes.vapi_phone_inbound_agent_id || "",
          subscription_status: settingsRes.subscription_status || "active",
          max_agents: settingsRes.max_agents || 3,
          voice_llm_provider: settingsRes.voice_llm_provider || VAPI_TENANT_DEFAULT_PROVIDER,
          voice_llm_model: settingsRes.voice_llm_model || VAPI_TENANT_DEFAULT_MODEL,
          twilio_messaging_enabled: !!settingsRes.twilio_messaging_enabled,
          twilio_lookup_enabled: !!settingsRes.twilio_lookup_enabled,
          twilio_manager_alerts_enabled: !!settingsRes.twilio_manager_alerts_enabled,
          twilio_messaging_service_sid: settingsRes.twilio_messaging_service_sid || "",
          twilio_sms_from_number: settingsRes.twilio_sms_from_number || "",
          twilio_whatsapp_from_number: settingsRes.twilio_whatsapp_from_number || "",
          twilio_manager_alert_number: settingsRes.twilio_manager_alert_number || "",
          prospecting_enabled: !!settingsRes.prospecting_enabled,
          target_titles: settingsRes.target_titles || [],
          target_industries: settingsRes.target_industries || [],
          target_states: settingsRes.target_states || [],
          target_employee_ranges: settingsRes.target_employee_ranges || ["1,10", "11,50"],
          brand_name: settingsRes.brand_name || "",
          brand_logo_url: settingsRes.brand_logo_url || "",
          primary_color: settingsRes.primary_color || BRAND.colors.primary,
        });
      }
      setAgents(agentsRes.agents || []);
      setPhoneNumbers(numbersRes.numbers || []);

      // Fetch team members
      const teamRes = await authFetch("/api/team");
      if (teamRes.ok) {
        const teamData = await teamRes.json();
        setTeamMembers(teamData.members || []);
      }
    } catch (e) {
      clientLog.error("admin-settings:load", e);
      toastError("Settings unavailable", "Could not load settings. Please refresh.");
    }
    setIsLoading(false);
  };

  const syncCarrierNumbers = async () => {
    setIsSyncing(true);
    try {
      const res = await authFetch("/api/carrier/numbers");
      const data = await res.json();
      setCarrierNumbers(data.numbers || []);
    } catch {
      toastError("Sync failed", "Could not fetch available Wireline phone numbers.");
    }
    setIsSyncing(false);
  };

  const saveSettings = async () => {
    setIsSaving(true);
    try {
      const res = await authFetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (!res.ok) {
        const body = (await safeJson(res)) as { error?: string; message?: string } | null;
        throw new Error(
          body?.error || body?.message || `Settings could not be saved (${res.status}).`,
        );
      }

      updateBranding({
        brand_name: settings.brand_name,
        brand_logo_url: settings.brand_logo_url,
        primary_color: settings.primary_color,
      });

      toastSuccess("Settings saved", "Platform configuration updated.");
    } catch (e: any) {
      toastError("Save failed", e.message);
    }
    setIsSaving(false);
  };

  const inviteTeamMember = async (email: string, role: string) => {
    try {
      const res = await authFetch("/api/team/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role }),
      });
      if (!res.ok) throw new Error("Invite failed");
      toastSuccess("Invitation sent", `An invite has been sent to ${email}`);
      fetchData();
    } catch (e: any) {
      toastError("Invite failed", e.message);
    }
  };

  const removeTeamMember = async (id: string) => {
    try {
      const res = await authFetch(`/api/team/members/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Removal failed");
      toastSuccess("Member removed", "Team access revoked.");
      fetchData();
    } catch (e: any) {
      toastError("Removal failed", e.message);
    }
  };

  const addPhoneNumber = async (phone_number: string, vapi_number_id: string) => {
    try {
      await authFetch("/api/phone-numbers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone_number, vapi_number_id }),
      });
      fetchData();
      toastSuccess("Number added", phone_number);
    } catch (e: any) {
      toastError("Failed to add number", e.message);
    }
  };

  const updateNumberAgent = async (id: string | number, agent_id: string) => {
    try {
      await authFetch(`/api/phone-numbers/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent_id }),
      });
      fetchData();
    } catch (e) {
      clientLog.error("admin-settings:assign-number", e);
      toastError("Assignment failed", "Could not update the agent for this number.");
    }
  };

  const deletePhoneNumber = (id: number | string) => {
    setConfirmState({
      open: true,
      title: "Remove number",
      message:
        "Remove this phone number from your agents? The number stays in your Wireline voice network, but it will stop routing calls to agents.",
      onConfirm: async () => {
        setIsDeletingNumber(id);
        try {
          const resp = await authFetch(`/api/phone-numbers/${id}`, { method: "DELETE" });
          if (resp.ok) {
            setPhoneNumbers((prev) => prev.filter((n) => n.id !== id));
          }
          setConfirmState(CLOSED_CONFIRM);
        } catch (e) {
          clientLog.error("admin-settings:delete-number", e);
          toastError("Delete failed", "Could not remove this carrier number. Please try again.");
        } finally {
          setIsDeletingNumber(null);
        }
      },
    });
  };

  const deleteAccount = async (confirm: string) => {
    if (confirm !== "DELETE MY ACCOUNT") return;
    try {
      const res = await authFetch("/api/user/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: "DELETE MY ACCOUNT" }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Deletion failed");
      }
      await signOut();
    } catch (e: any) {
      toastError("Account deletion failed", e.message);
    }
  };

  return (
    <>
      <AdminHubViewport scroll>
        <h1 className="sr-only">Admin workspace</h1>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3 border-b border-border/70 pb-3">
          <div>
            <p className="wl-eyebrow wl-eyebrow--muted">Workspace settings</p>
            <p className="mt-1 font-[var(--wireline-font-family-display)] text-xl font-semibold tracking-[-0.03em] text-foreground">
              Admin
            </p>
          </div>
          <Link
            to="/settings"
            className="inline-flex min-h-10 items-center rounded-xl px-3 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            Account settings
          </Link>
        </div>
        <WorkspaceTabStrip
          ariaLabel="Admin sections"
          activeId={activeTab}
          onSelect={(id) => navigate(`/admin?tab=${id}`)}
          density="compact"
          wrap
          className="mb-3 border-b border-border/70 pb-3"
          tabs={VALID_TABS.map((tab) => ({
            id: tab,
            label: OPS_ADMIN.tabLabels[tab as OpsAdminTab] ?? tab,
            shortLabel: ADMIN_TAB_SHORT_LABELS[tab],
          }))}
        />
        <WorkspacePageFrame mode="operate" className="gap-0 pb-0">
          <div className="h-full flex flex-col">
            <IntegrationHealthBanner
              health={integrationHealth}
              onOpenIntegrations={() => navigate("/connections")}
            />
            <div className="flex-1 min-h-0 scroll-viewport scroll-pb-safe">
              {isLoading ? (
                <ClientRouteLoading
                  icon={<Settings className="w-7 h-7" />}
                  label={OPS_ADMIN.loading}
                />
              ) : (
                <>
                  {activeTab === "accounts" && (
                    <motion.div
                      key="accounts"
                      role="tabpanel"
                      id="admin-panel-accounts"
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="h-full"
                    >
                      <AccountsPanel />
                    </motion.div>
                  )}
                  {activeTab === "branding" && (
                    <motion.div
                      key="branding"
                      role="tabpanel"
                      id="admin-panel-branding"
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="h-full space-y-4"
                    >
                      <p className="rounded-xl border border-border bg-card px-4 py-3 text-sm leading-6 text-muted-foreground">
                        Workspace brand also lives under{" "}
                        <Link
                          to="/settings/customization"
                          className="font-semibold text-primary hover:underline"
                        >
                          Settings → Appearance
                        </Link>{" "}
                        for everyday owner edits. Admin keeps the same controls for advanced
                        configuration.
                      </p>
                      <BrandingPanel
                        settings={settings}
                        onUpdate={setSettings}
                        onSave={saveSettings}
                        isSaving={isSaving}
                      />
                    </motion.div>
                  )}

                  {activeTab === "carrier" && (
                    <motion.div
                      key="carrier"
                      role="tabpanel"
                      id="admin-panel-carrier"
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="h-full"
                    >
                      <CarrierPanel
                        settings={settings}
                        agents={agents}
                        phoneNumbers={phoneNumbers}
                        carrierNumbers={carrierNumbers}
                        isSaving={isSaving}
                        isSyncing={isSyncing}
                        onUpdateSettings={setSettings}
                        onSaveSettings={saveSettings}
                        onSyncNumbers={syncCarrierNumbers}
                        onAddNumber={addPhoneNumber}
                        onDeleteNumber={deletePhoneNumber}
                        onUpdateNumberAgent={updateNumberAgent}
                      />
                    </motion.div>
                  )}

                  {activeTab === "subscription" && (
                    <motion.div
                      key="subscription"
                      role="tabpanel"
                      id="admin-panel-subscription"
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="h-full"
                    >
                      <SubscriptionPanel onDeleteAccount={deleteAccount} />
                    </motion.div>
                  )}

                  {activeTab === "team" && (
                    <motion.div
                      key="team"
                      role="tabpanel"
                      id="admin-panel-team"
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="h-full"
                    >
                      <TeamPanel
                        members={teamMembers}
                        onInvite={inviteTeamMember}
                        onRemove={removeTeamMember}
                      />
                    </motion.div>
                  )}

                  {activeTab === "flywheel" && (
                    <motion.div
                      key="flywheel"
                      role="tabpanel"
                      id="admin-panel-flywheel"
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="h-full"
                    >
                      <GrowthPanel
                        settings={settings}
                        setSettings={setSettings}
                        onSave={saveSettings}
                        isSaving={isSaving}
                      />
                    </motion.div>
                  )}

                  {activeTab === "activity" && (
                    <motion.div
                      key="activity"
                      role="tabpanel"
                      id="admin-panel-activity"
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="h-full"
                    >
                      <div className="space-y-5">
                        <ComplianceChecklist />
                        <AuditActivityPanel />
                      </div>
                    </motion.div>
                  )}
                </>
              )}
            </div>
          </div>
        </WorkspacePageFrame>
      </AdminHubViewport>
      <ConfirmModal
        open={confirmState.open}
        title={confirmState.title}
        message={confirmState.message}
        danger
        loading={isDeletingNumber !== null}
        onConfirm={confirmState.onConfirm}
        onCancel={() => setConfirmState(CLOSED_CONFIRM)}
      />
    </>
  );
}
