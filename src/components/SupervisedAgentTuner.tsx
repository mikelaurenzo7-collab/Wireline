/* eslint-disable @typescript-eslint/no-explicit-any -- API response shapes vary by endpoint and aren't shared as client types yet. */
import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Brain, ArrowUpCircle, Trash2, CheckCircle2, Zap, Terminal, Loader2 } from "lucide-react";
import { authFetch } from "../lib/api";
import { useToast } from "../contexts/ToastContext";
import { formatDate, formatDateTime } from "../lib/safe-date";
import { ShadButton } from "./ui/shadcn/ShadButton";

type Lesson = {
  id: string;
  lesson: string;
  created_at: string;
};

export default function SupervisedAgentTuner({ agentId }: { agentId: string }) {
  const { success: toastSuccess, error: toastError } = useToast();
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isPromoting, setIsPromoting] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    (async () => {
      try {
        const res = await authFetch(`/api/agents/${agentId}/lessons`, {
          signal: controller.signal,
        });
        const data = await res.json();
        if (!cancelled) setLessons(data.lessons || []);
      } catch (e: any) {
        if (cancelled || e?.name === "AbortError") return;
        toastError("Load failed", "Could not fetch training observations.");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [agentId, toastError]);

  const promoteToDirective = async (lesson: Lesson) => {
    setIsPromoting(lesson.id);
    try {
      const resp = await authFetch(`/api/agents/${agentId}/promote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lessonId: lesson.id, content: lesson.lesson }),
      });
      if (resp.ok) {
        setLessons((prev) => prev.filter((l) => l.id !== lesson.id));
        toastSuccess("Promoted to directive", "Observation is now a hard constraint.");
      } else {
        toastError("Promotion failed", "Could not promote this observation.");
      }
    } catch {
      toastError("Promotion failed", "Network error — please try again.");
    } finally {
      setIsPromoting(null);
    }
  };

  const deleteLesson = async (id: string) => {
    setIsDeleting(id);
    try {
      const resp = await authFetch(`/api/agents/${agentId}/lessons/${id}`, { method: "DELETE" });
      if (resp.ok) {
        setLessons((prev) => prev.filter((l) => l.id !== id));
      } else {
        toastError("Delete failed", "Could not discard this observation.");
      }
    } catch {
      toastError("Delete failed", "Network error — please try again.");
    } finally {
      setIsDeleting(null);
    }
  };

  if (isLoading) {
    return (
      <div className="p-12 flex flex-col items-center justify-center gap-4">
        <Loader2 className="w-8 h-8 animate-spin text-brand" />
        <p className="wl-label-muted tracking-[0.35em]">Loading observations…</p>
      </div>
    );
  }

  return (
    <div className="relative rounded-md wl-panel-elevated border border-border overflow-hidden">
      <div className="px-5 py-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-md wl-panel border border-brand/30 flex items-center justify-center text-brand">
            <Brain className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-[11px] font-medium text-ink uppercase tracking-[0.28em]">
              Training Buffer
            </h3>
            <p className="wl-label-muted">Promote observations to directives</p>
          </div>
        </div>
        {lessons.length > 0 && (
          <span className="wl-label flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-brand/10 border border-brand/25 text-brand">
            <Zap className="w-2.5 h-2.5" />
            {lessons.length} new
          </span>
        )}
      </div>

      <div className="divide-y divide-border">
        <AnimatePresence mode="popLayout">
          {lessons.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="p-12 flex flex-col items-center justify-center gap-3 text-center"
            >
              <div className="w-12 h-12 rounded-md wl-panel border border-brand/30 flex items-center justify-center text-brand">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <p className="wl-label text-brand/70 tracking-[0.35em]">Fully synchronized</p>
            </motion.div>
          ) : (
            lessons.map((lesson) => (
              <motion.div
                key={lesson.id}
                layout
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                className="p-4 group hover:bg-black/[0.02] transition-colors"
              >
                <div className="flex gap-3 items-start">
                  <div className="w-8 h-8 rounded-md wl-panel border border-border flex items-center justify-center shrink-0 mt-0.5 group-hover:border-brand/30 transition-colors">
                    <Terminal className="w-3.5 h-3.5 text-muted/70 group-hover:text-brand transition-colors" />
                  </div>

                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="wl-label-muted tracking-[0.22em]">
                        Observation · {formatDate(lesson.created_at)}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <ShadButton
                          type="button"
                          variant="editorial"
                          size="sm"
                          disableAnimations
                          onClick={() => promoteToDirective(lesson)}
                          disabled={isPromoting === lesson.id}
                          title="Promote this observation into a hard directive on the agent"
                          aria-label={`Promote observation to directive: ${lesson.lesson.slice(0, 80)}`}
                          className="h-8 px-3 rounded-md text-[10px] uppercase tracking-[0.18em] touch-press"
                        >
                          {isPromoting === lesson.id ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <ArrowUpCircle className="w-3 h-3" />
                          )}
                          Promote
                        </ShadButton>
                        <ShadButton
                          type="button"
                          variant="outline"
                          size="icon"
                          disableAnimations
                          onClick={() => deleteLesson(lesson.id)}
                          disabled={isDeleting === lesson.id}
                          title="Discard"
                          className="h-7 w-7 rounded-md text-muted/70 hover:text-rose-500 hover:border-rose-500/30"
                        >
                          {isDeleting === lesson.id ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Trash2 className="w-3 h-3" />
                          )}
                        </ShadButton>
                      </div>
                    </div>

                    <p className="text-sm text-ink/90 leading-relaxed font-mono bg-black/20 rounded-md px-3 py-2.5 border border-border">
                      {lesson.lesson}
                    </p>

                    <p className="wl-label-muted tracking-[0.22em]">
                      Captured{" "}
                      {formatDateTime(lesson.created_at, {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                </div>
              </motion.div>
            ))
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
