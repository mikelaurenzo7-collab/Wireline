import React, { useState, useEffect, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Shield,
  Search,
  Download,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  AlertCircle,
  XCircle,
  Info,
  Clock,
  User,
  Globe,
  Cpu,
  DollarSign,
  Activity,
  Filter,
  Calendar,
} from "lucide-react";
import PageShell, { Panel } from "./PageShell";
import HubTabs, { SYSTEM_HUB } from "./HubTabs";
import EmptyState from "./EmptyState";
import { authFetch } from "../lib/api";
import { useToast } from "../contexts/ToastContext";
import { cn } from "../lib/utils";
import { formatDateTime } from "../lib/safe-date";
import type { AuditEvent, AuditSeverity } from "../types/audit";

interface AuditStats {
  total: number;
  api_calls: number;
  total_cost: number;
  critical_count: number;
}

interface AuditResponse {
  events: AuditEvent[];
  total: number;
}

type TimeRange = 1 | 7 | 30 | 90;

const SEVERITY_OPTIONS: AuditSeverity[] = ["info", "warning", "error", "critical"];

// Category chips map to event-type *prefixes*. The server's
// /api/audit/events endpoint treats any value without a dot as a
// prefix (`auth` → `event_type ilike 'auth.%'`), so the chips here
// match every event in that namespace without having to enumerate
// each concrete type. Keep this list in sync with AuditEventType in
// ../types/audit.ts.
const EVENT_CATEGORIES = {
  auth: "Authentication",
  agent: "Agent Operations",
  settings: "Settings",
  billing: "Billing",
  ai: "AI Usage",
  api: "API & Webhooks",
  security: "Security",
  data: "Data Operations",
} as const;

function SeverityIcon({ severity }: { severity: AuditSeverity }) {
  const config = {
    info: { Icon: Info, color: "text-blue-600", bg: "bg-blue-500/10" },
    warning: { Icon: AlertTriangle, color: "text-yellow-600", bg: "bg-yellow-500/10" },
    error: { Icon: AlertCircle, color: "text-orange-600", bg: "bg-orange-500/10" },
    critical: { Icon: XCircle, color: "text-rose-500", bg: "bg-rose-500/10" },
  };
  const { Icon, color, bg } = config[severity];
  return (
    <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0", bg)}>
      <Icon className={cn("w-4 h-4", color)} />
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}) {
  return (
    <div className="relative glass rounded-xl p-4 border border-white/10 overflow-hidden">
      <div
        className={cn("absolute -top-6 -right-6 w-24 h-24 rounded-full opacity-20 blur-3xl", color)}
      />
      <div className="relative z-10">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] uppercase tracking-[0.3em] text-muted">{label}</span>
          <Icon className="w-3.5 h-3.5 text-muted/60" />
        </div>
        <p className="text-2xl font-display italic text-ink">{value}</p>
      </div>
    </div>
  );
}

