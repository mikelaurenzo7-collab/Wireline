import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import {
  Inbox, Flame, ShieldAlert, BookOpen, ListTodo, AlertOctagon,
  ChevronRight, Phone, Mail, Sparkles, Loader2, Check, Plus,
  RefreshCw, ArrowRight, Pencil, X, Bot
} from "lucide-react";
import { authFetch } from "../lib/api";
import { cn } from "../lib/utils";
import { ClaudeRecipeButton } from "./ClaudeRecipes";
import CsvExportButton from "./CsvExportButton";

interface TriageData {
  hot_leads: any[];
  compliance: any[];
  pending_tasks: any[];
  knowledge_gaps: any[];
  escalations: any[];
  counts: Record<string, number>;
}

type Tab = "hot" | "compliance" | "knowledge" | "tasks" | "escalations";

const TABS: { id: Tab; label: string; icon: any; accent: string; field: keyof TriageData["counts"] }[] = [
  { id: "hot",          label: "Hot Leads",      icon: Flame,        accent: "#FF6BD9", field: "hot_leads" },
  { id: "compliance",   label: "Compliance",     icon: ShieldAlert,  accent: "#FFC07D", field: "compliance" },
  { id: "knowledge",    label: "Knowledge Gaps", icon: BookOpen,     accent: "#7DF9FF", field: "knowledge_gaps" },
  { id: "tasks",        label: "Open Tasks",     icon: ListTodo,     accent: "#C58BFF", field: "pending_tasks" },
  { id: "escalations",  label: "Escalations",    icon: AlertOctagon, accent: "#FF6BD9", field: "escalations" },
];

export default function TriageInbox() {
  const [data, setData] = useState<TriageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("hot");

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

  return (
    <div className="min-h-full w-full max-w-[1700px] mx-auto space-y-10 pb-32">
      <motion.header
        initial={{ y: -16, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="flex flex-col lg:flex-row lg:justify-between lg:items-end gap-8"
      >
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="px-3 py-1.5 rounded-full glass border border-white/8 flex items-center gap-2">
              <Inbox className="w-3.5 h-3.5 text-brand" />
              <span className="text-[10px] uppercase tracking-[0.3em] text-ink/80">Triage</span>
            </div>
            <div className="px-3 py-1.5 rounded-full bg-rose-500/10 border border-rose-500/30 flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full rounded-full bg-rose-500 opacity-75 animate-ping" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500" />
              </span>
              <span className="text-[10px] uppercase tracking-[0.3em] text-rose-500">{totalAttention} items</span>
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-[10px] uppercase tracking-[0.6em] text-muted">Today's Inbox</p>
            <h1 className="font-display italic text-6xl md:text-7xl lg:text-[7rem] leading-[0.9] tracking-tight">
              <span className="text-aurora">Needs</span>{" "}
              <span className="text-ink/90">Attention</span>
            </h1>
            <p className="text-ink/55 max-w-2xl text-sm md:text-base leading-relaxed">
              Hot leads, compliance flags, knowledge gaps, open tasks, and escalations — surfaced in one place so nothing slips.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <CsvExportButton type="tasks" label="Export Tasks" />
          <button
            onClick={fetchData}
            disabled={loading}
            className="px-4 py-2.5 rounded-full glass border border-white/10 text-[11px] uppercase tracking-[0.3em] text-muted hover:text-brand hover:border-brand/40 transition-all flex items-center gap-2 disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Refresh
          </button>
        </div>
      </motion.header>

      {/* Tab strip */}
      <div className="flex flex-wrap gap-2.5">
        {TABS.map((t) => {
          const isActive = tab === t.id;
          const count = counts[t.field] || 0;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "relative px-5 py-3 rounded-full transition-all flex items-center gap-2.5 overflow-hidden",
                isActive ? "border-transparent text-paper" : "glass border border-white/10 text-ink/70 hover:text-ink hover:border-white/30",
              )}
            >
              {isActive && (
                <motion.div
                  layoutId="triage-tab"
                  className="absolute inset-0 rounded-full"
                  style={{
                    background: `linear-gradient(135deg, ${t.accent}, ${t.accent}cc)`,
                    boxShadow: `0 8px 24px -8px ${t.accent}88, 0 0 0 1px rgba(255,255,255,0.2) inset`,
                  }}
                  transition={{ type: "spring", stiffness: 380, damping: 32 }}
                />
              )}
              <t.icon className="w-4 h-4 relative z-10" />
              <span className="text-[11px] uppercase tracking-[0.25em] relative z-10 font-medium">{t.label}</span>
              {count > 0 && (
                <span className={cn(
                  "relative z-10 px-2 py-0.5 rounded-full text-[10px] font-bold",
                  isActive ? "bg-paper/20 text-paper" : "bg-white/10 text-ink/80",
                )}>{count}</span>
              )}
            </button>
          );
        })}
      </div>

      {loading && !data ? (
        <div className="py-32 flex flex-col items-center gap-4">
          <Loader2 className="w-10 h-10 animate-spin text-brand" />
          <p className="text-[10px] uppercase tracking-[0.5em] text-muted">Scanning the fleet</p>
        </div>
      ) : (
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.4 }}
            className="space-y-3"
          >
            {tab === "hot"          && <HotLeads        items={data?.hot_leads || []} />}
            {tab === "compliance"   && <ComplianceList  items={data?.compliance || []} />}
            {tab === "knowledge"    && <KnowledgeGaps   items={data?.knowledge_gaps || []} onRefresh={fetchData} />}
            {tab === "tasks"        && <OpenTasks       items={data?.pending_tasks || []} />}
            {tab === "escalations"  && <Escalations     items={data?.escalations || []} />}
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  );
}

