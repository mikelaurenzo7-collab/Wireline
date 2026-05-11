import React, { lazy, Suspense } from "react";
import { Routes, Route } from "react-router-dom";
import { AnimatePresence } from "motion/react";
import ErrorBoundary from "../components/ErrorBoundary";
import PageTransition from "../components/layout/PageTransition";
import RouteFallback from "../components/layout/RouteFallback";
import NotFound from "../components/layout/NotFound";

const DashboardHome   = lazy(() => import("../components/DashboardHome"));
const TriageInbox     = lazy(() => import("../components/TriageInbox"));
const ContactProfile  = lazy(() => import("../components/ContactProfile"));
const InsightsView    = lazy(() => import("../components/InsightsView"));
const AgentTraining   = lazy(() => import("../components/AgentTraining"));
const AppointmentsView = lazy(() => import("../components/Appointments"));
const FleetSettings   = lazy(() => import("../components/FleetSettings"));
const OutboundDialer  = lazy(() => import("../components/OutboundDialer"));
const AdminSettings   = lazy(() => import("../components/AdminSettings"));
const Integrations    = lazy(() => import("../components/Integrations"));
const CallLogs        = lazy(() => import("../components/CallLogs"));
const EmailInbox      = lazy(() => import("../components/EmailInbox"));
const KnowledgeBaseManager = lazy(() => import("../components/KnowledgeBaseManager"));
const LiveMonitor     = lazy(() => import("../components/LiveMonitor"));
const DncManager      = lazy(() => import("../components/DncManager"));
const AuditLog        = lazy(() => import("../components/AuditLog"));
const CommandCenter   = lazy(() => import("../pages/CommandCenter"));

export default function AppRoutes() {
  return (
    <AnimatePresence>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={<PageTransition><ErrorBoundary><DashboardHome /></ErrorBoundary></PageTransition>} />
          <Route path="/live" element={<PageTransition><ErrorBoundary><LiveMonitor /></ErrorBoundary></PageTransition>} />
          <Route path="/triage" element={<PageTransition><ErrorBoundary><TriageInbox /></ErrorBoundary></PageTransition>} />
          <Route path="/insights" element={<PageTransition><ErrorBoundary><InsightsView /></ErrorBoundary></PageTransition>} />
          <Route path="/contact/:number" element={<PageTransition><ErrorBoundary><ContactProfile /></ErrorBoundary></PageTransition>} />
          <Route path="/logs" element={<PageTransition><ErrorBoundary><CallLogs /></ErrorBoundary></PageTransition>} />
          <Route path="/inbox" element={<PageTransition><ErrorBoundary><EmailInbox /></ErrorBoundary></PageTransition>} />
          <Route path="/outbound" element={<PageTransition><ErrorBoundary><OutboundDialer /></ErrorBoundary></PageTransition>} />
          <Route path="/appointments" element={<PageTransition><ErrorBoundary><AppointmentsView /></ErrorBoundary></PageTransition>} />
          <Route path="/train" element={<PageTransition><ErrorBoundary><AgentTraining /></ErrorBoundary></PageTransition>} />
          <Route path="/knowledge" element={<PageTransition><ErrorBoundary><KnowledgeBaseManager /></ErrorBoundary></PageTransition>} />
          <Route path="/agents" element={<PageTransition><ErrorBoundary><FleetSettings /></ErrorBoundary></PageTransition>} />
          <Route path="/integrations" element={<PageTransition><ErrorBoundary><Integrations /></ErrorBoundary></PageTransition>} />
          <Route path="/admin" element={<PageTransition><ErrorBoundary><AdminSettings /></ErrorBoundary></PageTransition>} />
          <Route path="/dnc" element={<PageTransition><ErrorBoundary><DncManager /></ErrorBoundary></PageTransition>} />
          <Route path="/audit" element={<PageTransition><ErrorBoundary><AuditLog /></ErrorBoundary></PageTransition>} />
          <Route path="/command" element={<PageTransition><ErrorBoundary><CommandCenter /></ErrorBoundary></PageTransition>} />
          <Route path="*" element={<PageTransition><NotFound /></PageTransition>} />
        </Routes>
      </Suspense>
    </AnimatePresence>
  );
}
