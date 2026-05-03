import React, { useState, useEffect, useRef } from "react";
import { Loader2, PlayCircle, Plus, Phone, UploadCloud, Bot, Radar, Zap, Terminal, Shield, FileSpreadsheet, ChevronRight, Search, Trash2, AlertTriangle, CheckCircle2 } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import Papa from "papaparse";
import { cn } from "../lib/utils";
import { authFetch } from "../lib/api";
import { Link } from "react-router-dom";
import { ClaudeRecipeButton } from "./ClaudeRecipes";
import CsvExportButton from "./CsvExportButton";
import PageShell, { Panel } from "./PageShell";

export default function OutboundDialer() {
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

  useEffect(() => { fetchData(); }, []);

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
    }
    setIsLoadingMore(false);
  };

  const deleteLead = async (id: number | string) => {
    if (!confirm("Remove this lead from the queue?")) return;
    setIsDeletingLead(id);
    try {
      const resp = await authFetch(`/api/outbound/${id}`, { method: "DELETE" });
      if (resp.ok) {
        setLeads(prev => prev.filter(l => l.id !== id));
      }
    } catch (e) {
      console.error("Failed to delete lead:", e);
    }
    setIsDeletingLead(null);
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

      setCustomerName("");
      setCustomerNumber("");
      setContext("");
      setTimeout(() => fetchData(), 2000);
    } catch (err: any) {
      setDialError(err.message);
    } finally {
      setIsDialing(false);
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
          setIsUploading(false);
          return;
        }

        try {
          const res = await authFetch("/api/outbound/bulk", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ leads: parsedLeads })
          });
          if (!res.ok) throw new Error("Bulk upload failed.");

          setUploadStats(`Queued ${parsedLeads.length} lead${parsedLeads.length === 1 ? '' : 's'}.`);
          setTimeout(() => fetchData(), 1000);
        } catch (e: any) {
          setDialError(e.message);
        }
        setIsUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      },
      error: (error) => {
        setDialError(`CSV parsing error: ${error.message}`);
        setIsUploading(false);
      }
    });
  };

  const launchQueue = async () => {
    const queued = leads.filter(l => l.status === "Queued");
    if (queued.length === 0) return;
    if (!window.confirm(`Dispatch ${queued.length} queued call${queued.length === 1 ? '' : 's'} sequentially?`)) return;

    setIsDialing(true);
    setUploadStats(`Dispatching ${queued.length} call${queued.length === 1 ? '' : 's'}…`);
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
      }
    }

    setIsDialing(false);
    setUploadStats(`Sequential dispatch finished.`);
    setTimeout(() => fetchData(), 2000);
  };

  const queuedCount = leads.filter(l => l.status === "Queued").length;

  const headerActions = (
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
      <CsvExportButton type="leads" label="Export" />
    </div>
  );

  return (
    <PageShell
      title="Outbound Dialer"
      eyebrow="Signal · Dispatch"
      subtitle="Deploy agents across carrier networks for lead qualification."
      actions={headerActions}
    >
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
              title="dispatch params"
              hint={mode === "single" ? "SINGLE CALL" : "BULK UPLOAD"}
              icon={mode === "single" ? Zap : FileSpreadsheet}
              scroll
            >
              <div className="space-y-4">
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
                          className="w-full text-sm bg-black/30 border border-white/10 rounded-lg px-3 py-2 outline-none focus:border-brand/50 text-ink placeholder:text-muted/50 tabular-nums"
                        />
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
              title="operations queue"
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
    </PageShell>
  );
}