/* ─────────────────────────  Hot leads  ─────────────────────────── */

function HotLeads({ items }: { items: any[] }) {
  if (items.length === 0) return <Empty icon={Flame} label="No hot leads right now — keep dialing." />;
  return (
    <>
      {items.map((c) => (
        <motion.div
          key={c.id}
          initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
          className="relative aurora-ring rounded-2xl"
        >
          <div className="relative rounded-2xl glass border border-white/10 p-5 flex flex-col md:flex-row md:items-center gap-4 overflow-hidden">
            <div className="absolute -top-12 -right-12 w-40 h-40 rounded-full opacity-20 blur-3xl pointer-events-none" style={{ background: "radial-gradient(circle, #FF6BD9, transparent)" }} />
            <div className="relative z-10 flex items-center gap-4 min-w-0 flex-1">
              <div className="shrink-0 w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: "linear-gradient(135deg, #FF6BD9, #C58BFF)" }}>
                <span className="font-display italic text-2xl text-paper">{c.lead_score}</span>
              </div>
              <div className="min-w-0 flex-1">
                <Link
                  to={`/contact/${encodeURIComponent(c.customer_number || "unknown")}`}
                  className="font-display italic text-2xl text-ink leading-tight hover:text-brand transition-colors block truncate"
                >
                  {c.customer_number || "Unknown caller"}
                </Link>
                <p className="text-sm text-ink/65 mt-1 line-clamp-2">{c.summary}</p>
                <div className="flex items-center gap-3 mt-2 text-[10px] uppercase tracking-[0.3em] text-muted">
                  <span>{new Date(c.created_at).toLocaleDateString()}</span>
                  <span>·</span>
                  <span>{c.intent_label} intent</span>
                </div>
              </div>
            </div>
            <div className="relative z-10 flex items-center gap-2 shrink-0 flex-wrap">
              <ClaudeRecipeButton
                recipe="enrich-lead"
                initial={{
                  customerNumber: c.customer_number,
                  context: `High-intent (${c.lead_score}) lead from prior call. Summary: ${c.summary}`,
                }}
                label="Enrich"
              />
              <ClaudeRecipeButton
                recipe="brief"
                agentId={c.agent_id}
                initial={{
                  customerNumber: c.customer_number,
                  reasonForCall: `Follow-up on a high-intent (${c.lead_score}) inbound call. Last summary: ${c.summary}`,
                }}
                label="Brief Follow-up"
              />
              <Link
                to={`/contact/${encodeURIComponent(c.customer_number || "unknown")}`}
                className="w-10 h-10 rounded-full glass border border-white/10 flex items-center justify-center text-ink/70 hover:text-brand hover:border-brand/40 transition-all"
              >
                <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </motion.div>
      ))}
    </>
  );
}

/* ───────────────────────  Compliance flags  ────────────────────── */

function ComplianceList({ items }: { items: any[] }) {
  if (items.length === 0) return <Empty icon={ShieldAlert} label="All clear — no compliance flags." green />;
  return (
    <>
      {items.map((t) => (
        <motion.div key={t.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
          className="rounded-2xl bg-rose-500/5 border border-rose-500/30 p-5 flex flex-col md:flex-row md:items-center gap-3"
        >
          <ShieldAlert className="w-5 h-5 text-rose-500 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-[10px] uppercase tracking-[0.3em] text-rose-500 mb-1">Compliance · {t.priority}</div>
            <p className="text-sm text-ink/90 leading-relaxed">{t.description}</p>
            <div className="text-[10px] uppercase tracking-[0.3em] text-muted mt-2">{new Date(t.created_at).toLocaleString()}</div>
          </div>
        </motion.div>
      ))}
    </>
  );
}

/* ───────────────────────  Knowledge gaps  ──────────────────────── */

function KnowledgeGaps({ items, onRefresh }: { items: any[]; onRefresh: () => void }) {
  if (items.length === 0) return <Empty icon={BookOpen} label="No captured knowledge gaps. Your agents are answering everything." green />;
  return (
    <>
      {items.map((g) => <KnowledgeGapRow key={g.id} gap={g} onPromoted={onRefresh} />)}
    </>
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
    <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
      className="rounded-2xl glass border border-white/10 p-5 space-y-3"
    >
      <div className="flex items-start gap-3">
        <BookOpen className="w-5 h-5 text-brand shrink-0 mt-1" />
        <div className="flex-1 min-w-0">
          <div className="text-[10px] uppercase tracking-[0.3em] text-brand mb-1">Captured gap</div>
          {editing ? (
            <textarea
              value={content} onChange={(e) => setContent(e.target.value)} rows={3}
              className="w-full px-3 py-2 rounded-lg bg-black/30 border border-brand/30 outline-none text-ink text-sm focus:border-brand/60 transition-all resize-none"
            />
          ) : (
            <p className="text-sm text-ink/90 leading-relaxed">{cleaned}</p>
          )}
          <div className="text-[10px] uppercase tracking-[0.3em] text-muted mt-2">
            Agent · <span className="font-mono">{gap.agent_id}</span> · {new Date(gap.created_at).toLocaleDateString()}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 justify-end">
        <button
          onClick={() => { setEditing(!editing); setContent(cleaned); }}
          className="px-3 py-2 rounded-full text-[10px] uppercase tracking-[0.3em] text-muted hover:text-ink transition-colors flex items-center gap-1.5"
        >
          {editing ? <X className="w-3 h-3" /> : <Pencil className="w-3 h-3" />}
          {editing ? "Cancel" : "Edit"}
        </button>
        <button
          onClick={promote} disabled={busy}
          className="brutal-btn !py-2.5 !px-5 !text-[10px] !tracking-[0.3em]"
        >
          {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
          Promote to Knowledge
        </button>
      </div>
    </motion.div>
  );
}

/* ────────────────────────  Open tasks  ─────────────────────────── */

function OpenTasks({ items }: { items: any[] }) {
  if (items.length === 0) return <Empty icon={ListTodo} label="Inbox zero. You're caught up." green />;
  return (
    <>
      {items.map((t) => (
        <motion.div key={t.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
          className="rounded-2xl glass border border-white/10 p-5 flex items-start gap-3"
        >
          <span className={cn(
            "shrink-0 px-2 py-0.5 rounded-full text-[9px] uppercase tracking-[0.3em] mt-0.5",
            t.priority === "high"   && "bg-rose-500/15 text-rose-500 border border-rose-500/30",
            t.priority === "medium" && "bg-brand/15 text-brand border border-brand/30",
            t.priority === "low"    && "bg-zinc-500/15 text-zinc-300 border border-zinc-500/30",
          )}>{t.priority}</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-ink/90 leading-relaxed">{t.description}</p>
            <div className="text-[10px] uppercase tracking-[0.3em] text-muted mt-2 flex items-center gap-3">
              <span>{t.target_channel || "manual"}</span>
              <span>·</span>
              <span>{new Date(t.created_at).toLocaleString()}</span>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-muted shrink-0" />
        </motion.div>
      ))}
    </>
  );
}

/* ───────────────────────  Escalations  ─────────────────────────── */

function Escalations({ items }: { items: any[] }) {
  if (items.length === 0) return <Empty icon={AlertOctagon} label="No escalations on file." green />;
  return (
    <>
      {items.map((c) => (
        <motion.div key={c.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
          className="rounded-2xl bg-rose-500/5 border border-rose-500/30 p-5 flex flex-col md:flex-row md:items-center gap-3"
        >
          <AlertOctagon className="w-5 h-5 text-rose-500 shrink-0" />
          <div className="flex-1 min-w-0">
            <Link
              to={`/contact/${encodeURIComponent(c.customer_number || "unknown")}`}
              className="font-display italic text-xl text-ink hover:text-brand transition-colors block truncate"
            >
              {c.customer_number || "Unknown caller"}
            </Link>
            <p className="text-sm text-ink/70 line-clamp-2">{c.summary}</p>
            <div className="text-[10px] uppercase tracking-[0.3em] text-muted mt-1">
              {new Date(c.created_at).toLocaleString()}
            </div>
          </div>
          <ClaudeRecipeButton recipe="coach" callId={c.id} label="Coach Review" variant="compact" />
        </motion.div>
      ))}
    </>
  );
}

function Empty({ icon: Icon, label, green }: { icon: any; label: string; green?: boolean }) {
  return (
    <div className="rounded-3xl glass border border-white/10 p-16 text-center flex flex-col items-center gap-4">
      <Icon className={cn("w-12 h-12", green ? "text-emerald-500/60" : "text-muted/50")} />
      <p className={cn("text-[11px] uppercase tracking-[0.4em]", green ? "text-emerald-500/80" : "text-muted")}>{label}</p>
    </div>
  );
}
