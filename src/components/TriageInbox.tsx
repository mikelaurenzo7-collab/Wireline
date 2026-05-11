import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  Flame, ShieldAlert, BookOpen, ListTodo, AlertOctagon,
  ChevronRight, Loader2, Plus, RefreshCw, Pencil, X, Inbox,
} from "lucide-react";
import { authFetch } from "../lib/api";
import { cn } from "../lib/utils";
import { formatDate, formatDateTime } from "../lib/safe-date";
import { ClaudeRecipeButton } from "./ClaudeRecipes";
import CsvExportButton from "./CsvExportButton";
import PageShell, { Panel } from "./PageShell";
import EmptyState from "./EmptyState";
import WidgetBoundary from "./WidgetBoundary";

interface TriageData {
  hot_leads: any[];
  compliance: any[];
  pending_tasks: any[];
  knowledge_gaps: any[];
  escalations: any[];
  counts: Record<string, number>;
}

export default function TriageInbox() {
  const [data, setData] = useState<TriageData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      const r = await authFetch("/api/triage");
      const d = await r.json();
      setData(d);
    } finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, []);

  const counts = data?.counts || {} as any;
  const totalAttention = Object.values(counts).reduce((s: number, n: any) => s + (n as number), 0);

  const wrap = (icon: any, hint: string, body: React.ReactNode) => (
    <Panel icon={icon} hint={hint} title="" scroll flush>
      {loading && !data ? (
        <div className="h-full flex flex-col items-center justify-center gap-2">
          <Loader2 className="w-6 h-6 animate-spin text-brand" />
          <p className="text-[9px] uppercase tracking-[0.4em] text-muted">Scanning the fleet</p>
        </div>
      ) : totalAttention === 0 ? (
        <EmptyState
          icon={Inbox}
          title="All clear"
          description="No items need attention right now. Triage surfaces follow-ups, hot leads, and escalations from your agent activity."
          accent="#10B981"
          actions={[
            { label: "View Call Logs", to: "/logs" },
            { label: "View Dashboard", to: "/" },
          ]}
          className="h-full py-10"
        />
      ) : body}
    </Panel>
  );

  return (
    <PageShell
      eyebrow={`Today's Inbox · ${totalAttention} items`}
      title="Triage"
      subtitle="Hot leads, compliance flags, knowledge gaps, open tasks, and escalations."
      actions={
        <>
          <CsvExportButton type="tasks" label="CSV" />
          <button
            onClick={fetchData}
            disabled={loading}
            className="h-9 px-3 rounded-full glass border border-white/10 text-[10px] uppercase tracking-[0.28em] text-muted hover:text-brand hover:border-brand/40 transition-all flex items-center gap-1.5 disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
            Refresh
          </button>
        </>
      }
      tabs={[
        { id: "hot",         label: "Hot Leads",     icon: Flame,        badge: counts.hot_leads,       content: wrap(Flame, "Hot intent", <WidgetBoundary label="Hot Leads"><HotLeads items={data?.hot_leads || []} /></WidgetBoundary>) },
        { id: "compliance",  label: "Compliance",    icon: ShieldAlert,  badge: counts.compliance,      content: wrap(ShieldAlert, "Flags",  <WidgetBoundary label="Compliance"><ComplianceList items={data?.compliance || []} /></WidgetBoundary>) },
        { id: "knowledge",   label: "Gaps",          icon: BookOpen,     badge: counts.knowledge_gaps,  content: wrap(BookOpen, "Capture",   <WidgetBoundary label="Knowledge Gaps"><KnowledgeGaps items={data?.knowledge_gaps || []} onRefresh={fetchData} /></WidgetBoundary>) },
        { id: "tasks",       label: "Tasks",         icon: ListTodo,     badge: counts.pending_tasks,   content: wrap(ListTodo, "Open",      <WidgetBoundary label="Open Tasks"><OpenTasks items={data?.pending_tasks || []} /></WidgetBoundary>) },
        { id: "escalations", label: "Escalations",   icon: AlertOctagon, badge: counts.escalations,     content: wrap(AlertOctagon, "Critical", <WidgetBoundary label="Escalations"><Escalations items={data?.escalations || []} /></WidgetBoundary>) },
      ]}
    />
  );
}


/* ─────────────────────────  Hot leads  ─────────────────────────── */