const EventRow = React.memo(
  ({
    event,
    expanded,
    onToggle,
  }: {
    event: AuditEvent;
    expanded: boolean;
    onToggle: () => void;
  }) => {
    const timestamp = formatDateTime(
      event.created_at,
      { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" },
      "—",
      "en-US",
    );

    return (
      <motion.div
        layout
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        aria-label={`${event.event_type || event.action} event details`}
        className="relative glass border border-white/8 rounded-xl overflow-hidden hover:border-white/20 transition-all cursor-pointer outline-none focus:ring-2 focus:ring-brand/50"
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle();
          }
        }}
      >
        <div className="p-4 flex items-center gap-4">
          <SeverityIcon severity={event.severity} />
          <div className="flex-1 min-w-0 grid grid-cols-1 md:grid-cols-5 gap-3">
            <div className="md:col-span-2 min-w-0">
              <p className="text-sm text-ink font-medium break-words leading-snug">
                {event.event_type || event.action}
              </p>
              <p className="text-xs text-muted truncate mt-0.5">{event.actor_email || "System"}</p>
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted">Resource</p>
              <p className="text-sm text-ink break-all leading-snug">{event.resource_id || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted">Time</p>
              <p className="text-sm text-ink">{timestamp}</p>
            </div>
            <div className="text-right">
              {event.cost_usd != null && (
                <p className="text-sm text-ink">${Number(event.cost_usd ?? 0).toFixed(4)}</p>
              )}
            </div>
          </div>
          <motion.div animate={{ rotate: expanded ? 90 : 0 }} transition={{ duration: 0.2 }}>
            <ChevronRight className="w-4 h-4 text-muted shrink-0" />
          </motion.div>
        </div>

        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="overflow-hidden"
            >
              <div className="px-4 pb-4 pt-2 border-t border-white/8 space-y-3">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                  {event.ip_address && (
                    <div>
                      <p className="text-muted mb-1 flex items-center gap-1.5">
                        <Globe className="w-3 h-3" /> IP Address
                      </p>
                      <p className="text-ink font-mono">{event.ip_address}</p>
                    </div>
                  )}
                  {event.user_agent && (
                    <div className="md:col-span-2">
                      <p className="text-muted mb-1 flex items-center gap-1.5">
                        <User className="w-3 h-3" /> User Agent
                      </p>
                      <p className="text-ink break-all">{event.user_agent}</p>
                    </div>
                  )}
                  {event.provider && (
                    <div>
                      <p className="text-muted mb-1 flex items-center gap-1.5">
                        <Cpu className="w-3 h-3" /> Provider
                      </p>
                      <p className="text-ink">
                        {event.provider} / {event.model || "—"}
                      </p>
                    </div>
                  )}
                  {(event.input_tokens != null || event.output_tokens != null) && (
                    <div>
                      <p className="text-muted mb-1 flex items-center gap-1.5">
                        <Activity className="w-3 h-3" /> Tokens
                      </p>
                      <p className="text-ink font-mono">
                        {event.input_tokens || 0} in / {event.output_tokens || 0} out
                      </p>
                    </div>
                  )}
                  {event.latency_ms != null && (
                    <div>
                      <p className="text-muted mb-1 flex items-center gap-1.5">
                        <Clock className="w-3 h-3" /> Latency
                      </p>
                      <p className="text-ink font-mono">{event.latency_ms}ms</p>
                    </div>
                  )}
                </div>
                {event.metadata && Object.keys(event.metadata).length > 0 && (
                  <div>
                    <p className="text-muted text-xs mb-2">Metadata</p>
                    <pre className="text-xs text-ink/80 bg-black/20 rounded-lg p-3 overflow-x-auto max-h-48 overflow-y-auto scrollbar-hide">
                      {JSON.stringify(event.metadata, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    );
  },
);

export default function AuditLog() {
  const { error: toastError, success: toastSuccess } = useToast();

  // State
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [stats, setStats] = useState<AuditStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [timeRange, setTimeRange] = useState<TimeRange>(7);
  const [selectedSeverities, setSelectedSeverities] = useState<AuditSeverity[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [filtersExpanded, setFiltersExpanded] = useState(false);

  // Expandable rows
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

  // Fetch events
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        params.set("days", timeRange.toString());
        if (selectedSeverities.length > 0) {
          selectedSeverities.forEach((s) => params.append("severity", s));
        }
        if (selectedCategories.length > 0) {
          selectedCategories.forEach((c) => params.append("event_type", c));
        }

        const [eventsRes, statsRes] = await Promise.all([
          authFetch(`/api/audit/events?${params}`),
          authFetch(`/api/audit/stats?${params}`),
        ]);

        if (!eventsRes.ok || !statsRes.ok) {
          throw new Error("Failed to fetch audit data");
        }

        const eventsData: AuditResponse = await eventsRes.json();
        const statsData: any = await statsRes.json();

        // Map backend response to frontend stats shape
        const mappedStats: AuditStats = {
          total: statsData.total_events || 0,
          api_calls: statsData.total_api_calls || 0,
          total_cost: statsData.total_cost_usd || 0,
          critical_count: statsData.by_severity?.critical || 0,
        };

        setEvents(eventsData.events);
        setStats(mappedStats);
      } catch (err) {
        console.error("Failed to load audit log:", err);
        toastError(
          "Failed to load audit log",
          "Could not fetch audit events. Check your network connection and try refreshing.",
        );
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [timeRange, selectedSeverities, selectedCategories]);

  // Filtered events (search)
  const filteredEvents = useMemo(() => {
    if (!searchQuery.trim()) return events;
    const q = searchQuery.toLowerCase();
    return events.filter(
      (e) =>
        e.event_type?.toLowerCase().includes(q) ||
        e.action?.toLowerCase().includes(q) ||
        e.actor_email?.toLowerCase().includes(q) ||
        e.resource_id?.toLowerCase().includes(q),
    );
  }, [events, searchQuery]);

  // CSV Export
  const handleExport = async () => {
    setExporting(true);
    try {
      const params = new URLSearchParams();
      params.set("days", timeRange.toString());
      if (selectedSeverities.length > 0) {
        selectedSeverities.forEach((s) => params.append("severity", s));
      }
      if (selectedCategories.length > 0) {
        selectedCategories.forEach((c) => params.append("event_type", c));
      }

      const res = await authFetch(`/api/audit/export?${params}`);
      if (!res.ok) throw new Error("Export failed");

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `wireline-audit-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      toastSuccess("Export complete", "Audit log downloaded successfully.");
    } catch (err) {
      console.error("Export failed:", err);
      toastError("Export failed", "Could not download audit log.");
    } finally {
      setExporting(false);
    }
  };

  const toggleSeverity = useCallback((severity: AuditSeverity) => {
    setSelectedSeverities((prev) =>
      prev.includes(severity) ? prev.filter((s) => s !== severity) : [...prev, severity],
    );
  }, []);

  const toggleCategory = useCallback((category: string) => {
    setSelectedCategories((prev) =>
      prev.includes(category) ? prev.filter((c) => c !== category) : [...prev, category],
    );
  }, []);

  const toggleRow = useCallback((id: number) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  return (
    <div className="h-full flex flex-col min-h-0">
      <HubTabs tabs={SYSTEM_HUB} label="System sub-navigation" />
      <div className="flex-1 min-h-0">
        <PageShell
          title="Audit Log"
          subtitle="System activity monitoring & compliance"
          eyebrow="Security · Activity"
          actions={
            <button
              onClick={handleExport}
              disabled={exporting || events.length === 0}
              aria-label={`Export ${events.length} events as CSV`}
              className="px-4 py-2.5 rounded-full glass border border-white/10 text-[11px] uppercase tracking-[0.3em] text-ink/80 hover:text-brand hover:border-brand/40 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {exporting ? (
                <>
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  >
                    <Download className="w-3.5 h-3.5" />
                  </motion.div>
                  exporting...
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5" />
                  export
                </>
              )}
            </button>
          }
        >
          <div className="h-full flex flex-col gap-4 p-4 overflow-y-auto scrollbar-hide">
            {/* Stats Overview */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                label="Total Events"
                value={stats?.total.toLocaleString() || "—"}
                icon={Activity}
                color="bg-cyan-400"
              />
              <StatCard
                label="API Calls"
                value={stats?.api_calls.toLocaleString() || "—"}
                icon={Cpu}
                color="bg-purple-400"
              />
              <StatCard
                label="Total Cost"
                value={stats ? `$${stats.total_cost.toFixed(2)}` : "—"}
                icon={DollarSign}
                color="bg-emerald-400"
              />
              <StatCard
                label="Critical Events"
                value={stats?.critical_count || 0}
                icon={Shield}
                color="bg-rose-400"
              />
            </div>

            {/* Search and Time Range */}
            <div className="flex flex-col md:flex-row gap-3">
              <div className="flex-1 relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search events..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      // Trigger search (already handled by useMemo)
                    }
                  }}
                  className="w-full pl-11 pr-4 py-3 rounded-xl glass border border-white/10 text-sm text-ink placeholder:text-muted/50 focus:outline-none focus:border-brand/40 transition-all"
                />
              </div>
              <div className="relative">
                <select
                  value={timeRange}
                  onChange={(e) => setTimeRange(Number(e.target.value) as TimeRange)}
                  className="pl-4 pr-10 py-3 rounded-xl glass border border-white/10 text-sm text-ink appearance-none bg-transparent focus:outline-none focus:border-brand/40 transition-all cursor-pointer"
                >
                  <option value={1}>Last 24 hours</option>
                  <option value={7}>Last 7 days</option>
                  <option value={30}>Last 30 days</option>
                  <option value={90}>Last 90 days</option>
                </select>
                <Calendar className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none" />
              </div>
              <button
                onClick={() => setFiltersExpanded(!filtersExpanded)}
                aria-label={filtersExpanded ? "Hide filters" : "Show filters"}
                aria-expanded={filtersExpanded}
                className={cn(
                  "px-4 py-3 rounded-xl glass border transition-all flex items-center gap-2 text-sm",
                  filtersExpanded
                    ? "border-brand/40 text-brand"
                    : "border-white/10 text-ink/80 hover:border-white/20",
                )}
              >
                <Filter className="w-4 h-4" />
                Filters
                <motion.div
                  animate={{ rotate: filtersExpanded ? 180 : 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <ChevronDown className="w-4 h-4" />
                </motion.div>
              </button>
            </div>

            {/* Filters Panel */}
            <AnimatePresence>
              {filtersExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                  className="overflow-hidden"
                >
                  <div className="glass rounded-xl border border-white/10 p-4 space-y-4">
                    <div>
                      <h4 className="text-xs uppercase tracking-[0.3em] text-muted mb-3">
                        Severity
                      </h4>
                      <div className="flex flex-wrap gap-2">
                        {SEVERITY_OPTIONS.map((severity) => (
                          <button
                            key={severity}
                            onClick={() => toggleSeverity(severity)}
                            className={cn(
                              "px-3 py-1.5 rounded-full text-xs uppercase tracking-wider transition-all border",
                              selectedSeverities.includes(severity)
                                ? "border-brand/40 bg-brand/10 text-brand"
                                : "border-white/10 bg-white/5 text-muted hover:text-ink hover:border-white/20",
                            )}
                          >
                            {severity}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <h4 className="text-xs uppercase tracking-[0.3em] text-muted mb-3">
                        Event Type
                      </h4>
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(EVENT_CATEGORIES).map(([key, label]) => (
                          <button
                            key={key}
                            onClick={() => toggleCategory(key)}
                            className={cn(
                              "px-3 py-1.5 rounded-full text-xs uppercase tracking-wider transition-all border",
                              selectedCategories.includes(key)
                                ? "border-brand/40 bg-brand/10 text-brand"
                                : "border-white/10 bg-white/5 text-muted hover:text-ink hover:border-white/20",
                            )}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Events List */}
            <Panel title="Activity Stream" icon={Shield} scroll>
              {loading ? (
                <div className="flex items-center justify-center py-20">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  >
                    <Shield className="w-8 h-8 text-brand" />
                  </motion.div>
                </div>
              ) : filteredEvents.length === 0 ? (
                searchQuery.trim() ? (
                  <EmptyState
                    icon={Shield}
                    title="No matches"
                    description="Try a different search term or widen the time range filter."
                    accent="#0AC8D4"
                  />
                ) : (
                  <EmptyState
                    icon={Shield}
                    title="Audit trail is quiet"
                    description="Every agent action, escalation, and policy check writes here. Deploy an agent to start the feed."
                    accent="#0AC8D4"
                    actions={[{ label: "Deploy an agent", to: "/agents", primary: true }]}
                  />
                )
              ) : (
                <div className="space-y-3">
                  {filteredEvents.map((event) => (
                    <EventRow
                      key={event.id}
                      event={event}
                      expanded={expandedRows.has(event.id)}
                      onToggle={() => toggleRow(event.id)}
                    />
                  ))}
                </div>
              )}
            </Panel>
          </div>
        </PageShell>
      </div>
    </div>
  );
}
