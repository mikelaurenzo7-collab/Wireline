import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Loader2, ChevronRight, AlertTriangle } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import ConfirmModal from "./ConfirmModal";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "../lib/utils";
import { authFetch } from "../lib/api";
import CrmConnectionCard from "./CrmConnectionCard";
import IntegrationHealthBanner, { type IntegrationHealthPayload } from "./IntegrationHealthBanner";
import PageShell, { Panel } from "./PageShell";
import HubTabs, { SYSTEM_HUB } from "./HubTabs";
import { useToast } from "../contexts/ToastContext";
import { useBranding } from "../contexts/BrandingContext";

// Modularized Panels
import { BrandingPanel } from "./admin/BrandingPanel";
import { CarrierPanel } from "./admin/CarrierPanel";
import VoiceLibraryPanel from "./admin/VoiceLibraryPanel";
import PronunciationDictionaryPanel from "./PronunciationDictionaryPanel";
import { SubscriptionPanel } from "./admin/SubscriptionPanel";
import { SystemPanel } from "./admin/SystemPanel";
import { TeamPanel } from "./admin/TeamPanel";
import { GrowthPanel } from "./admin/GrowthPanel";
import { AuditActivityPanel } from "./admin/AuditActivityPanel";

type ConfirmState = { open: boolean; title: string; message: string; onConfirm: () => void };
const CLOSED_CONFIRM: ConfirmState = { open: false, title: "", message: "", onConfirm: () => {} };