function HotLeads({ items }: { items: any[] }) {
  if (items.length === 0) return <Empty icon={Flame} label="No hot leads right now — keep dialing." />;
  return (
    <ul className="divide-y divide-white/5">
      {items.map((c) => (
        <li key={c.id} className="group px-4 py-3.5 flex items-center gap-3 hover:bg-white/3 transition-all">
          {/* Score badge */}
          <div
            className="shrink-0 w-11 h-11 rounded-xl flex flex-col items-center justify-center"
            style={{
              background: "linear-gradient(135deg, rgba(255,107,217,0.25), rgba(197,139,255,0.20))",
              border: "1px solid rgba(255,107,217,0.30)",
              boxShadow: "0 0 16px rgba(255,107,217,0.20)"
            }}
          >
            <span className="font-display italic text-lg text-ink leading-none">{c.lead_score}</span>
            <span className="text-[7px] uppercase tracking-[0.3em] text-brand-3/70 mt-0.5">score</span>
          </div>

          <div className="min-w-0 flex-1">
            <Link
              to={`/contact/${encodeURIComponent(c.customer_number || "unknown")}`}
              className="font-display italic text-base text-ink leading-tight hover:text-brand transition-colors block truncate"
            >
              {c.customer_number || "Unknown caller"}
            </Link>
            <p className="text-[11px] text-muted/70 truncate">{c.summary}</p>
            <div className="flex items-center gap-2 mt-1 text-[8px] uppercase tracking-[0.26em] text-muted/50">
              <span>{formatDate(c.created_at)}</span>
              <span className="w-1 h-1 rounded-full bg-white/15" />
              <span
                className="text-brand/80"
                style={{ textShadow: "0 0 10px rgba(10,200,212,0.5)" }}
              >
                {c.intent_label} intent
              </span>
              {c.sentiment && (
                <span className="px-1 py-px rounded bg-white/10 text-[7px] tracking-normal">{c.sentiment}</span>
              )}
            </div>
            {c.coaching_note && (
              <p className="text-[10px] text-muted/60 mt-0.5 line-clamp-1 pr-2">{c.coaching_note}</p>
            )}
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <ClaudeRecipeButton
              recipe="enrich-lead"
              initial={{
                customerNumber: c.customer_number,
                context: `High-intent (${c.lead_score}) lead from prior call. Summary: ${c.summary}`,
              }}
              label="Enrich"
            />
            <Link
              to={`/contact/${encodeURIComponent(c.customer_number || "unknown")}`}
              aria-label={`View contact profile for ${c.customer_number || "unknown caller"}`}
              className="w-8 h-8 rounded-xl glass border border-white/8 flex items-center justify-center text-ink/50 hover:text-brand hover:border-brand/40 transition-all group-hover:border-white/15"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </li>
      ))}
    </ul>
  );
}

/* ───────────────────────  Compliance flags  ────────────────────── */

function ComplianceList({ items }: { items: any[] }) {
  if (items.length === 0) return <Empty icon={ShieldAlert} label="All clear — no compliance flags." green />;
  return (
    <ul className="divide-y divide-white/5">
      {items.map((t) => (
        <li key={t.id} className="px-4 py-3 flex items-start gap-3 bg-rose-500/3">
          <ShieldAlert className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="text-[8px] uppercase tracking-[0.28em] text-rose-500 mb-0.5">Compliance · {t.priority}</div>
            <p className="text-[12px] text-ink/90 leading-snug">{t.description}</p>
            <div className="text-[8px] uppercase tracking-[0.28em] text-muted mt-1">{formatDateTime(t.created_at)}</div>
          </div>
        </li>
      ))}
    </ul>
  );
}

/* ───────────────────────  Knowledge gaps  ──────────────────────── */

function KnowledgeGaps({ items, onRefresh }: { items: any[]; onRefresh: () => void }) {
  if (items.length === 0) return <Empty icon={BookOpen} label="No captured knowledge gaps. Your agents are answering everything." green />;
  return (
    <ul className="divide-y divide-white/5">
      {items.map((g) => <KnowledgeGapRow key={g.id} gap={g} onPromoted={onRefresh} />)}
    </ul>
  );
}

