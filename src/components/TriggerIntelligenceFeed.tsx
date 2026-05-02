import React from "react";
import { motion, AnimatePresence } from "motion/react";
import { Activity, Zap, Cpu, Search, ArrowRight, Shield, Target, Signal, Radio } from "lucide-react";
import { cn } from "../lib/utils";

type ActivityItem = {
  id: string;
  type: 'SIGNAL_ANALYZED' | 'MISSION_INJECTED' | 'NEURAL_OPTIMIZATION' | 'DIGITAL_RELAY';
  trigger: string;
  action: string;
  meta: string;
  timestamp: string;
  importance: 'critical' | 'high' | 'medium' | 'low';
}

export default function TriggerIntelligenceFeed({ activity }: { activity: ActivityItem[] }) {
  const getIcon = (type: string) => {
    switch (type) {
      case 'SIGNAL_ANALYZED': return <Signal className="w-5 h-5" />;
      case 'MISSION_INJECTED': return <Zap className="w-5 h-5" />;
      case 'NEURAL_OPTIMIZATION': return <Cpu className="w-5 h-5" />;
      case 'DIGITAL_RELAY': return <Radio className="w-5 h-5" />;
      default: return <Activity className="w-5 h-5" />;
    }
  };

  const getImportanceStyles = (importance: string) => {
    switch (importance) {
      case 'critical': return "text-rose-500 border-rose-500 bg-rose-500/10";
      case 'high': return "text-brand border-brand bg-brand/10";
      case 'medium': return "text-ink border-ink bg-zinc-100";
      default: return "text-muted border-zinc-200 bg-zinc-50";
    }
  };

  return (
    <div className="brutal-card !p-0 overflow-hidden bg-white hover:shadow-[16px_16px_0px_0px_rgba(10,10,10,1)] transition-all">
      <div className="p-6 border-b-4 border-ink bg-zinc-950 text-white flex justify-between items-center">
        <h3 className="text-sm font-black uppercase tracking-[0.4em] italic flex items-center gap-4">
          <Activity className="w-5 h-5 text-brand" />
          Neural Trigger Log
        </h3>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-brand rounded-full animate-ping" />
          <span className="text-[9px] font-bold text-white/40 uppercase tracking-widest italic">Live Intelligence Streams</span>
        </div>
      </div>
      
      <div className="divide-y-2 divide-ink/10 h-[400px] overflow-y-auto scrollbar-hide">
        <AnimatePresence mode="popLayout">
          {activity.length === 0 ? (
             <div className="h-full flex flex-col items-center justify-center p-12 space-y-6 opacity-20">
                <Search className="w-12 h-12" />
                <p className="text-[9px] font-black uppercase tracking-[0.5em] italic">Awaiting Synchronous Signals...</p>
             </div>
          ) : (
            activity.map((item) => (
              <motion.div
                key={item.id}
                initial={{ x: -20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: 20, opacity: 0 }}
                className="p-6 hover:bg-zinc-50 transition-colors group relative"
              >
                <div className="flex gap-6">
                  <div className={cn(
                    "w-12 h-12 brutal-border flex items-center justify-center shrink-0 shadow-none",
                    getImportanceStyles(item.importance)
                  )}>
                    {getIcon(item.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[8px] font-black uppercase tracking-widest text-muted group-hover:text-ink transition-colors italic">
                        {item.trigger}
                      </span>
                      <span className="text-[8px] font-mono text-muted/40 uppercase">
                        {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </span>
                    </div>
                    <div className="text-xs font-black text-ink uppercase tracking-tight mb-1 truncate">
                      {item.action}
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-1 h-3 bg-brand/40" />
                      <span className="text-[9px] font-bold text-muted uppercase italic truncate">{item.meta}</span>
                    </div>
                  </div>
                  <div className="absolute top-1/2 right-4 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <ArrowRight className="w-4 h-4 text-brand" />
                  </div>
                </div>
              </motion.div>
            ))
          )}
        </AnimatePresence>
      </div>
      
      <div className="p-4 bg-zinc-50 border-t-2 border-ink text-center">
        <span className="text-[8px] font-black text-ink/20 uppercase tracking-[1em] italic leading-none block">System Response Buffer: Stable</span>
      </div>
    </div>
  );
}
