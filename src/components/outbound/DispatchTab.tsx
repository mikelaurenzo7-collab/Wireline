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
import { EmptyState } from "../ui/EmptyState";
import { SegmentStrip } from "../ui/SegmentStrip";
import { OPS_CHANNEL_EMPTY } from "../../lib/wireline-ops-design";
import { ChannelListColHeader } from "../layout/ChannelInbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/shadcn/Select";
import { Checkbox } from "../ui/shadcn/Checkbox";
import { Input } from "../ui/shadcn/Input";
import { ShadButton } from "../ui/shadcn/ShadButton";

const DISPATCH_UNSET = "__unset__";

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
  dncEntries?: any[];
  isNumberOnDncList?: (num: string, entries: any[]) => boolean;
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
  dncEntries = [],
  isNumberOnDncList,
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

  const isDncBlocked =
    customerNumber.length > 0 && !!isNumberOnDncList?.(customerNumber, dncEntries);

  return (
    <>
      {isLoading ? (
        <div role="status" className="h-full flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-5 h-5 animate-spin text-brand" aria-hidden />
          <span className="app-section-title/70 font-display italic text-sm">
            Preparing dispatch console…
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
                <SegmentStrip
                  variant="soft"
                  aria-label="Dispatch mode"
                  testIdPrefix="dispatch-mode"
                  value={mode}
                  onChange={setMode}
                  options={[
                    { value: "single", label: "Single" },
                    { value: "bulk", label: "Bulk" },
                  ]}
                />

                <div className="space-y-1.5">
                  <label className="app-section-title flex items-center gap-1.5">
                    <Bot className="w-2.5 h-2.5 text-brand" /> Agent
                  </label>
                  <div className="relative">
                    <Select
                      value={selectedAgentId || DISPATCH_UNSET}
                      onValueChange={(v) => setSelectedAgentId(v === DISPATCH_UNSET ? "" : v)}
                    >
                      <SelectTrigger
                        aria-label="Select agent to dial with"
                        className="w-full text-sm bg-black/5 border border-white/10 rounded-md pl-3 py-2 text-foreground h-auto"
                      >
                        <SelectValue
                          placeholder={
                            agents.length === 0
                              ? "No agents — deploy one in Fleet"
                              : "Select an agent…"
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {agents.length === 0 ? (
                          <SelectItem value={DISPATCH_UNSET} disabled>
                            No agents — deploy one in Fleet
                          </SelectItem>
                        ) : (
                          <>
                            <SelectItem value={DISPATCH_UNSET} disabled>
                              Select an agent…
                            </SelectItem>
                            {agents.map((a) => (
                              <SelectItem key={a.id} value={a.id}>
                                {a.name}
                              </SelectItem>
                            ))}
                          </>
                        )}
                      </SelectContent>
                    </Select>
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
                        <Input
                          type="tel"
                          inputMode="tel"
                          autoComplete="tel"
                          value={customerNumber}
                          onChange={(e) => setCustomerNumber(e.target.value)}
                          placeholder="+1 555 000 0000"
                          className={cn(
                            "w-full text-sm bg-black/5 border rounded-md px-3 py-2 outline-none focus:border-brand/50 text-foreground placeholder:text-foreground/55 tabular-nums transition-all focus:shadow-[0_0_8px_rgba(var(--brand-rgb),0.1)] focus:bg-white/50",
                            customerNumber.length > 0
                              ? /^\+?[\d\s\-()]{7,15}$/.test(customerNumber)
                                ? "border-brand/50"
                                : "border-destructive/40"
                              : "border-white/10",
                          )}
                        />
                        {customerNumber.length > 0 &&
                          !/^\+?[\d\s\-()]{7,15}$/.test(customerNumber) && (
                            <p className="wl-micro-meta text-destructive mt-0.5">
                              Use format: +1 (555) 000-0000
                            </p>
                          )}
                        {customerNumber.length > 0 &&
                          /^\+?[\d\s\-()]{7,15}$/.test(customerNumber) && (
                            <p className="wl-micro-meta text-brand mt-0.5 flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" /> Valid number
                            </p>
                          )}
                      </div>

                      <div className="space-y-1.5">
                        <label className="app-section-title">Customer name</label>
                        <Input
                          type="text"
                          value={customerName}
                          onChange={(e) => setCustomerName(e.target.value)}
                          placeholder="Optional"
                          className="w-full text-sm bg-black/5 border border-white/10 rounded-md px-3 py-2 outline-none focus:border-brand/50 text-foreground placeholder:text-foreground/55"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="app-section-title">Context</label>
                        <textarea
                          value={context}
                          onChange={(e) => setContext(e.target.value)}
                          rows={4}
                          placeholder="What should the agent say?"
                          className="w-full text-sm bg-black/5 border border-white/10 rounded-md px-3 py-2 outline-none focus:border-brand/50 text-foreground placeholder:text-foreground/55 resize-none leading-relaxed"
                        />
                      </div>

                      <label className="rounded-md wl-panel border border-brand/20 p-3 flex items-start gap-2 cursor-pointer">
                        <Checkbox
                          checked={hasOutboundConsent}
                          onChange={(e) => setHasOutboundConsent(e.target.checked)}
                          className="mt-0.5 accent-brand"
                        />
                        <span className="wl-micro-meta--muted leading-relaxed">
                          I have prior express written consent to place this AI-assisted marketing
                          call, and this number is not on my DNC list.
                        </span>
                      </label>

                      {isDncBlocked && (
                        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 flex items-start gap-2 text-destructive shadow-[0_0_15px_rgba(244,63,94,0.1)]">
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                          <div className="wl-micro-meta leading-snug">
                            <strong className="font-bold">Blocked by DNC Policy:</strong> This
                            number is registered on your active Do-Not-Call list and cannot be
                            dialed.
                          </div>
                        </div>
                      )}

                      {quotaExhausted && (
                        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 flex items-start gap-2">
                          <AlertTriangle className="w-3.5 h-3.5 text-destructive shrink-0 mt-0.5" />
                          <p className="wl-micro-meta text-destructive/90 leading-snug">
                            Daily voice-minute limit reached. Resets at midnight UTC.
                          </p>
                        </div>
                      )}
                      {quotaNearLimit && (
                        <div className="rounded-md border border-brand/30 bg-brand/5 px-3 py-2 flex items-start gap-2">
                          <AlertTriangle className="w-3.5 h-3.5 text-brand shrink-0 mt-0.5" />
                          <p className="wl-micro-meta text-brand/90 leading-snug">
                            Near daily limit — {quotaUsed} of {quotaLimit} minutes used.
                          </p>
                        </div>
                      )}
                      <ShadButton
                        type="button"
                        variant="editorial"
                        disableAnimations
                        onClick={dispatchCall}
                        disabled={
                          isDialing ||
                          !customerNumber ||
                          !hasOutboundConsent ||
                          !!quotaExhausted ||
                          isDncBlocked
                        }
                        className="w-full rounded-md !py-3 text-[11px] tracking-[0.3em] transition-all duration-300 hover:shadow-[0_0_15px_rgba(var(--brand-rgb),0.3)] hover:-translate-y-0.5 relative overflow-hidden group"
                      >
                        {/* Glow effect on hover */}
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:animate-shimmer" />
                        {isDialing ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" /> Dispatching
                          </>
                        ) : (
                          <>
                            <Search className="w-4 h-4" /> Initiate call
                          </>
                        )}
                      </ShadButton>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="bulk"
                      initial={{ opacity: 0, x: 8 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 8 }}
                      className="space-y-3"
                    >
                      <div className="rounded-md wl-panel border border-border p-3">
                        <div className="flex items-center gap-1.5 mb-2 text-brand">
                          <Terminal className="w-3 h-3" />
                          <span className="wl-label">CSV format</span>
                        </div>
                        <ul className="wl-micro-meta--muted space-y-0.5">
                          <li className="flex items-center gap-1.5">
                            <ChevronRight className="w-2.5 h-2.5 text-brand" /> Headers:{" "}
                            <span className="text-foreground/80">phone, name, context</span>
                          </li>
                          <li className="flex items-center gap-1.5">
                            <ChevronRight className="w-2.5 h-2.5 text-brand" /> Limit:{" "}
                            <span className="text-foreground/80">1,000 rows</span>
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
                            <Select
                              value={bulkCampaignId || DISPATCH_UNSET}
                              onValueChange={(v) =>
                                setBulkCampaignId(v === DISPATCH_UNSET ? "" : v)
                              }
                            >
                              <SelectTrigger
                                aria-label="Assign to campaign"
                                className="w-full text-sm bg-black/5 border border-white/10 rounded-md pl-3 py-2 text-foreground h-auto"
                              >
                                <SelectValue placeholder="No campaign" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value={DISPATCH_UNSET}>No campaign</SelectItem>
                                {campaigns.map((c) => (
                                  <SelectItem key={c.id} value={c.id}>
                                    {c.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      )}

                      <label className="rounded-md wl-panel border border-brand/20 p-3 flex items-start gap-2 cursor-pointer">
                        <Checkbox
                          checked={hasOutboundConsent}
                          onChange={(e) => setHasOutboundConsent(e.target.checked)}
                          className="mt-0.5 accent-brand"
                        />
                        <span className="wl-micro-meta--muted leading-relaxed">
                          I have prior express written consent for every number in this manifest and
                          will honor opt-outs immediately.
                        </span>
                      </label>

                      <ShadButton
                        type="button"
                        variant="outline"
                        disableAnimations
                        onClick={triggerUploadCsv}
                        disabled={!hasOutboundConsent}
                        className="w-full h-auto rounded-md border border-dashed border-border hover:border-brand/30 py-8 flex flex-col items-center justify-center gap-2 group"
                      >
                        {isUploading ? (
                          <Loader2 className="w-7 h-7 text-brand animate-spin" />
                        ) : (
                          <UploadCloud className="w-7 h-7 text-muted group-hover:text-brand transition-colors" />
                        )}
                        <span className="font-display italic text-base text-foreground">
                          Upload manifest
                        </span>
                        <span className="app-section-title">Drag CSV or click to browse</span>
                      </ShadButton>

                      <div className="rounded-md wl-panel border border-brand/20 p-3 flex items-start gap-2">
                        <Shield className="w-3.5 h-3.5 text-brand shrink-0 mt-0.5" />
                        <p className="wl-micro-meta--muted leading-relaxed">
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
                        <div className="rounded-md bg-destructive/10 border border-destructive/30 text-destructive px-3 py-2 text-xs flex items-center gap-2">
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                          <span className="leading-relaxed">{dialError}</span>
                        </div>
                      )}
                      {uploadStats && (
                        <div className="rounded-md bg-brand/10 border border-brand/30 text-brand px-3 py-2 text-xs flex items-center gap-2">
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
                  <ShadButton
                    type="button"
                    variant="outline"
                    size="sm"
                    disableAnimations
                    onClick={launchQueue}
                    disabled={isDialing || !hasOutboundConsent}
                    title={
                      hasOutboundConsent
                        ? "Dispatch queued calls"
                        : "Confirm outbound consent before dispatching queued calls"
                    }
                    className="rounded-full bg-brand/20 border-brand/40 text-brand wl-label hover:bg-brand/30"
                  >
                    {isDialing ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Radar className="w-3 h-3" />
                    )}
                    Dispatch {queuedCount}
                  </ShadButton>
                ) : null
              }
            >
              <AnimatePresence mode="popLayout">
                {leads.length === 0 ? (
                  <EmptyState
                    icon={UploadCloud}
                    eyebrow={OPS_CHANNEL_EMPTY.outboundQueue.eyebrow}
                    title={OPS_CHANNEL_EMPTY.outboundQueue.title}
                    description={OPS_CHANNEL_EMPTY.outboundQueue.description}
                    density="compact"
                    withHalo={false}
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
                  <motion.div key="lead-list" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                    <ChannelListColHeader
                      columns={[
                        { label: "Lead" },
                        { label: "Number" },
                        { label: "Status", className: "text-right" },
                      ]}
                      className="grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_5rem]"
                    />
                    <div className="divide-y divide-black/6">
                      {leads.map((lead, idx) => (
                        <motion.div
                          layout
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          key={lead.id || idx}
                          className={cn(
                            "px-4 py-3 flex flex-col sm:flex-row gap-3 transition-colors items-start sm:items-center touch-press",
                            lead.status === "Queued" ? "bg-brand/5" : "hover:bg-black/3",
                          )}
                        >
                          <div className="flex-1 min-w-0 space-y-1.5">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="font-display italic text-lg text-foreground leading-none truncate">
                                {lead.customer_name || "Unknown subject"}
                              </h3>
                              {lead.source === "inbound" && (
                                <span className="px-1.5 py-0.5 rounded-full bg-brand-2/15 border border-brand-2/40 text-brand-2 wl-label leading-none">
                                  Inbound
                                </span>
                              )}
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span
                                className={cn(
                                  "px-1.5 py-0.5 rounded-full border wl-label leading-none inline-flex items-center gap-1",
                                  lead.status === "Completed"
                                    ? "bg-brand/10 border-brand/30 text-brand"
                                    : lead.status === "Queued"
                                      ? "bg-brand/15 border-brand/40 text-brand"
                                      : "bg-destructive/10 border-destructive/30 text-destructive",
                                )}
                              >
                                <span className="w-1 h-1 rounded-full bg-current" /> {lead.status}
                              </span>
                              <Link
                                to={`/contact/${encodeURIComponent(lead.phone_number || lead.customer_number || "unknown")}`}
                                className="px-2 py-0.5 rounded-full wl-panel border border-brand/30 hover:bg-brand/10 hover:border-brand/60 wl-micro-badge text-brand font-mono tabular-nums"
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
                            <ShadButton
                              type="button"
                              variant="outline"
                              size="icon"
                              disableAnimations
                              onClick={() => deleteLead(lead.id)}
                              disabled={isDeletingLead === lead.id}
                              aria-label="Remove lead"
                              title="Remove lead"
                              className="w-7 h-7 rounded-full text-muted hover:text-destructive hover:border-destructive/30"
                            >
                              {isDeletingLead === lead.id ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <Trash2 className="w-3 h-3" />
                              )}
                            </ShadButton>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {leadsHasMore && (
                <div className="px-4 py-3 flex justify-center border-t border-white/8">
                  <ShadButton
                    type="button"
                    variant="outline"
                    size="sm"
                    disableAnimations
                    onClick={loadMoreLeads}
                    disabled={isLoadingMore}
                    className="rounded-full border-border wl-label hover:border-brand/40"
                  >
                    {isLoadingMore ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Plus className="w-3 h-3" />
                    )}
                    Load {leadsTotal - leads.length} more
                  </ShadButton>
                </div>
              )}
            </Panel>
          </div>
        </div>
      )}
    </>
  );
}
