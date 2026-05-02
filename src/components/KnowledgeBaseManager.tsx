import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  BookOpen, Search, Loader2, Filter, Save, Trash2, X, Check, Pencil,
  Database, Users, AlertOctagon, RefreshCw, FileText, Sparkles,
} from "lucide-react";
import { authFetch } from "../lib/api";
import { cn } from "../lib/utils";

interface KnowledgeRow {
  id: number;
  agent_id: string;
  agent_name: string;
  agent_archetype: string | null;
  content: string;
  created_at: string;
}

interface AgentRef {
  id: string;
  name: string;
  archetype: string | null;
}

export default function KnowledgeBaseManager() {
  const [rows, setRows] = useState<KnowledgeRow[]>([]);
  const [agents, setAgents] = useState<AgentRef[]>([]);
  const [loading, setLoading] = useState(true);
  const [agentFilter, setAgentFilter] = useState<string>("");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<{ id: number; draft: string } | null>(null);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await authFetch("/api/knowledge");
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Failed to load");
      setRows(d.knowledge || []);
      setAgents(d.agents || []);
    } catch (e: any) {
      setError(e?.message || "Load failed");
    } finally { setLoading(false); }
  };

  useEffect(() => { refresh(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(r => {
      if (agentFilter && r.agent_id !== agentFilter) return false;
      if (q && !r.content.toLowerCase().includes(q) && !r.agent_name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, search, agentFilter]);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    rows.forEach(r => m.set(r.agent_id, (m.get(r.agent_id) || 0) + 1));
    return m;
  }, [rows]);

  const allFilteredSelected = filtered.length > 0 && filtered.every(r => selected.has(r.id));

  const toggleSelect = (id: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleSelectAll = () => {
    if (allFilteredSelected) {
      setSelected(prev => {
        const next = new Set(prev);
        filtered.forEach(r => next.delete(r.id));
        return next;
      });
    } else {
      setSelected(prev => new Set([...prev, ...filtered.map(r => r.id)]));
    }
  };

  const startEdit = (row: KnowledgeRow) => {
    setEditing({ id: row.id, draft: row.content });
    setConfirmDelete(null);
  };
  const cancelEdit = () => setEditing(null);

  const saveEdit = async () => {
    if (!editing) return;
    setSavingId(editing.id);
    try {
      const r = await authFetch(`/api/knowledge/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: editing.draft }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Save failed");
      setRows(prev => prev.map(p => p.id === editing.id ? { ...p, content: editing.draft } : p));
      setEditing(null);
    } catch (e: any) {
      setError(e?.message || "Save failed");
    } finally { setSavingId(null); }
  };

  const removeOne = async (id: number) => {
    setSavingId(id);
    try {
      await authFetch(`/api/knowledge/${id}`, { method: "DELETE" });
      setRows(prev => prev.filter(p => p.id !== id));
      setSelected(prev => { const next = new Set(prev); next.delete(id); return next; });
      setConfirmDelete(null);
    } finally { setSavingId(null); }
  };

  const removeBulk = async () => {
    if (selected.size === 0) return;
    setBulkBusy(true);
    try {
      const ids = Array.from(selected);
      await Promise.all(ids.map(id => authFetch(`/api/knowledge/${id}`, { method: "DELETE" })));
      setRows(prev => prev.filter(p => !selected.has(p.id)));
      setSelected(new Set());
    } finally { setBulkBusy(false); }
  };

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
              <Database className="w-3.5 h-3.5 text-brand" />
              <span className="text-[10px] uppercase tracking-[0.3em] text-ink/80">Knowledge Base</span>
            </div>
            <div className="px-3 py-1.5 rounded-full glass border border-white/8 flex items-center gap-2">
              <Users className="w-3 h-3 text-brand-2" />
              <span className="text-[10px] uppercase tracking-[0.3em] text-ink/80">{agents.length} agents · {rows.length} facts</span>
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-[10px] uppercase tracking-[0.6em] text-muted">Cross-Agent Intelligence</p>
            <h1 className="font-display italic text-6xl md:text-7xl lg:text-[7rem] leading-[0.9] tracking-tight">
              <span className="text-aurora">Knowledge</span>{" "}
              <span className="text-ink/90">Atlas</span>
            </h1>
            <p className="text-ink/55 max-w-2xl text-sm md:text-base leading-relaxed">
              Every fact your agents know — searchable, editable, prunable. Catch duplicates, fix errors, retire stale info.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={refresh}
            disabled={loading}
            className="px-4 py-2.5 rounded-full glass border border-white/10 text-[11px] uppercase tracking-[0.3em] text-muted hover:text-brand hover:border-brand/40 transition-all flex items-center gap-2 disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Refresh
          </button>
        </div>
      </motion.header>

      {/* Filter strip */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[280px]">
          <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search content or agent name…"
            className="w-full h-12 pl-11 pr-4 rounded-full glass border border-white/10 outline-none text-ink text-sm focus:border-brand/60 transition-all"
          />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setAgentFilter("")}
            className={cn(
              "px-4 h-10 rounded-full text-[11px] uppercase tracking-[0.25em] flex items-center gap-2 transition-all",
              !agentFilter
                ? "bg-brand text-paper"
                : "glass border border-white/10 text-ink/70 hover:text-ink hover:border-white/30",
            )}
          >
            <Filter className="w-3 h-3" /> All agents · {rows.length}
          </button>
          {agents.map(a => {
            const c = counts.get(a.id) || 0;
            if (c === 0) return null;
            const active = agentFilter === a.id;
            return (
              <button
                key={a.id}
                onClick={() => setAgentFilter(active ? "" : a.id)}
                className={cn(
                  "px-4 h-10 rounded-full text-[11px] uppercase tracking-[0.25em] flex items-center gap-2 transition-all",
                  active
                    ? "bg-brand-2 text-paper"
                    : "glass border border-white/10 text-ink/70 hover:text-ink hover:border-white/30",
                )}
              >
                {a.name} · {c}
              </button>
            );
          })}
        </div>
      </div>

      {/* Bulk action bar */}
      <AnimatePresence>
        {selected.size > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
            className="rounded-2xl bg-amber-500/10 border border-amber-500/30 px-5 py-3 flex items-center justify-between flex-wrap gap-3"
          >
            <div className="text-xs text-amber-400 flex items-center gap-2">
              <Check className="w-3.5 h-3.5" /> {selected.size} selected
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSelected(new Set())}
                className="px-3 h-9 rounded-lg glass border border-white/10 text-[10px] uppercase tracking-[0.25em] text-ink/70"
              >
                Clear
              </button>
              <button
                onClick={removeBulk}
                disabled={bulkBusy}
                className="px-3 h-9 rounded-lg bg-rose-500/15 border border-rose-500/40 text-rose-300 hover:bg-rose-500/25 text-[10px] uppercase tracking-[0.25em] flex items-center gap-1.5 disabled:opacity-50"
              >
                {bulkBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                Delete {selected.size}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error */}
      {error && (
        <div className="rounded-2xl bg-rose-500/10 border border-rose-500/30 p-4 text-rose-400 text-sm flex items-center gap-3">
          <AlertOctagon className="w-4 h-4" />
          <span>{error}</span>
        </div>
      )}

      {/* List */}
      <div className="relative aurora-ring rounded-3xl">
        <div className="relative rounded-3xl glass-strong border border-white/10 overflow-hidden">
          {/* Header row */}
          <div className="px-6 py-3 border-b border-white/10 flex items-center gap-4 bg-black/20">
            <button
              onClick={toggleSelectAll}
              disabled={filtered.length === 0}
              className={cn(
                "w-4 h-4 rounded border-2 flex items-center justify-center transition-all",
                allFilteredSelected ? "bg-brand border-brand text-paper" : "border-white/30 hover:border-white/50",
              )}
            >
              {allFilteredSelected && <Check className="w-2.5 h-2.5" strokeWidth={4} />}
            </button>
            <div className="text-[10px] uppercase tracking-[0.3em] text-muted flex-1">
              {filtered.length} of {rows.length} {filtered.length === 1 ? "fact" : "facts"}
              {(search || agentFilter) && <span className="ml-2 text-brand-2">filtered</span>}
            </div>
          </div>

          {loading && (
            <div className="p-16 flex flex-col items-center gap-3 text-muted">
              <Loader2 className="w-8 h-8 animate-spin text-brand" />
              <p className="text-[10px] uppercase tracking-[0.5em]">Loading</p>
            </div>
          )}

          {!loading && filtered.length === 0 && (
            <div className="p-16 text-center">
              <BookOpen className="w-10 h-10 mx-auto text-muted/40 mb-3" />
              <p className="text-[11px] uppercase tracking-[0.4em] text-muted">
                {rows.length === 0
                  ? "No knowledge yet — ingest from URL/PDF in Neural Atelier"
                  : "No matches for this filter"}
              </p>
            </div>
          )}

          <div className="divide-y divide-white/5">
            {filtered.map((row) => {
              const isEditing = editing?.id === row.id;
              const isSelected = selected.has(row.id);
              return (
                <div key={row.id} className={cn(
                  "px-6 py-4 flex items-start gap-4 transition-colors",
                  isSelected ? "bg-brand/5" : "hover:bg-white/3",
                )}>
                  <button
                    onClick={() => toggleSelect(row.id)}
                    className={cn(
                      "shrink-0 mt-1 w-4 h-4 rounded border-2 flex items-center justify-center transition-all",
                      isSelected ? "bg-brand border-brand text-paper" : "border-white/30 hover:border-white/50",
                    )}
                  >
                    {isSelected && <Check className="w-2.5 h-2.5" strokeWidth={4} />}
                  </button>

                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] uppercase tracking-[0.3em] px-2 py-0.5 rounded-full bg-brand-2/10 border border-brand-2/30 text-brand-2 flex items-center gap-1">
                        <Sparkles className="w-2.5 h-2.5" /> {row.agent_name}
                      </span>
                      {row.agent_archetype && (
                        <span className="text-[9px] uppercase tracking-[0.3em] text-muted">{row.agent_archetype}</span>
                      )}
                      <span className="text-[9px] uppercase tracking-[0.3em] text-muted ml-auto">
                        {new Date(row.created_at).toLocaleDateString()}
                      </span>
                    </div>

                    {isEditing ? (
                      <textarea
                        value={editing!.draft}
                        onChange={(e) => setEditing({ id: editing!.id, draft: e.target.value })}
                        autoFocus
                        rows={Math.max(2, Math.ceil((editing!.draft.length || 0) / 80))}
                        className="w-full px-4 py-3 rounded-xl bg-black/30 border border-brand/40 outline-none text-ink text-sm leading-relaxed focus:border-brand resize-y font-mono"
                      />
                    ) : (
                      <p className="text-ink/85 text-sm leading-relaxed whitespace-pre-wrap">{row.content}</p>
                    )}
                  </div>

                  <div className="shrink-0 flex items-center gap-1.5">
                    {isEditing ? (
                      <>
                        <button
                          onClick={saveEdit}
                          disabled={savingId === editing!.id || !editing!.draft.trim()}
                          className="h-9 px-3 rounded-lg bg-brand text-paper text-[10px] uppercase tracking-[0.25em] flex items-center gap-1.5 disabled:opacity-50"
                        >
                          {savingId === editing!.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                          Save
                        </button>
                        <button
                          onClick={cancelEdit}
                          className="h-9 px-3 rounded-lg glass border border-white/10 text-[10px] uppercase tracking-[0.25em] text-ink/70 hover:text-ink"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => startEdit(row)}
                          className="h-9 px-3 rounded-lg glass border border-white/10 text-[10px] uppercase tracking-[0.25em] text-ink/70 hover:text-brand hover:border-brand/40 flex items-center gap-1.5"
                        >
                          <Pencil className="w-3 h-3" /> Edit
                        </button>
                        {confirmDelete === row.id ? (
                          <>
                            <button
                              onClick={() => removeOne(row.id)}
                              disabled={savingId === row.id}
                              className="h-9 px-3 rounded-lg bg-rose-500/15 border border-rose-500/40 text-rose-300 text-[10px] uppercase tracking-[0.25em] flex items-center gap-1.5 disabled:opacity-50"
                            >
                              {savingId === row.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                              Confirm
                            </button>
                            <button
                              onClick={() => setConfirmDelete(null)}
                              className="h-9 px-3 rounded-lg glass border border-white/10 text-[10px] uppercase tracking-[0.25em] text-ink/70"
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => setConfirmDelete(row.id)}
                            className="h-9 w-9 rounded-lg glass border border-white/10 text-ink/70 hover:text-rose-300 hover:border-rose-500/40 flex items-center justify-center"
                            title="Delete"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="px-6 py-3 border-t border-white/5 text-[10px] uppercase tracking-[0.3em] text-muted/60 bg-black/10 flex items-center gap-2">
            <FileText className="w-3 h-3" />
            Edits apply to live agent calls immediately. Deletions are permanent.
          </div>
        </div>
      </div>
    </div>
  );
}
