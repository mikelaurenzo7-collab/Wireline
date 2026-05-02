import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Brain, ArrowUpCircle, Trash2, CheckCircle2, Shield, Zap, Sparkles, Terminal, Activity, Loader2 } from "lucide-react";
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
      // Remove from lessons locally
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
    } catch (e) {}
  };

  if (isLoading) {
    return (
      <div className="p-12 flex flex-col items-center justify-center space-y-4 opacity-50">
        <Loader2 className="w-8 h-8 animate-spin text-brand" />
        <p className="text-[10px] font-black uppercase tracking-[0.4em]">Calibrating Neural Pathways...</p>
      </div>
    );
  }

  return (
    <div className="brutal-card bg-white border-brand overflow-hidden">
      <div className="p-6 bg-brand border-b-4 border-ink flex justify-between items-center">
        <div className="flex items-center gap-3">
          <Brain className="w-6 h-6 text-white bg-ink p-1 brutal-border border-2" />
          <div>
            <h3 className="text-sm font-black uppercase tracking-widest text-ink">Supervised Training Buffer</h3>
            <p className="text-[9px] font-bold text-ink/60 uppercase tracking-tighter">Promote AI observations to system directives</p>
          </div>
        </div>
        <div className="flex items-center gap-2 bg-ink/10 px-3 py-1 brutal-border border-2 border-ink/20">
           <Zap className="w-3 h-3 text-ink" />
           <span className="text-[10px] font-black">{lessons.length} NEW_INSIGHTS</span>
        </div>
      </div>

      <div className="divide-y-4 divide-ink">
        <AnimatePresence mode="popLayout">
          {lessons.length === 0 ? (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="p-12 text-center"
            >
              <Sparkles className="w-12 h-12 mx-auto mb-4 text-brand opacity-20" />
              <p className="text-[10px] font-black uppercase tracking-[0.5em] text-muted">Neural Mesh Fully Synchronized</p>
            </motion.div>
          ) : (
            lessons.map((lesson) => (
              <motion.div
                key={lesson.id}
                layout
                initial={{ x: -50, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: 50, opacity: 0 }}
                className="p-6 group hover:bg-zinc-50 transition-colors"
              >
                <div className="flex gap-6 items-start">
                   <div className="w-12 h-12 brutal-border border-4 flex items-center justify-center shrink-0 bg-white group-hover:bg-brand transition-colors">
                      <Terminal className="w-5 h-5 text-ink" />
                   </div>
                   <div className="flex-1 space-y-2">
                      <div className="flex justify-between items-center">
                         <span className="text-[9px] font-black uppercase tracking-widest text-muted">Observation • {new Date(lesson.created_at).toLocaleDateString()}</span>
                         <div className="flex gap-2">
                             <button 
                               onClick={() => promoteToDirective(lesson)}
                               disabled={isPromoting === lesson.id}
                               className="p-2 brutal-border border-2 bg-white hover:bg-brand text-ink transition-all hover:translate-x-[-2px] hover:translate-y-[-2px] active:translate-x-0 active:translate-y-0 active:shadow-none disabled:opacity-50"
                               title="Promote to Absolute Rule"
                             >
                                {isPromoting === lesson.id ? <Loader2 className="w-4 h-4 animate-spin text-ink" /> : <ArrowUpCircle className="w-4 h-4" />}
                             </button>
                             <button 
                               onClick={() => deleteLesson(lesson.id)}
                               className="p-2 brutal-border border-2 bg-white hover:bg-rose-500 text-ink hover:text-white transition-all hover:translate-x-[-2px] hover:translate-y-[-2px] active:translate-x-0 active:translate-y-0 active:shadow-none"
                             >
                                <Trash2 className="w-4 h-4" />
                             </button>
                         </div>
                      </div>
                      <p className="text-sm font-bold text-ink font-mono bg-zinc-100 p-4 brutal-border border-2">
                         {lesson.lesson}
                      </p>
                      <div className="flex items-center gap-2">
                         <Activity className="w-4 h-4 text-brand" />
                         <span className="text-[10px] font-black uppercase italic tracking-tighter text-brand">Potential Accuracy Lift: +12%</span>
                      </div>
                   </div>
                </div>
              </motion.div>
            ))
          )}
        </AnimatePresence>
      </div>

      <div className="p-4 bg-zinc-950 text-white flex items-center justify-between">
         <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-brand" />
            <span className="text-[9px] font-black uppercase tracking-widest">Training Protocol: Supervised_Mesh_v1</span>
         </div>
         <CheckCircle2 className="w-4 h-4 text-brand opacity-40" />
      </div>
    </div>
  );
}
