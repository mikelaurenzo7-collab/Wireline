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
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="text-[9px] font-mono text-emerald-600/80 uppercase tracking-wider">
              Operational
            </span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <AnimatePresence mode="popLayout">
          {calls.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="col-span-full py-20 flex flex-col items-center justify-center border border-black/10 rounded-sm bg-black/[0.02] shadow-inner"
            >
              <div className="w-12 h-12 rounded-full bg-white border border-black/10 shadow-sm flex items-center justify-center mb-4">
                <Zap className="w-5 h-5 text-black/30" />
              </div>
              <p className="text-black/50 text-[11px] font-bold uppercase tracking-[0.25em]">
                Carrier network idle
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
                  "relative group overflow-hidden p-6 rounded-sm border transition-all duration-300",
                  call.status === "escalated"
                    ? "bg-rose-50 border-rose-300 shadow-[0_4px_20px_-8px_rgba(244,63,94,0.25)]"
                    : "bg-white border-black/15 shadow-[0_4px_20px_-8px_rgba(0,0,0,0.15)] hover:border-black/30",
                )}
              >
                <div className="absolute top-0 right-0 w-32 h-32 bg-brand/5 blur-3xl rounded-full -mr-16 -mt-16 pointer-events-none group-hover:bg-brand/10 transition-colors" />

                <div className="relative flex items-center gap-4 mb-5">
                  <div
                    className={clsx(
                      "w-12 h-12 rounded-sm flex items-center justify-center shrink-0 border transition-all",
                      call.status === "escalated"
                        ? "bg-rose-500/10 border-rose-500/20 text-rose-500"
                        : "bg-brand/10 border-brand/20 text-brand",
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
                          "text-[9px] font-bold uppercase tracking-widest",
                          call.status === "escalated" ? "text-rose-600" : "text-black",
                        )}
                      >
                        {call.sentiment_label}
                      </span>
                      <span className="w-1 h-1 rounded-full bg-black/20" />
                      <span className="text-[9px] text-black/50 font-mono font-bold tracking-widest">
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
                <div className="relative mb-5 p-4 rounded-sm bg-black/[0.03] border border-black/10">
                  <div className="flex items-center gap-2 mb-2">
                    <Sparkles className="w-3 h-3 text-brand" />
                    <span className="text-[10px] uppercase tracking-[0.2em] text-black/60 font-bold">
                      Autonomous Reasoning
                    </span>
                  </div>
                  <p className="text-xs text-ink/80 leading-relaxed italic font-medium">
                    {call.thought ||
                      "AI is synthesizing intent and identifying high-leverage follow-up actions..."}
                  </p>
                  <div className="absolute bottom-3 right-3 flex gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-black/40 animate-bounce [animation-delay:-0.3s]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-black/40 animate-bounce [animation-delay:-0.15s]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-black/40 animate-bounce" />
                  </div>
                </div>

                <div className="relative">
                  <div className="flex justify-between items-center mb-2">
                    <div className="flex items-center gap-2">
                      <MessageSquareText className="w-4 h-4 text-black/40" />
                      <span className="text-[10px] uppercase tracking-[0.2em] text-black/60 font-bold">
                        Sentiment Score
                      </span>
                    </div>
                    <span
                      className={clsx(
                        "text-[10px] font-mono font-bold tracking-widest",
                        call.urgency > 7 ? "text-rose-500" : "text-black",
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
                        "h-full rounded-sm transition-colors duration-500",
                        call.urgency > 7 ? "bg-rose-500" : "bg-black",
                      )}
                      style={{
                        boxShadow:
                          call.urgency > 7
                            ? "0 0 10px rgba(244,63,94,0.4)"
                            : "0 0 10px rgba(0, 0, 0 ,0.3)",
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
