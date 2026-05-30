import React from "react";
import { Activity, ShieldAlert, Zap, Phone, Sparkles, MessageSquareText } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { clsx } from "clsx";

interface LiveCall {
  id: string;
  customer_number: string;
  sentiment_label: string;
  urgency: number; // 0-10
  status: "active" | "escalated";
  thought?: string; // Optional: what the AI is currently "thinking"
}

export function LiveMonitor({ calls }: { calls: LiveCall[] }) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-6">
        <h3 className="app-section-title flex items-center gap-2">
          <Activity className="w-3.5 h-3.5 text-brand" />
          Live Network Monitor
        </h3>
        {calls.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500/60"></span>
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
            </span>
            <span className="text-[9px] font-mono text-emerald-600/80 uppercase tracking-wider">
              Operational
            </span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <AnimatePresence mode="popLayout">
          {calls.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="col-span-full py-16 flex flex-col items-center justify-center gap-3 text-center border border-dashed border-black/8 rounded-3xl bg-black/[0.01]"
            >
              <div className="relative">
                <span
                  aria-hidden
                  className="absolute inset-0 -z-10 rounded-full bg-brand/30 blur-2xl scale-150"
                />
                <div className="relative w-12 h-12 rounded-2xl bg-gradient-to-br from-brand to-brand-deep text-on-brand shadow-sm shadow-brand/25 flex items-center justify-center">
                  <Zap className="w-6 h-6" />
                </div>
              </div>
              <div className="space-y-1">
                <p className="font-mono text-[10px] uppercase tracking-[0.32em] text-brand/70">
                  Carrier network idle
                </p>
                <p className="font-display italic text-lg text-ink leading-tight">
                  Standing by for live calls
                </p>
              </div>
              <p className="text-caption leading-relaxed max-w-[260px]">
                Active conversations stream here in real time as your fleet picks up calls.
              </p>
            </motion.div>
          ) : (
            calls.map((call) => (
              <motion.div
                layout
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                key={call.id}
                className={clsx(
                  "relative group overflow-hidden p-6 rounded-3xl border transition-all duration-500",
                  call.status === "escalated"
                    ? "bg-rose-500/[0.03] border-rose-500/30 shadow-[0_0_40px_rgba(244,63,94,0.08)]"
                    : "glass border-black/8 hover:border-brand/30",
                )}
              >
                {/* Visual pulse for activity */}
                <div className="absolute top-0 right-0 w-32 h-32 bg-brand/5 blur-3xl rounded-full -mr-16 -mt-16 pointer-events-none group-hover:bg-brand/10 transition-colors" />

                <div className="relative flex items-center gap-4 mb-5">
                  <div
                    className={clsx(
                      "w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 transition-all",
                      call.status === "escalated"
                        ? "border bg-rose-500/10 border-rose-500/20 text-rose-500"
                        : "bg-gradient-to-br from-brand to-brand-deep text-on-brand shadow-sm shadow-brand/25",
                    )}
                  >
                    <Phone
                      className={clsx("w-5 h-5", call.status === "escalated" && "animate-pulse")}
                    />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-ink tracking-tight">
                      {call.customer_number}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span
                        className={clsx(
                          "text-[9px] font-medium uppercase tracking-wider",
                          call.status === "escalated" ? "text-rose-600" : "text-brand",
                        )}
                      >
                        {call.sentiment_label}
                      </span>
                      <span className="w-1 h-1 rounded-full bg-black/10" />
                      <span className="text-[9px] text-muted/70 font-mono">
                        ID: {call.id.substring(0, 8)}
                      </span>
                    </div>
                  </div>
                  {call.status === "escalated" && (
                    <div className="ml-auto w-8 h-8 rounded-full bg-rose-500/10 flex items-center justify-center">
                      <ShieldAlert className="w-4 h-4 text-rose-500" />
                    </div>
                  )}
                </div>

                {/* AI Thought / Live Stream Placeholder */}
                <div className="relative mb-5 p-3.5 rounded-2xl bg-black/[0.03] border border-black/5">
                  <div className="flex items-center gap-2 mb-2">
                    <Sparkles className="w-3 h-3 text-brand" />
                    <span className="text-[8px] uppercase tracking-[0.2em] text-muted font-bold">
                      Autonomous Reasoning
                    </span>
                  </div>
                  <p className="text-[11px] text-ink/70 leading-relaxed italic">
                    {call.thought ||
                      "AI is synthesizing intent and identifying high-leverage follow-up actions..."}
                  </p>
                  <div className="absolute bottom-2 right-2 flex gap-1">
                    <span className="w-1 h-1 rounded-full bg-brand/40 animate-bounce [animation-delay:-0.3s]" />
                    <span className="w-1 h-1 rounded-full bg-brand/40 animate-bounce [animation-delay:-0.15s]" />
                    <span className="w-1 h-1 rounded-full bg-brand/40 animate-bounce" />
                  </div>
                </div>

                <div className="relative">
                  <div className="flex justify-between items-center mb-2">
                    <div className="flex items-center gap-2">
                      <MessageSquareText className="w-3 h-3 text-muted/70" />
                      <span className="text-[9px] uppercase tracking-[0.2em] text-muted font-bold">
                        Sentiment Score
                      </span>
                    </div>
                    <span
                      className={clsx(
                        "text-[10px] font-mono font-bold",
                        call.urgency > 7 ? "text-rose-500" : "text-brand",
                      )}
                    >
                      {call.urgency * 10}%
                    </span>
                  </div>
                  <div className="h-1.5 w-full bg-black/5 rounded-full overflow-hidden p-[1px]">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${call.urgency * 10}%` }}
                      transition={{ duration: 1.5, ease: "easeOut" }}
                      className={clsx(
                        "h-full rounded-full transition-colors duration-500",
                        call.urgency > 7 ? "bg-rose-500" : "bg-gradient-to-r from-brand to-brand-2",
                      )}
                      style={{
                        boxShadow:
                          call.urgency > 7
                            ? "0 0 10px rgba(244,63,94,0.4)"
                            : "0 0 10px rgba(107, 43, 153 ,0.3)",
                      }}
                    />
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
