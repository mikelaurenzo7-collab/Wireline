/* eslint-disable @typescript-eslint/no-explicit-any -- Campaign rows + analytics
 * are forwarded from OutboundDialer's untyped /api/campaigns responses. The
 * prop shapes intentionally mirror those any[] sources so tightening can
 * happen in one pass once contracts/api-types.ts covers the outbound module. */
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
import { EmptyState } from "../ui/EmptyState";
import { OPS_CHANNEL_EMPTY } from "../../lib/wireline-ops-design";
import ClientRouteLoading from "../layout/ClientRouteLoading";
import { ShadButton } from "../ui/shadcn/ShadButton";
import { formatDate } from "../../lib/safe-date";
import { CAMPAIGN_STATUS, campaignOutcomeBarClass } from "./shared";

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
            <ShadButton
              type="button"
              variant="outline"
              size="sm"
              disableAnimations
              onClick={() => setShowCampaignModal(true)}
              className="rounded-full bg-brand/15 border-brand/40 text-brand wl-ops-chip hover:bg-brand/25"
            >
              <Plus className="w-3 h-3" /> New
            </ShadButton>
          }
        >
          {campaignLoading ? (
            <ClientRouteLoading
              icon={<Megaphone className="w-6 h-6" />}
              label="Loading campaigns"
            />
          ) : campaigns.length === 0 ? (
            <EmptyState
              icon={Megaphone}
              eyebrow={OPS_CHANNEL_EMPTY.campaigns.eyebrow}
              title={OPS_CHANNEL_EMPTY.campaigns.title}
              description={OPS_CHANNEL_EMPTY.campaigns.description}
              actions={[...OPS_CHANNEL_EMPTY.campaigns.actions]}
            />
          ) : (
            <div className="divide-y divide-border/60">
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
                      "px-4 py-3.5 cursor-pointer wl-panel border border-border hover:border-brand/30 hover:-translate-y-px transition-all duration-300 group touch-press",
                      isSelected && "bg-brand/8 ring-1 ring-inset ring-brand/30",
                    )}
                    onClick={() => handleSelectCampaign(c)}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={cn(
                          "w-9 h-9 rounded-md flex items-center justify-center shrink-0 mt-0.5 bg-gradient-to-br from-brand to-brand-deep text-on-brand shadow-sm shadow-brand/25",
                        )}
                      >
                        <Megaphone className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                          <span className="font-display italic text-base text-ink truncate">
                            {c.name}
                          </span>
                          <span
                            className={cn(
                              "px-2 py-0.5 rounded-full border wl-label shrink-0",
                              statusMeta.bg,
                              statusMeta.text,
                              statusMeta.border,
                            )}
                          >
                            {c.status}
                          </span>
                        </div>
                        {c.goal && <p className="text-caption truncate mb-1">{c.goal}</p>}
                        <div className="flex items-center gap-3 wl-micro-meta">
                          <span className="inline-flex items-center gap-1">
                            <Users className="w-2.5 h-2.5" />
                            {c.leads_count} leads
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <Activity className="w-2.5 h-2.5" />
                            {c.dialed_count} dialed
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <CheckCircle2 className="w-2.5 h-2.5 text-brand" />
                            {c.connected_count} connected
                          </span>
                        </div>
                      </div>
                      <ChevronRight className="w-3.5 h-3.5 text-ink/40 shrink-0 mt-1" />
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
                <ShadButton
                  type="button"
                  variant="ghost"
                  size="sm"
                  disableAnimations
                  onClick={() => {
                    if (!showAnalytics) fetchCampaignAnalytics(selectedCampaign.id);
                    setShowAnalytics((p) => !p);
                  }}
                  className={cn(
                    "rounded-full border wl-ops-chip",
                    showAnalytics
                      ? "bg-brand/20 border-brand/50 text-brand hover:bg-brand/20"
                      : "wl-panel border-border text-muted hover:text-brand hover:border-brand/40",
                  )}
                >
                  <TrendingUp className="w-3 h-3" /> Analytics
                </ShadButton>
                {selectedCampaign.status !== "running" &&
                  selectedCampaign.status !== "completed" && (
                    <ShadButton
                      type="button"
                      variant="outline"
                      size="sm"
                      disableAnimations
                      onClick={() => launchCampaign(selectedCampaign.id, selectedCampaign.name)}
                      disabled={launchingCampaignId === selectedCampaign.id}
                      className="rounded-full bg-brand/15 border-brand/40 text-brand wl-ops-chip hover:bg-brand/25"
                    >
                      {launchingCampaignId === selectedCampaign.id ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Rocket className="w-3 h-3" />
                      )}
                      Launch
                    </ShadButton>
                  )}
                {selectedCampaign.status === "running" && (
                  <ShadButton
                    type="button"
                    variant="destructive"
                    size="sm"
                    disableAnimations
                    onClick={() => stopCampaign(selectedCampaign.id)}
                    disabled={stoppingCampaignId === selectedCampaign.id}
                    className="rounded-full bg-destructive/15 border-destructive/40 text-destructive wl-ops-chip hover:bg-destructive/25 shadow-none"
                  >
                    {stoppingCampaignId === selectedCampaign.id ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Pause className="w-3 h-3" />
                    )}
                    Stop
                  </ShadButton>
                )}
                {selectedCampaign.status === "draft" && (
                  <ShadButton
                    type="button"
                    variant="outline"
                    size="sm"
                    disableAnimations
                    onClick={() => setCampaignStatus(selectedCampaign.id, "active")}
                    className="rounded-full bg-brand/15 border-brand/40 text-brand wl-ops-chip hover:bg-brand/25"
                  >
                    <Play className="w-3 h-3" /> Activate
                  </ShadButton>
                )}
                {selectedCampaign.status === "active" && (
                  <ShadButton
                    type="button"
                    variant="outline"
                    size="sm"
                    disableAnimations
                    onClick={() => setCampaignStatus(selectedCampaign.id, "paused")}
                    className="rounded-full wl-panel border-border text-muted wl-ops-chip hover:text-brand hover:border-brand/40"
                  >
                    <Pause className="w-3 h-3" /> Pause
                  </ShadButton>
                )}
                {selectedCampaign.status === "paused" && (
                  <ShadButton
                    type="button"
                    variant="outline"
                    size="sm"
                    disableAnimations
                    onClick={() => setCampaignStatus(selectedCampaign.id, "active")}
                    className="rounded-full bg-brand/15 border-brand/40 text-brand wl-ops-chip hover:bg-brand/25"
                  >
                    <Play className="w-3 h-3" /> Resume
                  </ShadButton>
                )}
                {["active", "paused"].includes(selectedCampaign.status) && (
                  <ShadButton
                    type="button"
                    variant="outline"
                    size="sm"
                    disableAnimations
                    onClick={() => setCampaignStatus(selectedCampaign.id, "completed")}
                    className="rounded-full bg-brand/10 border-brand/30 text-brand wl-ops-chip hover:bg-brand/20"
                  >
                    <CheckCircle2 className="w-3 h-3" /> Complete
                  </ShadButton>
                )}
                <ShadButton
                  type="button"
                  variant="outline"
                  size="icon"
                  disableAnimations
                  onClick={() => deleteCampaign(selectedCampaign.id)}
                  aria-label="Delete campaign"
                  title="Delete campaign"
                  className="w-8 h-8 rounded-md text-muted hover:text-destructive hover:border-destructive/30"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </ShadButton>
              </div>
            }
          >
            {/* Live progress bar when running */}
            {selectedCampaign.status === "running" && selectedCampaign.leads_count > 0 && (
              <div className="px-4 pt-3 pb-0">
                <div className="rounded-md bg-brand/8 border border-brand/20 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand opacity-75" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-brand" />
                      </span>
                      <span className="wl-label text-brand">
                        Live · Dialing in progress
                      </span>
                    </div>
                    <span className="wl-micro-badge font-mono text-muted tabular-nums">
                      {selectedCampaign.dialed_count ?? 0} / {selectedCampaign.leads_count} dialed
                    </span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-black/10 overflow-hidden">
                    <motion.div
                      animate={{
                        width: `${selectedCampaign.leads_count > 0 ? Math.round(((selectedCampaign.dialed_count ?? 0) / selectedCampaign.leads_count) * 100) : 0}%`,
                      }}
                      transition={{ duration: 0.6, ease: "easeOut" }}
                      className="h-full rounded-full bg-brand"
                    />
                  </div>
                  <div className="flex items-center gap-1 mt-1.5">
                    <RefreshCw className="w-2.5 h-2.5 text-ink/40 animate-spin [animation-duration:3s]" />
                    <span className="wl-micro-meta">Refreshing every 10s</span>
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
                        <span className="wl-label-muted">
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
                            },
                            {
                              label: "Avg Duration",
                              value: `${campaignAnalytics.call_stats?.avg_duration_sec ?? 0}s`,
                              icon: Clock,
                            },
                            {
                              label: "Total Cost",
                              value: `$${(campaignAnalytics.call_stats?.total_cost_usd ?? 0).toFixed(3)}`,
                              icon: DollarSign,
                            },
                            {
                              label: "Avg Score",
                              value:
                                campaignAnalytics.call_stats?.avg_lead_score != null
                                  ? campaignAnalytics.call_stats.avg_lead_score
                                  : "—",
                              icon: Award,
                            },
                          ].map(({ label, value, icon: Icon }) => (
                            <div
                              key={label}
                              className="rounded-md wl-panel border border-border p-3"
                            >
                              <div className="flex items-center gap-1.5 mb-1.5">
                                <Icon className="w-3 h-3 shrink-0 text-brand" />
                                <span className="wl-label text-muted">
                                  {label}
                                </span>
                              </div>
                              <div className="font-display italic text-lg leading-none tabular-nums text-brand">
                                {value}
                              </div>
                            </div>
                          ))}
                        </div>
                        {/* Outcome breakdown */}
                        {(campaignAnalytics.outcomes ?? []).length > 0 && (
                          <div className="rounded-md wl-panel border border-border p-3">
                            <h5 className="wl-label-muted mb-2.5 flex items-center gap-1.5">
                              <BarChart3 className="w-3 h-3" /> Lead Outcomes
                            </h5>
                            <div className="space-y-1.5">
                              {campaignAnalytics.outcomes.map((o: any) => (
                                <div key={o.status} className="flex items-center gap-2.5">
                                  <span className="wl-micro-meta--muted w-28 shrink-0">
                                    {o.status}
                                  </span>
                                  <div className="flex-1 h-1.5 rounded-full bg-black/10 overflow-hidden">
                                    <motion.div
                                      initial={{ width: 0 }}
                                      animate={{ width: `${o.pct}%` }}
                                      transition={{ duration: 0.6 }}
                                      className={cn(
                                        "h-full rounded-full",
                                        campaignOutcomeBarClass(o.status),
                                      )}
                                    />
                                  </div>
                                  <span className="wl-micro-badge font-mono text-ink/70 w-8 text-right shrink-0 tabular-nums">
                                    {o.count}
                                  </span>
                                  <span className="wl-micro-meta w-7 text-right shrink-0 tabular-nums">
                                    {o.pct}%
                                  </span>
                                </div>
                              ))}
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
            <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-2 border-b border-black/8">
              {[
                { label: "Leads", value: selectedCampaign.leads_count },
                { label: "Dialed", value: selectedCampaign.dialed_count },
                { label: "Connected", value: selectedCampaign.connected_count },
                {
                  label: "Window",
                  value: `${selectedCampaign.call_window_start}–${selectedCampaign.call_window_end}`,
                },
              ].map((s) => (
                <div key={s.label} className="rounded-md wl-panel border border-border p-2.5">
                  <div className="wl-label mb-1 text-brand">
                    {s.label}
                  </div>
                  <div className="font-display italic text-xl text-ink leading-none">{s.value}</div>
                </div>
              ))}
            </div>

            {/* Leads list */}
            {campaignLeadsLoading ? (
              <ClientRouteLoading
                icon={<Megaphone className="w-6 h-6" />}
                label="Loading leads"
                className="py-12"
              />
            ) : campaignLeads.length === 0 ? (
              <EmptyState
                icon={Megaphone}
                eyebrow={OPS_CHANNEL_EMPTY.campaignLeads.eyebrow}
                title={OPS_CHANNEL_EMPTY.campaignLeads.title}
                description={OPS_CHANNEL_EMPTY.campaignLeads.description}
                density="compact"
                withHalo={false}
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
                  <div className="mx-4 mt-3 rounded-md bg-destructive/10 border border-destructive/30 p-3 flex items-center gap-3">
                    <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="wl-label text-destructive">
                        {campaignLeads.filter((l) => l.status === "Failed").length} failed lead
                        {campaignLeads.filter((l) => l.status === "Failed").length > 1 ? "s" : ""}
                      </p>
                    </div>
                    <ShadButton
                      type="button"
                      variant="destructive"
                      size="sm"
                      disableAnimations
                      onClick={() => retryFailedLeads(selectedCampaign.id)}
                      className="shrink-0 rounded-full bg-destructive/20 border-destructive/40 text-destructive wl-label hover:bg-destructive/30 shadow-none"
                    >
                      <Activity className="w-3 h-3" /> Retry Failed
                    </ShadButton>
                  </div>
                )}
                <div className="divide-y divide-black/6 mt-2">
                  {campaignLeads.map((lead) => (
                    <div
                      key={lead.id}
                      className="px-4 py-3 flex items-center gap-3 hover:bg-black/3 transition-colors touch-press"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                          <span className="font-display italic text-sm text-ink truncate">
                            {lead.customer_name || "Unknown"}
                          </span>
                          <span
                            className={cn(
                              "px-1.5 py-0 rounded-full border wl-label leading-tight",
                              lead.status === "Completed"
                                ? "bg-brand/10 border-brand/30 text-brand"
                                : lead.status === "Queued"
                                  ? "bg-brand/15 border-brand/40 text-brand"
                                  : lead.status === "Failed"
                                    ? "bg-destructive/10 border-destructive/30 text-destructive"
                                    : lead.status === "Dialing"
                                      ? "bg-brand/8 border-brand/25 text-brand/80"
                                      : "bg-black/[0.04] border-border text-muted",
                            )}
                          >
                            {lead.status}
                          </span>
                        </div>
                        <Link
                          to={`/contact/${encodeURIComponent(lead.phone_number || lead.customer_number || "unknown")}`}
                          className="text-caption text-brand font-mono tabular-nums hover:underline"
                        >
                          {lead.phone_number || lead.customer_number}
                        </Link>
                      </div>
                      <div className="wl-micro-meta tabular-nums shrink-0">
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
