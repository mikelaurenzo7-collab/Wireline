/**
 * PhonePage — Dedicated sidebar page for voice/phone communication.
 *
 * Unifies call logs and outbound dialer into a single page with tab
 * navigation. Operators can view call history, launch outbound campaigns,
 * and monitor active calls from one surface.
 *
 * Mobile-first: tabs scroll horizontally, content fills available height.
 */
import React from "react";
import { useSearchParams } from "react-router-dom";
import { Phone, PhoneOutgoing, History } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import CallLogs from "../components/CallLogs";
import OutboundDialer from "../components/OutboundDialer";
import { cn } from "../lib/utils";

type PhoneTab = "logs" | "outbound";

const TABS: { id: PhoneTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "logs", label: "Call History", icon: History },
  { id: "outbound", label: "Outbound", icon: PhoneOutgoing },
];

export default function PhonePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = (searchParams.get("tab") as PhoneTab) || "logs";

  const setTab = (tab: PhoneTab) => {
    setSearchParams((prev) => {
      prev.set("tab", tab);
      return prev;
    });
  };

  return (
    <div className="flex flex-col h-[calc(var(--app-vvh,100dvh)-7rem)] sm:h-[calc(var(--app-vvh,100dvh)-9rem)] min-h-[400px]">
      {/* ─── Header + Tab Navigation ───────────────────────────────── */}
      <header className="shrink-0 mb-3 sm:mb-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-brand/8 flex items-center justify-center shrink-0">
            <Phone className="w-4.5 h-4.5 sm:w-5 sm:h-5 text-brand" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-base sm:text-lg font-semibold text-foreground">Phone</h1>
            <p className="text-[11px] sm:text-xs text-muted">
              Call history, outbound campaigns & live monitoring
            </p>
          </div>
        </div>
        {/* Tab pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide">
          {TABS.map((tab) => {
            const active = activeTab === tab.id;
            const TabIcon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setTab(tab.id)}
                className={cn(
                  "shrink-0 flex items-center gap-2 px-4 py-2 rounded-xl text-[12px] sm:text-[13px] font-medium transition-all whitespace-nowrap",
                  active
                    ? "bg-brand/10 text-brand border border-brand/20 shadow-sm"
                    : "text-muted hover:text-foreground hover:bg-muted/8 border border-transparent",
                )}
              >
                <TabIcon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </header>

      {/* ─── Content ───────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 overflow-y-auto rounded-xl">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
            className="h-full"
          >
            {activeTab === "logs" && <CallLogs />}
            {activeTab === "outbound" && <OutboundDialer />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
