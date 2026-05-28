/* eslint-disable @typescript-eslint/no-explicit-any -- agents[], campaigns[],
 * and leads[] are forwarded as-is from OutboundDialer's untyped /api/agents,
 * /api/campaigns and /api/leads state. Mirrors the parent's intentional
 * loose typing pending contracts/api-types.ts for the outbound module. */
import React, { useState } from "react";
import {
  Loader2,
  Zap,
  FileSpreadsheet,
  Bot,
  Phone,
  CheckCircle2,
  ChevronRight,
  Search,
  UploadCloud,
  Terminal,
  Shield,
  AlertTriangle,
  PlayCircle,
  Plus,
  Trash2,
  Radar,
  Megaphone,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "../../lib/utils";
import { Link } from "react-router-dom";
import { ClaudeRecipeButton } from "../ClaudeRecipes";
import { Panel } from "../PageShell";
import EmptyState from "../EmptyState";

interface DispatchTabProps {
  isLoading: boolean;
  agents: any[];
  selectedAgentId: string;
  setSelectedAgentId: (id: string) => void;
  customerNumber: string;
  setCustomerNumber: (num: string) => void;
  customerName: string;
  setCustomerName: (name: string) => void;
  context: string;
  setContext: (ctx: string) => void;
  hasOutboundConsent: boolean;
  setHasOutboundConsent: (consent: boolean) => void;
  isDialing: boolean;
  isUploading: boolean;
  dialError: string;
  uploadStats: string;
  dispatchCall: () => void;
  campaigns: any[];
  bulkCampaignId: string;
  setBulkCampaignId: (id: string) => void;
  triggerUploadCsv: () => void;
  leads: any[];
  leadsTotal: number;
  queuedCount: number;
  launchQueue: () => void;
  deleteLead: (id: number | string) => void;
  isDeletingLead: number | string | null;
  loadMoreLeads: () => void;
  leadsHasMore: boolean;
  isLoadingMore: boolean;
  quotaUsed?: number | null;
  quotaLimit?: number | null;
}

export default function DispatchTab({
  isLoading,
  agents,
  selectedAgentId,
  setSelectedAgentId,
  customerNumber,
  setCustomerNumber,
  customerName,
  setCustomerName,
  context,
  setContext,
  hasOutboundConsent,
  setHasOutboundConsent,
  isDialing,
  isUploading,
  dialError,
  uploadStats,
  dispatchCall,
  campaigns,
  bulkCampaignId,
  setBulkCampaignId,
  triggerUploadCsv,
  leads,
  leadsTotal,
  queuedCount,
  launchQueue,
  deleteLead,
  isDeletingLead,
  loadMoreLeads,
  leadsHasMore,
  isLoadingMore,
  quotaUsed,
  quotaLimit,
}: DispatchTabProps) {
  const [mode, setMode] = useState<"single" | "bulk">("single");

  const quotaExhausted =
    quotaUsed != null && quotaLimit != null && quotaLimit > 0 && quotaUsed >= quotaLimit;
  const quotaNearLimit =
    !quotaExhausted &&
    quotaUsed != null &&
    quotaLimit != null &&
    quotaLimit > 0 &&
    quotaUsed / quotaLimit >= 0.9;

  return (
    <>
      {isLoading ? (
        <div className="h-full flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-5 h-5 animate-spin text-brand" />
          <span className="app-section-title/70 font-display italic text-sm">
            Loading dispatcher
          </span>
        </div>
      ) : (
        <div className="h-full grid grid-cols-1 lg:grid-cols-12 gap-3 min-h-0">
          {/* Configuration */}
          <div className="lg:col-span-5 min-h-0">
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
                    {(["single", "bulk"] as const).map((m) => (
                      <button
                        key={m}
                        onClick={() => setMode(m)}
                        className={cn(
                          "px-3 py-1 rounded-full text-[10px] uppercase tracking-[0.25em] transition-colors",
                          mode === m ? "bg-brand/20 text-brand" : "text-muted hover:text-ink",
                        )}
                      >
                        {m === "single" ? "Single" : "Bulk"}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="app-section-title flex items-center gap-1.5">
                    <Bot className="w-2.5 h-2.5 text-brand" /> Agent
                  </label>
                  <div className="relative">
                    <select
                      value={selectedAgentId}
                      onChange={(e) => setSelectedAgentId(e.target.value)}
                      className="w-full text-sm bg-black/5 border border-black/10 rounded-lg pl-3 pr-8 py-2 outline-none focus:border-brand/50 appearance-none cursor-pointer text-ink"
                      aria-label="Select agent to dial with"
                    >
                      {agents.length === 0 ? (
                        <option value="" disabled>
                          No agents — create one in Fleet &gt; Agents
                        </option>
                      ) : (
                        <>
                          {!selectedAgentId && (
                            <option value="" disabled>
                              Select an agent…
                            </option>
                          )}
                          {agents.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.name}
                            </option>
                          ))}
                        </>
                      )}
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
                        <label className="app-section-title flex items-center gap-1.5">
                          <Phone className="w-2.5 h-2.5 text-brand" /> Phone number
                        </label>
                        <input
                          type="tel"
                          inputMode="tel"
                          autoComplete="tel"
                          value={customerNumber}
                          onChange={(e) => setCustomerNumber(e.target.value)}
                          placeholder="+1 555 000 0000"
                          className={cn(
                            "w-full text-sm bg-black/5 border rounded-lg px-3 py-2 outline-none focus:border-brand/50 text-ink placeholder:text-muted/70 tabular-nums",
                            customerNumber.length > 0
                              ? /^\+?[\d\s\-()]{7,15}$/.test(customerNumber)
                                ? "border-emerald-500/50"
                                : "border-rose-500/40"
                              : "border-black/10",
                          )}
                        />
                        {customerNumber.length > 0 &&
                          !/^\+?[\d\s\-()]{7,15}$/.test(customerNumber) && (
                            <p className="text-[10px] text-rose-500 mt-0.5">
                              Use format: +1 (555) 000-0000
                            </p>
                          )}
                        {customerNumber.length > 0 &&
                          /^\+?[\d\s\-()]{7,15}$/.test(customerNumber) && (
                            <p className="text-[10px] text-emerald-600 mt-0.5 flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" /> Valid number
                            </p>
                          )}
                      </div>

                      <div className="space-y-1.5">
                        <label className="app-section-title">Customer name</label>
                        <input
                          type="text"
                          value={customerName}
                          onChange={(e) => setCustomerName(e.target.value)}
                          placeholder="Optional"
                          className="w-full text-sm bg-black/5 border border-black/10 rounded-lg px-3 py-2 outline-none focus:border-brand/50 text-ink placeholder:text-muted/70"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="app-section-title">Context</label>
                        <textarea
                          value={context}
                          onChange={(e) => setContext(e.target.value)}
                          rows={4}
                          placeholder="What should the agent say?"
                          className="w-full text-sm bg-black/5 border border-black/10 rounded-lg px-3 py-2 outline-none focus:border-brand/50 text-ink placeholder:text-muted/70 resize-none leading-relaxed"
                        />
                      </div>

                      <label className="rounded-lg glass border border-brand/20 p-3 flex items-start gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={hasOutboundConsent}
                          onChange={(e) => setHasOutboundConsent(e.target.checked)}
                          className="mt-0.5 accent-brand"
                        />
                        <span className="text-[10px] text-muted/80 leading-relaxed">
                          I have prior express written consent to place this AI-assisted marketing
                          call, and this number is not on my DNC list.
                        </span>
                      </label>

                      {quotaExhausted && (
                        <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 px-3 py-2 flex items-start gap-2">
                          <AlertTriangle className="w-3.5 h-3.5 text-rose-500 shrink-0 mt-0.5" />
                          <p className="text-[10px] text-rose-500/90 leading-snug">
                            Daily voice-minute limit reached. Resets at midnight UTC.
                          </p>
                        </div>
                      )}
                      {quotaNearLimit && (
                        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 flex items-start gap-2">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                          <p className="text-[10px] text-amber-500/90 leading-snug">
                            Near daily limit — {quotaUsed} of {quotaLimit} minutes used.
                          </p>
                        </div>
                      )}
                      <button
                        onClick={dispatchCall}
                        disabled={
                          isDialing || !customerNumber || !hasOutboundConsent || !!quotaExhausted
                        }
                        className="brutal-btn w-full !py-3 !text-[11px] !tracking-[0.3em] disabled:opacity-50"
                      >
                        {isDialing ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" /> Dispatching
                          </>
                        ) : (
                          <>
                            <Search className="w-4 h-4" /> Initiate call
                          </>
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
                          <li className="flex items-center gap-1.5">
                            <ChevronRight className="w-2.5 h-2.5 text-brand" /> Headers:{" "}
                            <span className="text-ink/80">phone, name, context</span>
                          </li>
                          <li className="flex items-center gap-1.5">
                            <ChevronRight className="w-2.5 h-2.5 text-brand" /> Limit:{" "}
                            <span className="text-ink/80">1,000 rows</span>
                          </li>
                        </ul>
                      </div>

                      {/* Optional campaign assignment for bulk */}
                      {campaigns.length > 0 && (
                        <div className="space-y-1.5">
                          <label className="app-section-title flex items-center gap-1.5">
                            <Megaphone className="w-2.5 h-2.5 text-brand" /> Assign to campaign
                            (optional)
                          </label>
                          <div className="relative">
                            <select
                              aria-label="Assign to campaign"
                              value={bulkCampaignId}
                              onChange={(e) => setBulkCampaignId(e.target.value)}
                              className="w-full text-sm bg-black/5 border border-black/10 rounded-lg pl-3 pr-8 py-2 outline-none focus:border-brand/50 appearance-none cursor-pointer text-ink"
                            >
                              <option value="">No campaign</option>
                              {campaigns.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.name}
                                </option>
                              ))}
                            </select>
                            <ChevronRight className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted pointer-events-none rotate-90" />
                          </div>
                        </div>
                      )}

                      <label className="rounded-lg glass border border-brand/20 p-3 flex items-start gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={hasOutboundConsent}
                          onChange={(e) => setHasOutboundConsent(e.target.checked)}
                          className="mt-0.5 accent-brand"
                        />
                        <span className="text-[10px] text-muted/80 leading-relaxed">
                          I have prior express written consent for every number in this manifest and
                          will honor opt-outs immediately.
                        </span>
                      </label>

                      <button
                        type="button"
                        onClick={triggerUploadCsv}
                        disabled={!hasOutboundConsent}
                        className="w-full rounded-xl glass border border-dashed border-white/15 hover:border-brand/40 hover:bg-brand/5 transition-all py-8 flex flex-col items-center justify-center gap-2 group disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isUploading ? (
                          <Loader2 className="w-7 h-7 text-brand animate-spin" />
                        ) : (
                          <UploadCloud className="w-7 h-7 text-muted group-hover:text-brand transition-colors" />
                        )}
                        <span className="font-display italic lowercase text-base text-ink">
                          upload manifest
                        </span>
                        <span className="app-section-title">Drag CSV or click to browse</span>
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
          <div className="lg:col-span-7 min-h-0">
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
                    disabled={isDialing || !hasOutboundConsent}
                    title={
                      hasOutboundConsent
                        ? "Dispatch queued calls"
                        : "Confirm outbound consent before dispatching queued calls"
                    }
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-brand/20 border border-brand/40 text-brand text-[10px] uppercase tracking-[0.25em] hover:bg-brand/30 transition-colors disabled:opacity-50"
                  >
                    {isDialing ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Radar className="w-3 h-3" />
                    )}
                    Dispatch {queuedCount}
                  </button>
                ) : null
              }
            >
              <AnimatePresence mode="popLayout">
                {leads.length === 0 ? (
                  <EmptyState
                    icon={UploadCloud}
                    title="Queue is idle"
                    description="Upload a CSV of contacts and your agent will dial through them with full call notes saved to the CRM."
                    accent="#4F1E7B"
                    actions={[
                      {
                        label: "Upload CSV",
                        onClick: triggerUploadCsv,
                        primary: true,
                      },
                      { label: "Browse templates", to: "/agents" },
                    ]}
                  />
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
                          lead.status === "Queued" ? "bg-brand/5" : "hover:bg-white/3",
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
                            <span
                              className={cn(
                                "px-1.5 py-0.5 rounded-full border text-[9px] uppercase tracking-[0.25em] leading-none inline-flex items-center gap-1",
                                lead.status === "Completed"
                                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-500"
                                  : lead.status === "Queued"
                                    ? "bg-brand/15 border-brand/40 text-brand"
                                    : "bg-rose-500/10 border-rose-500/30 text-rose-500",
                              )}
                            >
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
                            {isDeletingLead === lead.id ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Trash2 className="w-3 h-3" />
                            )}
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
                    {isLoadingMore ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Plus className="w-3 h-3" />
                    )}
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
}
