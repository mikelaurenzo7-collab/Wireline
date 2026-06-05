/* eslint-disable @typescript-eslint/no-explicit-any -- Agents, leads, campaigns,
 * callbacks and analytics all flow through /api/* endpoints whose response
 * shapes are not yet codified in contracts/api-types.ts. The component treats
 * each row as any[] for state, and forwards the same shape to extracted
 * sub-components (DispatchTab, CampaignsTab, CallbacksList). Tightening is
 * tracked alongside the OutboundDialer god-file slicing pass. */
import React, { useState, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { CalendarClock, Repeat } from "lucide-react";
import { AnimatePresence } from "motion/react";
import Cadences from "../Cadences";
import Papa from "papaparse";
import { logFetchError } from "../../lib/utils";
import { authFetch } from "../../lib/api";
import { Panel } from "../PageShell";
import CsvExportButton from "../CsvExportButton";
import { useToast } from "../../contexts/ToastContext";
import ConfirmModal from "../ConfirmModal";
import { isNumberOnDncList, normalizeOutboundNumber } from "../../lib/dialer-compliance";

// Types & constants extracted to outbound/shared.tsx
import { type ConfirmState, CLOSED_CONFIRM } from "./shared";
// Sub-components extracted during the 2026 audit god-file slicing pass
import CallbacksListExtracted from "./CallbacksList";
import CreateCampaignModalExtracted from "./CreateCampaignModal";
import DispatchTab from "./DispatchTab";
import CampaignsTab from "./CampaignsTab";
import ClientToolbar from "../layout/ClientToolbar";
import { OPS_CHANNEL_TOOLBAR } from "../../lib/wireline-ops-design";
import {
  resolveAppPageSecondaryRoute,
  resolveAppPageSecondaryTabId,
} from "../../lib/page-sub-tabs";
import { Input } from "../ui/shadcn/Input";

export default function OutboundDialer({ embedded: _embedded = false }: { embedded?: boolean }) {
  const { success: toastSuccess, error: toastError, info: toastInfo } = useToast();
  const [searchParams] = useSearchParams();
  const outboundSecondary = resolveAppPageSecondaryRoute("/phone", "outbound");
  const activeView = outboundSecondary
    ? resolveAppPageSecondaryTabId(outboundSecondary, searchParams.get("view"))
    : "dispatch";
  const [confirmState, setConfirmState] = useState<ConfirmState>(CLOSED_CONFIRM);
  const [isLoading, setIsLoading] = useState(true);
  const [agents, setAgents] = useState<any[]>([]);
  const [leads, setLeads] = useState<any[]>([]);
  const [leadsHasMore, setLeadsHasMore] = useState(false);
  const [leadsTotal, setLeadsTotal] = useState(0);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerNumber, setCustomerNumber] = useState("");
  const [context, setContext] = useState("");
  const [hasOutboundConsent, setHasOutboundConsent] = useState(false);

  const [isDialing, setIsDialing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [dialError, setDialError] = useState("");
  const [uploadStats, setUploadStats] = useState("");
  const [isDeletingLead, setIsDeletingLead] = useState<number | string | null>(null);
  const [launchingCampaignId, setLaunchingCampaignId] = useState<string | null>(null);
  const [stoppingCampaignId, setStoppingCampaignId] = useState<string | null>(null);

  // Campaign state
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [campaignLoading, setCampaignLoading] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState<any | null>(null);
  const [campaignLeads, setCampaignLeads] = useState<any[]>([]);
  const [campaignLeadsLoading, setCampaignLeadsLoading] = useState(false);
  const [showCampaignModal, setShowCampaignModal] = useState(false);
  const [bulkCampaignId, setBulkCampaignId] = useState<string>("");
  const [campaignAnalytics, setCampaignAnalytics] = useState<any | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);

  // Scheduled callbacks
  const [callbacks, setCallbacks] = useState<any[]>([]);
  const [callbacksLoading, setCallbacksLoading] = useState(false);

  // Voice-minute quota state for pre-flight dial gate
  const [quotaUsed, setQuotaUsed] = useState<number | null>(null);
  const [quotaLimit, setQuotaLimit] = useState<number | null>(null);

  // Compliance DNC List state
  const [dncEntries, setDncEntries] = useState<any[]>([]);

  const fetchDncList = async () => {
    try {
      const r = await authFetch("/api/dnc");
      if (r.ok) {
        const d = await r.json();
        setDncEntries(d.entries || []);
      }
    } catch (e) {
      logFetchError("Failed to load DNC entries for dialer check", e);
    }
  };

  useEffect(() => {
    fetchData();
    fetchCampaigns();
    fetchCallbacks();
    fetchDncList();
    authFetch("/api/quotas")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.usage?.voice_minutes_daily != null) setQuotaUsed(d.usage.voice_minutes_daily);
        if (d?.limits?.voice_minutes_daily != null) setQuotaLimit(d.limits.voice_minutes_daily);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-time fetch on mount
  }, []);

  // Live-poll lead statuses when a running campaign is selected.
  useEffect(() => {
    if (!selectedCampaign || selectedCampaign.status !== "running") return;
    const interval = setInterval(() => {
      fetchCampaignLeads(selectedCampaign.id);
      fetchCampaigns(); // refresh dialed_count / connected_count on list too
    }, 10_000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally re-keyed on campaign id + status
  }, [selectedCampaign?.id, selectedCampaign?.status]);

  const fetchCampaignAnalytics = async (id: string) => {
    setAnalyticsLoading(true);
    try {
      const res = await authFetch(`/api/campaigns/${id}/analytics`);
      const data = await res.json();
      setCampaignAnalytics(data);
    } catch (e) {
      logFetchError("Failed to fetch campaign analytics:", e);
      toastError("Analytics unavailable", "Could not load campaign analytics.");
    }
    setAnalyticsLoading(false);
  };

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const agentsRes = await authFetch("/api/agents");
      const agentsData = await agentsRes.json();
      setAgents(agentsData.agents || []);
      if (agentsData.agents?.length > 0) setSelectedAgentId(agentsData.agents[0].id);

      const leadsRes = await authFetch("/api/outbound");
      const leadsData = await leadsRes.json();
      setLeads(leadsData.leads || []);
      setLeadsHasMore(leadsData.hasMore || false);
      setLeadsTotal(leadsData.total || 0);
    } catch (e) {
      logFetchError("OutboundDialer", e);
      toastError(
        "Load failed",
        "Could not load leads or agents. Check your connection and try again.",
      );
    }
    setIsLoading(false);
  };

  const loadMoreLeads = async () => {
    setIsLoadingMore(true);
    try {
      const res = await authFetch(`/api/outbound?offset=${leads.length}`);
      const data = await res.json();
      setLeads((prev) => [...prev, ...(data.leads || [])]);
      setLeadsHasMore(data.hasMore || false);
      setLeadsTotal(data.total || 0);
    } catch (e) {
      logFetchError("OutboundDialer", e);
      toastError("Load more failed", "Could not load additional leads.");
    }
    setIsLoadingMore(false);
  };

  const deleteLead = (id: number | string) => {
    setConfirmState({
      open: true,
      title: "Remove lead",
      message: "Remove this lead from the queue? This cannot be undone.",
      danger: true,
      onConfirm: async () => {
        setConfirmState(CLOSED_CONFIRM);
        setIsDeletingLead(id);
        try {
          const resp = await authFetch(`/api/outbound/${id}`, { method: "DELETE" });
          if (resp.ok) setLeads((prev) => prev.filter((l) => l.id !== id));
        } catch (e) {
          logFetchError("Failed to delete lead", e);
          toastError("Delete failed", "Could not remove this lead. Please try again.");
        }
        setIsDeletingLead(null);
      },
    });
  };

  const dispatchCall = async () => {
    if (!selectedAgentId || !customerNumber) return;
    if (!hasOutboundConsent) {
      setDialError("Confirm outbound consent before dispatching this call.");
      return;
    }
    if (isNumberOnDncList(customerNumber, dncEntries)) {
      setDialError("Cannot dial: number is registered on your active Do-Not-Call (DNC) list.");
      toastError(
        "Blocked by DNC Policy",
        "This phone number is listed on your active Do-Not-Call list.",
      );
      return;
    }
    setIsDialing(true);
    setDialError("");
    try {
      const res = await authFetch("/api/outbound/dial", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: selectedAgentId,
          customerName,
          customerNumber,
          context,
          hasExpressWrittenConsent: hasOutboundConsent,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      toastSuccess("Call dispatched", `Dialing ${customerNumber}…`);
      setCustomerName("");
      setCustomerNumber("");
      setContext("");
      setTimeout(() => fetchData(), 2000);
    } catch (err: any) {
      setDialError(err.message);
      toastError("Dispatch failed", err.message);
    } finally {
      setIsDialing(false);
    }
  };

  const launchCampaign = async (campaignId: string, campaignName: string) => {
    setLaunchingCampaignId(campaignId);
    try {
      const res = await authFetch(`/api/campaigns/${campaignId}/launch`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toastSuccess(
        "Campaign launched",
        `Dispatching ${data.dispatching} call${data.dispatching === 1 ? "" : "s"} for "${campaignName}"`,
      );
      setCampaigns((prev) =>
        prev.map((c) => (c.id === campaignId ? { ...c, status: "running" } : c)),
      );
      if (selectedCampaign?.id === campaignId)
        setSelectedCampaign((p: any) => ({ ...p, status: "running" }));
      setTimeout(() => fetchCampaigns(), 5000);
    } catch (e: any) {
      toastError("Launch failed", e.message);
    }
    setLaunchingCampaignId(null);
  };

  const stopCampaign = async (campaignId: string) => {
    setStoppingCampaignId(campaignId);
    try {
      const res = await authFetch(`/api/campaigns/${campaignId}/stop`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toastSuccess("Campaign stopped", "Dialing will halt after the current lead.");
      setCampaigns((prev) =>
        prev.map((c) => (c.id === campaignId ? { ...c, status: "paused" } : c)),
      );
      if (selectedCampaign?.id === campaignId)
        setSelectedCampaign((p: any) => ({ ...p, status: "paused" }));
    } catch (e: any) {
      toastError("Stop failed", e.message);
    }
    setStoppingCampaignId(null);
  };

  const retryFailedLeads = async (campaignId: string) => {
    try {
      const res = await authFetch(`/api/campaigns/${campaignId}/retry-failed`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toastSuccess(
        "Leads reset",
        `${data.reset} failed lead${data.reset === 1 ? "" : "s"} re-queued — launch again to retry`,
      );
      if (selectedCampaign?.id === campaignId) {
        const leads = await authFetch(`/api/campaigns/${campaignId}/leads`).then((r) => r.json());
        setCampaignLeads(leads.leads || []);
      }
    } catch (e: any) {
      toastError("Retry failed", e.message);
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setUploadStats("");
    setDialError("");

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        const rawLeads = results.data
          .map((row: any) => ({
            agent_id: selectedAgentId,
            customer_name: row.customer_name || row.Name || row.name || "",
            customer_number: row.customer_number || row.Phone || row.phone || "",
            context: row.context || row.Context || row.Notes || "",
            status: "Queued",
          }))
          .filter((l) => l.customer_number);

        if (rawLeads.length === 0) {
          setDialError(
            "No valid phone numbers found. Use a header named 'customer_number' or 'phone'.",
          );
          toastError("Upload failed", "No valid phone numbers found in CSV.");
          setIsUploading(false);
          return;
        }

        // Automatic Pre-flight Compliance Scrubbing
        let scrubbedCount = 0;
        const processedLeads = [];

        for (const lead of rawLeads) {
          const rawNum = String(lead.customer_number || "").trim();
          const digits = rawNum.replace(/\D/g, "");
          if (!digits || digits.length < 7) {
            scrubbedCount++;
            continue;
          }

          const formattedNum = normalizeOutboundNumber(rawNum);

          if (isNumberOnDncList(rawNum, dncEntries)) {
            scrubbedCount++;
            continue;
          }

          processedLeads.push({
            ...lead,
            customer_number: formattedNum,
          });
        }

        if (processedLeads.length === 0) {
          setDialError(
            `All ${rawLeads.length} leads were scrubbed due to DNC matches or invalid formatting.`,
          );
          toastError("Upload scrubbed", "All leads were filtered out by pre-flight compliance.");
          setIsUploading(false);
          return;
        }

        try {
          const res = await authFetch("/api/outbound/bulk", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              leads: processedLeads,
              has_express_written_consent: hasOutboundConsent,
              ...(bulkCampaignId ? { campaign_id: bulkCampaignId } : {}),
            }),
          });
          if (!res.ok) throw new Error("Bulk upload failed.");

          const msg = `Pre-flight Compliance Pass: ${processedLeads.length} leads queued. ${scrubbedCount} numbers scrubbed & excluded.`;
          setUploadStats(msg);
          toastSuccess("Leads queued", msg);
          setTimeout(() => {
            fetchData();
            fetchCampaigns();
          }, 1000);
        } catch (e: any) {
          setDialError(e.message);
          toastError("Upload failed", e.message);
        }
        setIsUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      },
      error: (error) => {
        setDialError(`CSV parsing error: ${error.message}`);
        toastError("CSV error", error.message);
        setIsUploading(false);
      },
    });
  };

  const launchQueue = () => {
    if (!hasOutboundConsent) {
      setDialError("Confirm outbound consent before dispatching queued calls.");
      return;
    }
    const queued = leads.filter((l) => l.status === "Queued");
    if (queued.length === 0) return;
    setConfirmState({
      open: true,
      title: "Launch queue",
      message: `Dispatch ${queued.length} queued call${queued.length === 1 ? "" : "s"} sequentially? This will place real outbound calls.`,
      confirmLabel: "Launch",
      onConfirm: () => {
        setConfirmState(CLOSED_CONFIRM);
        void runQueue(queued);
      },
    } as any);
  };

  const runQueue = async (queued: any[]) => {
    setIsDialing(true);
    let dialedCount = 0;
    let skippedDncCount = 0;
    setUploadStats(`Compliance Check Active: Scanning queue…`);

    // Pre-scan queue at launch-time for newly suppressed entries
    const verifiedQueued = [];
    for (const lead of queued) {
      if (isNumberOnDncList(lead.customer_number || lead.phone_number || "", dncEntries)) {
        skippedDncCount++;
        try {
          await authFetch(`/api/outbound/${lead.id}`, { method: "DELETE" });
        } catch (e) {
          logFetchError("Failed to delete DNC lead", e);
        }
      } else {
        verifiedQueued.push(lead);
      }
    }

    if (verifiedQueued.length === 0) {
      setIsDialing(false);
      const msg = `Queue Cancelled: All ${queued.length} numbers match active DNC suppressions.`;
      setDialError(msg);
      toastError("Queue Blocked", msg);
      setTimeout(() => fetchData(), 1000);
      return;
    }

    const statusMsg = `Compliance checks passed: Dialing ${verifiedQueued.length} calls (${skippedDncCount} DNC matches scrubbed)…`;
    setUploadStats(statusMsg);
    toastInfo("Queue launched", statusMsg);

    for (const lead of verifiedQueued) {
      try {
        const res = await authFetch("/api/outbound/dial", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            agentId: lead.agent_id,
            customerName: lead.customer_name,
            customerNumber: lead.customer_number || lead.phone_number,
            context: lead.context,
            hasExpressWrittenConsent: hasOutboundConsent,
          }),
        });
        if (res.ok) {
          setLeads((prev) => prev.map((l) => (l.id === lead.id ? { ...l, status: "Dialing" } : l)));
          dialedCount++;
        }
        await new Promise((resolve) => setTimeout(resolve, 2000));
      } catch (e) {
        logFetchError("Failed batch call", e);
        toastError(
          "Batch call error",
          `Could not dispatch call to ${lead.customer_number || "unknown number"}.`,
        );
      }
    }

    setIsDialing(false);
    const finishMsg = `Queue complete: ${dialedCount} calls dispatched; ${skippedDncCount} DNC numbers scrubbed & excluded.`;
    setUploadStats(finishMsg);
    toastSuccess("Queue complete", finishMsg);
    setTimeout(() => fetchData(), 2000);
  };

  const fetchCampaigns = async () => {
    setCampaignLoading(true);
    try {
      const res = await authFetch("/api/campaigns");
      const data = await res.json();
      setCampaigns(data.campaigns || []);
    } catch (e) {
      logFetchError("Failed to fetch campaigns:", e);
      toastError("Campaigns unavailable", "Could not load campaigns.");
    }
    setCampaignLoading(false);
  };

  const fetchCallbacks = async () => {
    setCallbacksLoading(true);
    try {
      const res = await authFetch("/api/callbacks");
      const data = await res.json();
      setCallbacks(data.callbacks || []);
    } catch (e) {
      logFetchError("Failed to fetch callbacks:", e);
      toastError("Callbacks unavailable", "Could not load scheduled callbacks.");
    }
    setCallbacksLoading(false);
  };

  const fetchCampaignLeads = async (id: string) => {
    setCampaignLeadsLoading(true);
    try {
      const res = await authFetch(`/api/campaigns/${id}/leads`);
      const data = await res.json();
      setCampaignLeads(data.leads || []);
    } catch (e) {
      logFetchError("Failed to fetch campaign leads:", e);
      toastError("Leads unavailable", "Could not load leads for this campaign.");
    }
    setCampaignLeadsLoading(false);
  };

  const setCampaignStatus = async (id: string, status: string) => {
    try {
      const res = await authFetch(`/api/campaigns/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (data.campaign) {
        setCampaigns((prev) => prev.map((c) => (c.id === id ? { ...c, ...data.campaign } : c)));
        if (selectedCampaign?.id === id)
          setSelectedCampaign((prev: any) => ({ ...prev, ...data.campaign }));
      }
    } catch (e) {
      logFetchError("Failed to set campaign status", e);
      toastError("Status update failed", "Could not change campaign status. Please try again.");
    }
  };

  const deleteCampaign = (id: string) => {
    setConfirmState({
      open: true,
      title: "Delete campaign",
      message:
        "Delete this campaign? Leads will be unlinked but not removed. This cannot be undone.",
      danger: true,
      onConfirm: async () => {
        setConfirmState(CLOSED_CONFIRM);
        try {
          await authFetch(`/api/campaigns/${id}`, { method: "DELETE" });
          setCampaigns((prev) => prev.filter((c) => c.id !== id));
          if (selectedCampaign?.id === id) setSelectedCampaign(null);
        } catch (e) {
          logFetchError("Failed to delete campaign", e);
          toastError("Delete failed", "Could not delete this campaign. Please try again.");
        }
      },
    });
  };

  const handleSelectCampaign = (c: any) => {
    setSelectedCampaign(c);
    setCampaignAnalytics(null);
    setShowAnalytics(false);
    fetchCampaignLeads(c.id);
  };

  const queuedCount = leads.filter((l) => l.status === "Queued").length;

  const exportAction = <CsvExportButton type="leads" label={OPS_CHANNEL_TOOLBAR.outbound.export} />;

  const outboundViewContent = (() => {
    switch (activeView) {
      case "campaigns":
        return (
          <CampaignsTab
            campaigns={campaigns}
            campaignLoading={campaignLoading}
            setShowCampaignModal={setShowCampaignModal}
            selectedCampaign={selectedCampaign}
            handleSelectCampaign={handleSelectCampaign}
            showAnalytics={showAnalytics}
            setShowAnalytics={setShowAnalytics}
            fetchCampaignAnalytics={fetchCampaignAnalytics}
            analyticsLoading={analyticsLoading}
            campaignAnalytics={campaignAnalytics}
            launchCampaign={launchCampaign}
            launchingCampaignId={launchingCampaignId}
            stopCampaign={stopCampaign}
            stoppingCampaignId={stoppingCampaignId}
            setCampaignStatus={setCampaignStatus}
            deleteCampaign={deleteCampaign}
            campaignLeadsLoading={campaignLeadsLoading}
            campaignLeads={campaignLeads}
            triggerUploadCsv={() => fileInputRef.current?.click()}
            retryFailedLeads={retryFailedLeads}
          />
        );
      case "sequences":
        return (
          <Panel icon={Repeat} hint="Multi-touch cadences" title="" scroll>
            <Cadences />
          </Panel>
        );
      case "callbacks":
        return (
          <Panel icon={CalendarClock} hint="Scheduled" title="" scroll>
            <CallbacksList
              callbacks={callbacks}
              loading={callbacksLoading}
              onRefresh={fetchCallbacks}
            />
          </Panel>
        );
      case "dispatch":
      default:
        return (
          <DispatchTab
            isLoading={isLoading}
            agents={agents}
            selectedAgentId={selectedAgentId}
            setSelectedAgentId={setSelectedAgentId}
            customerNumber={customerNumber}
            setCustomerNumber={setCustomerNumber}
            customerName={customerName}
            setCustomerName={setCustomerName}
            context={context}
            setContext={setContext}
            hasOutboundConsent={hasOutboundConsent}
            setHasOutboundConsent={setHasOutboundConsent}
            isDialing={isDialing}
            isUploading={isUploading}
            dialError={dialError}
            uploadStats={uploadStats}
            dispatchCall={dispatchCall}
            campaigns={campaigns}
            bulkCampaignId={bulkCampaignId}
            setBulkCampaignId={setBulkCampaignId}
            triggerUploadCsv={() => fileInputRef.current?.click()}
            leads={leads}
            leadsTotal={leadsTotal}
            queuedCount={queuedCount}
            launchQueue={launchQueue}
            deleteLead={deleteLead}
            isDeletingLead={isDeletingLead}
            loadMoreLeads={loadMoreLeads}
            leadsHasMore={leadsHasMore}
            isLoadingMore={isLoadingMore}
            quotaUsed={quotaUsed}
            quotaLimit={quotaLimit}
            dncEntries={dncEntries}
            isNumberOnDncList={isNumberOnDncList}
          />
        );
    }
  })();

  const dialerShell = (
    <div key={activeView} className="flex-1 min-h-0 overflow-hidden flex flex-col">
      {outboundViewContent}
    </div>
  );

  return (
    <>
      {/* Always-mounted file input — both EmptyState CTAs (single-mode queue
          and campaign view) trigger it via fileInputRef, so it must live
          outside the Bulk-mode subtree. Hidden visually; click is fully
          synthetic. */}
      <Input
        type="file"
        accept=".csv"
        className="hidden"
        ref={fileInputRef}
        onChange={handleFileUpload}
      />
      <div className="h-full flex flex-col min-h-0">
        <ClientToolbar
          left={
            <span className="app-toolbar-stat">
              {isLoading
                ? OPS_CHANNEL_TOOLBAR.outbound.loading
                : OPS_CHANNEL_TOOLBAR.outbound.stat(queuedCount, leadsTotal)}
            </span>
          }
          actions={exportAction}
        />
        <div className="flex-1 min-h-0">{dialerShell}</div>
      </div>
      <AnimatePresence>
        {showCampaignModal && (
          <CreateCampaignModal
            agents={agents}
            onClose={() => setShowCampaignModal(false)}
            onCreated={(c) => {
              setCampaigns((prev) => [c, ...prev]);
              setShowCampaignModal(false);
            }}
          />
        )}
      </AnimatePresence>
      <ConfirmModal
        open={confirmState.open}
        title={confirmState.title}
        message={confirmState.message}
        danger={(confirmState as any).danger}
        confirmLabel={(confirmState as any).confirmLabel}
        onConfirm={confirmState.onConfirm}
        onCancel={() => setConfirmState(CLOSED_CONFIRM)}
      />
    </>
  );
}

// CAMPAIGN_STATUS moved to outbound/shared.tsx

/* ─── Callbacks List — now in outbound/CallbacksList.tsx ───────── */
// Re-export for backwards compatibility; the inline copy has been removed.
const CallbacksList = CallbacksListExtracted;

/* ─── Create Campaign Modal — now in outbound/CreateCampaignModal.tsx ─ */
const CreateCampaignModal = CreateCampaignModalExtracted;
