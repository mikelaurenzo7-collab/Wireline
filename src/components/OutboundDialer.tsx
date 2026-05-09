import React, { useState, useEffect, useRef } from "react";
import { Loader2, PlayCircle, Plus, Phone, UploadCloud, Bot, Radar, Zap, Terminal, Shield, FileSpreadsheet, ChevronRight, Search, Trash2, AlertTriangle, CheckCircle2, Megaphone, Target, Pause, Play, X, Clock, Users, Activity, BarChart3, Rocket, RefreshCw, TrendingUp, DollarSign, Award, CalendarClock } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import Papa from "papaparse";
import { cn } from "../lib/utils";
import { authFetch } from "../lib/api";
import { formatDate, safeDate } from "../lib/safe-date";
import { Link } from "react-router-dom";
import { ClaudeRecipeButton } from "./ClaudeRecipes";
import CsvExportButton from "./CsvExportButton";
import PageShell, { Panel } from "./PageShell";
import HubTabs, { CHANNELS_HUB } from "./HubTabs";
import { useToast } from "../contexts/ToastContext";
import ConfirmModal from "./ConfirmModal";

type ConfirmState = { open: boolean; title: string; message: string; onConfirm: () => void; danger?: boolean };
const CLOSED_CONFIRM: ConfirmState = { open: false, title: "", message: "", onConfirm: () => {} };

