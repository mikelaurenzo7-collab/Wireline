import React, { lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { AnimatePresence } from "motion/react";
import ErrorBoundary from "../components/ErrorBoundary";
import PageTransition from "../components/layout/PageTransition";
import RouteFallback from "../components/layout/RouteFallback";
import NotFound from "../components/layout/NotFound";

const TriageInbox = lazy(() => import("../components/TriageInbox"));
const ContactProfile = lazy(() => import("../components/ContactProfile"));
const InsightsView = lazy(() => import("../components/InsightsView"));
const AgentTraining = lazy(() => import("../components/AgentTraining"));
const AppointmentsView = lazy(() => import("../components/Appointments"));
const FleetSettings = lazy(() => import("../components/FleetSettings"));
const OutboundDialer = lazy(() => import("../components/OutboundDialer"));
const AdminSettings = lazy(() => import("../components/AdminSettings"));
const Integrations = lazy(() => import("../components/Integrations"));
const CallLogs = lazy(() => import("../components/CallLogs"));
const EmailInbox = lazy(() => import("../components/EmailInbox"));
const SmsThreads = lazy(() => import("../components/SmsThreads"));
const KnowledgeBaseManager = lazy(() => import("../components/KnowledgeBaseManager"));
const LiveMonitor = lazy(() => import("../components/LiveMonitor"));
const DncManager = lazy(() => import("../components/DncManager"));
const AuditLog = lazy(() => import("../components/AuditLog"));
const LiveOps = lazy(() => import("../pages/CommandCenter"));
const HelpCenter = lazy(() => import("../components/HelpCenter"));
// /status, /changelog, /security are public marketing routes handled
// directly by App.tsx BEFORE AppShell mounts (see App.tsx route guards).
// Mounting them again here is dead code that would never be reached, but
// would still bundle three lazy chunks into the authenticated app shell.
const Pipeline = lazy(() => import("../components/Pipeline"));
// FounderDashboard is mounted as a PUBLIC route in App.tsx — NOT in the
// authenticated AppShell. This keeps it off every chrome menu / sidebar
// link / lazy chunk preload for the client app. The page itself handles
// auth + owner gating; the server endpoints (e.g. /api/admin/founder-stats)
// are independently gated by authorizeMigration (OWNER_EMAIL). The result:
// clients in the authenticated app never see, link to, or download code
// for the founder surface.
const SupervisorCockpit = lazy(() => import("../components/SupervisorCockpit"));

export default function AppRoutes() {
  return (
    <AnimatePresence>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route
            path="/"
            element={
              <PageTransition>
                <ErrorBoundary>
                  <LiveOps />
                </ErrorBoundary>
              </PageTransition>
            }
          />
          {/* /dashboard and /command both redirect to / — single consolidated Home */}
          <Route path="/dashboard" element={<Navigate to="/" replace />} />
          <Route path="/command" element={<Navigate to="/" replace />} />
          <Route
            path="/live"
            element={
              <PageTransition>
                <ErrorBoundary>
                  <LiveMonitor />
                </ErrorBoundary>
              </PageTransition>
            }
          />
          <Route
            path="/triage"
            element={
              <PageTransition>
                <ErrorBoundary>
                  <TriageInbox />
                </ErrorBoundary>
              </PageTransition>
            }
          />
          <Route
            path="/insights"
            element={
              <PageTransition>
                <ErrorBoundary>
                  <InsightsView />
                </ErrorBoundary>
              </PageTransition>
            }
          />
          <Route
            path="/contact/:number"
            element={
              <PageTransition>
                <ErrorBoundary>
                  <ContactProfile />
                </ErrorBoundary>
              </PageTransition>
            }
          />
          <Route
            path="/logs"
            element={
              <PageTransition>
                <ErrorBoundary>
                  <CallLogs />
                </ErrorBoundary>
              </PageTransition>
            }
          />
          <Route
            path="/inbox"
            element={
              <PageTransition>
                <ErrorBoundary>
                  <EmailInbox />
                </ErrorBoundary>
              </PageTransition>
            }
          />
          <Route
            path="/sms"
            element={
              <PageTransition>
                <ErrorBoundary>
                  <SmsThreads />
                </ErrorBoundary>
              </PageTransition>
            }
          />
          {/* /cockpit — Floor supervisor view (distinct from / Live Ops).
              / is owner pulse + action feed; /cockpit is per-agent availability + listen/whisper. */}
          <Route
            path="/cockpit"
            element={
              <PageTransition>
                <ErrorBoundary>
                  <SupervisorCockpit />
                </ErrorBoundary>
              </PageTransition>
            }
          />
          <Route
            path="/outbound"
            element={
              <PageTransition>
                <ErrorBoundary>
                  <OutboundDialer />
                </ErrorBoundary>
              </PageTransition>
            }
          />
          <Route
            path="/appointments"
            element={
              <PageTransition>
                <ErrorBoundary>
                  <AppointmentsView />
                </ErrorBoundary>
              </PageTransition>
            }
          />
          <Route
            path="/train"
            element={
              <PageTransition>
                <ErrorBoundary>
                  <AgentTraining />
                </ErrorBoundary>
              </PageTransition>
            }
          />
          <Route
            path="/knowledge"
            element={
              <PageTransition>
                <ErrorBoundary>
                  <KnowledgeBaseManager />
                </ErrorBoundary>
              </PageTransition>
            }
          />
          <Route
            path="/agents"
            element={
              <PageTransition>
                <ErrorBoundary>
                  <FleetSettings />
                </ErrorBoundary>
              </PageTransition>
            }
          />
          <Route
            path="/integrations"
            element={
              <PageTransition>
                <ErrorBoundary>
                  <Integrations />
                </ErrorBoundary>
              </PageTransition>
            }
          />
          <Route
            path="/admin"
            element={
              <PageTransition>
                <ErrorBoundary>
                  <AdminSettings />
                </ErrorBoundary>
              </PageTransition>
            }
          />
          <Route
            path="/dnc"
            element={
              <PageTransition>
                <ErrorBoundary>
                  <DncManager />
                </ErrorBoundary>
              </PageTransition>
            }
          />
          <Route
            path="/audit"
            element={
              <PageTransition>
                <ErrorBoundary>
                  <AuditLog />
                </ErrorBoundary>
              </PageTransition>
            }
          />
          <Route
            path="/help"
            element={
              <PageTransition>
                <ErrorBoundary>
                  <HelpCenter />
                </ErrorBoundary>
              </PageTransition>
            }
          />
          <Route
            path="/pipeline"
            element={
              <PageTransition>
                <ErrorBoundary>
                  <Pipeline />
                </ErrorBoundary>
              </PageTransition>
            }
          />
          <Route
            path="*"
            element={
              <PageTransition>
                <NotFound />
              </PageTransition>
            }
          />
        </Routes>
      </Suspense>
    </AnimatePresence>
  );
}
