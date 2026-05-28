import { motion, AnimatePresence } from "motion/react";
import { Activity, Zap, Cpu, Signal, Radio, Waves } from "lucide-react";
import { cn } from "../lib/utils";
import { formatTime } from "../lib/safe-date";

type ActivityItem = {
  id: string;
  type: "SIGNAL_ANALYZED" | "MISSION_INJECTED" | "NEURAL_OPTIMIZATION" | "DIGITAL_RELAY";
  trigger: string;
  action: string;
  meta: string;
  timestamp: string;
  importance: "critical" | "high" | "medium" | "low";
};

const TYPE_META: Record<string, { icon: typeof Signal; color: string }> = {
  SIGNAL_ANALYZED: { icon: Signal, color: "#4F1E7B" },
  MISSION_INJECTED: { icon: Zap, color: "#4F1E7B" },
  NEURAL_OPTIMIZATION: { icon: Cpu, color: "#10B981" },
  DIGITAL_RELAY: { icon: Radio, color: "#4F1E7B" },
};

const IMPORTANCE_RING: Record<string, string> = {
  critical: "border-rose-500/60 text-rose-500",
  high: "border-brand/50 text-brand",
  medium: "border-brand-2/40 text-brand-2",
  low: "border-white/15 text-muted",
};

export default function TriggerIntelligenceFeed({ activity }: { activity: ActivityItem[] }) {
  return (
    <div className="h-full flex flex-col">
      {activity.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 py-10">
          <div className="relative w-12 h-12">
            <div
              className="absolute inset-0 rounded-full opacity-30 animate-ping"
              style={{ background: "radial-gradient(circle, rgba(79, 30, 123 ,0.5), transparent)" }}
            />
            <div className="absolute inset-0 rounded-full glass border border-brand/30 flex items-center justify-center">
              <Waves className="w-5 h-5 text-brand/60" />
            </div>
          </div>
          <p className="text-[9px] uppercase tracking-[0.5em] text-muted/50">Awaiting signals…</p>
        </div>
      ) : (
        <ul className="flex-1 divide-y divide-white/5 overflow-y-auto scrollbar-hide">
          <AnimatePresence mode="popLayout">
            {activity.map((item, idx) => {
              const meta = TYPE_META[item.type] ?? { icon: Activity, color: "#57534E" };
              const IconComp = meta.icon;
              const ringCls = IMPORTANCE_RING[item.importance] ?? IMPORTANCE_RING.low;
              return (
                <motion.li
                  key={item.id}
                  layout
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 12 }}
                  transition={{ duration: 0.22, delay: idx * 0.03 }}
                  className="group flex items-start gap-3 px-4 py-3 hover:bg-white/[0.02] transition-colors"
                >
                  {/* Icon ring */}
                  <div
                    className={cn(
                      "shrink-0 w-8 h-8 rounded-xl glass border flex items-center justify-center mt-0.5",
                      ringCls,
                    )}
                  >
                    <IconComp className="w-3.5 h-3.5" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-0.5">
                      <span
                        className="text-[8px] uppercase tracking-[0.3em] truncate max-w-[120px]"
                        style={{ color: meta.color }}
                      >
                        {item.trigger}
                      </span>
                      <span className="text-[8px] font-mono text-muted/50 shrink-0 tabular-nums">
                        {formatTime(item.timestamp, {
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })}
                      </span>
                    </div>
                    <p className="text-[11px] text-ink/90 leading-snug truncate">{item.action}</p>
                    {item.meta && (
                      <p className="text-[9px] text-muted/70 mt-0.5 truncate">{item.meta}</p>
                    )}
                  </div>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      )}
    </div>
  );
}
