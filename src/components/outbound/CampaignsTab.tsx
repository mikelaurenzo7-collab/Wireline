import React from "react";
import {
  Loader2,
  Megaphone,
  Plus,
  ChevronRight,
  Users,
  Activity,
  CheckCircle2,
  BarChart3,
  TrendingUp,
  Rocket,
  Pause,
  Play,
  Trash2,
  Phone,
  Clock,
  DollarSign,
  Award,
  AlertTriangle,
  RefreshCw,
  Target,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "../../lib/utils";
import { Link } from "react-router-dom";
import { Panel } from "../PageShell";
import EmptyState from "../EmptyState";
import { formatDate } from "../../lib/safe-date";
import { CAMPAIGN_STATUS } from "./shared";

interface CampaignsTabProps {
  campaigns: any[];
  campaignLoading: boolean;
  setShowCampaignModal: (show: boolean) => void;
  selectedCampaign: any | null;
  handleSelectCampaign: (c: any) => void;
  showAnalytics: boolean;
  setShowAnalytics: (show: boolean | ((p: boolean) => boolean)) => void;
  fetchCampaignAnalytics: (id: string) => void;
  analyticsLoading: boolean;
  campaignAnalytics: any | null;
  launchCampaign: (campaignId: string, campaignName: string) => void;
  launchingCampaignId: string | null;
  stopCampaign: (campaignId: string) => void;
  stoppingCampaignId: string | null;
  setCampaignStatus: (id: string, status: string) => void;
  deleteCampaign: (id: string) => void;
  campaignLeadsLoading: boolean;
  campaignLeads: any[];
  triggerUploadCsv: () => void;
  retryFailedLeads: (campaignId: string) => void;
  selectedAgentId: string;
}

export default function CampaignsTab({
  campaigns,
  campaignLoading,
  setShowCampaignModal,
  selectedCampaign,
  handleSelectCampaign,
  showAnalytics,
  setShowAnalytics,
  fetchCampaignAnalytics,
  analyticsLoading,
  campaignAnalytics,
  launchCampaign,
  launchingCampaignId,
  stopCampaign,
  stoppingCampaignId,
  setCampaignStatus,
  deleteCampaign,
  campaignLeadsLoading,
  campaignLeads,
  triggerUploadCsv,
  retryFailedLeads,
  selectedAgentId,
}: CampaignsTabProps) {
  return (
    <div className="h-full grid grid-cols-1 lg:grid-cols-12 gap-3 min-h-0">
      {/* Campaign list */}
      <div className="lg:col-span-5 min-h-0">
        <Panel
          title="Campaigns"
          hint={`${campaigns.length} total`}
          icon={Megaphone}
          scroll
          flush
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
                <p className="app-section-title/70 max-w-xs">
                  Create a campaign to group and track bulk outbound calling efforts.
                </p>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {campaigns.map((c) => {
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
                      isSelected && "bg-brand/8 ring-1 ring-inset ring-brand/30",
                    )}
                    onClick={() => handleSelectCampaign(c)}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={cn(
                          "w-9 h-9 rounded-xl glass border flex items-center justify-center shrink-0 mt-0.5",
                          statusMeta.iconBorder,
                        )}
                      >
                        <Megaphone className={cn("w-4 h-4", statusMeta.text)} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                          <span className="font-display italic text-base text-ink truncate">
                            {c.name}
                          </span>
                          <span
                            className={cn(
                              "px-2 py-0.5 rounded-full border text-[8px] uppercase tracking-[0.3em] shrink-0",
                              statusMeta.bg,
                              statusMeta.text,
                              statusMeta.border,
                            )}
                          >
                            {c.status}
                          </span>
                        </div>
                        {c.goal && (
                          <p className="text-[10px] text-muted/70 truncate mb-1">{c.goal}</p>
                        )}
                        <div className="flex items-center gap-3 text-[9px] text-muted/70">
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
                      <ChevronRight className="w-3.5 h-3.5 text-muted/70 shrink-0 mt-1" />
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </Panel>
      </div>

      {/* Campaign detail */}
      <div className="lg:col-span-7 min-h-0">
        {selectedCampaign ? (
          <Panel
            title={selectedCampaign.name}
            hint="Campaign detail"
            icon={BarChart3}
            scroll
            flush
            actions={
              <div className="flex flex-wrap items-center gap-1.5">
                {/* Analytics button */}
                <button
                  onClick={() => {
                    if (!showAnalytics) fetchCampaignAnalytics(selectedCampaign.id);
                    setShowAnalytics((p) => !p);
                  }}
                  className={cn(
                    "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[10px] uppercase tracking-[0.25em] transition-colors",
                    showAnalytics
                      ? "bg-brand/20 border-brand/50 text-brand"
                      : "glass border-white/10 text-muted hover:text-brand hover:border-brand/40",
                  )}
                >
                  <TrendingUp className="w-3 h-3" /> Analytics
                </button>
                {/* Launch button — dials all queued leads via server fire-and-forget */}
                {selectedCampaign.status !== "running" &&
                  selectedCampaign.status !== "completed" && (
                    <button
                      onClick={() => launchCampaign(selectedCampaign.id, selectedCampaign.name)}
                      disabled={launchingCampaignId === selectedCampaign.id}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-brand/15 border border-brand/40 text-brand text-[10px] uppercase tracking-[0.25em] hover:bg-brand/25 transition-colors disabled:opacity-50"
                    >
                      {launchingCampaignId === selectedCampaign.id ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Rocket className="w-3 h-3" />
                      )}
                      Launch
                    </button>
                  )}
                {/* Stop button — halts a running campaign after the current lead finishes */}
                {selectedCampaign.status === "running" && (
                  <button
                    onClick={() => stopCampaign(selectedCampaign.id)}
                    disabled={stoppingCampaignId === selectedCampaign.id}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-rose-500/15 border border-rose-500/40 text-rose-500 text-[10px] uppercase tracking-[0.25em] hover:bg-rose-500/25 transition-colors disabled:opacity-50"
                  >
                    {stoppingCampaignId === selectedCampaign.id ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Pause className="w-3 h-3" />
                    )}
                    Stop
                  </button>
                )}
                {selectedCampaign.status === "draft" && (
                  <button
                    onClick={() => setCampaignStatus(selectedCampaign.id, "active")}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/15 border border-emerald-500/40 text-emerald-600 text-[10px] uppercase tracking-[0.25em] hover:bg-emerald-500/25 transition-colors"
                  >
                    <Play className="w-3 h-3" /> Activate
                  </button>
                )}
                {selectedCampaign.status === "active" && (
                  <button
                    onClick={() => setCampaignStatus(selectedCampaign.id, "paused")}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-500/15 border border-amber-500/40 text-amber-600 text-[10px] uppercase tracking-[0.25em] hover:bg-amber-500/25 transition-colors"
                  >
                    <Pause className="w-3 h-3" /> Pause
                  </button>
                )}
                {selectedCampaign.status === "paused" && (
                  <button
                    onClick={() => setCampaignStatus(selectedCampaign.id, "active")}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-brand/15 border border-brand/40 text-brand text-[10px] uppercase tracking-[0.25em] hover:bg-brand/25 transition-colors"
                  >
                    <Play className="w-3 h-3" /> Resume
                  </button>
                )}
                {["active", "paused"].includes(selectedCampaign.status) && (
                  <button
                    onClick={() => setCampaignStatus(selectedCampaign.id, "completed")}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-violet-500/15 border border-violet-500/40 text-violet-600 text-[10px] uppercase tracking-[0.25em] hover:bg-violet-500/25 transition-colors"
                  >
                    <CheckCircle2 className="w-3 h-3" /> Complete
                  </button>
                )}
                <button
                  onClick={() => deleteCampaign(selectedCampaign.id)}
                  aria-label="Delete campaign"
                  title="Delete campaign"
                  className="w-8 h-8 rounded-lg glass border border-white/10 flex items-center justify-center text-muted hover:text-rose-500 hover:border-rose-500/30 transition-all"
                >
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
                      <span className="text-[9px] uppercase tracking-[0.3em] text-brand">
                        Live · Dialing in progress
                      </span>
                    </div>
                    <span className="text-[9px] font-mono text-muted tabular-nums">
                      {selectedCampaign.dialed_count ?? 0} / {selectedCampaign.leads_count} dialed
                    </span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-black/10 overflow-hidden">
                    <motion.div
                      animate={{
                        width: `${selectedCampaign.leads_count > 0 ? Math.round(((selectedCampaign.dialed_count ?? 0) / selectedCampaign.leads_count) * 100) : 0}%`,
                      }}
                      transition={{ duration: 0.6, ease: "easeOut" }}
                      className="h-full rounded-full"
                      style={{ background: "linear-gradient(90deg,#4F1E7B,#4F1E7B)" }}
                    />
                  </div>
                  <div className="flex items-center gap-1 mt-1.5">
                    <RefreshCw
                      className="w-2.5 h-2.5 text-muted/70 animate-spin"
                      style={{ animationDuration: "3s" }}
                    />
                    <span className="text-[8px] text-muted/70">Refreshing every 10s</span>
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
                        <span className="text-[9px] uppercase tracking-[0.3em] text-muted">
                          Loading analytics
                        </span>
                      </div>
                    ) : campaignAnalytics ? (
                      <div className="space-y-3 pb-3">
                        {/* Call stats */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                          {[
                            {
                              label: "Answered",
                              value: campaignAnalytics.call_stats?.answered ?? 0,
                              icon: Phone,
                              accent: "#10B981",
                            },
                            {
                              label: "Avg Duration",
                              value: `${campaignAnalytics.call_stats?.avg_duration_sec ?? 0}s`,
                              icon: Clock,
                              accent: "#4F1E7B",
                            },
                            {
                              label: "Total Cost",
                              value: `$${(campaignAnalytics.call_stats?.total_cost_usd ?? 0).toFixed(3)}`,
                              icon: DollarSign,
                              accent: "#4F1E7B",
                            },
                            {
                              label: "Avg Score",
                              value:
                                campaignAnalytics.call_stats?.avg_lead_score != null
                                  ? campaignAnalytics.call_stats.avg_lead_score
                                  : "—",
                              icon: Award,
                              accent: "#4F1E7B",
                            },
                          ].map(({ label, value, icon: Icon, accent }) => (
                            <div key={label} className="rounded-xl glass border border-white/8 p-3">
                              <div className="flex items-center gap-1.5 mb-1.5">
                                <Icon className="w-3 h-3 shrink-0" style={{ color: accent }} />
                                <span className="text-[8px] uppercase tracking-[0.28em] text-muted">
                                  {label}
                                </span>
                              </div>
                              <div
                                className="font-display italic text-lg leading-none tabular-nums"
                                style={{ color: accent }}
                              >
                                {value}
                              </div>
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
                                  o.status === "Completed"
                                    ? "#10B981"
                                    : o.status === "Failed" || o.status?.includes("Fail")
                                      ? "#4F1E7B"
                                      : o.status === "Queued"
                                        ? "#4F1E7B"
                                        : o.status?.includes("Blocked")
                                          ? "#FF9A5C"
                                          : "#7C7469";
                                return (
                                  <div key={o.status} className="flex items-center gap-2.5">
                                    <span className="text-[9px] text-muted w-28 shrink-0">
                                      {o.status}
                                    </span>
                                    <div className="flex-1 h-1.5 rounded-full bg-black/10 overflow-hidden">
                                      <motion.div
                                        initial={{ width: 0 }}
                                        animate={{ width: `${o.pct}%` }}
                                        transition={{ duration: 0.6 }}
                                        className="h-full rounded-full"
                                        style={{ background: color }}
                                      />
                                    </div>
                                    <span className="text-[9px] font-mono text-ink/70 w-8 text-right shrink-0 tabular-nums">
                                      {o.count}
                                    </span>
                                    <span className="text-[8px] text-muted/70 w-7 text-right shrink-0 tabular-nums">
                                      {o.pct}%
                                    </span>
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
                { label: "Leads", value: selectedCampaign.leads_count, accent: "#4F1E7B" },
                { label: "Dialed", value: selectedCampaign.dialed_count, accent: "#4F1E7B" },
                { label: "Connected", value: selectedCampaign.connected_count, accent: "#10B981" },
                {
                  label: "Window",
                  value: `${selectedCampaign.call_window_start}–${selectedCampaign.call_window_end}`,
                  accent: "#4F1E7B",
                },
              ].map((s) => (
                <div key={s.label} className="rounded-lg glass border border-white/8 p-2.5">
                  <div
                    className="text-[8px] uppercase tracking-[0.3em] mb-1"
                    style={{ color: s.accent }}
                  >
                    {s.label}
                  </div>
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
              <EmptyState
                icon={Megaphone}
                title="No leads in campaign"
                description="Upload a CSV from the Bulk tab and pick this campaign in the dropdown — assigned leads land here."
                accent="#4F1E7B"
                actions={[
                  {
                    label: "Upload CSV",
                    onClick: triggerUploadCsv,
                    primary: true,
                  },
                ]}
              />
            ) : (
              <>
                {/* Retry failed banner */}
                {campaignLeads.some((l) => l.status === "Failed") && (
                  <div className="mx-4 mt-3 rounded-xl bg-rose-500/10 border border-rose-500/30 p-3 flex items-center gap-3">
                    <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] text-rose-500 uppercase tracking-[0.25em]">
                        {campaignLeads.filter((l) => l.status === "Failed").length} failed lead
                        {campaignLeads.filter((l) => l.status === "Failed").length > 1 ? "s" : ""}
                      </p>
                    </div>
                    <button
                      onClick={() => retryFailedLeads(selectedCampaign.id)}
                      className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-rose-500/20 border border-rose-500/40 text-rose-500 text-[9px] uppercase tracking-[0.25em] hover:bg-rose-500/30 transition-colors"
                    >
                      <Activity className="w-3 h-3" /> Retry Failed
                    </button>
                  </div>
                )}
                <div className="divide-y divide-white/5 mt-2">
                  {campaignLeads.map((lead) => (
                    <div
                      key={lead.id}
                      className="px-4 py-3 flex items-center gap-3 hover:bg-white/3 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                          <span className="font-display italic text-sm text-ink truncate">
                            {lead.customer_name || "Unknown"}
                          </span>
                          <span
                            className={cn(
                              "px-1.5 py-0 rounded-full border text-[8px] uppercase tracking-[0.25em] leading-tight",
                              lead.status === "Completed"
                                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-500"
                                : lead.status === "Queued"
                                  ? "bg-brand/15 border-brand/40 text-brand"
                                  : lead.status === "Failed"
                                    ? "bg-rose-500/10 border-rose-500/30 text-rose-500"
                                    : lead.status === "Dialing"
                                      ? "bg-amber-500/10 border-amber-500/30 text-amber-500"
                                      : "bg-white/5 border-white/10 text-muted",
                            )}
                          >
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
                      <div className="text-[9px] text-muted/70 tabular-nums shrink-0">
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
              <p className="app-section-title">Select a campaign to view details</p>
            </div>
          </Panel>
        )}
      </div>
    </div>
  );
}
