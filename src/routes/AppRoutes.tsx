import React, { Suspense } from "react";
import { lazyRoute } from "../lib/lazy-route";
import { Routes, Route, Navigate } from "react-router-dom";
import { AnimatePresence } from "motion/react";
import ErrorBoundary from "../components/ErrorBoundary";
import PageTransition from "../components/layout/PageTransition";
import RouteFallback from "../components/layout/RouteFallback";
import NotFound from "../components/layout/NotFound";
import OwnerOnlyRoute from "../components/OwnerOnlyRoute";

import { ActivityRedirect } from "./LegacyRedirects";

const ContactProfile = lazyRoute(() => import("../components/ContactProfile"));
const InsightsView = lazyRoute(() => import("../components/InsightsView"));
const FleetSettings = lazyRoute(() => import("../components/FleetSettings"));
const AdminSettings = lazyRoute(() => import("../components/AdminSettings"));
const Integrations = lazyRoute(() => import("../components/Integrations"));
const DncManager = lazyRoute(() => import("../components/DncManager"));
const AuditLog = lazyRoute(() => import("../components/AuditLog"));
const LiveOps = lazyRoute(() => import("../pages/CommandCenter"));
const HelpCenter = lazyRoute(() => import("../components/HelpCenter"));
const Status = lazyRoute(() => import("../components/Status"));
const PublicChangelog = lazyRoute(() => import("../components/PublicChangelog"));
const Security = lazyRoute(() => import("../components/Security"));
const TrustPackPage = lazyRoute(() => import("../components/TrustPackPage"));
const Pipeline = lazyRoute(() => import("../components/Pipeline"));
const FounderDashboard = lazyRoute(() => import("../components/FounderDashboard"));
const AgentChat = lazyRoute(() => import("../pages/AgentChat"));
const Training = lazyRoute(() => import("../pages/Training"));
const PhonePage = lazyRoute(() => import("../pages/PhonePage"));
const EmailPage = lazyRoute(() => import("../pages/EmailPage"));
const SmsPage = lazyRoute(() => import("../pages/SmsPage"));
const DesignPreviewPage = lazyRoute(() => import("../pages/DesignPreviewPage"));
const Design = lazyRoute(() => import("../pages/Design"));

export default function AppRoutes() {
  return (
    <AnimatePresence>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          {/* Live Ops is the default landing surface for signed-in operators. */}
          {/* Studio is home: the build-your-agent surface is the landing page.
              Live Ops remains one tap away under Command (and via its aliases). */}
          <Route path="/" element={<Navigate to="/agents" replace />} />
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
          {/* /dashboard, /command and /live all redirect to /ops — unified live ops surface. */}
          <Route path="/dashboard" element={<Navigate to="/ops" replace />} />
          <Route path="/command" element={<Navigate to="/ops" replace />} />
          <Route path="/live" element={<Navigate to="/ops" replace />} />
          <Route path="/triage" element={<Navigate to="/ops?tab=triage" replace />} />
          <Route
            path="/founder"
            element={
              <PageTransition>
                <ErrorBoundary>
                  <OwnerOnlyRoute>
                    <FounderDashboard />
                  </OwnerOnlyRoute>
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
          <Route path="/cockpit" element={<Navigate to="/ops?tab=floor" replace />} />
          <Route path="/director" element={<Navigate to="/chat" replace />} />
          <Route path="/director/*" element={<Navigate to="/chat" replace />} />
          <Route path="/account" element={<Navigate to="/admin?tab=subscription" replace />} />
          <Route path="/account/*" element={<Navigate to="/admin?tab=subscription" replace />} />
          <Route path="/billing" element={<Navigate to="/admin?tab=subscription" replace />} />
          <Route path="/admin/growth" element={<Navigate to="/admin?tab=flywheel" replace />} />
          <Route path="/ops/actions" element={<Navigate to="/ops?tab=intel" replace />} />
          <Route path="/appointments" element={<Navigate to="/phone?tab=appointments" replace />} />
          <Route path="/activity" element={<ActivityRedirect />} />
          <Route path="/knowledge" element={<Navigate to="/training?tab=database" replace />} />
          <Route path="/train" element={<Navigate to="/training" replace />} />
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
            path="/design"
            element={
              <PageTransition>
                <ErrorBoundary>
                  <Design />
                </ErrorBoundary>
              </PageTransition>
            }
          />
          <Route
            path="/design/preview"
            element={
              <PageTransition>
                <ErrorBoundary>
                  <DesignPreviewPage />
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
            path="/trust/:vertical"
            element={
              <PageTransition>
                <ErrorBoundary>
                  <TrustPackPage />
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
