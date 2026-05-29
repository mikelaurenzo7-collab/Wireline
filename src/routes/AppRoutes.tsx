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
const AppointmentsView = lazy(() => import("../components/Appointments"));
const FleetSettings = lazy(() => import("../components/FleetSettings"));
const AdminSettings = lazy(() => import("../components/AdminSettings"));
const Integrations = lazy(() => import("../components/Integrations"));
const KnowledgeBaseManager = lazy(() => import("../components/KnowledgeBaseManager"));
const DncManager = lazy(() => import("../components/DncManager"));
const AuditLog = lazy(() => import("../components/AuditLog"));
const LiveOps = lazy(() => import("../pages/CommandCenter"));
const HelpCenter = lazy(() => import("../components/HelpCenter"));
const Status = lazy(() => import("../components/Status"));
const PublicChangelog = lazy(() => import("../components/PublicChangelog"));
const Security = lazy(() => import("../components/Security"));
const Pipeline = lazy(() => import("../components/Pipeline"));
const FounderDashboard = lazy(() => import("../components/FounderDashboard"));
const SupervisorCockpit = lazy(() => import("../components/SupervisorCockpit"));
const AgentChat = lazy(() => import("../pages/AgentChat"));
const Training = lazy(() => import("../pages/Training"));
const PhonePage = lazy(() => import("../pages/PhonePage"));
const EmailPage = lazy(() => import("../pages/EmailPage"));
const SmsPage = lazy(() => import("../pages/SmsPage"));
const ActivityPage = lazy(() => import("../pages/ActivityPage"));

export default function AppRoutes() {
  return (
    <AnimatePresence>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          {/* Chat is the home surface — it runs the show. Landing on / (deploy
              root, OAuth return, bookmarks) sends operators straight to Chat. */}
          <Route path="/" element={<Navigate to="/chat" replace />} />
          <Route
            path="/ops"
            element={
              <PageTransition>
                <ErrorBoundary>
                  <LiveOps />
                </ErrorBoundary>
              </PageTransition>
            }
          />
          {/* /dashboard, /command and /live all redirect to /ops — the live call
              grid lives on Live Ops (/ops) and supervisory tooling on /cockpit, so
              a separate standalone monitor was redundant. */}
          <Route path="/dashboard" element={<Navigate to="/ops" replace />} />
          <Route path="/command" element={<Navigate to="/ops" replace />} />
          <Route path="/live" element={<Navigate to="/ops" replace />} />
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
            path="/founder"
            element={
              <PageTransition>
                <ErrorBoundary>
                  <FounderDashboard />
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
          {/* ── Channel pages (dedicated sidebar slots) ──────────────── */}
          <Route
            path="/phone"
            element={
              <PageTransition>
                <ErrorBoundary>
                  <PhonePage />
                </ErrorBoundary>
              </PageTransition>
            }
          />
          <Route
            path="/email"
            element={
              <PageTransition>
                <ErrorBoundary>
                  <EmailPage />
                </ErrorBoundary>
              </PageTransition>
            }
          />
          <Route
            path="/sms"
            element={
              <PageTransition>
                <ErrorBoundary>
                  <SmsPage />
                </ErrorBoundary>
              </PageTransition>
            }
          />
          {/* Legacy channel routes → redirect to new dedicated pages */}
          <Route path="/logs" element={<Navigate to="/phone" replace />} />
          <Route path="/inbox" element={<Navigate to="/email" replace />} />
          <Route path="/outbound" element={<Navigate to="/phone?tab=outbound" replace />} />
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
            path="/appointments"
            element={
              <PageTransition>
                <ErrorBoundary>
                  <AppointmentsView />
                </ErrorBoundary>
              </PageTransition>
            }
          />
          {/* Training — elevated from chat tab to its own dedicated page. */}
          <Route
            path="/training"
            element={
              <PageTransition>
                <ErrorBoundary>
                  <Training />
                </ErrorBoundary>
              </PageTransition>
            }
          />
          {/* /train legacy bookmarks → new dedicated training page. */}
          <Route path="/train" element={<Navigate to="/training" replace />} />
          {/* Activity — cross-channel history hub */}
          <Route
            path="/activity"
            element={
              <PageTransition>
                <ErrorBoundary>
                  <ActivityPage />
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
            path="/chat"
            element={
              <PageTransition>
                <ErrorBoundary>
                  <AgentChat />
                </ErrorBoundary>
              </PageTransition>
            }
          />
          <Route
            path="/chat/:id"
            element={
              <PageTransition>
                <ErrorBoundary>
                  <AgentChat />
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
            path="/status"
            element={
              <PageTransition>
                <ErrorBoundary>
                  <Status />
                </ErrorBoundary>
              </PageTransition>
            }
          />
          <Route
            path="/changelog"
            element={
              <PageTransition>
                <ErrorBoundary>
                  <PublicChangelog />
                </ErrorBoundary>
              </PageTransition>
            }
          />
          <Route
            path="/security"
            element={
              <PageTransition>
                <ErrorBoundary>
                  <Security />
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
