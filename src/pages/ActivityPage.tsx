/**
 * ActivityPage — Unified activity feed and history.
 *
 * Now that Phone, Email, and SMS have their own dedicated sidebar pages,
 * the Activity surface focuses on cross-channel event history and
 * appointments — the timeline of everything that happened across all
 * channels.
 *
 * Mobile-first: tabs scroll horizontally, content maximizes viewport.
 */
import React from "react";
import { useSearchParams } from "react-router-dom";
import { Radio, Calendar, PhoneCall } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import CallLogs from "../components/CallLogs";
import Appointments from "../components/Appointments";
import { cn } from "../lib/utils";

type ActivityTab = "calls" | "appointments";

const TABS: {
  id: ActivityTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: "calls", label: "Call Log", icon: PhoneCall },
  { id: "appointments", label: "Appointments", icon: Calendar },
];

export default function ActivityPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = (searchParams.get("tab") as ActivityTab) || "calls";

  const setTab = (tab: ActivityTab) => {
    setSearchParams((prev) => {
      prev.set("tab", tab);
      return prev;
    });
  };

  return (
    <div className="flex flex-col h-[calc(var(--app-vvh,100dvh)-7rem)] sm:h-[calc(var(--app-vvh,100dvh)-9rem)] lg:h-[calc(100dvh-8.5rem)] min-h-[400px]">
      {/* ─── Header + Tabs ─────────────────────────────────────────── */}
      <header className="shrink-0 mb-3 sm:mb-4">
        {/* Page identity — hidden on lg+ where DesktopContextBar shows it */}
        <div className="flex items-center gap-3 mb-3 lg:hidden">
          <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-brand/8 flex items-center justify-center shrink-0">
            <Radio className="w-4 h-4 sm:w-5 sm:h-5 text-brand" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-sm sm:text-lg font-semibold text-foreground">Activity</h1>
            <p className="text-[10px] sm:text-xs text-muted">
              Cross-channel history & scheduled events
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide">
          {TABS.map((tab) => {
            const active = activeTab === tab.id;
            const TabIcon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setTab(tab.id)}
                className={cn(
                  "shrink-0 flex items-center gap-1.5 px-3 py-1.5 sm:py-2 rounded-xl text-[11px] sm:text-[13px] font-medium transition-all whitespace-nowrap min-h-[36px] sm:min-h-0",
                  active
                    ? "bg-brand/10 text-brand border border-brand/20 shadow-sm"
                    : "text-muted hover:text-foreground hover:bg-muted/8 border border-transparent",
                )}
              >
                <TabIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
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
            {activeTab === "calls" && <CallLogs />}
            {activeTab === "appointments" && <Appointments />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