export default function OutboundDialer() {
  const { success: toastSuccess, error: toastError, info: toastInfo } = useToast();
  const [confirmState, setConfirmState] = useState<ConfirmState>(CLOSED_CONFIRM);
  const [isLoading, setIsLoading] = useState(true);
  const [agents, setAgents] = useState<any[]>([]);
  const [leads, setLeads] = useState<any[]>([]);
  const [leadsHasMore, setLeadsHasMore] = useState(false);
  const [leadsTotal, setLeadsTotal] = useState(0);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const [mode, setMode] = useState<"single" | "bulk">("single");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerNumber, setCustomerNumber] = useState("");
  const [context, setContext] = useState("");

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

  useEffect(() => { fetchData(); fetchCampaigns(); fetchCallbacks(); }, []);

  // Live-poll lead statuses when a running campaign is selected.
  useEffect(() => {
    if (!selectedCampaign || selectedCampaign.status !== "running") return;
    const interval = setInterval(() => {
      fetchCampaignLeads(selectedCampaign.id);
      fetchCampaigns(); // refresh dialed_count / connected_count on list too
    }, 10_000);
    return () => clearInterval(interval);
  }, [selectedCampaign?.id, selectedCampaign?.status]);

  const fetchCampaignAnalytics = async (id: string) => {
    setAnalyticsLoading(true);
    try {
      const res = await authFetch(`/api/campaigns/${id}/analytics`);
      const data = await res.json();
      setCampaignAnalytics(data);
    } catch (e) { console.error("Failed to fetch campaign analytics:", e); toastError("Analytics unavailable", "Could not load campaign analytics."); }
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
      console.error(e);
      toastError("Load failed", "Could not load leads or agents. Check your connection and try again.");
    }
    setIsLoading(false);
  };

  const loadMoreLeads = async () => {
    setIsLoadingMore(true);
    try {
      const res = await authFetch(`/api/outbound?offset=${leads.length}`);
      const data = await res.json();
      setLeads(prev => [...prev, ...(data.leads || [])]);
      setLeadsHasMore(data.hasMore || false);
      setLeadsTotal(data.total || 0);
    } catch (e) {
      console.error(e);
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
          if (resp.ok) setLeads(prev => prev.filter(l => l.id !== id));
        } catch (e) {
          console.error("Failed to delete lead:", e);
          toastError("Delete failed", "Could not remove this lead. Please try again.");
        }
        setIsDeletingLead(null);
      },
    });
  };

  const dispatchCall = async () => {
    if (!selectedAgentId || !customerNumber) return;
    setIsDialing(true);
    setDialError("");
    try {
      const res = await authFetch("/api/outbound/dial", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId: selectedAgentId, customerName, customerNumber, context })
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
      toastSuccess("Campaign launched", `Dispatching ${data.dispatching} call${data.dispatching === 1 ? '' : 's'} for "${campaignName}"`);
      setCampaigns(prev => prev.map(c => c.id === campaignId ? { ...c, status: 'running' } : c));
      if (selectedCampaign?.id === campaignId) setSelectedCampaign((p: any) => ({ ...p, status: 'running' }));
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
      setCampaigns(prev => prev.map(c => c.id === campaignId ? { ...c, status: 'paused' } : c));
      if (selectedCampaign?.id === campaignId) setSelectedCampaign((p: any) => ({ ...p, status: 'paused' }));
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
      toastSuccess("Leads reset", `${data.reset} failed lead${data.reset === 1 ? '' : 's'} re-queued — launch again to retry`);
      if (selectedCampaign?.id === campaignId) {
        const leads = await authFetch(`/api/campaigns/${campaignId}/leads`).then(r => r.json());
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
        const parsedLeads = results.data.map((row: any) => ({
          agent_id: selectedAgentId,
          customer_name: row.customer_name || row.Name || row.name || "",
          customer_number: row.customer_number || row.Phone || row.phone || "",
          context: row.context || row.Context || row.Notes || "",
          status: "Queued"
        })).filter(l => l.customer_number);

        if (parsedLeads.length === 0) {
          setDialError("No valid phone numbers found. Use a header named 'customer_number' or 'phone'.");
          toastError("Upload failed", "No valid phone numbers found in CSV.");
          setIsUploading(false);
          return;
        }

        try {
          const res = await authFetch("/api/outbound/bulk", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ leads: parsedLeads, ...(bulkCampaignId ? { campaign_id: bulkCampaignId } : {}) })
          });
          if (!res.ok) throw new Error("Bulk upload failed.");

          const msg = `Queued ${parsedLeads.length} lead${parsedLeads.length === 1 ? '' : 's'}${bulkCampaignId ? ' (campaign assigned)' : ''}`;
          setUploadStats(msg);
          toastSuccess("Leads queued", msg);
          setTimeout(() => { fetchData(); fetchCampaigns(); }, 1000);
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
      }
    });
  };

  const launchQueue = () => {
    const queued = leads.filter(l => l.status === "Queued");
    if (queued.length === 0) return;
    setConfirmState({
      open: true,
      title: "Launch queue",
      message: `Dispatch ${queued.length} queued call${queued.length === 1 ? '' : 's'} sequentially? This will place real outbound calls.`,
      confirmLabel: "Launch",
      onConfirm: () => { setConfirmState(CLOSED_CONFIRM); void runQueue(queued); },
    } as any);
  };

  const runQueue = async (queued: any[]) => {
    setIsDialing(true);
    setUploadStats(`Dispatching ${queued.length} call${queued.length === 1 ? '' : 's'}…`);
    toastInfo("Queue launched", `Dispatching ${queued.length} calls sequentially…`);
    setDialError("");

    for (const lead of queued) {
      try {
        const res = await authFetch("/api/outbound/dial", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            agentId: lead.agent_id,
            customerName: lead.customer_name,
            customerNumber: lead.customer_number,
            context: lead.context
          })
        });
        if (res.ok) {
          setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, status: "Dialing" } : l));
        }
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (e) {
        console.error("Failed batch call", e);
        toastError("Batch call error", `Could not dispatch call to ${lead.customer_number || "unknown number"}.`);
      }
    }

    setIsDialing(false);
    setUploadStats(`Sequential dispatch finished.`);
    toastSuccess("Queue complete", "All queued calls have been dispatched.");
    setTimeout(() => fetchData(), 2000);
  };

  const fetchCampaigns = async () => {
    setCampaignLoading(true);
    try {
      const res = await authFetch("/api/campaigns");
      const data = await res.json();
      setCampaigns(data.campaigns || []);
    } catch (e) { console.error("Failed to fetch campaigns:", e); toastError("Campaigns unavailable", "Could not load campaigns."); }
    setCampaignLoading(false);
  };

  const fetchCallbacks = async () => {
    setCallbacksLoading(true);
    try {
      const res = await authFetch("/api/callbacks");
      const data = await res.json();
      setCallbacks(data.callbacks || []);
    } catch (e) { console.error("Failed to fetch callbacks:", e); toastError("Callbacks unavailable", "Could not load scheduled callbacks."); }
    setCallbacksLoading(false);
  };

  const fetchCampaignLeads = async (id: string) => {
    setCampaignLeadsLoading(true);
    try {
      const res = await authFetch(`/api/campaigns/${id}/leads`);
      const data = await res.json();
      setCampaignLeads(data.leads || []);
    } catch (e) { console.error("Failed to fetch campaign leads:", e); toastError("Leads unavailable", "Could not load leads for this campaign."); }
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
        setCampaigns(prev => prev.map(c => c.id === id ? { ...c, ...data.campaign } : c));
        if (selectedCampaign?.id === id) setSelectedCampaign((prev: any) => ({ ...prev, ...data.campaign }));
      }
    } catch (e) { console.error("Failed to set campaign status:", e); toastError("Status update failed", "Could not change campaign status. Please try again."); }
  };

  const deleteCampaign = (id: string) => {
    setConfirmState({
      open: true,
      title: "Delete campaign",
      message: "Delete this campaign? Leads will be unlinked but not removed. This cannot be undone.",
      danger: true,
      onConfirm: async () => {
        setConfirmState(CLOSED_CONFIRM);
        try {
          await authFetch(`/api/campaigns/${id}`, { method: "DELETE" });
          setCampaigns(prev => prev.filter(c => c.id !== id));
          if (selectedCampaign?.id === id) setSelectedCampaign(null);
        } catch (e) { console.error("Failed to delete campaign:", e); toastError("Delete failed", "Could not delete this campaign. Please try again."); }
      },
    });
  };

  const handleSelectCampaign = (c: any) => {
    setSelectedCampaign(c);
    setCampaignAnalytics(null);
    setShowAnalytics(false);
    fetchCampaignLeads(c.id);
  };

  const queuedCount = leads.filter(l => l.status === "Queued").length;

  const dispatchTab = (
    <>
      {isLoading ? (
        <div className="h-full flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-5 h-5 animate-spin text-brand" />
          <span className="text-[10px] uppercase tracking-[0.4em] text-muted/70">Loading dispatcher</span>
        </div>
      ) : (
        <div className="h-full grid grid-cols-1 xl:grid-cols-12 gap-3 min-h-0">
          {/* Configuration */}
          <div className="xl:col-span-5 min-h-0">
            <Panel
              title="Parameters"
              hint={mode === "single" ? "SINGLE CALL" : "BULK UPLOAD"}
              icon={mode === "single" ? Zap : FileSpreadsheet}
              scroll
            >
              <div className="space-y-4">
                {/* Mode toggle */}
                <div className="flex items-center gap-2">
                  <div className="flex p-1 rounded-full glass border border-white/10">
                    {(["single", "bulk"] as const).map(m => (
                      <button
                        key={m}
                        onClick={() => setMode(m)}
                        className={cn(
                          "px-3 py-1 rounded-full text-[10px] uppercase tracking-[0.25em] transition-colors",
                          mode === m ? "bg-brand/20 text-brand" : "text-muted hover:text-ink"
                        )}
                      >
                        {m === "single" ? "Single" : "Bulk"}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[9px] uppercase tracking-[0.3em] text-muted/70 flex items-center gap-1.5">
                    <Bot className="w-2.5 h-2.5 text-brand" /> Agent
                  </label>
                  <div className="relative">
                    <select
                      value={selectedAgentId}
                      onChange={e => setSelectedAgentId(e.target.value)}
                      className="w-full text-sm bg-black/30 border border-white/10 rounded-lg pl-3 pr-8 py-2 outline-none focus:border-brand/50 appearance-none cursor-pointer text-ink"
                    >
                      {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                    <ChevronRight className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted pointer-events-none rotate-90" />
                  </div>
                </div>

                <AnimatePresence mode="wait">
                  {mode === "single" ? (
                    <motion.div
                      key="single"
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -8 }}
                      className="space-y-3"
                    >
                      <div className="space-y-1.5">
                        <label className="text-[9px] uppercase tracking-[0.3em] text-muted/70 flex items-center gap-1.5">
                          <Phone className="w-2.5 h-2.5 text-brand" /> Phone number
                        </label>
                        <input
                          type="tel"
                          value={customerNumber}
                          onChange={e => setCustomerNumber(e.target.value)}
                          placeholder="+1 555 000 0000"
                          className={cn(
                            "w-full text-sm bg-black/30 border rounded-lg px-3 py-2 outline-none focus:border-brand/50 text-ink placeholder:text-muted/50 tabular-nums",
                            customerNumber.length > 0
                              ? /^\+?[\d\s\-\(\)]{7,15}$/.test(customerNumber)
                                ? "border-emerald-500/50"
                                : "border-rose-500/40"
                              : "border-white/10"
                          )}
                        />
                        {customerNumber.length > 0 && !/^\+?[\d\s\-\(\)]{7,15}$/.test(customerNumber) && (
                          <p className="text-[10px] text-rose-400 mt-0.5">Use format: +1 (555) 000-0000</p>
                        )}
                        {customerNumber.length > 0 && /^\+?[\d\s\-\(\)]{7,15}$/.test(customerNumber) && (
                          <p className="text-[10px] text-emerald-400 mt-0.5 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" /> Valid number
                          </p>
                        )}
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[9px] uppercase tracking-[0.3em] text-muted/70">Customer name</label>
                        <input
                          type="text"
                          value={customerName}
                          onChange={e => setCustomerName(e.target.value)}
                          placeholder="Optional"
                          className="w-full text-sm bg-black/30 border border-white/10 rounded-lg px-3 py-2 outline-none focus:border-brand/50 text-ink placeholder:text-muted/50"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[9px] uppercase tracking-[0.3em] text-muted/70">Context</label>
                        <textarea
                          value={context}
                          onChange={e => setContext(e.target.value)}
                          rows={4}
                          placeholder="What should the agent say?"
                          className="w-full text-sm bg-black/30 border border-white/10 rounded-lg px-3 py-2 outline-none focus:border-brand/50 text-ink placeholder:text-muted/50 resize-none leading-relaxed"
                        />
                      </div>

                      <button
                        onClick={dispatchCall}
                        disabled={isDialing || !customerNumber}
                        className="brutal-btn w-full !py-3 !text-[11px] !tracking-[0.3em] disabled:opacity-50"
                      >
                        {isDialing ? (
                          <><Loader2 className="w-4 h-4 animate-spin" /> Dispatching</>
                        ) : (
                          <><Search className="w-4 h-4" /> Initiate call</>
                        )}
                      </button>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="bulk"
                      initial={{ opacity: 0, x: 8 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 8 }}
                      className="space-y-3"
                    >
                      <div className="rounded-lg glass border border-white/10 p-3">
                        <div className="flex items-center gap-1.5 mb-2 text-brand">
                          <Terminal className="w-3 h-3" />
                          <span className="text-[9px] uppercase tracking-[0.3em]">CSV format</span>
                        </div>
                        <ul className="text-[10px] text-muted/80 space-y-0.5">
                          <li className="flex items-center gap-1.5"><ChevronRight className="w-2.5 h-2.5 text-brand" /> Headers: <span className="text-ink/80">phone, name, context</span></li>
                          <li className="flex items-center gap-1.5"><ChevronRight className="w-2.5 h-2.5 text-brand" /> Limit: <span className="text-ink/80">1,000 rows</span></li>
                        </ul>
                      </div>

                      {/* Optional campaign assignment for bulk */}
                      {campaigns.length > 0 && (
                        <div className="space-y-1.5">
                          <label className="text-[9px] uppercase tracking-[0.3em] text-muted/70 flex items-center gap-1.5">
                            <Megaphone className="w-2.5 h-2.5 text-brand" /> Assign to campaign (optional)
                          </label>
                          <div className="relative">
                            <select
                              value={bulkCampaignId}
                              onChange={e => setBulkCampaignId(e.target.value)}
                              className="w-full text-sm bg-black/30 border border-white/10 rounded-lg pl-3 pr-8 py-2 outline-none focus:border-brand/50 appearance-none cursor-pointer text-ink"
                            >
                              <option value="">No campaign</option>
                              {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                            <ChevronRight className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted pointer-events-none rotate-90" />
                          </div>
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full rounded-xl glass border border-dashed border-white/15 hover:border-brand/40 hover:bg-brand/5 transition-all py-8 flex flex-col items-center justify-center gap-2 group"
                      >
                        <input type="file" accept=".csv" className="hidden" ref={fileInputRef} onChange={handleFileUpload} />
                        {isUploading ? (
                          <Loader2 className="w-7 h-7 text-brand animate-spin" />
                        ) : (
                          <UploadCloud className="w-7 h-7 text-muted group-hover:text-brand transition-colors" />
                        )}
                        <span className="font-display italic lowercase text-base text-ink">upload manifest</span>
                        <span className="text-[9px] uppercase tracking-[0.3em] text-muted/70">Drag CSV or click to browse</span>
                      </button>

                      <div className="rounded-lg glass border border-brand/20 p-3 flex items-start gap-2">
                        <Shield className="w-3.5 h-3.5 text-brand shrink-0 mt-0.5" />
                        <p className="text-[10px] text-muted/80 leading-relaxed">
                          Bulk data is scrubbed and encrypted before dispatch.
                        </p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <AnimatePresence>
                  {(dialError || uploadStats) && (
                    <motion.div
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="space-y-2"
                    >
                      {dialError && (
                        <div className="rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-500 px-3 py-2 text-xs flex items-center gap-2">
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                          <span className="leading-relaxed">{dialError}</span>
                        </div>
                      )}
                      {uploadStats && (
                        <div className="rounded-lg bg-brand/10 border border-brand/30 text-brand px-3 py-2 text-xs flex items-center gap-2">
                          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                          <span className="leading-relaxed">{uploadStats}</span>
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </Panel>
          </div>

          {/* Operations Queue */}
          <div className="xl:col-span-7 min-h-0">
            <Panel
              title="Queue"
              hint={leadsTotal > 0 ? `${leads.length}/${leadsTotal}` : "QUEUE"}
              icon={PlayCircle}
              scroll
              flush
              actions={
                queuedCount > 0 ? (
                  <button
                    onClick={launchQueue}
                    disabled={isDialing}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-brand/20 border border-brand/40 text-brand text-[10px] uppercase tracking-[0.25em] hover:bg-brand/30 transition-colors disabled:opacity-50"
                  >
                    {isDialing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Radar className="w-3 h-3" />}
                    Dispatch {queuedCount}
                  </button>
                ) : null
              }
            >
              <AnimatePresence mode="popLayout">
                {leads.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center gap-3 py-16 text-center">
                    <div className="w-14 h-14 rounded-2xl glass border border-white/10 flex items-center justify-center text-muted">
                      <Phone className="w-6 h-6" />
                    </div>
                    <div className="space-y-1.5">
                      <h3 className="font-display italic lowercase text-2xl text-ink">queue idle</h3>
                      <p className="text-[10px] uppercase tracking-[0.4em] text-muted/70">No leads in pipeline</p>
                    </div>
                  </div>
                ) : (
                  <div className="divide-y divide-white/6">
                    {leads.map((lead, idx) => (
                      <motion.div
                        layout
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        key={lead.id || idx}
                        className={cn(
                          "px-4 py-3 flex flex-col sm:flex-row gap-3 transition-colors items-start sm:items-center",
                          lead.status === 'Queued' ? 'bg-brand/5' : 'hover:bg-white/3'
                        )}
                      >
                        <div className="flex-1 min-w-0 space-y-1.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-display italic text-lg text-ink leading-none truncate">
                              {lead.customer_name || "Unknown subject"}
                            </h3>
                            {lead.source === "inbound" && (
                              <span className="px-1.5 py-0.5 rounded-full bg-brand-2/15 border border-brand-2/40 text-brand-2 text-[9px] uppercase tracking-[0.25em] leading-none">
                                Inbound
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={cn(
                              "px-1.5 py-0.5 rounded-full border text-[9px] uppercase tracking-[0.25em] leading-none inline-flex items-center gap-1",
                              lead.status === 'Completed' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500' :
                              lead.status === 'Queued' ? 'bg-brand/15 border-brand/40 text-brand' :
                              'bg-rose-500/10 border-rose-500/30 text-rose-500'
                            )}>
                              <span className="w-1 h-1 rounded-full bg-current" /> {lead.status}
                            </span>
                            <Link
                              to={`/contact/${encodeURIComponent(lead.phone_number || lead.customer_number || "unknown")}`}
                              className="px-2 py-0.5 rounded-full glass border border-brand/30 hover:bg-brand/10 hover:border-brand/60 transition-all text-[10px] text-brand font-mono tabular-nums"
                            >
                              {lead.phone_number || lead.customer_number}
                            </Link>
                          </div>
                        </div>

                        <div className="shrink-0 flex items-center gap-1.5">
                          <ClaudeRecipeButton
                            recipe="enrich-lead"
                            variant="ghost"
                            initial={{
                              customerName: lead.customer_name,
                              customerNumber: lead.phone_number || lead.customer_number,
                              context: lead.context,
                            }}
                            label="Enrich"
                          />
                          <ClaudeRecipeButton
                            recipe="brief"
                            variant="ghost"
                            agentId={selectedAgentId}
                            initial={{
                              customerName: lead.customer_name,
                              customerNumber: lead.phone_number,
                              reasonForCall: lead.context,
                            }}
                            label="Brief"
                          />
                          <button
                            onClick={() => deleteLead(lead.id)}
                            disabled={isDeletingLead === lead.id}
                            aria-label="Remove lead"
                            title="Remove lead"
                            className="w-7 h-7 rounded-full glass border border-white/10 flex items-center justify-center text-muted hover:text-rose-500 hover:border-rose-500/30 disabled:opacity-40 transition-all"
                          >
                            {isDeletingLead === lead.id
                              ? <Loader2 className="w-3 h-3 animate-spin" />
                              : <Trash2 className="w-3 h-3" />}
                          </button>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </AnimatePresence>

              {leadsHasMore && (
                <div className="px-4 py-3 flex justify-center border-t border-white/6">
                  <button
                    onClick={loadMoreLeads}
                    disabled={isLoadingMore}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full glass border border-white/10 text-ink text-[10px] uppercase tracking-[0.25em] hover:border-brand/40 transition-colors disabled:opacity-50"
                  >
                    {isLoadingMore ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                    Load {leadsTotal - leads.length} more
                  </button>
                </div>
              )}
            </Panel>
          </div>
        </div>
      )}
    </>
  );

  const campaignsTab = (
    <div className="h-full grid grid-cols-1 xl:grid-cols-12 gap-3 min-h-0">
      {/* Campaign list */}
      <div className="xl:col-span-5 min-h-0">
        <Panel
          title="Campaigns"
          hint={`${campaigns.length} total`}
          icon={Megaphone}
          scroll flush
          actions={
            <button
              onClick={() => setShowCampaignModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-brand/15 border border-brand/40 text-brand text-[10px] uppercase tracking-[0.25em] hover:bg-brand/25 transition-colors"
            >
              <Plus className="w-3 h-3" /> New
            </button>
          }
        >
          {campaignLoading ? (
            <div className="h-full flex items-center justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-brand" />
            </div>
          ) : campaigns.length === 0 ? (
            <div className="h-full min-h-[200px] flex flex-col items-center justify-center gap-4 text-center px-6 py-12">
              <div className="w-14 h-14 rounded-2xl glass border border-white/10 flex items-center justify-center text-muted">
                <Megaphone className="w-6 h-6" />
              </div>
              <div className="space-y-1.5">
                <h3 className="font-display italic lowercase text-2xl text-ink">no campaigns</h3>
                <p className="text-[10px] uppercase tracking-[0.4em] text-muted/70 max-w-xs">
                  Create a campaign to group and track bulk outbound calling efforts.
                </p>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {campaigns.map(c => {
                const statusMeta = CAMPAIGN_STATUS[c.status] ?? CAMPAIGN_STATUS.draft;
                const isSelected = selectedCampaign?.id === c.id;
                return (
                  <motion.div
                    key={c.id}
                    layout
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={cn(
                      "px-4 py-3.5 cursor-pointer hover:bg-white/3 transition-colors group",
                      isSelected && "bg-brand/8 ring-1 ring-inset ring-brand/30"
                    )}
                    onClick={() => handleSelectCampaign(c)}
                  >
                    <div className="flex items-start gap-3">
                      <div className={cn("w-9 h-9 rounded-xl glass border flex items-center justify-center shrink-0 mt-0.5", statusMeta.iconBorder)}>
                        <Megaphone className={cn("w-4 h-4", statusMeta.text)} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                          <span className="font-display italic text-base text-ink truncate">{c.name}</span>
                          <span className={cn("px-2 py-0.5 rounded-full border text-[8px] uppercase tracking-[0.3em] shrink-0", statusMeta.bg, statusMeta.text, statusMeta.border)}>
                            {c.status}
                          </span>
                        </div>
                        {c.goal && (
                          <p className="text-[10px] text-muted/60 truncate mb-1">{c.goal}</p>
                        )}
                        <div className="flex items-center gap-3 text-[9px] text-muted/60">
                          <span className="inline-flex items-center gap-1">
                            <Users className="w-2.5 h-2.5" />
                            {c.leads_count} leads
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <Activity className="w-2.5 h-2.5" />
                            {c.dialed_count} dialed
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400" />
                            {c.connected_count} connected
                          </span>
                        </div>
                      </div>
                      <ChevronRight className="w-3.5 h-3.5 text-muted/40 shrink-0 mt-1" />
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </Panel>
      </div>

      {/* Campaign detail */}
      <div className="xl:col-span-7 min-h-0">
        {selectedCampaign ? (
          <Panel
            title={selectedCampaign.name}
            hint="Campaign detail"
            icon={BarChart3}
            scroll flush
            actions={
              <div className="flex items-center gap-1.5">
                {/* Analytics button */}
                <button
                  onClick={() => {
                    if (!showAnalytics) fetchCampaignAnalytics(selectedCampaign.id);
                    setShowAnalytics(p => !p);
                  }}
                  className={cn(
                    "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[10px] uppercase tracking-[0.25em] transition-colors",
                    showAnalytics
                      ? "bg-brand/20 border-brand/50 text-brand"
                      : "glass border-white/10 text-muted hover:text-brand hover:border-brand/40"
                  )}
                >
                  <TrendingUp className="w-3 h-3" /> Analytics
                </button>
                {/* Launch button — dials all queued leads via server fire-and-forget */}
                {selectedCampaign.status !== "running" && selectedCampaign.status !== "completed" && (
                  <button
                    onClick={() => launchCampaign(selectedCampaign.id, selectedCampaign.name)}
                    disabled={launchingCampaignId === selectedCampaign.id}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-brand/15 border border-brand/40 text-brand text-[10px] uppercase tracking-[0.25em] hover:bg-brand/25 transition-colors disabled:opacity-50"
                  >
                    {launchingCampaignId === selectedCampaign.id
                      ? <Loader2 className="w-3 h-3 animate-spin" />
                      : <Rocket className="w-3 h-3" />}
                    Launch
                  </button>
                )}
                {/* Stop button — halts a running campaign after the current lead finishes */}
                {selectedCampaign.status === "running" && (
                  <button
                    onClick={() => stopCampaign(selectedCampaign.id)}
                    disabled={stoppingCampaignId === selectedCampaign.id}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-rose-500/15 border border-rose-500/40 text-rose-400 text-[10px] uppercase tracking-[0.25em] hover:bg-rose-500/25 transition-colors disabled:opacity-50"
                  >
                    {stoppingCampaignId === selectedCampaign.id
                      ? <Loader2 className="w-3 h-3 animate-spin" />
                      : <Pause className="w-3 h-3" />}
                    Stop
                  </button>
                )}
                {selectedCampaign.status === "draft" && (
                  <button onClick={() => setCampaignStatus(selectedCampaign.id, "active")}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/15 border border-emerald-500/40 text-emerald-400 text-[10px] uppercase tracking-[0.25em] hover:bg-emerald-500/25 transition-colors">
                    <Play className="w-3 h-3" /> Activate
                  </button>
                )}
                {selectedCampaign.status === "active" && (
                  <button onClick={() => setCampaignStatus(selectedCampaign.id, "paused")}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-500/15 border border-amber-500/40 text-amber-400 text-[10px] uppercase tracking-[0.25em] hover:bg-amber-500/25 transition-colors">
                    <Pause className="w-3 h-3" /> Pause
                  </button>
                )}
                {selectedCampaign.status === "paused" && (
                  <button onClick={() => setCampaignStatus(selectedCampaign.id, "active")}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-brand/15 border border-brand/40 text-brand text-[10px] uppercase tracking-[0.25em] hover:bg-brand/25 transition-colors">
                    <Play className="w-3 h-3" /> Resume
                  </button>
                )}
                {["active", "paused"].includes(selectedCampaign.status) && (
                  <button onClick={() => setCampaignStatus(selectedCampaign.id, "completed")}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-violet-500/15 border border-violet-500/40 text-violet-400 text-[10px] uppercase tracking-[0.25em] hover:bg-violet-500/25 transition-colors">
                    <CheckCircle2 className="w-3 h-3" /> Complete
                  </button>
                )}
                <button onClick={() => deleteCampaign(selectedCampaign.id)}
                  aria-label="Delete campaign"
                  title="Delete campaign"
                  className="w-8 h-8 rounded-lg glass border border-white/10 flex items-center justify-center text-muted hover:text-rose-500 hover:border-rose-500/30 transition-all">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            }
          >
            {/* Live progress bar when running */}
            {selectedCampaign.status === "running" && selectedCampaign.leads_count > 0 && (
              <div className="px-4 pt-3 pb-0">
                <div className="rounded-xl bg-brand/8 border border-brand/20 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand opacity-75" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-brand" />
                      </span>
                      <span className="text-[9px] uppercase tracking-[0.3em] text-brand">Live · Dialing in progress</span>
                    </div>
                    <span className="text-[9px] font-mono text-muted tabular-nums">
                      {selectedCampaign.dialed_count ?? 0} / {selectedCampaign.leads_count} dialed
                    </span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-white/5 overflow-hidden">
                    <motion.div
                      animate={{ width: `${selectedCampaign.leads_count > 0 ? Math.round(((selectedCampaign.dialed_count ?? 0) / selectedCampaign.leads_count) * 100) : 0}%` }}
                      transition={{ duration: 0.6, ease: "easeOut" }}
                      className="h-full rounded-full"
                      style={{ background: "linear-gradient(90deg,#0AC8D4,#9B59F5)" }}
                    />
                  </div>
                  <div className="flex items-center gap-1 mt-1.5">
                    <RefreshCw className="w-2.5 h-2.5 text-muted/50 animate-spin" style={{ animationDuration: "3s" }} />
                    <span className="text-[8px] text-muted/50">Refreshing every 10s</span>
                  </div>
                </div>
              </div>
            )}

            {/* Analytics panel */}
            <AnimatePresence>
              {showAnalytics && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="px-4 pt-3">
                    {analyticsLoading ? (
                      <div className="flex items-center justify-center py-6 gap-2">
                        <Loader2 className="w-4 h-4 animate-spin text-brand" />
                        <span className="text-[9px] uppercase tracking-[0.3em] text-muted">Loading analytics</span>
                      </div>
                    ) : campaignAnalytics ? (
                      <div className="space-y-3 pb-3">
                        {/* Call stats */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                          {[
                            { label: "Answered",     value: campaignAnalytics.call_stats?.answered ?? 0,                             icon: Phone,       accent: "#10B981" },
                            { label: "Avg Duration",  value: `${campaignAnalytics.call_stats?.avg_duration_sec ?? 0}s`,               icon: Clock,       accent: "#0AC8D4" },
                            { label: "Total Cost",    value: `$${(campaignAnalytics.call_stats?.total_cost_usd ?? 0).toFixed(3)}`,    icon: DollarSign,  accent: "#9B59F5" },
                            { label: "Avg Score",     value: campaignAnalytics.call_stats?.avg_lead_score != null ? campaignAnalytics.call_stats.avg_lead_score : "—", icon: Award, accent: "#E040C0" },
                          ].map(({ label, value, icon: Icon, accent }) => (
                            <div key={label} className="rounded-xl glass border border-white/8 p-3">
                              <div className="flex items-center gap-1.5 mb-1.5">
                                <Icon className="w-3 h-3 shrink-0" style={{ color: accent }} />
                                <span className="text-[8px] uppercase tracking-[0.28em] text-muted">{label}</span>
                              </div>
                              <div className="font-display italic text-lg leading-none tabular-nums" style={{ color: accent }}>{value}</div>
                            </div>
                          ))}
                        </div>
                        {/* Outcome breakdown */}
                        {(campaignAnalytics.outcomes ?? []).length > 0 && (
                          <div className="rounded-xl glass border border-white/8 p-3">
                            <h5 className="text-[8px] uppercase tracking-[0.3em] text-muted mb-2.5 flex items-center gap-1.5">
                              <BarChart3 className="w-3 h-3" /> Lead Outcomes
                            </h5>
                            <div className="space-y-1.5">
                              {campaignAnalytics.outcomes.map((o: any) => {
                                const color =
                                  o.status === "Completed" ? "#10B981" :
                                  o.status === "Failed" || o.status?.includes("Fail") ? "#E040C0" :
                                  o.status === "Queued" ? "#0AC8D4" :
                                  o.status?.includes("Blocked") ? "#FF9A5C" :
                                  "#7C7469";
                                return (
                                  <div key={o.status} className="flex items-center gap-2.5">
                                    <span className="text-[9px] text-muted w-28 shrink-0">{o.status}</span>
                                    <div className="flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
                                      <motion.div
                                        initial={{ width: 0 }}
                                        animate={{ width: `${o.pct}%` }}
                                        transition={{ duration: 0.6 }}
                                        className="h-full rounded-full"
                                        style={{ background: color }}
                                      />
                                    </div>
                                    <span className="text-[9px] font-mono text-ink/70 w-8 text-right shrink-0 tabular-nums">{o.count}</span>
                                    <span className="text-[8px] text-muted/60 w-7 text-right shrink-0 tabular-nums">{o.pct}%</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : null}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Stats row */}
            <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-2 border-b border-white/8">
              {[
                { label: "Leads",     value: selectedCampaign.leads_count,     accent: "#0AC8D4" },
                { label: "Dialed",    value: selectedCampaign.dialed_count,     accent: "#9B59F5" },
                { label: "Connected", value: selectedCampaign.connected_count,  accent: "#10B981" },
                { label: "Window",    value: `${selectedCampaign.call_window_start}–${selectedCampaign.call_window_end}`, accent: "#E040C0" },
              ].map(s => (
                <div key={s.label} className="rounded-lg glass border border-white/8 p-2.5">
                  <div className="text-[8px] uppercase tracking-[0.3em] mb-1" style={{ color: s.accent }}>{s.label}</div>
                  <div className="font-display italic text-xl text-ink leading-none">{s.value}</div>
                </div>
              ))}
            </div>

            {/* Leads list */}
            {campaignLeadsLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-5 h-5 animate-spin text-brand" />
              </div>
            ) : campaignLeads.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
                <p className="text-[10px] uppercase tracking-[0.4em] text-muted/50">No leads assigned to this campaign</p>
                <p className="text-[10px] text-muted/40">Use the Bulk tab and select this campaign when uploading a CSV.</p>
              </div>
            ) : (
              <>
                {/* Retry failed banner */}
                {campaignLeads.some(l => l.status === 'Failed') && (
                  <div className="mx-4 mt-3 rounded-xl bg-rose-500/10 border border-rose-500/30 p-3 flex items-center gap-3">
                    <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] text-rose-400 uppercase tracking-[0.25em]">
                        {campaignLeads.filter(l => l.status === 'Failed').length} failed lead{campaignLeads.filter(l => l.status === 'Failed').length > 1 ? 's' : ''}
                      </p>
                    </div>
                    <button
                      onClick={() => retryFailedLeads(selectedCampaign.id)}
                      className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-rose-500/20 border border-rose-500/40 text-rose-400 text-[9px] uppercase tracking-[0.25em] hover:bg-rose-500/30 transition-colors"
                    >
                      <Activity className="w-3 h-3" /> Retry Failed
                    </button>
                  </div>
                )}
                <div className="divide-y divide-white/5 mt-2">
                  {campaignLeads.map(lead => (
                    <div key={lead.id} className="px-4 py-3 flex items-center gap-3 hover:bg-white/3 transition-colors">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                          <span className="font-display italic text-sm text-ink truncate">{lead.customer_name || "Unknown"}</span>
                          <span className={cn(
                            "px-1.5 py-0 rounded-full border text-[8px] uppercase tracking-[0.25em] leading-tight",
                            lead.status === 'Completed' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500' :
                            lead.status === 'Queued' ? 'bg-brand/15 border-brand/40 text-brand' :
                            lead.status === 'Failed' ? 'bg-rose-500/10 border-rose-500/30 text-rose-500' :
                            lead.status === 'Dialing' ? 'bg-amber-500/10 border-amber-500/30 text-amber-500' :
                            'bg-white/5 border-white/10 text-muted'
                          )}>
                            {lead.status}
                          </span>
                        </div>
                        <Link
                          to={`/contact/${encodeURIComponent(lead.phone_number || lead.customer_number || "unknown")}`}
                          className="text-[10px] text-brand font-mono tabular-nums hover:underline"
                        >
                          {lead.phone_number || lead.customer_number}
                        </Link>
                      </div>
                      <div className="text-[9px] text-muted/50 tabular-nums shrink-0">
                        {formatDate(lead.created_at)}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </Panel>
        ) : (
          <Panel title="Campaign Details" hint="Details" icon={Target}>
            <div className="h-full flex items-center justify-center">
              <p className="text-[9px] uppercase tracking-[0.5em] text-muted/40">Select a campaign to view details</p>
            </div>
          </Panel>
        )}
      </div>
    </div>
  );

  return (
    <>
      <div className="h-full flex flex-col min-h-0">
        <HubTabs tabs={CHANNELS_HUB} label="Channels sub-navigation" />
        <div className="flex-1 min-h-0">
      <PageShell
        title="Outbound"
        eyebrow="Communications · Outbound"
        subtitle="Run outbound calling campaigns for lead qualification and follow-up."
        actions={<CsvExportButton type="leads" label="Export" />}
        tabs={[
          { id: "dispatch",   label: "Dispatch",   icon: Zap,           content: dispatchTab },
          { id: "campaigns",  label: "Campaigns",  icon: Megaphone,     badge: campaigns.length || undefined, content: campaignsTab },
          { id: "callbacks",  label: "Callbacks",  icon: CalendarClock, badge: callbacks.length || undefined, content: (
            <Panel icon={CalendarClock} hint="Scheduled" title="" scroll>
              <CallbacksList callbacks={callbacks} loading={callbacksLoading} onRefresh={fetchCallbacks} />
            </Panel>
          )},
        ]}
      />
        </div>
      </div>
      <AnimatePresence>
        {showCampaignModal && (
          <CreateCampaignModal
            agents={agents}
            onClose={() => setShowCampaignModal(false)}
            onCreated={(c) => {
              setCampaigns(prev => [c, ...prev]);
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

const CAMPAIGN_STATUS: Record<string, { text: string; bg: string; border: string; iconBorder: string }> = {
  draft:     { text: "text-muted",        bg: "bg-white/5",           border: "border-white/15",         iconBorder: "border-white/10" },
  active:    { text: "text-emerald-400",  bg: "bg-emerald-500/10",    border: "border-emerald-500/30",   iconBorder: "border-emerald-500/30" },
  paused:    { text: "text-amber-400",    bg: "bg-amber-500/10",      border: "border-amber-500/30",     iconBorder: "border-amber-500/30" },
  completed: { text: "text-violet-400",   bg: "bg-violet-500/10",     border: "border-violet-500/30",    iconBorder: "border-violet-500/30" },
};

/* ─── Callbacks List ─────────────────────────────────────────────── */
function CallbacksList({ callbacks, loading, onRefresh }: { callbacks: any[]; loading: boolean; onRefresh: () => void }) {
  if (loading) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-2">
        <Loader2 className="w-5 h-5 animate-spin text-brand" />
        <p className="text-[9px] uppercase tracking-[0.4em] text-muted">Loading callbacks</p>
      </div>
    );
  }

  if (callbacks.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 px-6 text-center">
        <CalendarClock className="w-10 h-10 text-muted/30" />
        <p className="text-[11px] uppercase tracking-[0.35em] text-muted">No scheduled callbacks</p>
        <p className="text-[10px] text-muted/60 max-w-xs">
          When agents use the schedule_callback tool during a call, those contacts appear here and are auto-dialed at the promised time.
        </p>
        <button
          onClick={onRefresh}
          className="mt-2 h-8 px-4 rounded-full glass border border-white/10 text-[9px] uppercase tracking-[0.3em] text-muted hover:text-brand hover:border-brand/40 transition-all flex items-center gap-1.5"
        >
          <RefreshCw className="w-3 h-3" /> Refresh
        </button>
      </div>
    );
  }

  const now = new Date();

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
        <span className="text-[9px] uppercase tracking-[0.35em] text-muted">{callbacks.length} scheduled · auto-dialed at due time</span>
        <button
          onClick={onRefresh}
          className="h-7 px-3 rounded-full glass border border-white/10 text-[9px] uppercase tracking-[0.28em] text-muted hover:text-brand hover:border-brand/40 transition-all flex items-center gap-1.5"
        >
          <RefreshCw className="w-2.5 h-2.5" /> Refresh
        </button>
      </div>
      <ul className="flex-1 overflow-y-auto divide-y divide-white/5 scrollbar-hide">
        {callbacks.map((cb) => {
          const scheduledAt = safeDate(cb.callback_scheduled_at);
          // Skip rows with unparsable timestamps — render a placeholder
          // instead of crashing the list with "The string did not match
          // the expected pattern" on Safari.
          if (!scheduledAt) return null;
          const isPast = scheduledAt < now;
          const minutesUntil = Math.max(0, Math.round((scheduledAt.getTime() - now.getTime()) / 60_000));
          const relativeLabel = isPast
            ? "Dialing soon…"
            : minutesUntil < 60
              ? `in ${minutesUntil}m`
              : minutesUntil < 1440
                ? `in ${Math.round(minutesUntil / 60)}h`
                : scheduledAt.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

          return (
            <li key={cb.id} className="flex items-start gap-3 px-4 py-3 hover:bg-white/[0.02] transition-colors">
              <div className={cn(
                "mt-0.5 w-2 h-2 rounded-full flex-shrink-0",
                isPast ? "bg-amber-400 animate-pulse" : "bg-brand"
              )} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-ink font-medium truncate">
                    {cb.customer_name || cb.customer_number}
                  </span>
                  <span className={cn(
                    "text-[9px] uppercase tracking-[0.3em] flex-shrink-0",
                    isPast ? "text-amber-400" : "text-brand"
                  )}>
                    {relativeLabel}
                  </span>
                </div>
                {cb.customer_name && (
                  <p className="text-[10px] text-muted mt-0.5">{cb.customer_number}</p>
                )}
                {cb.last_contact_summary && (
                  <p className="text-[10px] text-muted/70 mt-1 line-clamp-1">{cb.last_contact_summary}</p>
                )}
                <p className="text-[9px] text-muted/50 mt-1">
                  {scheduledAt.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ─── Create Campaign Modal ──────────────────────────────────────── */
function CreateCampaignModal({ agents, onClose, onCreated }: { agents: any[]; onClose: () => void; onCreated: (c: any) => void }) {
  const [form, setForm] = useState({
    name: "", goal: "", agent_id: "",
    call_window_start: "09:00", call_window_end: "17:00", max_attempts: "3",
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));
  const inputCls = "w-full text-sm bg-black/30 border border-white/10 rounded-lg px-3 py-2 outline-none focus:border-brand/50 text-ink placeholder:text-muted/50 transition-all";

  const save = async () => {
    if (!form.name.trim()) { setErr("Campaign name is required."); return; }
    setSaving(true); setErr("");
    try {
      const res = await authFetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, max_attempts: parseInt(form.max_attempts) || 3 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create campaign");
      onCreated(data.campaign);
    } catch (e: any) { setErr(e.message); }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <motion.div initial={{ scale: 0.96, opacity: 0, y: 16 }} animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.96, opacity: 0, y: 16 }} transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        className="relative w-full max-w-md rounded-2xl glass-strong border border-white/15 shadow-2xl overflow-hidden"
      >
        <header className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
          <div>
            <p className="text-[9px] uppercase tracking-[0.4em] text-brand mb-0.5">Signal · Campaigns</p>
            <h2 className="font-display italic lowercase text-2xl text-ink">new campaign</h2>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg glass border border-white/10 flex items-center justify-center text-muted hover:text-ink transition-colors">
            <X className="w-4 h-4" />
          </button>
        </header>

        <div className="p-5 space-y-4 overflow-y-auto max-h-[70vh] scrollbar-hide">
          <div className="space-y-1.5">
            <label className="text-[9px] uppercase tracking-[0.3em] text-muted/70">Campaign Name</label>
            <input className={inputCls} placeholder="Q4 Win-Back Drive" value={form.name} onChange={e => set("name", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <label className="text-[9px] uppercase tracking-[0.3em] text-muted/70">Goal (optional)</label>
            <input className={inputCls} placeholder="Re-engage churned users from past 90 days" value={form.goal} onChange={e => set("goal", e.target.value)} />
          </div>
          {agents.length > 0 && (
            <div className="space-y-1.5">
              <label className="text-[9px] uppercase tracking-[0.3em] text-muted/70 flex items-center gap-1.5">
                <Bot className="w-2.5 h-2.5 text-brand" /> Default Agent
              </label>
              <select className={cn(inputCls, "appearance-none cursor-pointer")} value={form.agent_id} onChange={e => set("agent_id", e.target.value)}>
                <option value="">Unassigned</option>
                {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-[9px] uppercase tracking-[0.3em] text-muted/70 flex items-center gap-1.5">
                <Clock className="w-2.5 h-2.5 text-brand" /> Window start
              </label>
              <input type="time" className={inputCls} value={form.call_window_start} onChange={e => set("call_window_start", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-[9px] uppercase tracking-[0.3em] text-muted/70">Window end</label>
              <input type="time" className={inputCls} value={form.call_window_end} onChange={e => set("call_window_end", e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-[9px] uppercase tracking-[0.3em] text-muted/70">Max retry attempts</label>
            <input type="number" min="1" max="10" className={inputCls} value={form.max_attempts} onChange={e => set("max_attempts", e.target.value)} />
          </div>

          {err && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-rose-500/10 border border-rose-500/30">
              <AlertTriangle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
              <p className="text-[11px] text-rose-400">{err}</p>
            </div>
          )}
        </div>

        <footer className="px-5 py-4 border-t border-white/10 flex items-center justify-end gap-2">
          <button onClick={onClose} className="h-9 px-4 rounded-full glass border border-white/10 text-[10px] uppercase tracking-[0.28em] text-muted hover:text-ink transition-colors">
            Cancel
          </button>
          <button onClick={save} disabled={saving}
            className="h-9 px-5 rounded-full bg-brand/15 border border-brand/50 text-brand text-[10px] uppercase tracking-[0.28em] hover:bg-brand/25 transition-all flex items-center gap-1.5 disabled:opacity-50">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            Create
          </button>
        </footer>
      </motion.div>
    </div>
  );
}
