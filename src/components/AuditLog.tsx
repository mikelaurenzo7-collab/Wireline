/* eslint-disable @typescript-eslint/no-explicit-any -- API response shapes vary by endpoint and aren't shared as client types yet. */
import React, { useState, useEffect, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Shield,
  Search,
  Download,
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
  RefreshCw,
  Loader2,
} from "lucide-react";
import PageShell, { Panel } from "./PageShell";
import { EmptyState } from "./ui/EmptyState";
import {
  OPS_CHANNEL_EMPTY,
  OPS_CHANNEL_TOOLBAR,
  OPS_AUDIT_SEVERITY,
} from "../lib/wireline-ops-design";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/shadcn/Select";
import { authFetch } from "../lib/api";
import AdminHubViewport from "./layout/AdminHubViewport";
import ClientRouteLoading from "./layout/ClientRouteLoading";
import ClientToolbar from "./layout/ClientToolbar";
import { useToast } from "../contexts/ToastContext";
import { cn, logFetchError } from "../lib/utils";
import { formatDateTime } from "../lib/safe-date";
import type { AuditEvent, AuditSeverity } from "../types/audit";
import { Input } from "./ui/shadcn/Input";
import { ShadButton } from "./ui/shadcn/ShadButton";

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

function SeverityIcon({ severity, size = "md" }: { severity: AuditSeverity; size?: "md" | "sm" }) {
  const config = {
    info: { Icon: Info, color: "text-brand", bg: "bg-brand/10", label: "Info" },
    warning: { Icon: AlertTriangle, color: "text-brand", bg: "bg-brand/10", label: "Warning" },
    error: {
      Icon: AlertCircle,
      color: "text-destructive",
      bg: "bg-destructive/10",
      label: "Error",
    },
    critical: {
      Icon: XCircle,
      color: "text-destructive",
      bg: "bg-destructive/10",
      label: "Critical",
    },
  };
  const { Icon, color, bg, label } = config[severity];
  const box = size === "sm" ? "w-5 h-5" : "w-8 h-8";
  const icon = size === "sm" ? "w-3 h-3" : "w-4 h-4";
  return (
    <div
      className={cn("rounded-md flex items-center justify-center shrink-0", box, bg)}
      aria-hidden={size === "sm"}
    >
      <Icon className={cn(icon, color)} aria-hidden />
      {size !== "sm" && <span className="sr-only">{label} severity</span>}
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
        className="relative wl-panel border border-border rounded-md overflow-hidden hover:border-brand/25 transition-all cursor-pointer outline-none focus:ring-2 focus:ring-brand/50 touch-press"
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
            <div className="md:col-span-2">
              <p className="text-sm text-foreground font-medium">
                {event.event_type || event.action}
              </p>
              <p className="text-xs text-muted">{event.actor_email || "System"}</p>
            </div>
            <div>
              <p className="text-xs text-muted">Resource</p>
              <p className="text-sm text-foreground">{event.resource_id || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted">Time</p>
              <p className="text-sm text-foreground">{timestamp}</p>
            </div>
            <div className="text-right">
              {event.cost_usd != null && (
                <p className="text-sm text-foreground">${Number(event.cost_usd ?? 0).toFixed(4)}</p>
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
              <div className="px-4 pb-4 pt-2 border-t border-border space-y-3">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                  {event.ip_address && (
                    <div>
                      <p className="text-muted mb-1 flex items-center gap-1.5">
                        <Globe className="w-3 h-3" /> IP Address
                      </p>
                      <p className="text-foreground font-mono">{event.ip_address}</p>
                    </div>
                  )}
                  {event.user_agent && (
                    <div className="md:col-span-2">
                      <p className="text-muted mb-1 flex items-center gap-1.5">
                        <User className="w-3 h-3" /> User Agent
                      </p>
                      <p className="text-foreground truncate">{event.user_agent}</p>
                    </div>
                  )}
                  {event.provider && (
                    <div>
                      <p className="text-muted mb-1 flex items-center gap-1.5">
                        <Cpu className="w-3 h-3" /> Provider
                      </p>
                      <p className="text-foreground">
                        {event.provider} / {event.model || "—"}
                      </p>
                    </div>
                  )}
                  {(event.input_tokens != null || event.output_tokens != null) && (
                    <div>
                      <p className="text-muted mb-1 flex items-center gap-1.5">
                        <Activity className="w-3 h-3" /> Tokens
                      </p>
                      <p className="text-foreground font-mono">
                        {event.input_tokens || 0} in / {event.output_tokens || 0} out
                      </p>
                    </div>
                  )}
                  {event.latency_ms != null && (
                    <div>
                      <p className="text-muted mb-1 flex items-center gap-1.5">
                        <Clock className="w-3 h-3" /> Latency
                      </p>
                      <p className="text-foreground font-mono">{event.latency_ms}ms</p>
                    </div>
                  )}
                </div>
                {event.metadata && Object.keys(event.metadata).length > 0 && (
                  <div>
                    <p className="text-muted text-xs mb-2">Metadata</p>
                    <pre className="text-xs text-foreground/80 bg-black/20 rounded-md p-3 overflow-x-auto max-h-48 overflow-y-auto scrollbar-hide">
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
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [timeRange, setTimeRange] = useState<TimeRange>(7);
  const [selectedSeverities, setSelectedSeverities] = useState<AuditSeverity[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [filtersExpanded, setFiltersExpanded] = useState(false);

  // Expandable rows
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

  const fetchAudit = useCallback(async () => {
    setLoading(true);
    setLoadErr(null);
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

      const mappedStats: AuditStats = {
        total: statsData.total_events || 0,
        api_calls: statsData.total_api_calls || 0,
        total_cost: statsData.total_cost_usd || 0,
        critical_count: statsData.by_severity?.critical || 0,
      };

      setEvents(eventsData.events ?? []);
      setStats(mappedStats);
    } catch (err) {
      logFetchError("Failed to load audit log:", err);
      setLoadErr("Could not fetch audit events. Check your network connection and retry.");
      toastError(
        "Failed to load audit log",
        "Could not fetch audit events. Check your network connection and try refreshing.",
      );
    } finally {
      setLoading(false);
    }
  }, [timeRange, selectedSeverities, selectedCategories, toastError]);

  useEffect(() => {
    fetchAudit();
  }, [fetchAudit]);

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
      logFetchError("Export failed:", err);
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
    <AdminHubViewport scroll>
      <PageShell title="" eyebrow="" subtitle="" scrollable>
        <div className="flex flex-col flex-1 min-h-0 gap-3 h-full">
          <ClientToolbar
            left={
              <span className="app-toolbar-stat">
                {loading
                  ? OPS_CHANNEL_TOOLBAR.audit.loading
                  : OPS_CHANNEL_TOOLBAR.audit.stat(filteredEvents.length)}
              </span>
            }
            actions={
              <div className="flex items-center gap-2 flex-wrap justify-end">
                <Select
                  value={String(timeRange)}
                  onValueChange={(v) => setTimeRange(Number(v) as TimeRange)}
                >
                  <SelectTrigger
                    aria-label="Time range"
                    className="h-9 w-[140px] rounded-full wl-panel border border-border text-[var(--wireline-typography-overline-size)] text-muted bg-transparent"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Last 24 hours</SelectItem>
                    <SelectItem value="7">Last 7 days</SelectItem>
                    <SelectItem value="30">Last 30 days</SelectItem>
                    <SelectItem value="90">Last 90 days</SelectItem>
                  </SelectContent>
                </Select>
                <ShadButton
                  type="button"
                  variant="outline"
                  size="sm"
                  disableAnimations
                  onClick={() => setFiltersExpanded(!filtersExpanded)}
                  aria-label={filtersExpanded ? "Hide filters" : "Show filters"}
                  aria-expanded={filtersExpanded}
                  className={cn(
                    "h-9 rounded-full wl-ops-chip touch-press",
                    filtersExpanded && "border-brand/40 text-brand",
                  )}
                >
                  <Filter className="w-3 h-3" />
                  Filters
                </ShadButton>
                <ShadButton
                  type="button"
                  variant="outline"
                  size="sm"
                  disableAnimations
                  onClick={fetchAudit}
                  disabled={loading}
                  className="h-9 rounded-full wl-ops-chip text-muted touch-press"
                >
                  {loading ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <RefreshCw className="w-3 h-3" />
                  )}
                  {OPS_CHANNEL_TOOLBAR.audit.refresh}
                </ShadButton>
                <ShadButton
                  type="button"
                  variant="destructive"
                  size="sm"
                  disableAnimations
                  onClick={handleExport}
                  disabled={exporting || events.length === 0}
                  aria-label={`Export ${events.length} events as CSV`}
                  className="h-9 rounded-full bg-brand/15 border-brand/40 text-brand wl-ops-chip hover:bg-brand/25 shadow-none touch-press"
                >
                  {exporting ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Download className="w-3 h-3" />
                  )}
                  {OPS_CHANNEL_TOOLBAR.audit.export}
                </ShadButton>
              </div>
            }
          />

          {/* Stat bar — DNC compliance pattern */}
          <div className="shrink-0 grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              {
                label: "Total Events",
                value: stats?.total.toLocaleString() || "—",
                icon: Activity,
              },
              { label: "API Calls", value: stats?.api_calls.toLocaleString() || "—", icon: Cpu },
              {
                label: "Total Cost",
                value: stats ? `$${stats.total_cost.toFixed(2)}` : "—",
                icon: DollarSign,
              },
              { label: "Critical", value: stats?.critical_count ?? "—", icon: Shield },
            ].map(({ label, value, icon: Icon }) => (
              <div
                key={label}
                className="relative rounded-md wl-panel border border-border p-4 overflow-hidden"
              >
                <div className="flex items-center justify-between mb-2">
                  <p className="wl-label-muted">{label}</p>
                  <Icon className="w-3.5 h-3.5 text-brand" />
                </div>
                <p className="font-display italic text-3xl text-foreground leading-none tabular-nums">
                  {value}
                </p>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-2" role="group" aria-label="Severity legend">
            {SEVERITY_OPTIONS.map((severity) => {
              const meta = OPS_AUDIT_SEVERITY[severity];
              const active = selectedSeverities.includes(severity);
              return (
                <ShadButton
                  key={severity}
                  type="button"
                  variant={active ? "default" : "outline"}
                  size="sm"
                  disableAnimations
                  onClick={() => toggleSeverity(severity)}
                  aria-pressed={active}
                  title={meta.hint}
                  className="wl-filter-chip rounded-full h-auto px-3 py-1.5 inline-flex items-center gap-1.5"
                >
                  <SeverityIcon severity={severity} size="sm" />
                  {meta.label}
                </ShadButton>
              );
            })}
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
                <div className="wl-panel rounded-md border border-border p-4 space-y-4">
                  <div>
                    <h4 className="wl-label-muted mb-3">Event type</h4>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(EVENT_CATEGORIES).map(([key, label]) => (
                        <ShadButton
                          key={key}
                          type="button"
                          variant={selectedCategories.includes(key) ? "default" : "outline"}
                          size="sm"
                          disableAnimations
                          onClick={() => toggleCategory(key)}
                          className="wl-filter-chip rounded-full h-auto px-3 py-1.5"
                        >
                          {label}
                        </ShadButton>
                      ))}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Events List */}
          <div className="flex-1 min-h-0">
            <Panel
              title="Activity Stream"
              hint={`${filteredEvents.length} events`}
              icon={Shield}
              scroll
              className="h-full"
              actions={
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
                  <Input
                    type="search"
                    aria-label="Search audit events"
                    placeholder="Search events…"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="h-8 w-44 pl-8 pr-3 rounded-full wl-panel border border-border text-[var(--wireline-typography-overline-size)] text-foreground placeholder:text-foreground/55 focus:border-brand/40 focus:outline-none"
                  />
                </div>
              }
            >
              {loading ? (
                <ClientRouteLoading
                  icon={<Shield className="w-7 h-7" />}
                  label={OPS_CHANNEL_TOOLBAR.audit.loading}
                  className="min-h-[280px]"
                />
                ) : loadErr ? (
                  <EmptyState
                    icon={Shield}
                    title="Couldn't load audit events"
                    description={loadErr}
                  actions={[{ label: "Retry", onClick: fetchAudit, primary: true }]}
                  density="compact"
                  withHalo={false}
                  className="py-10"
                />
              ) : filteredEvents.length === 0 ? (
                searchQuery.trim() ? (
                  <EmptyState
                    icon={Shield}
                    title={OPS_CHANNEL_EMPTY.auditNoMatch.title}
                    density="compact"
                    withHalo={false}
                    actions={[
                      { label: "Clear search", onClick: () => setSearchQuery(""), primary: true },
                    ]}
                  />
                ) : (
                  <EmptyState
                    icon={Shield}
                    title={OPS_CHANNEL_EMPTY.audit.title}
                    actions={[...OPS_CHANNEL_EMPTY.audit.actions]}
                    density="compact"
                    withHalo={false}
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
        </div>
      </PageShell>
    </AdminHubViewport>
  );
}