const KnowledgeGapRow: React.FC<{ gap: any; onPromoted: () => void }> = ({ gap, onPromoted }) => {
  const cleaned = gap.lesson.replace(/^\[KNOWLEDGE GAP\]\s*/, "");
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState(cleaned);
  const [busy, setBusy] = useState(false);

  const promote = async () => {
    setBusy(true);
    try {
      const r = await authFetch(`/api/knowledge-gaps/${gap.id}/promote`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customContent: editing ? content : undefined }),
      });
      if (r.ok) onPromoted();
    } finally { setBusy(false); }
  };

  return (
    <li className="px-4 py-3">
      <div className="flex items-start gap-3">
        <BookOpen className="w-4 h-4 text-brand shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="text-[8px] uppercase tracking-[0.28em] text-brand mb-0.5">Captured gap</div>
          {editing ? (
            <textarea
              value={content} onChange={(e) => setContent(e.target.value)} rows={2}
              className="w-full px-2 py-1.5 rounded-lg bg-black/5 border border-brand/20 outline-none text-ink text-[12px] focus:border-brand/50 transition-all resize-none"
            />
          ) : (
            <p className="text-[12px] text-ink/90 leading-snug">{cleaned}</p>
          )}
          <div className="text-[8px] uppercase tracking-[0.28em] text-muted mt-1">
            Agent · <span className="font-mono">{gap.agent_id}</span> · {formatDate(gap.created_at)}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => { setEditing(!editing); setContent(cleaned); }}
            className="w-7 h-7 rounded-full text-muted hover:text-ink transition-colors flex items-center justify-center"
            title={editing ? "Cancel" : "Edit"}
          >
            {editing ? <X className="w-3 h-3" /> : <Pencil className="w-3 h-3" />}
          </button>
          <button
            onClick={promote} disabled={busy}
            className="brutal-btn !py-1.5 !px-3 !text-[9px] !tracking-[0.28em]"
          >
            {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
            Promote
          </button>
        </div>
      </div>
    </li>
  );
};

/* ────────────────────────  Open tasks  ─────────────────────────── */

function OpenTasks({ items }: { items: any[] }) {
  if (items.length === 0) return <Empty icon={ListTodo} label="Inbox zero. You're caught up." green />;
  return (
    <ul className="divide-y divide-white/5">
      {items.map((t) => (
        <li key={t.id} className="px-4 py-3 flex items-start gap-3">
          <span className={cn(
            "shrink-0 px-1.5 py-0.5 rounded-full text-[8px] uppercase tracking-[0.28em] mt-0.5 border",
            t.priority === "high"   && "bg-rose-500/15 text-rose-500 border-rose-500/30",
            t.priority === "medium" && "bg-brand/15 text-brand border-brand/30",
            t.priority === "low"    && "bg-zinc-500/15 text-zinc-300 border-zinc-500/30",
          )}>{t.priority}</span>
          <div className="flex-1 min-w-0">
            <p className="text-[12px] text-ink/90 leading-snug">{t.description}</p>
            <div className="text-[8px] uppercase tracking-[0.28em] text-muted mt-1 flex items-center gap-2">
              <span>{t.target_channel || "manual"}</span>
              <span>·</span>
              <span>{formatDateTime(t.created_at)}</span>
            </div>
          </div>
          <ChevronRight className="w-3.5 h-3.5 text-muted shrink-0" />
        </li>
      ))}
    </ul>
  );
}

/* ───────────────────────  Escalations  ─────────────────────────── */

function Escalations({ items }: { items: any[] }) {
  if (items.length === 0) return <Empty icon={AlertOctagon} label="No escalations on file." green />;
  return (
    <ul className="divide-y divide-white/5">
      {items.map((c) => (
        <li key={c.id} className="px-4 py-3 flex items-start gap-3 bg-rose-500/3">
          <AlertOctagon className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <Link
              to={`/contact/${encodeURIComponent(c.customer_number || "unknown")}`}
              className="font-display italic text-base text-ink hover:text-brand transition-colors block truncate"
            >
              {c.customer_number || "Unknown caller"}
            </Link>
            <p className="text-[11px] text-ink/70 truncate">{c.summary}</p>
            <div className="text-[8px] uppercase tracking-[0.28em] text-muted mt-0.5">
              {formatDateTime(c.created_at)}
            </div>
            {c.coaching_note && (
              <p className="text-[10px] text-rose-400/80 mt-0.5 line-clamp-1 pr-2">{c.coaching_note}</p>
            )}
          </div>
          <ClaudeRecipeButton recipe="coach" callId={c.id} label="Coach" variant="compact" />
        </li>
      ))}
    </ul>
  );
}

function Empty({ icon: Icon, label, green }: { icon: any; label: string; green?: boolean }) {
  return (
    <div className="h-full flex flex-col items-center justify-center gap-3 px-6 text-center">
      <Icon className={cn("w-10 h-10", green ? "text-emerald-500/60" : "text-muted/50")} />
      <p className={cn("text-[10px] uppercase tracking-[0.4em]", green ? "text-emerald-500/80" : "text-muted")}>{label}</p>
    </div>
  );
}
