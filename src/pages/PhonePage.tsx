/**

 * PhonePage — voice channel: call history, outbound dialer, and appointments.

 */

import { useSearchParams } from "react-router-dom";

import { PhoneOutgoing, History, Calendar } from "lucide-react";

import { AnimatePresence, motion } from "motion/react";

import CallLogs from "../components/CallLogs";

import OutboundDialer from "../components/OutboundDialer";

import Appointments from "../components/Appointments";

import ClientRouteViewport from "../components/layout/ClientRouteViewport";

import ClientSubTabs from "../components/layout/ClientSubTabs";

import HubTabs, { CHANNELS_HUB } from "../components/HubTabs";

type PhoneTab = "logs" | "outbound" | "appointments";

const TABS = [
  { id: "logs" as const, label: "Call History", icon: History },

  { id: "outbound" as const, label: "Outbound", icon: PhoneOutgoing },

  { id: "appointments" as const, label: "Appointments", icon: Calendar },
];

export default function PhonePage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const tabParam = searchParams.get("tab");

  const activeTab: PhoneTab =
    tabParam === "outbound" || tabParam === "appointments" || tabParam === "logs"
      ? tabParam
      : "logs";

  const setTab = (tab: PhoneTab) => {
    setSearchParams((prev) => {
      if (tab === "logs") prev.delete("tab");
      else prev.set("tab", tab);

      return prev;
    });
  };

  return (
    <ClientRouteViewport>
      <HubTabs tabs={CHANNELS_HUB} label="Channels" className="mb-2 md:mb-3" />

      <ClientSubTabs
        tabs={TABS}
        activeId={activeTab}
        onChange={(id) => setTab(id as PhoneTab)}
        aria-label="Phone sections"
      />

      <div className="flex-1 min-h-0 overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.16 }}
            className="h-full min-h-0"
          >
            {activeTab === "logs" && <CallLogs embedded />}

            {activeTab === "outbound" && <OutboundDialer embedded />}

            {activeTab === "appointments" && <Appointments embedded />}
          </motion.div>
        </AnimatePresence>
      </div>
    </ClientRouteViewport>
  );
}