export default function AdminSettings() {
  const { success: toastSuccess, error: toastError } = useToast();
  const { signOut } = useAuth();
  const { updateBranding } = useBranding();
  const [confirmState, setConfirmState] = useState<ConfirmState>(CLOSED_CONFIRM);
  const [settings, setSettings] = useState({
    vapi_phone_number_id: "",
    vapi_phone_inbound_agent_id: "",
    subscription_status: "active",
    max_agents: 3,
    voice_llm_provider: "google",
    voice_llm_model: "gemini-1.5-flash",
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
    primary_color: "#4F1E7B",
  });
  const [teamMembers, setTeamMembers] = useState<any[]>([]);
  const [agents, setAgents] = useState<any[]>([]);
  const [phoneNumbers, setPhoneNumbers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeletingNumber, setIsDeletingNumber] = useState<number | string | null>(null);
  const [claudeStatus, setClaudeStatus] = useState<{
    available: boolean;
    model: string;
    capabilities?: string[];
  } | null>(null);
  type IntegrationRow = {
    id: string;
    label: string;
    description: string;
    group: string;
    required: boolean;
    status: "configured" | "missing" | "fallback";
    envVars: Array<{ name: string; present: boolean }>;
    fallback?: string;
    docsUrl?: string;
  };
  const [integrations, setIntegrations] = useState<IntegrationRow[] | null>(null);
  const [operationalSlos, setOperationalSlos] = useState<Record<string, unknown> | null>(null);
  const [integrationHealth, setIntegrationHealth] = useState<IntegrationHealthPayload | null>(null);

  type AdminTab =
    | "branding"
    | "carrier"
    | "voices"
    | "pronunciation"
    | "subscription"
    | "team"
    | "flywheel"
    | "system"
    | "activity";
  const VALID_TABS: AdminTab[] = [
    "branding",
    "carrier",
    "voices",
    "pronunciation",
    "subscription",
    "team",
    "flywheel",
    "system",
    "activity",
  ];
  // Honor ?tab=<name> in the URL so deep links (e.g. the TrialBanner
  // "Upgrade now" CTA pointing at /admin?tab=subscription) land on
  // the correct tab instead of bouncing to the default. Falls back
  // to "branding" for unknown or missing values.
  const initialTab: AdminTab = (() => {
    if (typeof window === "undefined") return "branding";
    const qs = new URLSearchParams(window.location.search).get("tab");
    return VALID_TABS.includes(qs as AdminTab) ? (qs as AdminTab) : "branding";
  })();
  const [activeTab, setActiveTab] = useState<AdminTab>(initialTab);

  const [carrierNumbers, setCarrierNumbers] = useState<any[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);

  const providerDocsUrl =
    {
      google: "https://ai.google.dev/gemini-api/docs/models",
      anthropic: "https://docs.anthropic.com/en/docs/about-claude/models/overview",
    }[settings.voice_llm_provider] ?? "https://ai.google.dev/gemini-api/docs/models";

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
    fetchClaudeStatus();
    fetchIntegrations();
    fetchOperationalSlos();
    fetchIntegrationHealth();
    fetchTeam();
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

  const fetchClaudeStatus = async () => {
    try {
      const r = await authFetch("/api/claude/status");
      if (r.ok) setClaudeStatus(await r.json());
    } catch {
      /* non-critical */
    }
  };

  const fetchIntegrations = async () => {
    try {
      const r = await authFetch("/api/health/integrations");
      if (r.ok) {
        const d = await r.json();
        setIntegrations(d.integrations || []);
      }
    } catch {
      /* non-critical */
    }
  };

  const fetchOperationalSlos = async () => {
    try {
      const r = await authFetch("/api/health/slos");
      if (r.ok) setOperationalSlos(await r.json());
      else setOperationalSlos(null);
    } catch {
      setOperationalSlos(null);
    }
  };

  const downloadEvidencePack = async () => {
    try {
      const r = await authFetch("/api/soc2/evidence-pack");
      if (!r.ok) {
        toastError(
          "Export unavailable",
          "Requires audit.read permission — owner, admin, or auditor roles.",
        );
        return;
      }
      const data = await r.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `wireline-soc2-evidence-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toastSuccess("Evidence pack exported", "JSON downloaded for your SOC2 workbook.");
    } catch (e: any) {
      toastError("Export failed", e?.message || "Unknown error.");
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
          voice_llm_provider: settingsRes.voice_llm_provider || "google",
          voice_llm_model: settingsRes.voice_llm_model || "gemini-1.5-flash",
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
          primary_color: settingsRes.primary_color || "#4F1E7B",
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
      console.error(e);
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
    } catch (e) {
      console.error(e);
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
      if (!res.ok) throw new Error("Save failed");

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

  const updateNumberAgent = async (id: string, agent_id: string) => {
    try {
      await authFetch(`/api/phone-numbers/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent_id }),
      });
      fetchData();
    } catch (e) {
      console.error(e);
      toastError("Assignment failed", "Could not update the agent for this number.");
    }
  };

  const deletePhoneNumber = (id: number | string) => {
    setConfirmState({
      open: true,
      title: "Remove number",
      message:
        "Remove this phone number from your fleet? The number stays in your Wireline voice network, but it will stop routing calls to agents.",
      onConfirm: async () => {
        setConfirmState(CLOSED_CONFIRM);
        setIsDeletingNumber(id);
        try {
          const resp = await authFetch(`/api/phone-numbers/${id}`, { method: "DELETE" });
          if (resp.ok) {
            setPhoneNumbers((prev) => prev.filter((n) => n.id !== id));
          }
        } catch (e) {
          console.error(e);
          toastError("Delete failed", "Could not remove this carrier number. Please try again.");
        }
        setIsDeletingNumber(null);
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

  const tabSwitcher = (
    <div
      className="flex p-1 rounded-full glass border border-white/10 overflow-x-auto snap-x snap-mandatory scrollbar-hide max-w-full"
      role="tablist"
    >
      {(
        [
          "branding",
          "carrier",
          "voices",
          "pronunciation",
          "subscription",
          "team",
          "flywheel",
          "system",
          "activity",
        ] as const
      ).map((t) => (
        <button
          key={t}
          role="tab"
          aria-selected={activeTab === t}
          aria-controls={`admin-panel-${t}`}
          onClick={() => setActiveTab(t)}
          className={cn(
            "shrink-0 snap-start px-3 py-1.5 rounded-full text-[10px] uppercase tracking-[0.25em] transition-colors whitespace-nowrap",
            activeTab === t ? "bg-brand/20 text-brand" : "text-muted hover:text-ink",
          )}
        >
          {t === "branding"
            ? "Branding"
            : t === "carrier"
              ? "Carrier"
              : t === "voices"
                ? "Voices"
                : t === "pronunciation"
                  ? "Pronunciation"
                  : t === "subscription"
                    ? "Billing"
                    : t === "team"
                      ? "Team"
                      : t === "flywheel"
                        ? "Growth"
                        : t === "system"
                          ? "System"
                          : "Activity"}
        </button>
      ))}
    </div>
  );

  return (
    <div className="h-full flex flex-col min-h-0">
      <HubTabs tabs={SYSTEM_HUB} label="System sub-navigation" />
      <div className="flex-1 min-h-0">
        <PageShell
          title="Settings"
          eyebrow="Admin · Configuration"
          subtitle="API credentials, phone numbers, and platform configuration."
          actions={tabSwitcher}
        >
          <div className="h-full flex flex-col">
            <IntegrationHealthBanner
              health={integrationHealth}
              onOpenIntegrations={() => setActiveTab("system")}
            />
            <div className="flex-1 min-h-0">
              {isLoading ? (
                <div
                  role="status"
                  aria-live="polite"
                  className="h-full flex flex-col items-center justify-center gap-3"
                >
                  <Loader2 className="w-5 h-5 animate-spin text-brand" aria-hidden="true" />
                  <span className="text-[10px] uppercase tracking-[0.4em] text-muted/70">
                    Loading settings
                  </span>
                </div>
              ) : (
                <AnimatePresence mode="wait">
                  {activeTab === "branding" && (
                    <motion.div
                      key="branding"
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="h-full"
                    >
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
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
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

                  {activeTab === "voices" && (
                    <motion.div
                      key="voices"
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="h-full"
                    >
                      <VoiceLibraryPanel />
                    </motion.div>
                  )}

                  {activeTab === "pronunciation" && (
                    <motion.div
                      key="pronunciation"
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="h-full"
                    >
                      <PronunciationDictionaryPanel />
                    </motion.div>
                  )}

                  {activeTab === "subscription" && (
                    <motion.div
                      key="subscription"
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="h-full"
                    >
                      <SubscriptionPanel
                        settings={settings}
                        agents={agents}
                        isSaving={isSaving}
                        onUpdateSettings={setSettings}
                        onSaveSettings={saveSettings}
                        onDeleteAccount={deleteAccount}
                      />
                    </motion.div>
                  )}

                  {activeTab === "team" && (
                    <motion.div
                      key="team"
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
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
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
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

                  {activeTab === "system" && (
                    <motion.div
                      key="system"
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="h-full"
                    >
                      <SystemPanel
                        claudeStatus={claudeStatus}
                        integrations={integrations}
                        operationalSlos={operationalSlos}
                        onOpenIntegrations={() => setActiveTab("system")}
                      />
                    </motion.div>
                  )}

                  {activeTab === "activity" && (
                    <motion.div
                      key="activity"
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="h-full"
                    >
                      <AuditActivityPanel />
                    </motion.div>
                  )}
                </AnimatePresence>
              )}
            </div>
          </div>
        </PageShell>
        <ConfirmModal
          open={confirmState.open}
          title={confirmState.title}
          message={confirmState.message}
          danger
          onConfirm={confirmState.onConfirm}
          onCancel={() => setConfirmState(CLOSED_CONFIRM)}
        />
      </div>
    </div>
  );
}
