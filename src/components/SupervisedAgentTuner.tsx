import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Brain, ArrowUpCircle, Trash2, CheckCircle2, Zap, Sparkles, Terminal, Activity, Loader2 } from "lucide-react";
import { cn } from "../lib/utils";
import { authFetch } from "../lib/api";

type Lesson = {
  id: string;
  lesson: string;
  created_at: string;
}

export default function SupervisedAgentTuner({ agentId }: { agentId: string }) {
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isPromoting, setIsPromoting] = useState<string | null>(null);

  useEffect(() => {
    fetchLessons();
  }, [agentId]);

  const fetchLessons = async () => {
    try {
      const res = await authFetch(`/api/agents/${agentId}/lessons`);
      const data = await res.json();
      setLessons(data.lessons || []);
    } catch (e) {
      console.error("Failed to fetch lessons");
    } finally {
      setIsLoading(false);
    }
  };

  const promoteToDirective = async (lesson: Lesson) => {
    setIsPromoting(lesson.id);
    try {
      await authFetch(`/api/agents/${agentId}/promote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lessonId: lesson.id, content: lesson.lesson })
      });
      setLessons(prev => prev.filter(l => l.id !== lesson.id));
    } catch (e) {
      console.error("Promotion failed");
    } finally {
      setIsPromoting(null);
    }
  };

  const deleteLesson = async (id: string) => {
    try {
      await authFetch(`/api/agents/${agentId}/lessons/${id}`, { method: 'DELETE' });
      setLessons(prev => prev.filter(l => l.id !== id));
    } catch (e) {
      console.error("Failed to delete lesson:", e);
    }
  };

  if (isLoading) {
    return (
      <div className="p-12 flex flex-col items-center justify-center gap-4">
        <div className="relative w-10 h-10">
          <div className="absolute inset-0 rounded-full opacity-40"
            style={{ background: "conic-gradient(from 0deg, #7DF9FF, #C58BFF, #7DF9FF)", filter: "blur(1px)", animation: "spin 2s linear infinite" }} />
          <div className="absolute inset-1 rounded-full bg-paper" />
          <div className="absolute inset-2 rounded-full glass flex items-center justify-center">
            <Brain className="w-3 h-3 text-brand" />
          </div>
        </div>
        <p className="text-[9px] uppercase tracking-[0.5em] text-muted/60">Loading observations…</p>
      </div>
    );
  }

  return (
    <div className="relative aurora-ring rounded-2xl overflow-hidden">
      <div className="relative rounded-2xl glass border border-white/10 overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-white/8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl glass border border-brand/30 flex items-center justify-center text-brand">
              <Brain className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-[11px] font-medium text-ink uppercase tracking-[0.28em]">Training Buffer</h3>
              <p className="text-[9px] text-muted/70 uppercase tracking-[0.3em]">Promote observations to directives</p>
            </div>
          </div>
          {lessons.length > 0 && (
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-brand/10 border border-brand/25 text-brand text-[9px] uppercase tracking-[0.28em]">
              <Zap className="w-2.5 h-2.5" />
              {lessons.length} new
            </span>
          )}
        </div>

        {/* List */}
        <div className="divide-y divide-white/5">
          <AnimatePresence mode="popLayout">
            {lessons.length === 0 ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="p-12 flex flex-col items-center justify-center gap-3 text-center"
              >
                <div className="w-12 h-12 rounded-2xl glass border border-emerald-500/30 flex items-center justify-center text-emerald-500">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <p className="text-[9px] uppercase tracking-[0.5em] text-emerald-500/70">Fully synchronized</p>
              </motion.div>
            ) : (
              lessons.map((lesson) => (
                <motion.div
                  key={lesson.id}
                  layout
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  className="p-4 group hover:bg-white/[0.02] transition-colors"
                >
                  <div className="flex gap-3 items-start">
                    <div className="w-8 h-8 rounded-lg glass border border-white/10 flex items-center justify-center shrink-0 mt-0.5 group-hover:border-brand/30 transition-colors">
                      <Terminal className="w-3.5 h-3.5 text-muted/60 group-hover:text-brand transition-colors" />
                    </div>

                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[8px] uppercase tracking-[0.3em] text-muted/60">
                          Observation · {new Date(lesson.created_at).toLocaleDateString()}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => promoteToDirective(lesson)}
                            disabled={isPromoting === lesson.id}
                            title="Promote to directive"
                            className="h-7 px-2.5 rounded-lg glass border border-brand/25 text-brand hover:bg-brand/15 transition-all text-[9px] uppercase tracking-[0.25em] flex items-center gap-1.5 disabled:opacity-50"
                          >
                            {isPromoting === lesson.id
                              ? <Loader2 className="w-3 h-3 animate-spin" />
                              : <ArrowUpCircle className="w-3 h-3" />}
                            Promote
                          </button>
                          <button
                            onClick={() => deleteLesson(lesson.id)}
                            title="Discard"
                            className="h-7 w-7 rounded-lg glass border border-white/10 text-muted/60 hover:text-rose-500 hover:border-rose-500/30 transition-all flex items-center justify-center"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>

                      <p className="text-sm text-ink/90 leading-relaxed font-mono bg-black/20 rounded-lg px-3 py-2.5 border border-white/6">
                        {lesson.lesson}
                      </p>

                      <div className="flex items-center gap-1.5 text-[9px] text-brand/70">
                        <Activity className="w-3 h-3" />
                        <span className="uppercase tracking-[0.3em]">Potential accuracy lift: +12%</span>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
