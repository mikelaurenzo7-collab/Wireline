/**
 * PhonePage — voice channel: call history, outbound dialer, and appointments.
 * Section tabs live in AppShell chrome (AppChromeSubTabs).
 */
import { useSearchParams } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import CallLogs from "../components/CallLogs";
import OutboundDialer from "../components/OutboundDialer";
import Appointments from "../components/Appointments";
import ClientRouteViewport from "../components/layout/ClientRouteViewport";
import { resolveAppPageSubTabId, resolveAppPageSubTabRoute } from "../lib/page-sub-tabs";

const PHONE_ROUTE = resolveAppPageSubTabRoute("/phone")!;

export default function PhonePage() {
  const [searchParams] = useSearchParams();
  const activeTab = resolveAppPageSubTabId(PHONE_ROUTE, searchParams.get("tab"));

  return (
    <ClientRouteViewport>
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.16 }}
            className="flex-1 min-h-0 flex flex-col overflow-hidden"
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
